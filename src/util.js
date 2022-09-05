/*
 * Common utils
 */
import fs from 'fs';
import { promisify } from 'util';

export function delay(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

export function requestKey(r) {
    return `${r.method()}:${r.url()}`;
}

export function normalizeURL(url) {
    if (!url) return '';
    const u = new URL(url.replace(/\/+$/, ''));
    u.hash = '';
    return u.toString();
}

export function checkBrowser(str) {
    return ['chromium', 'firefox', 'webkit'].includes(str);
}

export function toBool(str) {
    if (!str) return !!str;
    if (typeof str !== 'string') return str;
    str = str.toLowerCase();
    if (str === 'false' || str === 'off' || str === 'no' || str === '0') return false;
    return true;
}

export function smartSplit(str) {
    if (!str) return [];
    if (typeof str !== 'string') return str;
    const split = [];
    for (let s of str.split(/[,; ]+/)) {
        if (s.trim()) {
            split.push(s);
        }
    }
    return split;
}

export async function parseSnapshot(fname) {
    let record = await fs.promises.readFile(fname);
    if (fname.endsWith('.gz')) {
        record = await promisify(gunzip)(record);
    }
    return JSON.parse(record);
}
