/*
 * Record a page.
 */
import fs from 'fs';
import fetch from 'cross-fetch';
import playwright from 'playwright';
import CleanCSS from 'clean-css';
import { PurgeCSS } from 'purgecss';
import { PlaywrightBlocker } from '@cliqz/adblocker-playwright';

import { requestKey, normalizeURL, toBool, smartSplit, encodeBody } from './util.js';

async function processArgs(args) {
    args.gzip = toBool(args.gzip);
    args.js = toBool(args.js);
    args.blockAds = toBool(args.blockAds);
    args.extraMeta = toBool(args.extraMeta);
    args.headless = toBool(args.headless);
    args.iframes = toBool(args.iframes);
    args.minify = toBool(args.minify);
    args.purgeCSS = toBool(args.purgeCSS);

    args.wait = parseInt(args.wait) * 1000;
    args.timeout = parseInt(args.timeout) * 1000;
    args.imgTimeout = parseInt(args.imgTimeout) * 1000;

    args.DROP = smartSplit(args.dropRequests).map((x) => new RegExp(x, 'i'));
    args.HEADERS = smartSplit(args.headers).map((x) => x.toLowerCase());
    args.REMOVE = smartSplit(args.removeElems);
    args.CSS = args.addCSS ? args.addCSS.trim() : '';

    args.DROPST = smartSplit(args.dropStatus).map((x) => new RegExp(x.replace(/x/ig, '\\d')));
    if (args.blockList) {
        const blockList = await fs.promises.readFile(args.blockList, { encoding: 'utf8' });
        args.DROPLI = blockList
            .split('\n')
            .map((x) => x.trim().replace(/\/+$/, ''))
            .filter((x) => x && !x.startsWith('#') && x.length > 5)
            .map((x) => new RegExp(`^https?://(www\.|m\.)?${x}/.+`, 'i'));
        console.log(`Loaded ${args.DROPLI.length} drop list domains from file`);
    }

    args.URI = args._ ? args._[0] : null || args.input || args.url;
    let HOST = new URL(args.URI).host;
    if (HOST.startsWith('www.')) HOST = HOST.slice(4);
    let OUT = args._ ? args._[1] : null || args.output;
    if (!OUT) OUT = `snapshot_${HOST}.json`;
    if (args.gzip && !OUT.endsWith('.gz')) OUT += '.gz';
    args.OUT = OUT;
    // console.log('ARGS:', args);
}

export async function recordPage(args) {
    await processArgs(args);

    // only Chromium supported for now
    const browser = await playwright.chromium.launch({ headless: args.headless });
    const context = await browser.newContext({
        javaScriptEnabled: args.js,
        userAgent: args.userAgent,
        bypassCSP: true,
        ignoreHTTPSErrors: true,
        serviceWorkers: 'block',
        viewport: null,
    });
    const page = await context.newPage();

    if (args.blockAds) {
        const blocker = await PlaywrightBlocker.fromPrebuiltAdsAndTracking(fetch);
        await blocker.enableBlockingInPage(page);
    }

    const snapshot = await internalRecordPage(args, page);

    return { snapshot, page, context, browser };
}

async function internalRecordPage(args, page) {
    const { URI, DROP, DROPLI, DROPST, HEADERS, REMOVE, CSS } = args;

    if ((DROP && DROP.length) || (DROPLI && DROPLI.length)) {
        const block = [...DROP, ...DROPLI];
        page.route('**', async (route) => {
            const r = route.request();
            const u = normalizeURL(r.url());
            for (const re of block) {
                if (re.test(u)) {
                    console.warn('Drop matching request:', re, u);
                    route.abort();
                    return;
                }
            }
            route.continue();
        });
    }

    let snapshot = { url: URI, base_url: '', html: '', responses: {} };
    if (args.extraMeta) {
        snapshot = {
            url: URI,
            base_url: '',
            canonical_url: '',
            date: new Date().toISOString(),
            title: '',
            html: '',
            responses: {},
        };
    }

    page.on('response', async (response) => {
        const r = response.request();
        const u = normalizeURL(r.url());
        if (u.startsWith('data:')) {
            return;
        }
        // ignore the index page, it will be saved at the end
        if (u === normalizeURL(URI)) return;

        const status = response.status();
        if (DROPST && DROPST.length) {
            for (const re of DROPST) {
                if (re.test(status.toString())) {
                    console.warn('Drop matching status:', re, status);
                    return;
                }
            }
        } else {
            // ignore redirect requests, they will be saved after resolved
            if (status >= 300 && status < 400) {
                console.warn('Redirect from:', u, 'to:', response.headers()['location']);
                return;
            }
            // allow all the other statuses
        }

        const key = requestKey(r);
        console.log('Response:', status, key);

        // restrict headers to subset
        let headers = Object.entries(response.headers()).filter(([key]) => HEADERS.includes(key));
        headers = Object.fromEntries(headers);
        const contentType = headers['content-type'];

        let body;
        try {
            const buffer = await response.body();
            body = encodeBody(r.resourceType(), contentType, buffer);
        } catch (err) {
            const frame = page.frame({ url: u });
            if (frame && args.iframes) {
                console.log('Capture IFRAME content for:', frame.url());
                const content = (await frame.content()).trim();
                body = encodeBody(r.resourceType(), contentType, new Buffer.from(content, 'utf-8'));
            } else if (status !== 204) {
                console.error('ERR saving response for:', status, u, err);
            }
        }

        // if the request was NOT cached, or it WAS cached
        // and the new request is successful (overwrite with fresh data)
        if (!snapshot.responses[key] || (snapshot.responses[key] && snapshot.responses[key].status === 200)) {
            snapshot.responses[key] = {
                body,
                headers,
                request_url: u,
                status,
            };
            if (u !== response.url()) {
                snapshot.responses[key] = {
                    response_url: response.url(),
                };
            }
        }
    });

    try {
        console.log('Waiting for the page to load...');
        await page.goto(URI, { timeout: args.timeout, waitUntil: 'networkidle' });
    } catch (err) {
        console.error('Wait timeout:', err);
    }

    // initial snapshot
    snapshot.html = (await page.content()).trim();

    const imgCount = await page.locator('img').count();
    if (imgCount > 0) {
        try {
            console.log('Waiting for images to load...');
            await page.waitForSelector('img', { timeout: args.imgTimeout });
        } catch (err) {
            console.error('Images timeout:', err);
        }
    }

    // resolved base URL
    snapshot.base_url = await page.evaluate('document.baseURI');

    if (args.extraMeta) {
        snapshot.title = (await page.title()).trim();
        // resolved canonical URL
        snapshot.canonical_url = await page.evaluate(
            `(document.querySelector("link[rel='canonical']") || document.createElement('link')).getAttribute('href')`,
        );
        if (!snapshot.canonical_url) delete snapshot.canonical_url;
    }

    // delete possible index duplicates, when user URL != resolved URL
    let baseKey = `GET:${snapshot.base_url}`;
    if (snapshot.responses[baseKey] && snapshot.responses[baseKey].body) {
        delete snapshot.responses[baseKey];
    }
    if (snapshot.canonical_url) {
        baseKey = `GET:${snapshot.canonical_url}`;
        if (snapshot.responses[baseKey] && snapshot.responses[baseKey].body) {
            delete snapshot.responses[baseKey];
        }
    }
    baseKey = null;

    for (const selector of REMOVE) {
        console.log('Removing element selector:', selector);
        await page.evaluate((s) => {
            for (const el of document.querySelectorAll(s)) {
                el.parentNode.removeChild(el);
            }
        }, selector);
    }

    if (CSS && CSS.length) {
        console.log('Adding custom CSS...');
        await page.evaluate((css) => {
            const cssHack = document.createElement('style');
            cssHack.className = 'hack';
            cssHack.innerText = css;
            document.head.appendChild(cssHack);
        }, CSS);
    }

    // second snapshot
    snapshot.html = (await page.content()).trim();

    if (args.purgeCSS) {
        console.log('Purging unused CSS...');
        const pageCSS = await page.evaluate(() => {
            const css = [];
            for (const style of document.styleSheets) {
                let raw;
                try {
                    raw = Array.from(style.cssRules).map((r) => r.cssText).join(' ');
                } catch (err) {
                    console.error('Cannot access CSS:', err);
                }
                if (raw) css.push({ raw });
            }
            return css;
        });
        const purgedCSS = await new PurgeCSS().purge({
            css: pageCSS,
            content: [{ raw: snapshot.html, extension: 'html' }],
        });
        const joinedCSS = purgedCSS.map(({ css }) => css.trim()).join('\n');
        const finalCSS = new CleanCSS({ mergeAdjacentRules: true }).minify(joinedCSS);
        console.log('Stats:', finalCSS.stats);

        console.log('Replacing existing CSS...');
        await page.evaluate(() => {
            for (const c of document.querySelectorAll('style')) {
                c.parentNode.removeChild(c);
            }
        });
        await page.evaluate((css) => {
            const cssHack = document.createElement('style');
            cssHack.className = 'purge';
            cssHack.innerText = css;
            document.head.appendChild(cssHack);
        }, finalCSS.styles);

        // final snapshot
        snapshot.html = (await page.content()).trim();
        // remove obsolete CSS resources
        for (const k of Object.keys(snapshot.responses)) {
            const res = snapshot.responses[k];
            if (res.headers['content-type'] && res.headers['content-type'].startsWith('text/css')) {
                console.log('Purging CSS response:', k);
                res.body = null;
                delete snapshot.responses[k];
            }
        }
    }

    return snapshot;
}
