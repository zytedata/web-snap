import test from 'ava';
import { restorePage } from '../src/restore.js';

test('basic restore page', async (t) => {
    const RECORD = {
        url: 'https://example.com',
        base_url: 'https://example.com/',
        html: 'Example page',
        responses: {},
    };
    const { page, browser } = await restorePage({ RECORD, timeout: 1, wait: 0, headless: true });

    const url = page.url();
    t.is(RECORD.base_url, url);
    const base_url = await page.evaluate('document.baseURI');
    t.is(RECORD.base_url, base_url);
    const html = (await page.content()).trim();
    t.true(html.includes('<body>Example page</body>'));

    await browser.close();
});

test('complex restore page', async (t) => {
    const RECORD = {
        url: 'https://example.com/complex/',
        base_url: 'https://example.com/complex/',
        html: `<!DOCTYPE html><html>
<head>
    <link rel="stylesheet" href="style.css">
    <script src="script.js"></script>
</head>
<body>
    <div id="target">Original</div>
    <img src="small.png">
</body>
</html>`,
        responses: {
            'GET:https://example.com/style.css': {
                'body': 'QUOPRI:body { background-color: gray; }',
                'headers': {
                    'content-type': 'text/css',
                },
                'request_url': 'https://example.com/style.css',
                'status': 200,
            },
            'GET:https://example.com/script.js': {
                'body': `QUOPRI:document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('target').innerText='Changed by JS';
});`,
                'headers': {
                    'content-type': 'application/javascript',
                },
                'request_url': 'https://example.com/script.js',
                'status': 200,
            },
            'GET:https://example.com/small.png': {
                // 1x1 transparent PNG
                'body': 'BASE64:iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
                'headers': {
                    'content-type': 'image/png',
                },
                'request_url': 'https://example.com/small.png',
                'status': 200,
            },
        },
    };

    const { page, browser } = await restorePage({
        RECORD,
        offline: true,
        js: true,
        timeout: 3,
        wait: 3,
        headless: true,
    });

    const targetText = await page.locator('#target').innerText();
    t.is(targetText, 'Changed by JS');

    // Verify if the image has been loaded from cache
    const [imgWidth, imgHeight] = await page.locator('img').evaluate((img) => [img.naturalWidth, img.naturalHeight]);
    t.is(imgWidth, 1);
    t.is(imgHeight, 1);

    await browser.close();
});
