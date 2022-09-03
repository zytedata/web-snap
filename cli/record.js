#!/usr/bin/env node
import fs from 'fs';
import { gzip } from 'zlib';
import { promisify } from 'util';
import { minify } from 'html-minifier-terser';
import mri from 'mri';

import pkg from '../package.json' assert { type: 'json' };
import { recordPage } from '../src/record.js';
import { delay } from '../src/util.js';

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
        blockAds: null, // enable AdBlocker?
        imgTimeout: 15,
        js: 'on', // disable JS execution and capturing
        minify: null, // min final HTML before save
        purgeCSS: null, // purge unused CSS and generate 1 single CSS file
        timeout: 15, // navigation timeout
        wait: 5, // wait for user interaction (seconds)
        // headers: 'content-type, date', // Content-Type header is pretty important
        headers: 'content-type, content-length, date, content-language, last-modified', // extended version
        userAgent: '', // custom user agent
        // userAgent: Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.0.0 Safari/537.36
        dropRequests: '', // drop matching requests
        removeElems: '', // remove page elements
        addCSS: '', // add extra CSS
    },
};

(async () => {
    const args = mri(process.argv.slice(2), options);

    if (args.version) {
        console.log('Web-Snap v' + pkg.version);
        return;
    }

    const [snapshot, page, browser] = await recordPage(args);

    page.on('close', async () => {
        if (args.minify) {
            try {
                snapshot.html = await minify(snapshot.html, {
                    removeAttributeQuotes: true,
                    sortAttributes: true,
                    sortClassName: true,
                });
            } catch (err) {
                console.error('Cannot minify HTML!', err);
            }
        }
        if (args.gzip) {
            const record = await promisify(gzip)(JSON.stringify(snapshot));
            await fs.promises.writeFile(args.OUT, record, { encoding: 'utf8' });
        } else {
            await fs.promises.writeFile(args.OUT, JSON.stringify(snapshot, null, 2), { encoding: 'utf8' });
        }
        console.log(`Snapshot file: "${args.OUT}" was saved`);
        process.exit();
    });

    await delay(args.wait);
    await browser.close();
})();