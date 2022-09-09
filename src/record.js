/*
 * Record a page.
 */
import fetch from 'cross-fetch';
import playwright from 'playwright';
import CleanCSS from 'clean-css';
import { PurgeCSS } from 'purgecss';
import { PlaywrightBlocker } from '@cliqz/adblocker-playwright';

import { requestKey, normalizeURL, toBool, smartSplit } from './util.js';

function processArgs(args) {
    args.gzip = toBool(args.gzip);
    args.js = toBool(args.js);
    args.blockAds = toBool(args.blockAds);
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

    args.URI = args._ ? args._[0] : null || args.input || args.url;
    let HOST = new URL(args.URI).host;
    if (HOST.startsWith('www.')) HOST = HOST.slice(4);
    let OUT = args._ ? args._[1] : null || args.output;
    if (!OUT) OUT = `snapshot_${HOST}.json`;
    if (args.gzip && !OUT.endsWith('.gz')) OUT += '.gz';
    args.OUT = OUT;
}

export async function recordPage(args) {
    processArgs(args);

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
    const { URI, DROP, HEADERS, REMOVE, CSS } = args;

    if (DROP && DROP.length) {
        page.route('**', async (route) => {
            const r = route.request();
            const u = normalizeURL(r.url());
            for (const re of DROP) {
                if (re.test(u)) {
                    console.log('Drop matching request:', re, u);
                    route.abort();
                    return;
                }
            }
            route.continue();
        });
    }

    const snapshot = { url: URI, base_url: '', canonical_url: '', html: '', responses: {} };

    page.on('response', async (response) => {
        const r = response.request();
        const u = normalizeURL(r.url());
        if (u.startsWith('data:')) {
            return;
        }
        // ignore the index page, it will be saved at the end
        if (u === normalizeURL(URI)) return;
        const status = response.status();
        // ignore redirect requests, they will be saved after resolved
        if (status >= 300 && status < 400) {
            console.log('Redirect from:', u, 'to:', response.headers()['location']);
            return;
        } else if (status >= 500) {
            // don't save server error responses
            console.error('Remote server error', status, u);
            return;
        }
        // else if (status >= 400 && status < 500) {
        //     // should we save client error responses?
        //     console.error('Ignoring client error', status, u);
        //     return;
        // }
        const key = requestKey(r);
        console.log('Response:', status, key);

        // restrict headers to subset
        let headers = Object.entries(response.headers()).filter(([key]) => HEADERS.includes(key));
        headers = Object.fromEntries(headers);

        let body;
        try {
            const buffer = await response.body();
            body = buffer.toString('base64');
        } catch (err) {
            const frame = page.frame({ url: u });
            if (frame && args.iframes) {
                console.log('Capture IFRAME content for:', frame.url());
                const content = (await frame.content()).trim();
                body = new Buffer.from(content, 'binary').toString('base64');
            } else if (status !== 204) {
                console.error('ERR saving response for:', status, u, err);
                // try {
                //     response = await page.request.fetch(r, { ignoreHTTPSErrors: true, failOnStatusCode: true });
                //     const buffer = await response.body();
                //     body = buffer.toString('base64');
                //     console.log('SUCCESS FETCH:', key);
                // } catch (err) {
                //     console.error('FETCH ERR', err);
                // }
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
    // resolved canonical URL
    snapshot.canonical_url = await page.evaluate(
        `(document.querySelector("link[rel='canonical']") || document.createElement('link')).getAttribute('href')`,
    );
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
