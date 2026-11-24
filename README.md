# FlyRank Polite Scraper

A deterministic, ethical, and polite web scraping pipeline built for the [Books to Scrape](https://books.toscrape.com/) sandbox. 

The pipeline traverses the first 3 catalogue pages, visits all 60 book detail pages, extracts product details into normalized and schema-validated JSON records, handles page failures gracefully without crashing, and produces an honest run report.

---

## 1. Target Classification

- **Target Site:** Books to Scrape (`https://books.toscrape.com/`)
- **Site Purpose:** A sandbox environment specifically designed and hosted for developers to practice web scraping safely.
- **Scope:** First 3 catalogue pages only (containing exactly 60 books).
- **Data Collected:** Book title, canonical product URL, original price text, normalized numeric price in GBP, availability/stock status, star rating text, book description (or `null`), source catalogue URL, and ISO fetch timestamp.
- **Robots.txt Result:** `no robots file found` (HTTP 404). While a missing robots file does not grant permission on standard sites, Books to Scrape explicitly states on its homepage that it is an open sandbox for scraping practice.
- **Ethics Commitment:** *"I will not reuse this code on another site without checking its rules and terms first."*

---

## 2. Lane & Installation

- **Lane:** JavaScript / Node.js
- **Runtime:** Node.js 20+ (native `fetch`, native `AbortController`, ES modules)
- **Dependencies:**
  - `cheerio`: Server-side HTML selector and DOM parsing.
  - `zod`: Schema declaration and strict runtime validation.

### Setup

Clone the repository and install dependencies:

```bash
git clone https://github.com/sandy-sh/flyrank-polite-scraper.git
cd flyrank-polite-scraper
npm install
```

---

## 3. How to Run

To run the complete scraping pipeline:

```bash
cd src && node index.js
```

The scraper will:
1. Crawl catalogue pages 1–3 and discover all 60 book URLs.
2. Inject one deliberate non-existent URL to verify failure resilience.
3. Fetch/read detail pages from cache or live server.
4. Normalize and validate records via Zod.
5. Generate output files in `output/`:
   - `output/books.json`: Exactly 60 valid, deduplicated records.
   - `output/errors.json`: Schema validation errors (if any).
   - `output/run-report.json`: Execution audit metrics.

---

## 4. Record Schema

Every scraped book is validated against a strict Zod schema before storage. Any record that violates the schema is rejected into `output/errors.json` and never touches `output/books.json`.

```javascript
{
  title: string;              // Book title
  product_url: string;        // Canonical absolute URL (unique identifier)
  price_text: string;         // Raw extracted price string (e.g. "£51.77")
  price_gbp: number;          // Normalized floating-point number (e.g. 51.77)
  availability_text: string;  // Stock text (e.g. "In stock (22 available)")
  rating_text: string;        // Star rating in words (e.g. "Three")
  description: string | null; // Description text, or null if absent (no invented text)
  source_page: string;        // Provenance: catalogue page where link was discovered
  fetched_at: string;         // Provenance: ISO 8601 timestamp of fetch
}
```

---

## 5. Politeness Rules & Failure Survival

This scraper is built as a respectful guest following strict etiquette:

1. **Honest User-Agent:** Every request sends a descriptive user-agent header identifying the bot and its repository:  
   `FlyRankInternship-A9/PoliteScraper (https://github.com/sandy-sh/flyrank-polite-scraper.git)`.
2. **Rate Limiting & Delays:** A minimum 500 ms delay is enforced before any live network request to prevent server strain. Cached requests bypass delays since they do not touch the network.
3. **Request Timeouts:** Requests use an `AbortController` with a strict 10-second timeout, ensuring the pipeline never hangs indefinitely on stalled connections.
4. **Local Caching (Idempotency):** Downloaded HTML is cached locally in `cache/` (`catalogue-page-*.html` and `book-*.html`). Rerunning the scraper reads from disk (`CACHE HIT`), producing the exact same 60 records without re-hammering the sandbox.
5. **Smart Retry Strategy:** 
   - Retries once after a 1,000 ms backoff only on **timeouts** or **HTTP 5xx server errors**.
   - **Never retries HTTP 404 (Not Found) or 403 (Forbidden):** If a page does not exist or access is denied, asking again is bad practice.
6. **Page Isolation:** Each book detail page is processed in its own `try/catch` boundary. A broken or non-existent page is logged, tracked in `run-report.json`, and skipped so the remaining 59 records complete successfully.

---

## 6. Why No Browser Was Needed

This assignment needed no headless browser (such as Playwright or Puppeteer) because all required book data is already present in the raw, server-rendered HTML returned by the server. Using a headless browser would have added unnecessary CPU, memory overhead, and latency without providing any additional data.

---

## 7. Run Report Proof

Here is the actual `output/run-report.json` generated from a verified run. Notice that all 60 valid records survived, 63 pages were served from cache, and the single deliberately injected broken URL was cleanly caught and logged under `failed_pages`:

```json
{
  "start_time": "2026-11-24T09:00:57.579Z",
  "duration_ms": 1507,
  "pages_fetched": 0,
  "cache_hits": 63,
  "valid_records": 60,
  "invalid_records": 0,
  "failed_pages": [
    {
      "url": "https://books.toscrape.com/catalogue/this-book-does-not-exist-test-404_9999/index.html",
      "type": "detail",
      "error": "Client error: HTTP 404 - page does not exist or access forbidden"
    }
  ]
}
```

---

## 8. Honest Limitations

- **Static HTML Dependency:** This scraper relies on predictable server-side rendered HTML and CSS selectors. If the website migrates to a client-rendered Single Page Application (SPA) where content is rendered via client-side JavaScript, or if classes are dynamically obfuscated, Cheerio will not be able to extract the data.
- **Cache Invalidation:** The local file cache has no expiration time-to-live (TTL). If the live site updates prices or stock, the cache must be manually purged to capture the changes.

---

## 9. Ethics Note

Web scraping is a privilege that relies on mutual respect between automated clients and server operators:
- **Prioritize Official APIs:** Always check for and use an official public API if available before building a scraper.
- **Respect Access Boundaries:** Never bypass logins, paywalls, CAPTCHAs, or IP bans. When a server responds with `403 Forbidden` or `429 Too Many Requests`, respect the boundary immediately.
- **Minimal Collection:** Scrape only the data points you need for your task and crawl only at reasonable rates. Do not scrape personal private data or burden infrastructure.
