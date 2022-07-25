/*
 * Record a page.
 */
import fs from 'fs';
import mri from 'mri';
import playwright from 'playwright';
import { delay, requestKey, normalizeURL, checkBrowser, smartSplit } from './util.js';

const options = {
    boolean: ['help', 'version', 'jsEnabled'],
    alias: {
        i: 'input',
        o: 'output',
        v: 'version',
        // c: 'config',
    },
    default: {
        browser: 'chromium',
        wait: 5 * 1000,
        headless: false,
        output: 'snapshot.json',
        timeout: 15 * 1000,
        imgTimeout: 15 * 1000,
        jsEnabled: false, // disable JS execution and capturing
        // headers: 'content-type, date', // Content-Type header is pretty important
        headers: 'content-type, date, content-language, last-modified, expires', // extended version
        // userAgent: Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.0.0 Safari/537.36
        removeElems: '', // remove page elements
        addCSS: '', // add extra CSS
    },
};

(async function main() {
    const args = mri(process.argv.slice(2), options);
    // console.log(args);

    if (args.version) {
        console.log('Web-Snap v' + pkg.version);
        return;
    }

    if (!checkBrowser(args.browser)) {
        console.error(`Invalid browser name "${args.browser}"! Cannot launch!`);
    }
    if (args.jsEnabled === 'off') {
        args.jsEnabled = false;
    }

    const URL = args._[0] || args.input;
    const OUT = args._[1] || args.output;
    const HEADERS = smartSplit(args.headers);
    const REMOVE = smartSplit(args.removeElems);
    const CSS = args.addCSS;

    const restrictHeaders = function (resp) {
        const headers = resp.headers();
        return Object.fromEntries(Object.entries(headers).filter(([key]) => HEADERS.includes(key)));
    };

    const snapshot = { url: URL, html: '', responses: {} };

    const browser = await playwright[args.browser].launch({ headless: args.headless });
    const context = await browser.newContext({
        javaScriptEnabled: args.jsEnabled,
        userAgent: args.userAgent,
        ignoreHTTPSErrors: true,
        viewport: null,
    });
    const page = await context.newPage();

    page.on('close', async () => {
        await fs.promises.writeFile(OUT, JSON.stringify(snapshot, null, 2), { encoding: 'utf8' });
        console.log(`Snapshot file: "${OUT}" was saved`);
        process.exit();
    });

    page.on('response', async (response) => {
        const r = response.request();
        const u = normalizeURL(r.url());
        if (u.startsWith('data:')) {
            return;
        }
        if (u === normalizeURL(URL)) return;
        const status = response.status();
        if (status >= 300 && status <= 399) {
            console.log('Redirect from:', u, 'to:', response.headers()['location']);
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
        await page.goto(URL, { timeout: args.timeout, waitUntil: 'networkidle' });
    } catch (err) {
        console.error('Wait timeout:', err);
    }

    for (const selector of REMOVE) {
        console.log('Removing element selector:', selector);
        await page.evaluate((s) => {
            for (const el of document.querySelectorAll(s)) {
                el.parentNode.removeChild(el);
            }
        }, selector);
    }

    if (CSS && CSS.trim()) {
        console.log('Adding custom CSS...');
        await page.evaluate((css) => {
            const cssHack = document.createElement('style');
            cssHack.className = 'hack';
            cssHack.innerText = css;
            document.head.appendChild(cssHack);
        }, CSS);
    }

    // initial snapshot
    snapshot.html = (await page.content()).trim();

    try {
        console.log('Waiting for images to load...');
        await page.waitForSelector('img', { timeout: args.imgTimeout });
    } catch (err) {
        console.error('Images timeout:', err);
    }

    // second snapshot
    snapshot.html = (await page.content()).trim();

    await delay(args.wait);

    // final snapshot
    snapshot.html = (await page.content()).trim();

    await browser.close();
})();
