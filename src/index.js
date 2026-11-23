import { readFile, writeFile, access } from 'node:fs/promises';
import * as cheerio from 'cheerio';

const url = 'https://books.toscrape.com/';
let currentPageUrl = url;
let cataloguePages = 1;

const bookUrls = [];
const bookRawData = [];

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

        bookUrls.push({ 
            "product_url": new URL(href, currentPageUrl).href,
            "source_page": currentPageUrl
        });
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
console.log(`unique_urls=${new Set(bookUrls.map(book => book.product_url)).size}`);

for (let index = 0; index < bookUrls.length; index++) {
    const book = bookUrls[index];

    const bookCachePath = `../cache/book-${index + 1}.html`;
    let bookContent;

    try {
        await access(bookCachePath);
        bookContent = await readFile(bookCachePath, 'utf8');

        const size = Buffer.byteLength(bookContent, 'utf8');
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
            const response = await fetch(book.product_url, {
            headers: {
                'User-Agent' : 'FlyRankInternship-A9/PoliteScraper (https://github.com/sandy-sh/flyrank-polite-scraper.git)'
            },
            signal: controller.signal
            });

            if (response.status !== 200) {
                throw new Error(`Unexpected status: ${response.status}`);
            }

            bookContent = await response.text();
            const size = Buffer.byteLength(bookContent, 'utf8');
            console.log(`response_size= ${size} bytes`);

            await writeFile(bookCachePath, bookContent, 'utf8');
            console.log('FETCH');
        } finally {
            clearTimeout(timeout);
        }
    }

    const $ = cheerio.load(bookContent);
    const titleText = $('div.product_main h1')?.text().trim() ?? null;
    const priceText = $('div.product_main p.price_color')?.text().trim() ?? null;
    const availabilityText = $('div.product_main p.availability')?.text().trim() ?? null;
    const ratingText = $('div.product_main p.star-rating')?.attr('class')?.split(' ')[1] ?? null;
    const descriptionText = $('div#product_description + p').text().trim() || null;
    const fetchedAt = new Date().toISOString();

    bookRawData.push({
        "title": titleText,
        "product_url": book.product_url,
        "price_text": priceText,
        "availability_text": availabilityText,
        "rating_text": ratingText,
        "description": descriptionText,
        "source_page": book.source_page,
        "fetched_at": fetchedAt
    });
}

console.log(JSON.stringify(bookRawData[0], null, 2));
console.log(`detail_pages=${bookRawData.length}`);