/*
 * Common utils
 */

export function delay(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

export function requestKey(r) {
    return `${r.method()}:${r.url()}`;
}

export function normalizeURL(url) {
    const u = new URL(url.replace(/\/+$/, ''));
    u.hash = '';
    return u.toString();
}

export function checkBrowser(str) {
    return ['chromium', 'firefox', 'webkit'].includes(str);
}

export function smartSplit(str) {
    const split = [];
    for (let s of str.split(/[,; ]+/)) {
        if (s.trim()) {
            split.push(s.toLowerCase());
        }
    }
    return split;
}
