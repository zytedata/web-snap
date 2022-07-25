/*
 * Record a page.
 */
import fs from 'fs';
import mri from 'mri';
import { chromium } from 'playwright';
import { delay, requestKey, normalizeURL } from './util.js';

function restrictHeaders(resp) {
    const headers = resp.headers();
    return Object.fromEntries(Object.entries(headers).filter(([key]) => key === 'content-type' || key === 'date'));
}

async function saveSnap(out, snapshot) {
    await fs.promises.writeFile(out, JSON.stringify(snapshot, null, 2), { encoding: 'utf8' });
    console.log(`Snapshot file: "${out}" was saved`);
}

const options = {
    boolean: ['help', 'version', 'jsEnabled'],
    alias: {
        i: 'input',
        o: 'output',
        v: 'version',
        // c: 'config',
    },
    default: {
        wait: 5 * 1000,
        headless: false,
        output: 'snapshot.json',
        timeout: 15 * 1000,
        imgTimeout: 15 * 1000,
        // headers
    },
};

(async function main() {
    const args = mri(process.argv.slice(2), options);
    // console.log(args);

    if (args.version) {
        console.log('Web-Snap v' + pkg.version);
        return;
    }

    const URL = args._[0] || args.input;
    const OUT = args._[1] || args.output;

    const snapshot = { url: URL, html: '', responses: {} };

    const browser = await chromium.launch({ headless: args.headless });
    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: null });
    const page = await context.newPage();

    page.on('close', async () => {
        await saveSnap(OUT, snapshot);
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

    // initial snapshow
    snapshot.html = (await page.content()).trim();

    try {
        console.log('Waiting for images to load...');
        await page.waitForSelector('img', { timeout: args.imgTimeout });
    } catch (err) {
        console.error('Images timeout:', err);
    }

    // second snapshow
    snapshot.html = (await page.content()).trim();

    await delay(args.wait);

    // final snapshow
    snapshot.html = (await page.content()).trim();

    await browser.close();
})();
