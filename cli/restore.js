#!/usr/bin/env node
import mri from 'mri';

import pkg from '../package.json' assert { type: 'json' };
import { restorePage } from '../src/restore.js';
import { delay } from '../src/util.js';

const options = {
    boolean: ['help', 'version'],
    alias: {
        i: 'input',
        v: 'version',
        rm: 'removeElems',
        // c: 'config',
    },
    default: {
        headless: null, // visible browser window
        js: 'yes', // JS execution on restore
        offline: 'yes', // force browser offline
        timeout: 15, // navigation timeout
        wait: 120, // keep the browser open (seconds)
        overwrite: null, // overwrite body HTML with HTML from snapshot
        removeElems: '', // remove page elements
    },
};

(async () => {
    const args = mri(process.argv.slice(2), options);

    if (args.version) {
        console.log('Web-Snap v' + pkg.version);
        return;
    }

    const { page, browser } = await restorePage(args);
    page.on('close', process.exit);
    browser.on('disconnected', process.exit);

    await delay(args.wait);
    await browser.close();
})();
