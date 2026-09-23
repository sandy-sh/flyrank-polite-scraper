import { readFile, writeFile, access } from 'node:fs/promises';

    const url = 'https://books.toscrape.com/';
    const cachePath = './cache/catalogue-page-1.html';

    let controller = new AbortController();
    const timeout = setTimeout(() => {
        controller.abort();
    }, 10000);

try {
    await access(cachePath);
    
    const content = await readFile(cachePath, 'utf8');
    const size = Buffer.byteLength(content, 'utf8');

    console.log('CACHE HIT');
    console.log(`response_size= ${size} bytes`);

} catch (err) {
    const response = await fetch(url, {
        headers: {
            'User-Agent' : 'FlyRankInternship-A9/PoliteScraper (https://github.com/sandy-sh/flyrank-polite-scraper.git)'
        },
        signal: controller.signal
    });

    if (response.status !== 200) {
        throw new Error(`Unexpected status: ${response.status}`);
    }

    const html = await response.text();
    const size = Buffer.byteLength(html, 'utf8');
    console.log(`response_size= ${size} bytes`);

    await writeFile(cachePath, html, 'utf8');

    clearTimeout(timeout);
    console.log('FETCH');
}