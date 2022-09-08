import test from 'ava';
import { restorePage } from '../src/restore.js';

test('basic restore page', async (t) => {
    const RECORD = { url: 'http://example.com', base_url: 'http://example.com/', html: 'Example page', responses: {} };
    const { page, browser } = await restorePage({ RECORD, timeout: 1, wait: 1, headless: true });

    const url = page.url();
    t.is(RECORD.base_url, url);
    const base_url = await page.evaluate('document.baseURI');
    t.is(RECORD.base_url, base_url);
    const html = (await page.content()).trim();
    t.true(html.includes('<body>Example page</body>'));

    await browser.close();
});
