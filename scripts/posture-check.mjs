#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * Outside-in security posture check for any public website: what a security scanner (or
 * an agency's security lead) sees, checked in about 1 minute. Read-only: it only sends
 * GET/HEAD requests, opens TLS connections, reads DNS, and asks Mozilla Observatory for a
 * scan (a public service; pass --skip observatory to leave it out).
 *
 *   node posture-check.mjs https://example.com [options]
 *
 * Options:
 *   --repo <dir>             the project's repo; finds its headers file and a Supabase URL + public key in its source
 *   --headers-file <file>    compare live headers to this file's site-wide rule (exact values): a vercel.json
 *                            ("/(.*)" rule) or a Netlify / Cloudflare Pages _headers file ("/*" block).
 *                            Use the built file when the build generates it. Alias: --vercel-json
 *   --supabase-url <url>     probe Row Level Security with the public key (needs --anon-key)
 *   --anon-key <key>         the PUBLIC key only: sb_publishable_... or a legacy JWT whose role is anon
 *   --tables a,b,c           tables to probe (default: from --repo's generated types and migrations)
 *   --public-tables <json>   tables public on purpose: {"plans": null, "posts": "published=eq.false"}
 *                            null = every row is public; a filter = rows that must still return nothing
 *   --skip a,b               skip checks by id (see CHECKS below), e.g. observatory,tls,rls
 *   --strict                 count warnings as failures
 *   --report <file.md>       write a Markdown report
 *
 * Exit codes: 0 no failures, 1 a check failed, 2 the script itself broke.
 * Built from NewsbookLM's HARDEN-12 check; see references/scanners.md for what each check means.
 */
import { createHash } from "node:crypto";
import dns from "node:dns/promises";
import fs from "node:fs";
import path from "node:path";
import tls from "node:tls";
import { pathToFileURL } from "node:url";

/** The 6 headers every scanner grades, plus 1 that Observatory and BrowserTotal reward. */
export const REQUIRED_HEADERS = [
  "content-security-policy",
  "strict-transport-security",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
];
export const RECOMMENDED_HEADERS = ["cross-origin-opener-policy"];

const YEAR = 31_536_000;
const SECURITY_TXT_MIN_DAYS = 30;

/** Same-origin script and stylesheet URLs the page loads. */
export function pageAssets(html, origin) {
  const own = new URL(origin).host;
  const urls = new Set();
  const tags = [
    ...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi),
    ...[...html.matchAll(/<link\b[^>]*>/gi)].filter((m) => /rel=["']?(?:stylesheet|modulepreload)/i.test(m[0])).map((m) => [m[0], m[0].match(/href=["']([^"']+)["']/i)?.[1]]),
  ];
  for (const [, src] of tags) {
    if (!src) continue;
    try {
      const url = new URL(src, origin);
      if (url.host === own && !url.pathname.startsWith("/cdn-cgi/")) urls.add(url.href);
    } catch {
      // not a URL; ignore
    }
  }
  return [...urls];
}

/** A file whose URL changes with its content (a hash in the name, a build folder, or ?v=<hash>), so it may be cached a year. */
export function isFingerprinted(url) {
  const { pathname, search } = new URL(url);
  return (
    /\/(?:assets|_next\/static|_app\/immutable|static\/(?:js|css))\//.test(pathname) ||
    /[.-][A-Za-z0-9_]{8,}\.(?:js|css|mjs)$/.test(pathname) ||
    /[?&](?:v|h|hash|ver|version)=[A-Za-z0-9._-]{6,}/.test(search)
  );
}

/** Scripts a CDN edge adds to the page that are not in the repo (Cloudflare's /cdn-cgi/ features). */
export function edgeInjectedScripts(html) {
  const found = new Set();
  const known = {
    "email-decode": "Cloudflare Email Address Obfuscation",
    "rocket-loader": "Cloudflare Rocket Loader",
    "challenge-platform": "Cloudflare bot challenge",
    "zaraz": "Cloudflare Zaraz",
  };
  for (const [, src] of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']*\/cdn-cgi\/[^"']*)["']/gi)) {
    const name = Object.entries(known).find(([k]) => src.includes(k))?.[1] ?? src;
    found.add(name);
  }
  if (/static\.cloudflareinsights\.com\/beacon/.test(html)) found.add("Cloudflare Web Analytics beacon");
  return [...found];
}

/** Hashes of the inline scripts on a page that the CSP's script-src does not list. */
export function unhashedInlineScripts(html, policy) {
  const csp = parseCsp(policy);
  const allowed = csp.get("script-src") ?? csp.get("default-src") ?? [];
  const missing = [];
  for (const [, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (/(?:^|\s)src\s*=/i.test(attrs)) continue;
    const type = attrs.match(/(?:^|\s)type\s*=\s*["']?([^"'\s>]+)/i)?.[1]?.toLowerCase();
    if (type && ["application/ld+json", "application/json", "importmap", "speculationrules"].includes(type)) continue;
    const hash = `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`;
    if (!allowed.includes(hash)) missing.push(hash);
  }
  return missing;
}

/**
 * The site-wide headers configured in a hosting file: vercel.json (the "/(.*)" rule) or a
 * Netlify / Cloudflare Pages _headers file (the "/*" block). Returns [{ key, value }].
 */
export function configuredHeaders(text, fileName) {
  if (fileName.endsWith(".json")) {
    return JSON.parse(text).headers?.find((h) => h.source === "/(.*)")?.headers ?? [];
  }
  const out = [];
  let inBlock = false;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      inBlock = line.trim() === "/*";
      continue;
    }
    const match = inBlock && line.match(/^\s+([A-Za-z0-9-]+):\s*(.*)$/);
    if (match) out.push({ key: match[1], value: match[2] });
  }
  return out;
}

// ---------- pure helpers (unit-testable) ----------

/** CSP directives as a map of lowercase name to its source list. */
export function parseCsp(policy) {
  const map = new Map();
  for (const part of (policy ?? "").split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) map.set(name.toLowerCase(), sources);
  }
  return map;
}

/** Problems (fail) and notes (warn) for a CSP, the way Observatory grades it. */
export function cspFindings(policy) {
  const csp = parseCsp(policy);
  const fail = [];
  const warn = [];
  const scripts = csp.get("script-src") ?? csp.get("default-src");
  if (!scripts) fail.push("no script-src or default-src, so scripts are unrestricted");
  else {
    for (const bad of ["'unsafe-inline'", "'unsafe-eval'"]) {
      // 'unsafe-inline' is ignored by browsers when a hash or nonce is present, but scanners still dock it.
      if (scripts.includes(bad)) fail.push(`script-src allows ${bad}`);
    }
    if (scripts.some((s) => s === "*" || s === "https:" || s === "http:" || s === "data:")) fail.push("script-src allows any host (*, https:, http: or data:)");
  }
  if (!csp.has("object-src") && !(csp.get("default-src") ?? []).includes("'none'")) warn.push("no object-src 'none'");
  if (!csp.has("base-uri")) warn.push("no base-uri");
  if (!csp.has("frame-ancestors")) warn.push("no frame-ancestors (X-Frame-Options alone is the legacy form)");
  if (!csp.has("form-action")) warn.push("no form-action");
  if ((csp.get("style-src") ?? []).includes("'unsafe-inline'")) warn.push("style-src allows 'unsafe-inline' (BrowserTotal docks 15 points; Observatory does not)");
  return { fail, warn };
}

/** Problems with an HSTS value; preload needs max-age >= 1 year, includeSubDomains and preload. */
export function hstsFindings(value) {
  if (!value) return { fail: ["missing"], warn: [] };
  const maxAge = Number(value.match(/max-age=(\d+)/i)?.[1] ?? 0);
  const fail = [];
  const warn = [];
  if (maxAge < 15_768_000) fail.push(`max-age ${maxAge} is under 6 months`);
  else if (maxAge < YEAR) warn.push(`max-age ${maxAge} is under 1 year (preload needs 1 year)`);
  if (!/includesubdomains/i.test(value)) warn.push("no includeSubDomains");
  if (!/preload/i.test(value)) warn.push("no preload");
  return { fail, warn };
}

/** Exact comparison of live headers with configured { key, value } pairs. */
export function headerDiff(configured, live) {
  const problems = [];
  for (const { key, value } of configured) {
    const got = live.get(key);
    if (got === null || got === undefined) problems.push(`${key} missing`);
    else if (got.trim() !== String(value).trim()) problems.push(`${key} differs from config (live: ${got.slice(0, 100)})`);
  }
  return problems;
}

/** Security headers a cross-origin fetch() cannot read: what browser-based scanners (BrowserTotal) miss. */
export function unexposedHeaders(live) {
  if (!live.get("access-control-allow-origin")) return [];
  const exposed = (live.get("access-control-expose-headers") ?? "").toLowerCase();
  if (exposed.trim() === "*") return [];
  return [...REQUIRED_HEADERS, ...RECOMMENDED_HEADERS].filter((h) => live.get(h) && !exposed.includes(h));
}

/** Days until a security.txt Expires date, or null when it has none. */
export function securityTxtDaysLeft(text, now = Date.now()) {
  const expires = text.match(/^Expires:\s*(.+)$/im)?.[1];
  const time = expires ? Date.parse(expires.trim()) : NaN;
  return Number.isFinite(time) ? Math.floor((time - now) / 86_400_000) : null;
}

/** Hosts of the external scripts the served HTML loads by tag, before any consent choice. */
export function externalScriptHosts(html, origin) {
  const own = new URL(origin).host;
  const hosts = new Set();
  for (const [, src] of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
    try {
      const host = new URL(src, origin).host;
      if (host !== own) hosts.add(host);
    } catch {
      // not a URL; ignore
    }
  }
  return [...hosts].sort();
}

/** Inline tag snippets that load trackers before consent (GTM, gtag, Meta, Clarity, Hotjar). */
export function inlineTrackers(html) {
  const found = [];
  const inline = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join("\n");
  const signs = {
    "Google Tag Manager": /googletagmanager\.com\/gtm\.js/,
    "Google tag (gtag.js)": /googletagmanager\.com\/gtag\/js|gtag\(['"]config/,
    "Meta Pixel": /connect\.facebook\.net|fbq\(['"]init/,
    "Microsoft Clarity": /clarity\.ms\/tag/,
    Hotjar: /static\.hotjar\.com/,
  };
  for (const [name, re] of Object.entries(signs)) if (re.test(inline)) found.push(name);
  return found;
}

/** The role inside a legacy Supabase JWT key, or null when it is not a JWT. */
export function jwtRole(key) {
  const parts = key.split(".");
  if (parts.length !== 3 || !key.startsWith("eyJ")) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")).role ?? null;
  } catch {
    return null;
  }
}

/** Every public table named in Supabase generated types and in migrations' CREATE TABLE. */
export function tableInventory(typesSource, migrationSources) {
  const names = new Set();
  const tables = typesSource.match(/public:\s*\{\s*Tables:\s*\{([\s\S]*?)\n\s{4}Views:/)?.[1] ?? "";
  for (const [, name] of tables.matchAll(/^\s{6}([a-z_][a-z0-9_]*):\s*\{/gm)) names.add(name);
  const create = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi;
  for (const sql of migrationSources) for (const [, name] of sql.matchAll(create)) names.add(name.toLowerCase());
  return [...names].sort();
}

/** A signed-out read: rows fail; an empty list or a refusal (401/403/404) passes. */
export function rlsVerdict(status, body) {
  if (Array.isArray(body)) return body.length === 0 ? { ok: true } : { ok: false, detail: "returns rows to a signed-out visitor" };
  if ([401, 403, 404].includes(status)) return { ok: true };
  return { ok: false, detail: `unexpected response ${status}` };
}

/** Markdown report: failures, then warnings, then passes. */
export function renderReport(target, results, when = new Date()) {
  const by = (s) => results.filter((r) => r.status === s);
  const line = (r) => `- **${r.name}**${r.detail ? `: ${r.detail}` : ""}`;
  return [
    `# Security posture: ${target}`,
    "",
    `Checked ${when.toISOString().slice(0, 16).replace("T", " ")} UTC by \`posture-check.mjs\` (security-hardening skill). Read-only.`,
    "",
    `**${by("FAIL").length} failing, ${by("WARN").length} warnings, ${by("PASS").length} passing, ${by("SKIP").length} skipped.**`,
    "",
    ...(by("FAIL").length ? ["## Failing", "", ...by("FAIL").map(line), ""] : []),
    ...(by("WARN").length ? ["## Warnings", "", ...by("WARN").map(line), ""] : []),
    "## Passing",
    "",
    ...by("PASS").map(line),
    ...(by("SKIP").length ? ["", "## Skipped", "", ...by("SKIP").map(line)] : []),
    "",
  ].join("\n");
}

// ---------- repo discovery ----------

function walk(dir, exts, out = [], depth = 0) {
  if (depth > 6 || !fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || ["node_modules", "dist", "build", "out", ".next", "coverage"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, exts, out, depth + 1);
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(full);
  }
  return out;
}

/**
 * Supabase URL and PUBLIC key hardcoded in the repo's source (never .env files, which may
 * hold secrets). A service-role key found in source is returned as a finding, never used.
 */
export function discoverSupabase(repo) {
  const files = walk(path.join(repo, "src"), [".ts", ".tsx", ".js", ".jsx", ".mjs"]).concat(walk(path.join(repo, "app"), [".ts", ".tsx", ".js"]), walk(path.join(repo, "lib"), [".ts", ".js"]));
  const found = { url: null, key: null, serviceKeyIn: null };
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const url = text.match(/https:\/\/[a-z0-9]{20}\.supabase\.co/)?.[0];
    if (url && !found.url) found.url = url;
    const publishable = text.match(/sb_publishable_[\w-]+/)?.[0];
    if (publishable && !found.key) found.key = publishable;
    if (/sb_secret_[\w-]{10,}/.test(text)) found.serviceKeyIn ??= path.relative(repo, file);
    for (const [jwt] of text.matchAll(/eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/g)) {
      const role = jwtRole(jwt);
      if (role === "anon" && !found.key) found.key = jwt;
      if (role === "service_role") found.serviceKeyIn ??= path.relative(repo, file);
    }
  }
  return found;
}

function repoTables(repo) {
  const typesFile = walk(repo, ["types.ts", "database.types.ts", "supabase.ts"]).find((f) => /Tables:\s*\{/.test(fs.readFileSync(f, "utf8")));
  const migrations = path.join(repo, "supabase/migrations");
  const sql = fs.existsSync(migrations) ? fs.readdirSync(migrations).filter((f) => f.endsWith(".sql")).map((f) => fs.readFileSync(path.join(migrations, f), "utf8")) : [];
  return tableInventory(typesFile ? fs.readFileSync(typesFile, "utf8") : "", sql);
}

// ---------- network ----------

async function get(url, init = {}) {
  return fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20_000), headers: { "user-agent": "security-hardening-posture-check" }, ...init });
}

function probeTls(host, version) {
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port: 443, servername: host, minVersion: version, maxVersion: version, ciphers: "DEFAULT@SECLEVEL=0" }, () => {
      resolve({ accepted: true });
      socket.end();
    });
    socket.on("error", (e) => resolve({ accepted: false, code: e.code }));
    socket.setTimeout(10_000, () => {
      resolve({ accepted: false, code: "TIMEOUT" });
      socket.destroy();
    });
  });
}

// ---------- the checks ----------

export const CHECKS = ["https", "headers", "config", "csp", "hsts", "expose", "compression", "cache", "redirect", "securitytxt", "wellknown", "preload", "tls", "observatory", "scripts", "cookies", "email", "rls"];

async function run(opts) {
  const origin = new URL(opts.url).origin;
  const host = new URL(origin).hostname;
  const apex = host.replace(/^www\./, "");
  const results = [];
  const add = (id, name, status, detail = "") => results.push({ id, name, status, detail });
  const check = async (id, name, fn) => {
    if (opts.skip.has(id)) return add(id, name, "SKIP", "skipped by `--skip`");
    try {
      const out = await fn();
      if (out && typeof out === "object") add(id, name, out.status, out.detail);
      else add(id, name, "PASS", out || "");
    } catch (e) {
      add(id, name, "FAIL", e.message);
    }
  };
  const fail = (m) => {
    throw new Error(m);
  };
  const warn = (detail) => ({ status: "WARN", detail });

  let page = null;
  let html = "";
  await check("https", `HTTPS page loads (${origin}/)`, async () => {
    page = await get(origin + "/");
    html = await page.text();
    if (page.status !== 200) fail(`status ${page.status}${page.headers.get("location") ? ` to ${page.headers.get("location")}` : ""}`);
    return `status 200, ${Math.round(html.length / 1024)} KB of HTML`;
  });
  if (!page) return results;
  const live = page.headers;

  await check("headers", "The 6 graded security headers are present", async () => {
    const missing = REQUIRED_HEADERS.filter((h) => !live.get(h));
    if (missing.length) fail(`missing: ${missing.join(", ")}`);
    const extra = RECOMMENDED_HEADERS.filter((h) => !live.get(h));
    if (extra.length) return warn(`all 6 present; also recommended: ${extra.join(", ")}`);
    return "all 6, plus Cross-Origin-Opener-Policy";
  });

  await check("config", "Live headers match the hosting config", async () => {
    if (!opts.headersFile) {
      const why = opts.repo
        ? "no vercel.json or _headers file in the repo; if the build generates one, pass the built file with `--headers-file`"
        : "no headers file given (`--headers-file` or `--repo`)";
      return { status: "SKIP", detail: why };
    }
    const name = path.basename(opts.headersFile);
    const rule = configuredHeaders(fs.readFileSync(opts.headersFile, "utf8"), name);
    if (!rule.length) return warn(`${name} sets no site-wide headers ("/(.*)" in vercel.json, "/*" in _headers)`);
    const problems = headerDiff(rule, live);
    if (problems.length) fail(problems.join("; "));
    return `${rule.length} headers match ${name}`;
  });

  await check("csp", "Content-Security-Policy is strict for scripts", async () => {
    const policy = live.get("content-security-policy");
    if (!policy) fail("no Content-Security-Policy header");
    const { fail: bad, warn: notes } = cspFindings(policy);
    const unhashed = bad.length ? [] : unhashedInlineScripts(html, policy);
    if (unhashed.length) bad.push(`the home page has ${unhashed.length} inline script(s) the CSP does not allow, so browsers block them: add ${unhashed.join(" ")}`);
    if (bad.length) fail(bad.join("; ") + (notes.length ? `; also: ${notes.join("; ")}` : ""));
    if (notes.length) return warn(notes.join("; "));
    return "no unsafe script sources; every inline script on the home page is allowed by hash";
  });

  await check("hsts", "Strict-Transport-Security is preload-ready", async () => {
    const { fail: bad, warn: notes } = hstsFindings(live.get("strict-transport-security"));
    if (bad.length) fail(bad.join("; "));
    if (notes.length) return warn(notes.join("; "));
    return live.get("strict-transport-security");
  });

  await check("expose", "Browser-based scanners can read the security headers", async () => {
    const hidden = unexposedHeaders(live);
    if (hidden.length) return warn(`the page sends Access-Control-Allow-Origin but a cross-origin fetch() cannot read ${hidden.join(", ")}; BrowserTotal will grade headers D. Add Access-Control-Expose-Headers (references/headers-and-csp.md)`);
    return live.get("access-control-allow-origin") ? "Access-Control-Expose-Headers covers them" : "no CORS on the page, nothing to expose";
  });

  await check("compression", "HTML is compressed", async () => {
    const enc = live.get("content-encoding");
    return enc ? `content-encoding: ${enc}` : warn("no content-encoding on the HTML (Node's fetch asks for gzip, deflate and br)");
  });

  await check("cache", "Fingerprinted build files are cached for a year", async () => {
    const assets = pageAssets(html, origin);
    if (!assets.length) return warn("the home page loads no script or stylesheet from the site itself");
    const hashed = assets.find(isFingerprinted);
    if (!hashed) {
      const res = await get(assets[0], { method: "HEAD" });
      return warn(`no fingerprinted file (a hash in the name, /assets/, or ?v=<hash>), so files cannot be cached long safely; ${new URL(assets[0]).pathname} has "${res.headers.get("cache-control") ?? "no cache-control"}"`);
    }
    const res = await get(hashed, { method: "HEAD" });
    const cc = res.headers.get("cache-control") ?? "";
    const maxAge = Number(cc.match(/max-age=(\d+)/)?.[1] ?? 0);
    const shown = new URL(hashed).pathname + new URL(hashed).search;
    if (maxAge < YEAR || !/immutable/.test(cc)) return warn(`${shown} is fingerprinted but has "${cc || "no cache-control"}"; it can safely be "public, max-age=31536000, immutable" (scanners call short caching "no caching strategy")`);
    const htmlCc = live.get("cache-control") ?? "";
    const htmlAge = Number(htmlCc.match(/max-age=(\d+)/)?.[1] ?? 0);
    if (htmlAge > 300 && !/no-cache|must-revalidate/.test(htmlCc)) return warn(`assets OK, but the HTML is cached ${htmlAge}s ("${htmlCc}"), so a deploy can show up late`);
    return `${shown}: ${cc}`;
  });

  await check("redirect", "Plain HTTP redirects to HTTPS", async () => {
    const res = await get(`http://${host}/`);
    const location = res.headers.get("location") ?? "";
    if (![301, 302, 307, 308].includes(res.status) || !location.startsWith("https://")) fail(`got ${res.status} to "${location}"`);
    return `${res.status} to ${location}`;
  });

  await check("securitytxt", "security.txt published (RFC 9116)", async () => {
    const res = await get(origin + "/.well-known/security.txt");
    const text = res.ok ? await res.text() : fail(`status ${res.status}`);
    if (/<html/i.test(text)) fail("returns HTML (the app shell), not a security.txt file");
    if (!/^Contact:/im.test(text)) fail("no Contact line");
    const days = securityTxtDaysLeft(text);
    if (days === null) fail("no valid Expires line");
    if (days < 0) fail(`expired ${-days} days ago`);
    if (days < SECURITY_TXT_MIN_DAYS) return warn(`expires in ${days} days; update Expires`);
    return `Contact present, expires in ${days} days`;
  });

  await check("wellknown", "Unknown /.well-known/ paths return 404", async () => {
    const res = await get(origin + "/.well-known/posture-check-probe.txt");
    const body = await res.text();
    if (res.status === 200 && /<html/i.test(body)) return warn("returns the app shell with 200; scanners read it as a real file (exclude /.well-known/ from the SPA rewrite)");
    return `status ${res.status}`;
  });

  await check("preload", "Domain is on the browser HSTS preload list", async () => {
    const res = await get(`https://hstspreload.org/api/v2/status?domain=${apex}`);
    const { status, preloadedDomain } = await res.json();
    // Some endings (.app, .dev, .page...) are preloaded as a whole: HTTPS-only forever, nothing to submit or undo.
    if (status === "preloaded" && preloadedDomain && preloadedDomain !== apex) return `preloaded through the whole .${preloadedDomain} ending (HTTPS-only forever, every subdomain included; no entry of its own)`;
    if (status === "preloaded") return "preloaded";
    return warn(`hstspreload.org status: "${status}". Submitting is the owner's call; it is hard to undo (references/site-basics.md)`);
  });

  await check("tls", "TLS 1.0 and 1.1 refused, TLS 1.2 accepted", async () => {
    for (const version of ["TLSv1", "TLSv1.1"]) {
      const r = await probeTls(host, version);
      if (r.accepted) fail(`${version} was accepted`);
      if (r.code !== "ERR_SSL_TLSV1_ALERT_PROTOCOL_VERSION") return warn(`could not prove ${version} is refused (${r.code}); check SSL Labs`);
    }
    if (!(await probeTls(host, "TLSv1.2")).accepted) fail("TLS 1.2 was refused");
    return "old versions refused";
  });

  await check("observatory", "Mozilla Observatory grade", async () => {
    const res = await get(`https://observatory-api.mdn.mozilla.net/api/v2/scan?host=${host}`, { method: "POST" });
    const scan = await res.json();
    if (scan.error) fail(`scan error: ${scan.error}`);
    const detail = `${scan.grade} (score ${scan.score}, ${scan.tests_passed}/${scan.tests_quantity} tests pass): ${scan.details_url}`;
    if (scan.grade === "A+") return detail;
    if (/^A/.test(scan.grade)) return warn(detail);
    fail(detail);
  });

  await check("scripts", "No third-party scripts or trackers load before consent", async () => {
    const hosts = externalScriptHosts(html, origin);
    const trackers = inlineTrackers(html);
    const edge = edgeInjectedScripts(html);
    const notes = [];
    if (hosts.length) notes.push(`script tags load from ${hosts.join(", ")} on first paint (each needs SRI, or load it from code after consent)`);
    if (trackers.length) notes.push(`inline snippets start ${trackers.join(", ")} before any choice`);
    if (edge.length) notes.push(`the CDN injects code that is not in the repo: ${edge.join(", ")} (served from the site's own domain, so the CSP lets it run; keep it on purpose or turn it off in the CDN dashboard)`);
    if (notes.length) return warn(notes.join("; "));
    return "the served HTML loads no third-party or CDN-injected script";
  });

  await check("cookies", "No cookies set before a choice", async () => {
    const cookies = typeof live.getSetCookie === "function" ? live.getSetCookie() : [live.get("set-cookie")].filter(Boolean);
    if (cookies.length) return warn(`the first response sets ${cookies.map((c) => c.split("=")[0]).join(", ")}; only strictly necessary cookies may load before consent`);
    return "none on the first response (scripts may still set some; check a fresh browser)";
  });

  await check("email", "Email anti-spoofing (SPF and DMARC)", async () => {
    const txt = async (name) => (await dns.resolveTxt(name).catch(() => [])).map((r) => r.join(""));
    const spf = (await txt(apex)).find((t) => /^v=spf1/i.test(t));
    const dmarc = (await txt(`_dmarc.${apex}`)).find((t) => /^v=DMARC1/i.test(t));
    if (!spf || !dmarc) fail(`${!spf ? "no SPF record" : ""}${!spf && !dmarc ? "; " : ""}${!dmarc ? "no DMARC record" : ""} (a domain without them can be spoofed, even if it sends no mail)`);
    const policy = dmarc.match(/p=(\w+)/i)?.[1]?.toLowerCase();
    if (policy === "none") return warn(`SPF present; DMARC is p=none (monitoring only), move to quarantine or reject`);
    return `SPF present, DMARC p=${policy}`;
  });

  await check("rls", "Signed-out visitors read no private rows (Supabase RLS)", async () => {
    if (opts.serviceKeyIn) fail(`a SECRET Supabase key is in source (${opts.serviceKeyIn}); rotate it now (references/database-and-keys.md)`);
    if (!opts.supabaseUrl || !opts.anonKey) {
      const why = opts.repo
        ? "no Supabase URL and public key in the repo's source: not applicable if the app has no database (if it does, pass `--supabase-url` and `--anon-key`)"
        : "no Supabase URL and public key given (`--supabase-url` and `--anon-key`, or `--repo`)";
      return { status: "SKIP", detail: why };
    }
    const role = jwtRole(opts.anonKey);
    if (role && role !== "anon") fail(`the key given has role "${role}"; only the public anon key may be used here`);
    if (opts.anonKey.startsWith("sb_secret_")) fail("that is a secret key; pass the publishable key");
    const tables = opts.tables.length ? opts.tables : [];
    if (!tables.length) return warn("no tables to probe (pass `--tables`, or `--repo` with Supabase types or migrations)");
    // New publishable keys go on the apikey header only (they are not JWTs); legacy anon JWTs need both.
    const headers = role ? { apikey: opts.anonKey, authorization: `Bearer ${opts.anonKey}` } : { apikey: opts.anonKey };
    const leaks = [];
    for (const table of tables) {
      const privateRows = table in opts.publicTables ? opts.publicTables[table] : "";
      if (privateRows === null) continue;
      const res = await get(`${opts.supabaseUrl}/rest/v1/${table}?select=*&limit=1${privateRows ? `&${privateRows}` : ""}`, { headers });
      const body = await res.json().catch(() => null);
      const verdict = rlsVerdict(res.status, body);
      if (!verdict.ok) leaks.push(`\`${table}\` ${verdict.detail}`);
    }
    if (leaks.length) fail(leaks.join("; ") + (Object.keys(opts.publicTables).length ? "" : " (a table public on purpose goes in `--public-tables`, with the filter its private rows must fail)"));
    return `${tables.length} tables probed with the public key, ${Object.keys(opts.publicTables).length} public on purpose; no private rows returned`;
  });

  return results;
}

// ---------- CLI ----------

function parseArgs(argv) {
  const opts = { url: null, skip: new Set(), tables: [], publicTables: {}, strict: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--repo") opts.repo = path.resolve(next());
    else if (a === "--headers-file" || a === "--vercel-json") opts.headersFile = path.resolve(next());
    else if (a === "--supabase-url") opts.supabaseUrl = next().replace(/\/$/, "");
    else if (a === "--anon-key") opts.anonKey = next();
    else if (a === "--tables") opts.tables = next().split(",").map((t) => t.trim()).filter(Boolean);
    else if (a === "--public-tables") opts.publicTables = JSON.parse(next());
    else if (a === "--skip") next().split(",").forEach((s) => opts.skip.add(s.trim()));
    else if (a === "--strict") opts.strict = true;
    else if (a === "--report") opts.report = path.resolve(next());
    else if (a === "--help" || a === "-h") opts.help = true;
    else if (!a.startsWith("--")) opts.url = /^https?:\/\//.test(a) ? a : `https://${a}`;
    else throw new Error(`unknown option ${a}`);
  }
  if (opts.repo) {
    const candidates = ["vercel.json", "public/_headers", "_headers", "static/_headers", "site/_headers", "dist/_headers"];
    opts.headersFile ??= candidates.map((f) => path.join(opts.repo, f)).find((f) => fs.existsSync(f));
    const sb = discoverSupabase(opts.repo);
    opts.supabaseUrl ??= sb.url;
    opts.anonKey ??= sb.key;
    opts.serviceKeyIn = sb.serviceKeyIn;
    if (!opts.tables.length && opts.supabaseUrl) opts.tables = repoTables(opts.repo);
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.url) {
    console.log(fs.readFileSync(new URL(import.meta.url), "utf8").match(/\/\*\*([\s\S]*?)\*\//)[1].replace(/^ \* ?/gm, ""));
    process.exit(opts.url ? 0 : 2);
  }
  const results = await run(opts);
  for (const r of results) console.log(`${r.status.padEnd(4)}  ${r.name}${r.detail ? `: ${r.detail}` : ""}`);
  if (opts.report) fs.writeFileSync(opts.report, renderReport(new URL(opts.url).origin, results));
  const failed = results.some((r) => r.status === "FAIL" || (opts.strict && r.status === "WARN"));
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`posture-check: ${e.stack ?? e}`);
    process.exit(2);
  });
}
