import {Container, Node, Pod} from "kubernetes-types/core/v1";
import * as kv from './kv';
import {renderImpl} from "./nodesRender";
import {sampleNodes, samplePods} from "./nodesSample";

const defaultNsGroupSystem = "(default|kube-(.*)|istio-(.*)|ingress-nginx)"
const defaultNsGroupInfra = "(infra|monitoring)"
const defaultNsGroupProd = "(.*-)?prod"

function readWrapper(
    el: HTMLInputElement,
    target: (data: ProgressEvent<FileReader>) => void
) {
    const reader = new FileReader()
    reader.onload = target;
    reader.readAsText(el.files[0]);
}

function objectList<T>(
    data: string,
    apiVersion: string | ((p0: string) => boolean),
    kind: string | ((p0: string) => boolean),
): T[] {
    let objList: object;
    try {
        objList = JSON.parse(data);
    } catch (err) {
        if (err instanceof SyntaxError) {
            throw new Error("failed to parse JSON");
        }
        throw new Error(`unknown error: ${err}`)
    }
    if (typeof objList !== 'object') {
        throw new Error("expected an object");
    }
    if (objList['kind'] !== 'List') {
        throw new Error("expected pods['kind'] == 'List'")
    }
    const items: object[] = objList['items'];
    if (!Array.isArray(items)) {
        throw new Error("expected pods['items'] to be an array");
    }
    let apiVersionCmp: (p0: string) => boolean;
    if (typeof apiVersion === "string") {
        apiVersionCmp = (p0: string) => {
            return p0 === apiVersion
        };
    } else {
        apiVersionCmp = apiVersion;
    }
    let kindCmp: (p0: string) => boolean;
    if (typeof kind === "string") {
        kindCmp = (p0: string) => {
            return p0 === kind;
        }
    } else {
        kindCmp = kind;
    }

    items.forEach((item, itemIdx) => {
        if (!apiVersionCmp(item['apiVersion'])) {
            throw new Error(`expected pods['items'][${itemIdx}]['apiVersion'] == '${apiVersion}'`)
        }
        if (!kindCmp(item['kind'])) {
            throw new Error(`expected pods['items'][${itemIdx}]['kind'] == '${kind}'`)
        }
    });
    return items as T[];
}

function processNodes(data: string | ArrayBuffer | null) {
    if (typeof data !== 'string') {
        throw new Error("readAsText returned a non-string value");
    }
    const nodes = objectList<Node>(data, "v1", "Node");
    console.log("nodeCount", nodes.length);
    return nodes;
}

function processPods(data: string | ArrayBuffer | null) {
    if (typeof data !== 'string') {
        throw new Error("readAsText returned a non-string value");
    }
    const pods = objectList<Pod>(data, "v1", "Pod");
    console.log("podCount", pods.length);
    const filteredPods = pods.filter((pod) => {
        return pod.status?.phase === 'Running'
    });
    console.log("filteredPodCount", filteredPods.length);
    return filteredPods;
}

function addFormListener<T>(
    key: string,
    inputElementId: string,
    processor: (p0: string | ArrayBuffer | null) => T[],
    postProcessor: (p0: T[]) => void,
) {
    const el = document.getElementById(inputElementId) as HTMLInputElement;
    el.addEventListener('change', () => {
        readWrapper(el, (ev) => {
            try {
                const items = processor(ev.target.result);
                postProcessor(items);
            } catch (err) {
                console.error("form input processing failed", err);
                alert(`processing ${key} failed, ${err}`);
            } finally {
                el.value = '';
            }
        })
    }, false);
}

function minifyContainer(container: Container): Container {
    return {
        name: container.name,
        resources: container.resources,
    };
}

function minifyPod(pod: Pod): Pod {
    return {
        apiVersion: "v1",
        kind: "Pod",
        metadata: pod.metadata,
        spec: {
            nodeName: pod.spec?.nodeName,
            containers: pod.spec?.containers?.map((c) => minifyContainer(c)),
        }
    };
}

interface State {
    nodes?: Node[];
    pods?: Pod[];

    nsGroupSystem: RegExp;
    nsGroupInfra: RegExp;
    nsGroupProd: RegExp;

    nodeFilter?: RegExp;
}

const state: State = {
    nsGroupSystem: new RegExp(defaultNsGroupSystem),
    nsGroupInfra: new RegExp(defaultNsGroupInfra),
    nsGroupProd: new RegExp(defaultNsGroupProd),
};

function setState(next: Partial<State>) {
    let dirty = false;
    if (next.nodes && next.nodes != state.nodes) dirty = true;
    if (next.pods && next.pods != state.pods) dirty = true;

    if (next.nsGroupSystem && next.nsGroupSystem != state.nsGroupSystem) dirty = true;
    if (next.nsGroupInfra && next.nsGroupInfra != state.nsGroupInfra) dirty = true;
    if (next.nsGroupProd && next.nsGroupProd != state.nsGroupProd) dirty = true;
    if (next.nodeFilter && next.nodeFilter != state.nodeFilter) dirty = true;

    state.nodes = next.nodes ?? state.nodes;
    state.pods = next.pods ?? state.pods;

    state.nsGroupSystem = next.nsGroupSystem ?? state.nsGroupSystem;
    state.nsGroupInfra = next.nsGroupInfra ?? state.nsGroupInfra;
    state.nsGroupProd = next.nsGroupProd ?? state.nsGroupProd;

    state.nodeFilter = next.nodeFilter ?? state.nodeFilter;

    if (dirty) {
        render();
    }
}

function render() {
    const {nodes, pods, nsGroupSystem, nsGroupInfra, nsGroupProd, nodeFilter} = state;
    if (nodes && pods) {
        if (nodes.length > 0 && pods.length > 0) {
            renderImpl(document.getElementById('root'), {
                cpuX: false,
                scaleUnit: 5,
                nodeFilter,

                nsGroupSystem,
                nsGroupInfra,
                nsGroupProd,
            }, {nodes, pods});
        }
    }
}

const nodesFormMsg = () => document.querySelector('#user-input-nodes-group > .msg');

function onNodes(nodes: Node[], persist: boolean = true) {
    nodesFormMsg().innerHTML = `${nodes.length} nodes loaded!`
    if (persist) kv.set('nodes:nodeList', nodes);
    setState({nodes});
}

const podsFormMsg = () => document.querySelector('#user-input-pods-group > .msg');

function onPods(pods: Pod[], persist: boolean = true) {
    podsFormMsg().innerHTML = `${pods.length} pods loaded!`
    pods = pods.map(p => minifyPod(p));
    if (persist) kv.set('nodes:podList', pods);
    setState({pods});
}

function isRegexValid(pattern: string): boolean {
    try {
        new RegExp(pattern);
        return true;
    } catch (err) {
        return false;
    }
}

function nsGroupLoad() {
    const system = kv.load<string>('nodes:ns:system');
    const infra = kv.load<string>('nodes:ns:infra');
    const prod = kv.load<string>('nodes:ns:prod');

    const nsGroupSystem = system && isRegexValid(system) ? new RegExp(system) : new RegExp(defaultNsGroupSystem);
    const nsGroupInfra = infra && isRegexValid(infra) ? new RegExp(infra) : new RegExp(defaultNsGroupInfra);
    const nsGroupProd = prod && isRegexValid(prod) ? new RegExp(prod) : new RegExp(defaultNsGroupProd);

    (document.getElementById('user-input-system-ns') as HTMLInputElement).value = nsGroupSystem.source;
    (document.getElementById('user-input-infra-ns') as HTMLInputElement).value = nsGroupInfra.source;
    (document.getElementById('user-input-prod-ns') as HTMLInputElement).value = nsGroupProd.source;

    setState({
        nsGroupSystem,
        nsGroupInfra,
        nsGroupProd
    });
}

function nsGroupApply() {
    const inpSystem = document.getElementById('user-input-system-ns') as HTMLInputElement;
    const inpInfra = document.getElementById('user-input-infra-ns') as HTMLInputElement;
    const inpProd = document.getElementById('user-input-prod-ns') as HTMLInputElement;

    const nextState: Partial<State> = {}

    if (inpSystem.value != state.nsGroupSystem.source) {
        if (!isRegexValid(inpSystem.value)) {
            alert(`invalid regex expression: ${inpSystem.value}`);
            inpSystem.value = state.nsGroupSystem.source;
        } else {
            nextState['nsGroupSystem'] = new RegExp(inpSystem.value);
            kv.set('nodes:ns:system', inpSystem.value);
        }
    }

    if (inpInfra.value != state.nsGroupInfra.source) {
        if (!isRegexValid(inpInfra.value)) {
            alert(`invalid regex expression: ${inpInfra.value}`);
            inpInfra.value = state.nsGroupInfra.source;
        } else {
            nextState['nsGroupInfra'] = new RegExp(inpInfra.value);
            kv.set('nodes:ns:infra', inpInfra.value);
        }
    }

    if (inpProd.value != state.nsGroupProd.source) {
        if (!isRegexValid(inpProd.value)) {
            alert(`invalid regex expression: ${inpProd.value}`);
            inpProd.value = state.nsGroupProd.source;
        } else {
            nextState['nsGroupProd'] = new RegExp(inpProd.value);
            kv.set('nodes:ns:prod', inpProd.value);
        }
    }

    // ew
    if (JSON.stringify(nextState) != "{}") {
        setState(nextState);
    } else {
        console.log("no updates");
    }
}

function nfLoad() {
    const nf = kv.load<string>("nodes:filter:nodeFilter");

    const nodeFilter = nf && isRegexValid(nf) ? new RegExp(nf) : undefined;

    (document.getElementById('user-input-node-filter') as HTMLInputElement).value = nodeFilter ? nodeFilter.source : '';

    setState({
        nodeFilter
    });
}

function nfApply() {
    const inpFilter = document.getElementById('user-input-node-filter') as HTMLInputElement;

    const nextState: Partial<State> = {}

    if (inpFilter.value != (state.nodeFilter?.source ?? '')) {
        if (!isRegexValid(inpFilter.value)) {
            alert(`invalid regex expression: ${inpFilter.value}`);
            inpFilter.value = state.nodeFilter?.source ?? '';
        } else {
            nextState['nodeFilter'] = new RegExp(inpFilter.value);
            kv.set('nodes:filter:nodeFilter', inpFilter.value);
        }
    }

    // ew
    if (JSON.stringify(nextState) != "{}") {
        setState(nextState);
    } else {
        console.log("no updates");
    }
}

function reset() {
    kv.remove('nodes:nodeList');
    kv.remove('nodes:podList');
    kv.remove('nodes:ns:system');
    kv.remove('nodes:ns:infra');
    kv.remove('nodes:ns:prod');
    kv.remove('nodes:filter:nodeFilter');

    alert(`all configs reset.`);
    setTimeout(() => {
        window.location.reload();
    }, 100);
}

function init() {
    addFormListener('pods', 'user-input-pods', processPods, onPods);
    addFormListener('nodes', 'user-input-nodes', processNodes, onNodes);

    const existingNodes = kv.load<Node[]>('nodes:nodeList');
    if (existingNodes) {
        onNodes(existingNodes, false);
    }

    const existingPods = kv.load<Pod[]>('nodes:podList');
    if (existingPods) {
        onPods(existingPods, false);
    }

    nsGroupLoad();
    const nsApplyBtn = document.getElementById('user-input-ns-apply');
    nsApplyBtn.addEventListener('click', () => {
        nsGroupApply();
    });

    nfLoad();
    const nfApplyBtn = document.getElementById('user-input-filter-apply');
    nfApplyBtn.addEventListener('click', () => {
        nfApply();
    });

    const resetBtn = document.getElementById('user-input-reset');
    resetBtn.addEventListener('click', () => {
        reset();
    })

    const sampleBtn = document.getElementById('user-input-sample');
    sampleBtn.addEventListener('click', () => {
        onNodes(sampleNodes, false);
        onPods(samplePods, false);
    });
}

init();