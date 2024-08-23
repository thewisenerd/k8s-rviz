import {Container, Node, Pod} from "kubernetes-types/core/v1";
import * as kv from './kv';

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
            containers: pod.spec?.containers?.map((c) => minifyContainer(c)),
        }
    };
}


const nodesFormMsg = () => document.querySelector('#user-input-nodes-group > .msg');

function onNodes(nodes: Node[]) {
    nodesFormMsg().innerHTML = `${nodes.length} nodes loaded!`
    kv.set('nodes:nodeList', nodes);
}

const podsFormMsg = () => document.querySelector('#user-input-pods-group > .msg');

function onPods(pods: Pod[]) {
    podsFormMsg().innerHTML = `${pods.length} pods loaded!`
    pods = pods.map(p => minifyPod(p));
    kv.set('nodes:podList', pods);
}

addFormListener('pods', 'user-input-pods', processPods, onPods);
addFormListener('nodes', 'user-input-nodes', processNodes, onNodes);

const existingNodes = kv.load<Node[]>('nodes:nodeList');
if (existingNodes) {
    onNodes(existingNodes);
}

const existingPods = kv.load<Pod[]>('nodes:podList');
if (existingPods) {
    onPods(existingPods);
}
