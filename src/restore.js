#!/usr/bin/env node
/*
 * Restore a recorded page.
 */
import fs from 'fs';
import mri from 'mri';
import { gunzip } from 'zlib';
import { promisify } from 'util';
import { chromium } from 'playwright';

import { delay, requestKey, normalizeURL, toBool } from './util.js';
import pkg from '../package.json' assert { type: 'json' };

const options = {
    boolean: ['help', 'version'],
    alias: {
        i: 'input',
        v: 'version',
        // c: 'config',
    },
    default: {
        js: true, // disable JS execution and capturing
        offline: true,
        wait: 120,
    },
};

function processArgs(args) {
    args.js = toBool(args.js);
    args.offline = toBool(args.offline);
    args.wait = parseInt(args.wait) * 1000;
    console.log(args);
}

;(async function main() {
    const args = mri(process.argv.slice(2), options);
    // console.log(args);

    if (args.version) {
        console.log('Web-Snap v' + pkg.version);
        return;
    }

    processArgs(args);
    const SNAP = args._[0] || args.input;
    let record = await fs.promises.readFile(SNAP);
    if (SNAP.endsWith('.gz')) {
        record = await promisify(gunzip)(record);
    }
    record = JSON.parse(record);
    console.log('Restoring URL:', record.url);

    const browser = await chromium.launch({
        headless: false,
        args: [
            '--disable-web-security',
            '--disable-site-isolation-trials',
            '--disable-features=IsolateOrigins',
            '--allow-running-insecure-content',
        ],
    });
    browser.on('disconnected', process.exit);
    const context = await browser.newContext({
        acceptInsecureCerts: true,
        ignoreHTTPSErrors: true,
        javaScriptEnabled: args.js,
        offline: args.offline,
        viewport: null,
    });

    const page = await context.newPage();
    page.on('close', process.exit);
    page.on('console', async (msg) => {
        if (msg.text().startsWith('Failed to load resource')) return;
        console.log(`CONSOLE ${msg.type()}: ${msg.text()}`);
    });

    page.route('**', async (route) => {
        const r = route.request();
        const u = normalizeURL(r.url());

        if (u === normalizeURL(record.url)) {
            console.log(`Serve INDEX page from record: ${u}`);
            route.fulfill({
                contentType: 'text/html; charset=utf-8',
                body: record.html,
            });
            return;
        }

        const key = requestKey(r);
        const cached = record.responses[key];
        if (cached && cached.body) {
            // ignore all javascript requests on restore, when JS disabled
            const contentType = cached.headers['content-type'];
            if (!args.js && (contentType === 'text/javascript' || contentType === 'application/javascript')) {
                // HTTP 204 = NO CONTENT
                route.fulfill({ status: 204 });
                return;
            }
            console.log(`Intercept RESTORE request: ${key}`);
            route.fulfill({
                contentType: contentType || '',
                body: Buffer.from(cached.body, 'base64'),
                status: record.status,
                headers: cached.headers, // Some headers may be useful here
            });
            return;
        }

        // else
        console.log(`Missing resource: ${key}`);
        route.continue(); // or abort ??
    });

    await page.goto(record.url, { waitUntil: 'networkidle' });
    await delay(args.wait);
    await browser.close();
})();
