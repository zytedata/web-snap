#!/usr/bin/env node
import mri from 'mri';

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
        .filter(([_, v]) => v >= maxValue / 12);
    const totSize = data.reduce((sum, curr) => sum + curr[1], 0);

    console.log(`\nHTML size is ${snap.html.length}`);
    console.log(`Resources size is ${totSize}`);
    console.log(`There are ${Object.keys(snap.responses).length} resources in total`);

    data.push(['GET:HTML body', snap.html.length]);

    data.sort((a, b) => b[1] - a[1]);
    console.log('\nTop resources by size::');
    for (const item of data.slice(0, 10)) {
        const barText = bar(item[1], maxValue);
        const suffix = ' ' + item[1];
        console.log(item[0].slice(4).replace(/^https?:\/\/(w+\.)?/, ''));
        console.log(barText + suffix);
    }

    console.log('\nResources by type::');
    resourceTypes = Array.from(Object.entries(resourceTypes));
    resourceTypes.sort((a, b) => b[1] - a[1]);
    maxValue = resourceTypes[0][1];
    for (const item of resourceTypes) {
        const barText = bar(item[1], maxValue);
        const suffix = ' ' + item[1];
        console.log(item[0]);
        console.log(barText + suffix);
    }
})();
