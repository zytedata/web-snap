/*
 * Restore a recorded page.
 */
import fs from 'fs';
import { gunzip } from 'zlib';
import { promisify } from 'util';
import { chromium } from 'playwright';

import { requestKey, normalizeURL, toBool, smartSplit } from './util.js';

async function processArgs(args) {
    args.js = toBool(args.js);
    args.headless = toBool(args.headless); // debug & tests
    args.offline = toBool(args.offline);
    args.wait = parseInt(args.wait) * 1000;
    args.REMOVE = smartSplit(args.removeElems);

    const snap = args._ ? args._[0] : null || args.input;
    if (snap) {
        let record = await fs.promises.readFile(snap);
        if (snap.endsWith('.gz')) {
            record = await promisify(gunzip)(record);
        }
        args.RECORD = JSON.parse(record);
    }
}

export async function restorePage(args) {
    await processArgs(args);
    const record = args.RECORD;

    if (!record) {
        console.error(`Empty snapshot file! Cannot launch!`);
        return;
    }

    console.log('Restoring URL:', record.url);

    const browser = await chromium.launch({
        headless: args.headless,
        args: [
            '--disable-web-security',
            '--disable-site-isolation-trials',
            '--disable-features=IsolateOrigins',
            '--allow-running-insecure-content',
        ],
    });

    const context = await browser.newContext({
        acceptInsecureCerts: true,
        ignoreHTTPSErrors: true,
        javaScriptEnabled: args.js,
        offline: args.offline,
        viewport: null,
    });

    const page = await context.newPage();
    page.on('console', async (msg) => {
        if (msg.text().startsWith('Failed to load resource')) return;
        console.log(`CONSOLE ${msg.type()}: ${msg.text()}`);
    });

    page.route('**', async (route) => {
        const r = route.request();
        const u = normalizeURL(r.url());

        if (u === normalizeURL(record.url) || u === normalizeURL(record.base_url)) {
            console.log(`Restored INDEX from CACHE: ${u}`);
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
            console.log(`Restored from CACHE: ${key}`);
            route.fulfill({
                contentType: contentType || '',
                body: Buffer.from(cached.body, 'base64'),
                status: record.status,
                headers: cached.headers, // Some headers may be useful here
            });
            return;
        }

        // else
        console.log(`MISSING resource: ${key}`);
        route.continue(); // or abort ??
    });

    // navigate to the resolved URL instead of the user provided one
    await page.goto(record.base_url, { waitUntil: 'networkidle' });

    for (const selector of args.REMOVE) {
        console.log('Removing element selector:', selector);
        await page.evaluate((s) => {
            for (const el of document.querySelectorAll(s)) {
                el.parentNode.removeChild(el);
            }
        }, selector);
    }

    return [page, browser];
}
