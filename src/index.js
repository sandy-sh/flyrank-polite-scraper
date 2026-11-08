import { readFile, writeFile, access } from 'node:fs/promises';
import * as cheerio from 'cheerio';

    const url = 'https://books.toscrape.com/';
    let currentPageUrl = url;
    let cataloguePages = 1;

    const bookUrls = [];

    while (cataloguePages <= 3) {
        const cachePath = `../cache/catalogue-page-${cataloguePages}.html`;
        let content;

        try {
            await access(cachePath);
            content = await readFile(cachePath, 'utf8');
    
            const size = Buffer.byteLength(content, 'utf8');
            console.log('CACHE HIT');
            console.log(`response_size= ${size} bytes`);
        } catch (err) {
            if (err.code !== 'ENOENT') {
                throw err;
            }

            await new Promise(resolve => setTimeout(resolve, 500));
            
            let controller = new AbortController();

            const timeout = setTimeout(() => {
                controller.abort();
            }, 10000);

            try {
                const response = await fetch(currentPageUrl, {
                headers: {
                    'User-Agent' : 'FlyRankInternship-A9/PoliteScraper (https://github.com/sandy-sh/flyrank-polite-scraper.git)'
                },
                signal: controller.signal
                });

                if (response.status !== 200) {
                    throw new Error(`Unexpected status: ${response.status}`);
                }

                content = await response.text();
                const size = Buffer.byteLength(content, 'utf8');
                console.log(`response_size= ${size} bytes`);

                await writeFile(cachePath, content, 'utf8');
                console.log('FETCH');
            } finally {
                clearTimeout(timeout);
            }
        }

        const $ = cheerio.load(content);

        const bookLinks = $('article.product_pod h3 a');
        bookLinks.each((index, element) => {
            const href = $(element).attr('href');

            bookUrls.push(new URL(href, currentPageUrl).href);
        });

        
        if (cataloguePages >= 3) {
            break;
        }

        cataloguePages++;

        const nextPageLink = $('li.next a').attr('href');
        if (nextPageLink) {
            currentPageUrl = new URL(nextPageLink, currentPageUrl).href;
            console.log(`Fetching next page: ${currentPageUrl}`);
        }
    }
    console.log(`catalogue_pages=${cataloguePages}`);
    console.log(`discovered=${bookUrls.length}`);
    console.log(`unique_urls=${new Set(bookUrls).size}`);

