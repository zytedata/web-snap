#!/usr/bin/env node
/*
 * Record a page.
 */
import fs from 'fs';
import mri from 'mri';
import { gzip } from 'zlib';
import { promisify } from 'util';
import playwright from 'playwright';
import CleanCSS from 'clean-css';
import { PurgeCSS } from 'purgecss';
import { minify } from 'html-minifier-terser';

import { delay, requestKey, normalizeURL, checkBrowser, toBool, smartSplit } from './util.js';

const options = {
    boolean: ['help', 'version'],
    alias: {
        i: 'input',
        o: 'output',
        v: 'version',
        z: 'gzip',
        css: 'addCSS',
        rm: 'removeElems',
        drop: 'dropRequests',
    },
    default: {
        browser: 'chromium',
        gzip: null, // compress final JSON
        headless: null, // visible browser window
        imgTimeout: 15 * 1000,
        js: 'on', // disable JS execution and capturing
        minify: null, // min final HTML before save
        purgeCSS: null, // purge unused CSS and generate 1 single CSS file
        timeout: 15 * 1000, // navigation timeout
        wait: 5 * 1000,
        // headers: 'content-type, date', // Content-Type header is pretty important
        headers: 'content-type, date, content-language, last-modified, expires', // extended version
        // userAgent: Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.0.0 Safari/537.36
        dropRequests: '', // drop matching requests
        removeElems: '', // remove page elements
        addCSS: '', // add extra CSS
    },
};

function processArgs(args) {
    args.gzip = toBool(args.gzip);
    args.js = toBool(args.js);
    args.headless = toBool(args.headless);
    args.minify = toBool(args.minify);
    args.purgeCSS = toBool(args.purgeCSS);

    args.CSS = args.addCSS ? args.addCSS.trim() : '';
    args.HEADERS = smartSplit(args.headers).map(x => x.toLowerCase());
    args.REMOVE = smartSplit(args.removeElems);
    // console.log(args);
}

;(async function main() {
    const args = mri(process.argv.slice(2), options);

    if (args.version) {
        console.log('Web-Snap v' + pkg.version);
        return;
    }

    if (!checkBrowser(args.browser)) {
        console.error(`Invalid browser name "${args.browser}"! Cannot launch!`);
    }

    processArgs(args);
    const { CSS, HEADERS, REMOVE } = args;
    const URI = args._[0] || args.input;

    let HOST = new URL(URI).host;
    if (HOST.startsWith('www.')) HOST = HOST.slice(4);
    let OUT = args._[1] || args.output;
    if (!OUT) OUT = `snapshot_${HOST}.json`;
    if (args.gzip && !OUT.endsWith('.gz')) OUT += '.gz';

    const DROP = [];
    for (const re of smartSplit(args.dropRequests)) {
        DROP.push(new RegExp(re, 'i'));
    }

    const restrictHeaders = function (resp) {
        const headers = resp.headers();
        return Object.fromEntries(Object.entries(headers).filter(([key]) => HEADERS.includes(key)));
    };

    const snapshot = { url: URI, html: '', responses: {} };

    // XXX -- persistent context seems broken
    // const context = await playwright.firefox.launchPersistentContext('~/.mozilla/firefox/..', {headless: args.headless});

    const browser = await playwright[args.browser].launch({ headless: args.headless });
    const context = await browser.newContext({
        javaScriptEnabled: args.js,
        userAgent: args.userAgent,
        ignoreHTTPSErrors: true,
        viewport: null,
    });
    const page = await context.newPage();

    page.on('close', async () => {
        if (args.minify) {
            try {
                snapshot.html = await minify(snapshot.html, {
                    removeAttributeQuotes: true,
                    sortAttributes: true,
                    sortClassName: true,
                });
            } catch (err) {
                console.error('Cannot minify!', err);
            }
        }
        if (args.gzip) {
            const record = await promisify(gzip)(JSON.stringify(snapshot));
            await fs.promises.writeFile(OUT, record, { encoding: 'utf8' });
        } else {
            await fs.promises.writeFile(OUT, JSON.stringify(snapshot, null, 2), { encoding: 'utf8' });
        }
        console.log(`Snapshot file: "${OUT}" was saved`);
        process.exit();
    });

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
        if (status >= 300 && status <= 399) {
            console.log('Redirect from:', u, 'to:', response.headers()['location']);
            return;
        }
        if (status >= 500) {
            console.error('Remote server error', status, u);
            return;
        }
        console.log('Request:', requestKey(r), response.status());
        const headers = restrictHeaders(response);
        let buffer;
        try {
            buffer = await response.body();
        } catch (err) {
            console.error('Cannot save response for:', u);
            return;
        }
        snapshot.responses[requestKey(r)] = {
            body: buffer.toString('base64'),
            headers,
            request_url: u,
            response_url: response.url(),
            status,
        };
    });

    try {
        console.log('Waiting for the page to load...');
        await page.goto(URI, { timeout: args.timeout, waitUntil: 'networkidle' });
    } catch (err) {
        console.error('Wait timeout:', err);
    }

    // initial snapshot
    snapshot.html = (await page.content()).trim();
    // resolved base URL
    snapshot.base_url = await page.evaluate('document.baseURI');

    try {
        console.log('Waiting for images to load...');
        await page.waitForSelector('img', { timeout: args.imgTimeout });
    } catch (err) {
        console.error('Images timeout:', err);
    }

    for (const selector of REMOVE) {
        console.log('Removing element selector:', selector);
        await page.evaluate((s) => {
            for (const el of document.querySelectorAll(s)) {
                el.parentNode.removeChild(el);
            }
        }, selector);
    }

    if (CSS) {
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
        console.log(finalCSS.stats);

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
        snapshot.html = await page.content();
        for (const k of Object.keys(snapshot.responses)) {
            const res = snapshot.responses[k];
            if (res.headers['content-type'] && res.headers['content-type'].startsWith('text/css')) {
                console.log('Purging CSS response:', k);
                res.body = null;
                delete snapshot.responses[k];
            }
        }
    }

    await delay(args.wait);

    // final snapshot
    snapshot.html = (await page.content()).trim();

    await browser.close();
})();
