import { readFile, writeFile, access, mkdir } from 'node:fs/promises';
import * as cheerio from 'cheerio';
import { z } from 'zod';

const url = 'https://books.toscrape.com/';
let currentPageUrl = url;
let cataloguePages = 1;

const bookUrls = [];
const bookRawData = [];

const bookSchema = z.object({
    title: z.string(),
    product_url: z.string().url(),
    price_text: z.string(),
    price_gbp: z.number(),
    availability_text: z.string(),
    rating_text: z.string(),
    description: z.string().nullable(),
    source_page: z.string().url(),
    fetched_at: z.iso.datetime()
})

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

const uniqueUrls = new Set();

for (let index = 0; index < bookUrls.length; index++) {
    const book = bookUrls[index];

    if (uniqueUrls.has(book.product_url)){
        continue
    } 

    uniqueUrls.add(book.product_url);

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
    const titleText = $('div.product_main h1').text().trim();
    const priceText = $('div.product_main p.price_color').text().trim();
    const availabilityText = $('div.product_main p.availability').text().trim();
    const ratingText = $('div.product_main p.star-rating')?.attr('class').split(' ')[1];
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

function normalizePrice(bookRawData) {
    const rawData = [];

    for (let i = 0; i < bookRawData.length; i++) {
        rawData.push({
            "title": bookRawData[i].title,
            "product_url": bookRawData[i].product_url,
            "price_text": bookRawData[i].price_text,
            "price_gbp": Number(bookRawData[i].price_text.replace('£', '')),
            "availability_text": bookRawData[i].availability_text,
            "rating_text": bookRawData[i].rating_text,
            "description": bookRawData[i].description,
            "source_page": bookRawData[i].source_page,
            "fetched_at": bookRawData[i].fetched_at
        })
    }

    return rawData;
}

const normalizedBookData = normalizePrice(bookRawData);
console.log(JSON.stringify(normalizedBookData[0], null, 2));
console.log(`detail_pages=${normalizedBookData.length}`);

const validBook = [];
const invalidBook = [];

for (const book of normalizedBookData) {
    const result = bookSchema.safeParse(book);

    if (result.success) {
        validBook.push(result.data);
    } else {
        invalidBook.push({
            "book": book,
            "errors": result.error.issues
        });
    }
}

console.log(`valid_book=${validBook.length}`);
console.log(`invalid_book=${invalidBook.length}`);

await mkdir('../output', { recursive: true });
await writeFile('../output/books.json', JSON.stringify(validBook, null, 2), 'utf8');
await writeFile('../output/errors.json', JSON.stringify(invalidBook, null, 2), 'utf8');