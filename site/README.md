# murmur site

The one-page home for murmur (US-066): what murmur is, the waveform pill, one download button that picks Mac or Windows, and short answers to the first questions. Everything deeper links to the docs in `docs/`, which stay the single source of truth.

## Where it lives, and why

Here in `site/`, inside the murmur repo, decided 2026-09-26. The page reads the app's own `src/renderer/tokens.css`, draws its icons and preview image with the same kit as the app icons (`scripts/lib/draw.js`), takes the version from `package.json`, and points at the stable release links from US-063. Keeping it in the repo means none of that can drift, and the design and header lints cover it too.

It is plain HTML, CSS, and one small script with no dependencies and no framework: a single page needs nothing more, and nothing here ever needs `npm install`.

## Build and preview

```
SITE_URL=https://your-domain npm run site
```

That writes `site/dist/`: the page, `tokens.css`, `styles.css`, the generated `pill.css`, `app.js`, `favicon.svg`, `apple-touch-icon.png`, `og.png`, `robots.txt`, `sitemap.xml`, and `llms.txt`. Without `SITE_URL` it builds against a placeholder domain for local looks only. To preview, serve `site/dist` on the port claimed for it in the port registry (4870).

What the page says lives in `content.js`. The FAQ renders from it twice, as the visible answers and as FAQPage JSON-LD, so the two always match; facts that drift (price, OS minimums) carry their verified-on date there.

## Deploying on Vercel

Before the first deploy:

1. A release with the universal Mac build (US-065) and the stable download copies (US-063) is out, so the Mac button serves a build that runs on every Mac.
2. LaBroi has chosen and bought the domain.

Then create a Vercel project from the lbwalton/murmur repo with Root Directory `site` (leave "include files outside the root directory" on; the build reads `../src`, `../scripts`, and `../package.json`) and set the environment variable `SITE_URL` to the domain with https and no trailing slash. `vercel.json` sets the build and the six security headers; a build without `SITE_URL` fails on purpose.

After it is live:

- `curl -sI https://<domain>/` shows Content-Security-Policy, Strict-Transport-Security, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy.
- The domain has SPF and DMARC records even though it sends no mail: `v=spf1 -all` as a TXT record on the domain, and `v=DMARC1; p=reject;` as a TXT record on `_dmarc`. Check with `dig +short TXT <domain>` and `dig +short TXT _dmarc.<domain>`.
- `/robots.txt`, `/sitemap.xml`, and `/llms.txt` load; the JSON-LD passes validator.schema.org; submit the sitemap in Google Search Console.
