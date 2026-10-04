# murmur site

The one-page home for murmur at https://murmurapp.app (US-066), with the brushwork hero (US-079): what murmur is, a live pill to try, paint around it that the visitor can add to and save as a poster, the One drop film, one download button that picks Mac or Windows, and short answers to the first questions. Everything deeper links to the docs in `docs/`, which stay the single source of truth.

## Where it lives, and why

Here in `site/`, inside the murmur repo, decided 2026-09-26. The page reads the app's own `src/renderer/tokens.css`, paints with the app's own brush engine (`src/renderer/brush.ts`, stripped of its types by Node at build time), takes the belt colors from `shared/cosmetics.json`, draws its favicon and preview image with the same kit as the app icons (`scripts/lib/draw.js`), takes the version from `package.json`, and points at the stable release links from US-063. Keeping it in the repo means none of that can drift, and the design and header lints cover it too.

It is plain HTML, CSS, and two small scripts (`app.js` picks the download; `hero.js` is the hero) with no dependencies and no framework. Nothing here ever needs `npm install`; the build needs Node 22.13 or later.

## Build and preview

```
SITE_URL=https://murmurapp.app npm run site
node site/serve.js
```

That writes `site/dist/` and serves it at http://localhost:4870 (the port claimed for it in the port registry) with the same headers the host sends. Without `SITE_URL` it builds against a placeholder domain for local looks only; a deploy build (`SITE_DEPLOY=1`, or Cloudflare's own `CF_PAGES`) without it fails on purpose.

What the build fetches or copies, none of which is ever committed:

- **The display face.** Bricolage Grotesque (SIL Open Font License 1.1), the extra bold in its condensed widths, cut to the characters the page uses, from Google Fonts at build time, with its license beside it in `fonts/OFL.txt`. Offline (`SITE_OFFLINE=1`) or on a fetch failure the build carries on and the page uses system fonts.
- **The film.** One drop, copied from `FILM_DIR` (default `~/Projects/murmur-film/out`, outside the repo). Without it the page has no film section.
- **The support address.** `SUPPORT_EMAIL` adds it to the footer, the structured data, and llms.txt.

What the page says lives in `content.js`. The FAQ renders from it twice, as the visible answers and as FAQPage JSON-LD, so the two always match; facts that drift (price, OS minimums) carry their verified-on date there.

## Hosting: Cloudflare Pages

Chosen by LaBroi 2026-10-02. Vercel's Hobby plan is for non-commercial use only, and a site that sells murmur Pro is commercial (Vercel's fair use guidelines, checked 2026-10-02); Cloudflare Pages' free plan allows it, and the domain's DNS already lives at Cloudflare.

The project is deployed by direct upload from a Mac that has the film, so what was checked locally is exactly what ships:

```
SITE_URL=https://murmurapp.app SITE_DEPLOY=1 SUPPORT_EMAIL=support@murmurapp.app npm run site
npx wrangler pages deploy site/dist --project-name murmur --branch main
```

Cloudflare keeps the scripts, stylesheets, and font in browsers for four hours while the page itself is always fetched fresh, so the build stamps each of those references with a fingerprint of the file (`?v=` plus a short hash) and a deploy reaches returning visitors on their next load.

`site/headers.js` is the one list of security headers: the build writes it into `dist/_headers`, which Pages applies to every response, and the preview server sends the same list.

After a deploy:

- `curl -sI https://murmurapp.app/` shows Content-Security-Policy, Strict-Transport-Security, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy.
- `dig +short TXT murmurapp.app` shows the SPF record, and `dig +short TXT _dmarc.murmurapp.app` shows `v=DMARC1; p=reject`.
- `/robots.txt`, `/sitemap.xml`, and `/llms.txt` load; the JSON-LD passes validator.schema.org; the sitemap is submitted in Google Search Console.
