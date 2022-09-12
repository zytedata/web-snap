#!/usr/bin/env node
import mri from 'mri';
import prettyBytes from 'pretty-bytes';

import { parseSnapshot } from '../src/util.js';

const options = {
    alias: {
        i: 'input',
    },
};

function bar(value, maxValue) {
    // https://github.com/morishin/ascii-horizontal-barchart
    const fractions = ['▏', '▎', '▍', '▋', '▊', '▉'];
    const barLength = (value * 100) / maxValue;
    const wholeNumberPart = Math.floor(barLength);
    const fractionalPart = barLength - wholeNumberPart;
    let txt = fractions[fractions.length - 1].repeat(wholeNumberPart);
    if (fractionalPart > 0) txt += fractions[Math.floor(fractionalPart * fractions.length)];
    return txt;
}

(async () => {
    const args = mri(process.argv.slice(2), options);

    const fname = args._ ? args._[0] : null || args.input;
    const snap = await parseSnapshot(fname);

    let resourceTypes = {};
    let maxValue = Math.max(...Object.values(snap.responses).map((v) => (v.body ? v.body.length : 0)));
    const data = Object.entries(snap.responses)
        .map(([k, v]) => {
            const t = (v.headers && v.headers['content-type']) ? v.headers['content-type'].split('/')[0] : 'other';
            if (resourceTypes[t]) resourceTypes[t] += 1;
            else resourceTypes[t] = 1;
            return [k, v.body ? v.body.length : 0];
        })
        .filter(([_, v]) => v >= maxValue / 20 && v > 100);
    const totSize = data.reduce((sum, curr) => sum + curr[1], 0);

    console.log(`\nHTML body size: ${prettyBytes(snap.html.length, { minimumFractionDigits: 2 })}`);
    console.log(`Resources size: ${prettyBytes(totSize, { minimumFractionDigits: 2 })}`);
    console.log(`There are ${Object.keys(snap.responses).length} resources in total`);

    data.push(['GET:HTML body', snap.html.length]);

    data.sort((a, b) => b[1] - a[1]);
    console.log('\nTop resources by size::');
    for (const [txt, nr] of data.slice(0, 10)) {
        const barText = bar(nr, maxValue);
        const suffix = ' ' + prettyBytes(nr, { minimumFractionDigits: 2 });
        let http = txt.slice(4).replace(/^https?:\/\/(w+\.)?/, '');
        if (http.length > 165) http = http.slice(0, 160) + ' ... ' + http.slice(-5);
        console.log(http);
        console.log(barText + suffix);
    }

    console.log('\nResources by type::');
    resourceTypes = Array.from(Object.entries(resourceTypes));
    resourceTypes.sort((a, b) => b[1] - a[1]);
    maxValue = resourceTypes[0][1];
    for (const [txt, nr] of resourceTypes) {
        const barText = bar(nr, maxValue);
        const suffix = ' ' + nr;
        console.log(txt + '\n' + barText + suffix);
    }
})();
