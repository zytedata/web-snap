import test from 'ava';
import http from 'http';
import express from 'express';
import { recordPage } from '../src/record.js';

const PORT = 12345;

function createTestServer() {
    const app = express();
    const server = http.createServer(app);
    app.set('etag', false);
    return { app, server };
}

test('basic record page', async (t) => {
    const { app, server } = createTestServer();
    app.get('/', function (_, res) {
        res.send('<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>Hello world</body></html>');
    });
    await new Promise((resolve) => server.listen(PORT, resolve));

    const { snapshot, browser } = await recordPage({
        url: `http://localhost:${PORT}`,
        wait: 0,
        timeout: 1,
        imgTimeout: 1,
        headless: true,
    });
    t.is(snapshot.url, `http://localhost:${PORT}`);
    t.is(snapshot.base_url, `http://localhost:${PORT}/`);
    t.true(snapshot.html.includes('<body>Hello world</body>'));
    t.deepEqual(snapshot.responses, {});

    await browser.close();
    server.close();
});

test('record page with minCSS', async (t) => {
    const { app, server } = createTestServer();
    const testPort = PORT + 1;
    app.get('/', function (_, res) {
        res.send(`<!DOCTYPE html><html><head><meta charset="utf-8">
        <style>
            body {
                background-color: #deadbeef;
            }
        </style>
        <style>
            .unused {
                background: #coffee;
            }
            .unused {
                color: #coffee;
            }
        </style>
        </head><body>
        <style>
            body {
                margin: 0px 0px 0px 0px;
            }
        </style>
        Hello minCSS</body></html>`);
    });
    await new Promise((resolve) => server.listen(testPort, resolve));

    const { snapshot, browser } = await recordPage({
        url: `http://localhost:${testPort}`,
        wait: 1,
        timeout: 1,
        imgTimeout: 1,
        headless: true,
        minCSS: true,
    });

    t.is(snapshot.url, `http://localhost:${testPort}`);
    t.true(snapshot.html.includes('<style class="clean">'));
    t.true(snapshot.html.includes('{background-color:#deadbeef'));
    t.true(snapshot.html.includes('margin:0}'));
    t.false(snapshot.html.includes('#coffee'));

    await browser.close();
    server.close();
});
