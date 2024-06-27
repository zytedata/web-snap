/*
 * Common utils
 */
import fs from 'fs';
import { gunzip } from 'zlib';
import { promisify } from 'util';

import { encode, decode } from './quopri.js';

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

export function encodeBody(resourceType, contentType, buffer) {
    if (!buffer || buffer.length === 0) return '';
    if (
        resourceType === 'document' ||
        resourceType === 'stylesheet' ||
        resourceType === 'script' ||
        resourceType === 'manifest'
    ) {
        return `QUOPRI:${encode(buffer)}`;
    }
    if (
        contentType &&
        (contentType.startsWith('text/') ||
            contentType.startsWith('image/svg+xml') ||
            contentType.startsWith('application/json'))
    ) {
        return `QUOPRI:${encode(buffer)}`;
    }
    return `BASE64:${buffer.toString('base64')}`;
}

export function decodeBody(body) {
    if (!body || body.length === 0) return '';
    if (body.startsWith('QUOPRI:')) return decode(body.slice(7));
    if (body.startsWith('BASE64:')) return Buffer.from(body.slice(7), 'base64');
    return Buffer.from(body, 'base64');
}
