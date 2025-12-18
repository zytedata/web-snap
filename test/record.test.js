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
        timeout: 3,
        imgTimeout: 3,
        headless: true,
    });
    t.is(snapshot.url, `http://localhost:${PORT}`);
    t.is(snapshot.base_url, `http://localhost:${PORT}/`);
    t.true(snapshot.html.includes('<body>Hello world</body>'));
    t.deepEqual(snapshot.responses, {});

    await browser.close();
    server.close();
});
