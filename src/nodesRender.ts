import {Node, Pod} from "kubernetes-types/core/v1";
import {parseCpu, parseMemory} from "./utils";
import {debounce} from "./debounce";

export interface SearchParams {
    nodeFilter?: RegExp;
}

export interface RenderParams {
    cpuX: boolean;
    scaleUnit: number;
    nsGroupSystem: RegExp;
    nsGroupInfra: RegExp;
    nsGroupProd: RegExp;
}

export type Params = SearchParams & RenderParams;

export interface TooltipData {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    text: string;
    priority: number;
}

function getNamespacePriority(params: Params, ns: string): number {
    if (params.nsGroupSystem.test(ns)) {
        return 0;
    }
    if (params.nsGroupInfra.test(ns)) {
        return 1;
    }
    if (params.nsGroupProd.test(ns)) {
        return 2;
    }
    return 3;
}

function renderNodeInternal(canvas: HTMLCanvasElement, tooltipElement: HTMLSpanElement, params: Params, node: Node, pods: Pod[]) {
    const ctx = canvas.getContext('2d');
    let gTooltipList: TooltipData[] = [];

    function smallFloat(value: number): string {
        if (Number.isInteger(value)) {
            return value.toString();
        } else {
            return value.toFixed(2);
        }
    }

    function mTooltip(x: number, y: number, width: number, height: number, text: string, priority?: number) {
        let tooltip: TooltipData = {
            x1: x, y1: y,
            x2: x + width, y2: y + height,
            text: text,
            priority: (!!priority ? priority : 0)
        };
        gTooltipList.push(tooltip);
        console.debug("adding tooltip", tooltip)
    }

    function mFillRect(x: number, y: number, width: number, height: number, tooltipText?: string, tooltipPriority?: number) {
        if (params.cpuX) {
            ctx.fillRect(x, y, width, height)
        } else {
            // noinspection JSSuspiciousNameCombination
            ctx.fillRect(y, x, height, width);
        }

        if (tooltipText) {
            mTooltip(x, y, width, height, tooltipText, tooltipPriority);
        }
    }

    function mStrokeRect(x: number, y: number, width: number, height: number, tooltipText?: string, tooltipPriority?: number) {
        if (params.cpuX) {
            ctx.strokeRect(x, y, width, height)
        } else {
            // noinspection JSSuspiciousNameCombination
            ctx.strokeRect(y, x, height, width);
        }

        if (tooltipText) {
            mTooltip(x, y, x + width, y + height, tooltipText, tooltipPriority);
        }
    }

    function mFilterTooltipList(x: number, y: number): TooltipData[] {
        console.debug("filtering tooltipList", x, y, gTooltipList)
        return gTooltipList
            .filter(data => (params.cpuX
                    ? (x > data.x1 && x <= data.x2 && y > data.y1 && y <= data.y2)
                    : (x > data.y1 && x <= data.y2 && y > data.x1 && y <= data.x2)
            ))
            .sort((a, b) => (a.priority - b.priority));
    }

    let {name: nodeName} = node.metadata

    let cpu = parseCpu(node.status.capacity.cpu);
    let mem = parseMemory(node.status.capacity.memory);
    console.debug(`identified, node=${nodeName}, cpu=${cpu}, memory=${mem}`);

    let width = Math.ceil(params.cpuX ? cpu : mem);
    let height = Math.ceil(params.cpuX ? mem : cpu);

    canvas.style.width = (width * params.scaleUnit).toString();
    canvas.style.height = (height * params.scaleUnit).toString();
    canvas.style.border = '1px solid black';

    const scale = params.scaleUnit * window.devicePixelRatio;
    canvas.width = Math.floor(width * scale);
    canvas.height = Math.floor(height * scale);

    ctx.scale(scale, scale);

    // grid
    for (let i = 0; i < width; i++) {
        for (let j = 0; j < height; j++) {
            let fill = j % 2 == 0;
            if (i % 2 == 0) {
                fill = j % 2 == 1;
            }
            let fillStyle = '#fff';
            if (fill) {
                fillStyle = 'rgba(0, 0, 0, 0.05)';
            }
            ctx.fillStyle = fillStyle;
            ctx.fillRect(i, j, 1, 1);
        } // y
    } // x

    let cpuOffset = 0;
    let memOffset = 0;
    let prevCtx: { ns: string, podName: string, x: number, y: number } = undefined;

    pods.sort((a, b) => {
        let {namespace: aNs} = a.metadata
        let {namespace: bNs} = b.metadata

        if (aNs == bNs) return 0;
        return getNamespacePriority(params, aNs) - getNamespacePriority(params, bNs);
    }).forEach(pod => {
        let {namespace: ns, name: podName} = pod.metadata;

        if (ns == 'buffer') {
            return;
        }

        let podCpu = 0;
        let podMem = 0;
        pod.spec.containers.forEach(container => {
            let rcpu1, rcpu2, rmem1, rmem2;
            if (container.resources.requests) {
                rcpu2 = container.resources.requests.cpu;
                rmem2 = container.resources.requests.memory;
            }
            let rcpu = rcpu1 ? rcpu1 : (rcpu2 ? rcpu2 : undefined);
            let rmem = rmem1 ? rmem1 : (rmem2 ? rmem2 : undefined);

            if (rcpu && rmem) {
                try {
                    let containerCpu = parseCpu(rcpu);
                    let containerMem = parseMemory(rmem);

                    podCpu += containerCpu;
                    podMem += containerMem;
                } catch (err) {
                    console.error(`failed to parse resource requirements for ${ns}/${podName}`, err);
                }
            } else {
                console.error(`no resource requests found for ${ns}/${podName}/${container.name}`)
            }
        }); // containers

        console.info(`got resource requests, cpu=${podCpu}, mem=${podMem} for ${ns}/${podName}`);

        // rbg
        let priority = getNamespacePriority(params, ns);
        if (priority == 0) {
            ctx.fillStyle = 'rgba(255, 0, 0, 0.1)'
        } else if (priority == 1) {
            ctx.fillStyle = 'rgba(0, 0, 255, 0.1)'
        } else if (priority == 2) {
            ctx.fillStyle = 'rgba(0, 255, 0, 0.1)'
        } else {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'
        }
        mFillRect(cpuOffset, memOffset, podCpu, podMem, `${ns}/${podName}, cpu=${smallFloat(podCpu)}, mem=${smallFloat(podMem)}`)
        ctx.lineWidth = 1 / params.scaleUnit;
        mStrokeRect(cpuOffset, memOffset, podCpu, podMem)

        if (prevCtx && ns != prevCtx.ns) {
            console.debug("changing of the namespace", prevCtx, ns, cpuOffset, memOffset);
            let nsCpu = cpuOffset - prevCtx.x;
            let nsMem = memOffset - prevCtx.y;
            mStrokeRect(prevCtx.x, prevCtx.y, nsCpu, nsMem, `ns/${ns}, cpu=${smallFloat(nsCpu)}, mem=${smallFloat(nsMem)}`, 1);
            prevCtx = undefined;
        }
        if (!prevCtx) {
            prevCtx = {ns, podName, x: cpuOffset, y: memOffset}
        }

        cpuOffset += podCpu
        memOffset += podMem
    });

    if (prevCtx) {
        console.debug("last namespace", prevCtx, cpuOffset, memOffset);
        let nsCpu = cpuOffset - prevCtx.x;
        let nsMem = memOffset - prevCtx.y;
        mStrokeRect(prevCtx.x, prevCtx.y, nsCpu, nsMem, `ns=${prevCtx.ns}, cpu=${smallFloat(nsCpu)}, mem=${smallFloat(nsMem)}`, 1);
    }

    const defaultTooltipText = `cpu=${smallFloat(cpu)}, mem=${smallFloat(mem)}`;

    function mouseOut() {
        tooltipElement.innerHTML = defaultTooltipText;
    }

    function mouseMove(e: MouseEvent) {
        e.preventDefault();
        e.stopPropagation();

        let rect = canvas.getBoundingClientRect();

        let mouseX = e.clientX - rect.left;
        let mouseY = e.clientY - rect.top;

        let x = mouseX / params.scaleUnit;
        let y = mouseY / params.scaleUnit;

        tooltipElement.innerHTML = `${mouseX}, ${mouseY}, ${x}, ${y}`

        let tooltipList = mFilterTooltipList(x, y)
        console.debug("got tooltipList", tooltipList)
        if (tooltipList.length > 0) {
            tooltipElement.innerHTML = tooltipList[0].text;
        } else {
            tooltipElement.innerHTML = 'no data'
        }
    }

    tooltipElement.innerHTML = defaultTooltipText;
    canvas.addEventListener('mouseout', debounce(mouseOut, 60), false);
    canvas.addEventListener('mousemove', debounce(mouseMove, 60), false);
}

export function renderNodeImpl(el: HTMLCanvasElement, tooltipElement: HTMLSpanElement, params: Params, node: Node, podList: Pod[]) {
    if (el['getContext']) {
        let canvas = el as HTMLCanvasElement;
        renderNodeInternal(canvas, tooltipElement, params, node, podList);
    } else {
        el.innerHTML = "canvas not supported";
    }
}

interface NodeBox {
    node: Node;
    pods: Pod[];
}

function renderNode(
    root: HTMLElement,
    params: Params,
    box: NodeBox
) {
    const {node, pods} = box;

    const existing = document.getElementById(node.metadata.name);
    if (params.nodeFilter) {
        debugger;
        if (!params.nodeFilter.test(node.metadata.name)) {
            if (existing) {
                existing.parentNode.removeChild(existing);
            }
            return;
        }
    }

    const el = document.createElement('div');
    el.id = node.metadata.name;
    el.className += ' nodechart';

    const canvas = document.createElement('canvas');
    const label = document.createElement('span');
    label.innerHTML = node.metadata.name;
    label.className += ' label';

    const tooltip = document.createElement('span');
    tooltip.innerHTML = '';
    tooltip.className += ' tooltip';

    el.appendChild(canvas);
    el.appendChild(label);
    el.appendChild(tooltip);

    renderNodeImpl(canvas, tooltip, params, node, pods);

    if (existing) {
        existing.replaceWith(el);
    } else {
        root.appendChild(el);
    }
}

export function renderImpl(root: HTMLElement, params: Params, props: {
    nodes: Node[],
    pods: Pod[],
}) {
    const {nodes, pods} = props;
    const errors: string[] = [];

    const boxes = new Map<string, NodeBox>();
    nodes.forEach((node) => {
        boxes.set(node.metadata.name, {
            node,
            pods: [],
        });
    })

    pods.forEach((pod) => {
        const podKey = `[${pod.metadata.namespace}/${pod.metadata.name}]`;
        const nodeName = pod.spec.nodeName;
        if (!nodeName) {
            errors.push(`${podKey} invalid nodeName '${nodeName}'`);
            return
        }
        const nodeBox = boxes.get(nodeName);
        if (nodeBox == undefined) {
            errors.push(`${podKey} unknown nodeName '${nodeName}'`);
        }
        nodeBox.pods.push(pod);
    });

    const renderList = Array.from(boxes.keys());
    renderList.forEach((nodeName) => {
        renderNode(root, params, boxes.get(nodeName));
    });
}