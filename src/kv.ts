const hasLocalStorage = 'localStorage' in window;

const keyPrefix = 'k8s-rviz:'

function getImpl(key: string): string | null {
    if (!hasLocalStorage) {
        return null
    }

    key = keyPrefix + key;
    return localStorage.getItem(key)
}

export function get(key: string): string | null {
    try {
        return getImpl(key);
    } catch (err) {
        console.error(`failed to get key=${key} from localStorage`, err);
        return null;
    }
}

export function load<T>(key: string): T | null {
    try {
        const value = get(key);
        if (value != null) {
            return JSON.parse(value) as T;
        }
    } catch (err) {
        console.error(`failed to load key=${key} from localStorage`, err);
        return null;
    }
}

function setImpl(key: string, value: string): void {
    if (!hasLocalStorage) {
        return
    }

    key = keyPrefix + key;
    return localStorage.setItem(key, value)
}

export function set<T>(key: string, value: T): void {
    try {
        return setImpl(key, JSON.stringify(value))
    } catch (err) {
        console.error(`failed to set key=${key} in localStorage`, err);
        return;
    }
}