
export function parseMemory(value: string): number {
    let numStr = value;
    let div = 1024.0;
    if (value.endsWith('Ki')) {
        numStr = numStr.substring(0, numStr.length - 2);
        div = 1024 * 1024.0;
    }
    if (value.endsWith('Mi')) {
        numStr = numStr.substring(0, numStr.length - 2);
        div = 1024.0;
    }
    if (value.endsWith('Gi')) {
        numStr = numStr.substring(0, numStr.length - 2);
        div = 1.0;
    }
    try {
        return parseInt(numStr) / div;
    } catch (err) {
        console.error(`failed to parse memory for value=${value}, numStr=${numStr}, div=${div}`);
        throw err;
    }
}

export function parseCpu(value: string): number {
    let numStr = value;
    let div = 1.0;

    if (numStr.endsWith('m')) {
        numStr = numStr.substring(0, numStr.length - 1);
        div = 1000.0;
    }

    try {
        return parseInt(numStr) / div;
    } catch (err) {
        console.error(`failed to parse cpu for value=${value}, numStr=${numStr}, div=${div}`);
        throw err;
    }
}
