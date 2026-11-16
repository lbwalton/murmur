// SPDX-License-Identifier: GPL-3.0-only
// Cloudflare Pages runs this for murmurapp.app/download/<target> (US-169):
// the download counter, whose logic is site/download.js. It sits at the
// repo root because `wrangler pages deploy` looks for functions/ in the
// folder it runs from, and the site deploys from the repo root
// (site/README.md). Deployed from anywhere else, the download links still
// work through the fallback in _redirects (site/redirects.js), uncounted.
import { handleDownload } from '../../site/download.js'

export function onRequest(context) {
  return handleDownload(context.request, context.env, context)
}
