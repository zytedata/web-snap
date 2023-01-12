import test from 'ava';
import http from 'http';
import express from 'express';
import { recordPage } from '../src/record.js';

const PORT = 12345;

function createTestServer() {
    const server = express();
    server.http = http.createServer(server);
    server.set('etag', false);
    server.port = PORT;
    server.url = `http://localhost:${PORT}`;
    return server;
}

test('basic record page', async (t) => {
    const server = createTestServer();
    server.get('/', function (_, res) {
        res.send('<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>Hello world</body></html>');
    });
    server.listen(PORT);

    const { snapshot, browser } = await recordPage({ url: server.url, timeout: 3, imgTimeout: 3, headless: true });
    t.is(snapshot.url, server.url);
    t.is(snapshot.base_url, server.url + '/');
    t.true(snapshot.html.includes('<body>Hello world</body>'));
    t.deepEqual(snapshot.responses, {});

    await browser.close();
    server.http.close();
});
