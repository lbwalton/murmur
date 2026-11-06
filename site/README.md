# murmur site

murmur's site at https://murmurapp.app. The home page (US-066) carries the brushwork hero (US-079): what murmur is, a live pill to try, paint around it that the visitor can add to and save as a poster, the One drop film, one download button that picks Mac or Windows, and short answers to the first questions.

Since US-092 the site also has:

- **The docs.** Every file in `docs/` becomes its own page at `/docs/<name>/`, and `/docs/` lists them all with their questions. `docs/` stays the single source of truth. A deploy build reads the docs as they were at the release the download button serves (the tag `v` plus the version in package.json), so the site never describes a feature nobody can download yet; a release's docs reach the site with the first deploy after it is tagged. `DOCS_REF` picks another git ref, and a local build without it reads the working tree. `site/markdown.js` renders the Markdown the docs use, with GitHub's heading anchors, so a link to a question works on both. A new doc must be added to `DOCS` in `content.js`, in reading order; the build stops if one is missing.
- **The Wispr Flow comparison** at `/wispr-flow-alternative/`, written in `content.js`. Every Wispr Flow fact there carries the date it was checked against Wispr's own pages; recheck before changing a word.
- **One header and footer** on every page, written by `build.js`. The header stays at the top while a page scrolls.
- **A 404 page** with the same header.

The build checks every link on every page: one that points at a page or a question that does not exist stops it.

## Where it lives, and why

Here in `site/`, inside the murmur repo, decided 2026-09-26. The page reads the app's own `src/renderer/tokens.css`, paints with the app's own brush engine (`src/renderer/brush.ts`, stripped of its types by Node at build time), takes the belt colors from `shared/cosmetics.json`, draws its favicon and preview image with the same kit as the app icons (`scripts/lib/draw.js`), takes the version from `package.json`, and points at the stable release links from US-063. Keeping it in the repo means none of that can drift, and the design and header lints cover it too.

It is plain HTML, CSS, and two small scripts (`app.js` picks the download; `hero.js` is the hero) with no dependencies and no framework. The docs and comparison pages ship no script of their own (Cloudflare adds one to pages that show an email address; see Security). Nothing here ever needs `npm install`; the build needs Node 22.13 or later.

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
git fetch --tags
SITE_URL=https://murmurapp.app SITE_DEPLOY=1 SUPPORT_EMAIL=support@murmurapp.app npm run site
npx wrangler pages deploy site/dist --project-name murmur --branch main
```

The docs pages come from the tag of the version in package.json, and the download buttons serve GitHub's latest published release, so deploy a new version's site only after its release is published (not while it is a draft). Until then, a deploy from a branch that already carries the new version fails for want of its tag; set `DOCS_REF` to the published tag to deploy anyway.

Cloudflare keeps the scripts, stylesheets, and font in browsers for four hours while the page itself is always fetched fresh, so the build stamps each of those references with a fingerprint of the file (`?v=` plus a short hash) and a deploy reaches returning visitors on their next load.

`site/headers.js` is the one list of security headers: the build writes it into `dist/_headers`, which Pages applies to every response, and the preview server sends the same list.

## Security

- **HTTPS only, forever.** The whole `.app` ending is on the browsers' HSTS preload list with `includeSubDomains` (Chrome, Firefox, Safari and Edge ship it built in; hstspreload.org reports murmurapp.app's preloaded domain as `app`). Browsers refuse plain HTTP for murmurapp.app and every subdomain, and nothing here can change that, so any new subdomain must serve valid HTTPS from its first minute or it will not load at all. `site/headers.js` still sends `includeSubDomains` and `preload`, because scanners grade them.
- **Headers scanners can read.** Pages adds `Access-Control-Allow-Origin: *` to every response, so `headers.js` also sends `Access-Control-Expose-Headers` naming the security headers. Without it, a scanner that checks the site from its own web page (BrowserTotal) sees none of them and grades them missing (US-118).
- **security.txt.** The build writes `/.well-known/security.txt` (RFC 9116) from `site/security-txt.js`: security reports go to security@murmurapp.app (LaBroi, 2026-10-31), forwarded by a Cloudflare Email Routing rule like support@. Its Expires date is 364 days after the build, so every deploy renews it; deploy again within 364 days of the last deploy, or it lapses.
- **Not in the repo:** Cloudflare's Email Address Obfuscation adds a small script (`/cdn-cgi/scripts/.../email-decode.min.js`) to pages that show an email address. It is served from the site's own domain, so the CSP allows it. It can be turned off in the Cloudflare dashboard (the zone's Email Address Obfuscation setting); LaBroi decides.
- `site/headers.test.js` fails if a security header goes missing, the CSP allows inline or eval code, HSTS loses preload readiness, a header is not exposed, or security.txt changes contact or expiry.
- The full check: `node ~/.claude/skills/security-hardening/scripts/posture-check.mjs https://murmurapp.app --repo .` (LaBroi's security-hardening skill).

After a deploy:

- `curl -sI https://murmurapp.app/` shows Content-Security-Policy, Strict-Transport-Security, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, Cross-Origin-Opener-Policy, and Access-Control-Expose-Headers.
- `curl -s https://murmurapp.app/.well-known/security.txt` shows the Contact line and an Expires date about a year out.
- `dig +short TXT murmurapp.app` shows the SPF record, and `dig +short TXT _dmarc.murmurapp.app` shows `v=DMARC1; p=reject`.
- `/robots.txt`, `/sitemap.xml`, `/llms.txt`, and `/llms-full.txt` load; the JSON-LD on the home page, a doc, and the comparison passes validator.schema.org; the sitemap is submitted in Google Search Console.
