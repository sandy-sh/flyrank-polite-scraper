import { readFile, writeFile, access, mkdir } from 'node:fs/promises';
import * as cheerio from 'cheerio';
import { z } from 'zod';

const startTime = new Date();
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

const runReport = {
    start_time: startTime.toISOString(),
    duration_ms: 0,
    pages_fetched: 0,
    cache_hits: 0,
    valid_records: 0,
    invalid_records: 0,
    failed_pages: []
}

async function politeFetch(targetUrl, timeoutMs = 10000) {
    const maxAttempts = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 500));

        const controller = new AbortController();

        const timeout = setTimeout(() => {
            controller.abort();
        }, timeoutMs);

        try {
            const response = await fetch(targetUrl, {
            headers: {
                'User-Agent' : 'FlyRankInternship-A9/PoliteScraper (https://github.com/sandy-sh/flyrank-polite-scraper.git)'
            },
            signal: controller.signal
            });

            if (response.status === 404 || response.status === 403 || (response.status >= 400 && response.status < 500)) {
                throw new Error(`Client error: HTTP ${response.status} - page does not exist or access forbidden`);
            }

            if (response.status >= 500 && attempt < maxAttempts) {
                console.warn(`[WARN] Server error ${response.status} fetching ${targetUrl}. Waiting before retry...`);

                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }

            if (!response.ok) {
                throw new Error(`Server error: HTTP ${response.status}`);
            }

            const html = await response.text();
            
            runReport.pages_fetched++;
            return html;

        } catch (err) {
            const isTimeout = err.name === 'AbortError';

            if (isTimeout && attempt < maxAttempts) {
                console.warn(`[WARN] Timeout fetching ${targetUrl}. Retrying once...`);

                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }

            throw isTimeout ? new Error('Request timed out') : err;
        } finally {
            clearTimeout(timeout);
        }
    }
}

// Phase 1: Catalogue Discovery

while (cataloguePages <= 3) {

const cachePath = `../cache/catalogue-page-${cataloguePages}.html`;
let content;

    try {
        await access(cachePath);
        content = await readFile(cachePath, 'utf8');

        runReport.cache_hits++;
        console.log(`[CACHE HIT] Catalogue Page ${cataloguePages}`);
    } catch (err) {
        if (err.code !== 'ENOENT') {
            throw err;
        }

        try {
            content = await politeFetch(currentPageUrl);

            await writeFile(cachePath, content, 'utf8');
            console.log(`[FETCHED] Catalogue Page ${cataloguePages}`);
        } catch (fetchErr) {
            console.error(`[ERROR] Failed to fetch catalogue page ${currentPageUrl}: ${fetchErr.message}`);
            
            runReport.failed_pages.push({
                url: currentPageUrl,
                type: 'catalogue',
                error: fetchErr.message
            });
            break;
        }
    }

    const $ = cheerio.load(content);

    $('article.product_pod h3 a').each((index, element) => {
        const href = $(element).attr('href');

        bookUrls.push({ 
            "product_url": new URL(href, currentPageUrl).href,
            "source_page": currentPageUrl
        });
    });

    if (cataloguePages >= 3) break;
    
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

// Phase 2: Safe Failure Test - Inject one made-up Book Url (tested locally, never hammering site)

bookUrls.push({
    product_url: 'https://books.toscrape.com/catalogue/this-book-does-not-exist-test-404_9999/index.html',
    source_page: 'https://books.toscrape.com/'
})

// Phase 3: Detail Pagees Scraping

const uniqueUrls = new Set();

for (let index = 0; index < bookUrls.length; index++) {
    const book = bookUrls[index];

    if (uniqueUrls.has(book.product_url)){
        continue;
    } 

    uniqueUrls.add(book.product_url);

    try {
        const bookCachePath = `../cache/book-${index + 1}.html`;
        let bookContent;

        try {
            await access(bookCachePath);
            bookContent = await readFile(bookCachePath, 'utf8');

            runReport.cache_hits++;
            console.log(`[CACHE HIT] Book #${index +1}`);
        } catch (err) {
            if (err.code !== 'ENOENT') {
                throw err;
            }

            bookContent = await politeFetch(book.product_url);
            await writeFile(bookCachePath, bookContent, 'utf8');
            console.log(`[FETCHED] Book #${index +1}`);
        }

        const $ = cheerio.load(bookContent);
        const titleText = $('div.product_main h1').text().trim();
        const priceText = $('div.product_main p.price_color').text().trim();
        const availabilityText = $('div.product_main p.availability').text().trim();
        const ratingText = $('div.product_main p.star-rating')?.attr('class').split(' ')[1];
        const descriptionText = $('div#product_description + p').text().trim() || null;
        const fetchedAt = new Date().toISOString();

        bookRawData.push({
            title: titleText,
            product_url: book.product_url,
            price_text: priceText,
            availability_text: availabilityText,
            rating_text: ratingText,
            description: descriptionText,
            source_page: book.source_page,
            fetched_at: fetchedAt
        });
    } catch (pageError) {
        console.error(`[PAGE SKIPPED] Error processing ${book.product_url}: ${pageError.message}`);

        runReport.failed_pages.push({
            url: book.product_url,
            type: 'detail',
            error: pageError.message
        });
    }
}

// Phase 4: Normalization & Validation
function normalizePrice(bookRawData) {
    const rawData = [];

    for (let i = 0; i < bookRawData.length; i++) {
        rawData.push({
            title: bookRawData[i].title,
            product_url: bookRawData[i].product_url,
            price_text: bookRawData[i].price_text,
            price_gbp: Number(bookRawData[i].price_text.replace('£', '')),
            availability_text: bookRawData[i].availability_text,
            rating_text: bookRawData[i].rating_text,
            description: bookRawData[i].description,
            source_page: bookRawData[i].source_page,
            fetched_at: bookRawData[i].fetched_at
        })
    }

    return rawData;
}

const normalizedBookData = normalizePrice(bookRawData);
// console.log(JSON.stringify(normalizedBookData[0], null, 2));
// console.log(`detail_pages=${normalizedBookData.length}`);

const validBooks = [];
const invalidBooks = [];

for (const book of normalizedBookData) {
    const result = bookSchema.safeParse(book);

    if (result.success) {
        validBooks.push(result.data);
    } else {
        invalidBooks.push({
            book,
            errors: result.error.issues
        });
    }
}

runReport.valid_records = validBooks.length;
runReport.invalid_records = invalidBooks.length;

//Finalize run duration
const endTime = new Date();
runReport.duration_ms = endTime - startTime;

await mkdir('../output', { recursive: true });
await writeFile('../output/books.json', JSON.stringify(validBooks, null, 2), 'utf8');
await writeFile('../output/errors.json', JSON.stringify(invalidBooks, null, 2), 'utf8');
await writeFile('../output/run-report.json', JSON.stringify(runReport, null, 2), 'utf8');

console.log("\n--- Run Summary ---");
console.log(`Duration: ${(runReport.duration_ms / 1000).toFixed(2)}s`);
console.log(`Pages Fetched: ${runReport.pages_fetched}`);
console.log(`Cache Hits: ${runReport.cache_hits}`);
console.log(`Valid Records: ${runReport.valid_records}`);
console.log(`Invalid Records: ${runReport.invalid_records}`);
console.log(`Failed Pages: ${runReport.failed_pages.length}`);