import test from 'ava';
import createTestServer from 'create-test-server';
import { recordPage } from '../src/record.js';

test('basic record page', async (t) => {
    const server = await createTestServer();
    server.get('/', '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>Hello world</body></html>');

    const [snap, _, browser] = await recordPage({ url: server.url, timeout: 3, imgTimeout: 3, headless: true });
    t.is(snap.url, server.url);
    t.is(snap.base_url, server.url + '/');
    t.true(snap.html.includes('<body>Hello world</body>'));

    await browser.close();
    await server.close();
});
