// SPDX-License-Identifier: GPL-3.0-only
// Report a problem (US-182). murmur has no server, so a problem report is
// a GitHub issue or an email the person opens in their own browser or
// mail app, after seeing and editing every word of it. This builds the
// words, and it is free of Electron so a test can prove what can never
// get in: keys, base URLs, the hosts of custom endpoints, the dictionary,
// expansions, mic names, history, and the home folder.
//
// The details are an allowlist: buildProblemDetails is handed the whole
// settings object on purpose, and picks the few fields below itself, so
// the marked-values test plants markers everywhere else and watches them
// stay out. The log is not trusted at all: every line is read by its tag
// and kept only in a shape known to hold no words, paths, or addresses.
import { type ProviderCatalog, providerForBaseUrl } from './catalog'
import { type KeysKnown, connectionsNow } from './profiles'
import { type ReportKind, fitsMailto } from './report'
import type { Settings } from './settings'

/** The only address the main process will open for a problem report. */
export const ISSUE_BASE = 'https://github.com/lbwalton/murmur/issues/new?'
/** The issue form in .github/ISSUE_TEMPLATE. */
export const ISSUE_TEMPLATE = 'problem.yml'
/** The ids of the form's fields, which a link can fill by name. */
export const ISSUE_FIELDS = ['what', 'expected', 'details'] as const
/** Every issue the app opens starts its title with this. */
export const TITLE_PREFIX = 'Problem: '
/** GitHub turns a link over its server limit away (414 URI Too Long);
 *  this keeps the whole link well under it. */
export const MAX_ISSUE_URL_CHARS = 7000
/** How many log lines a report carries, at most. */
export const LOG_LINES = 30

/** What the short form says when the whole report went to the clipboard. */
export const PASTE_NOTE = 'murmur copied the full report to your clipboard. Select this line and paste over it.'

/** murmur's own public addresses. A line naming one keeps its host. */
const OWN_HOSTS = [
  'github.com',
  'api.github.com',
  'raw.githubusercontent.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'murmurapp.app'
]

/** The facts only the main process can read. Nothing here comes from a
 *  setting the person typed. */
export interface ProblemFacts {
  version: string
  /** process.platform */
  platform: string
  osVersion: string
  arch: string
  electron: string
  chrome: string
  /** The display the window is on, or null when there is no window. */
  scaleFactor: number | null
  windowSize: { width: number; height: number } | null
  /** The window's zoom factor (1 is 100 percent). */
  zoom: number | null
  look: 'glass' | 'solid'
  /** Why the window is solid, when it is and the reason is known. */
  lookReason: string | null
  locale: string
  /** Scrubbed out of every line, never shown. */
  home: string
  username: string
  /** Every mic name murmur knows of, scrubbed out of every line. */
  micLabels: string[]
}

/** Where the person was looking when they asked to report. */
export interface ProblemView {
  page: string
  /** The settings section in view, on the settings page only. */
  section: string | null
}

export interface ProblemInput {
  settings: Settings
  catalog: ProviderCatalog | null
  keys: KeysKnown
  facts: ProblemFacts
  view: ProblemView
  /** The log file's text, as it is on disk. */
  log: string
}

export interface ProblemDraft {
  /** The details block, 1 fact per line. */
  details: string
  /** The newest log lines that passed the filter, oldest first. */
  log: string[]
  /** How many lines among those the filter left out. */
  withheld: number
}

/** What the person sends: the 2 text boxes and the 2 blocks, as edited. */
export interface ProblemFields {
  what: string
  expected: string
  details: string
  log: string
}

const PAGES: Record<string, string> = {
  home: 'Home',
  analytics: 'Analytics',
  wrapup: 'Wrap-up',
  journey: 'Journey',
  setup: 'Settings',
  wizard: 'the setup wizard'
}

const SECTIONS: Record<string, string> = {
  provider: 'Provider and keys',
  dictation: 'Dictation',
  shortcuts: 'Shortcuts',
  dictionary: 'Dictionary',
  notes: 'Notes',
  transform: 'Transform',
  timeback: 'Time back and recap',
  history: 'History',
  look: 'Look',
  system: 'System',
  pro: 'murmur Pro'
}

/** A page and section the window reported, or null for anything else:
 *  the main process takes only these from the page. */
export function asProblemView(value: unknown): ProblemView | null {
  if (typeof value !== 'object' || value === null) return null
  const { page, section } = value as { page?: unknown; section?: unknown }
  if (typeof page !== 'string' || !(page in PAGES)) return null
  if (section === null || section === undefined) return { page, section: null }
  return typeof section === 'string' && section in SECTIONS ? { page, section } : { page, section: null }
}

/** The details line that says where the person was looking. */
export function viewLine(view: ProblemView): string {
  const page = PAGES[view.page] ?? 'murmur'
  const section = view.page === 'setup' && view.section ? SECTIONS[view.section] : undefined
  return `Showing: ${page}${section ? `, ${section}` : ''}`
}

function osName(platform: string): string {
  return platform === 'darwin' ? 'macOS' : platform === 'win32' ? 'Windows' : platform
}

function hostOf(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host === '' ? null : host
  } catch {
    return null
  }
}

/** The hosts a line may name: the catalog's providers and murmur's own. */
export function knownHosts(catalog: ProviderCatalog | null): string[] {
  const hosts = new Set(OWN_HOSTS)
  for (const p of catalog?.providers ?? []) {
    for (const url of [p.baseUrl, p.llmBaseUrl]) {
      const host = url ? hostOf(url) : null
      if (host) hosts.add(host)
    }
  }
  return [...hosts]
}

/** Every address the settings point at, so their hosts can be scrubbed
 *  from text that names them without a scheme. */
function settingsUrls(settings: Settings, keys: KeysKnown): string[] {
  return [
    settings.provider.baseUrl,
    settings.provider.keySavedForBaseUrl,
    settings.polish.baseUrl,
    settings.notes.connection.baseUrl,
    settings.transform.connection.baseUrl,
    ...settings.provider.profiles.flatMap((p) => [p.baseUrl, p.polish?.baseUrl, p.sort?.baseUrl, p.transform?.baseUrl]),
    ...keys.ring
  ].filter((url): url is string => typeof url === 'string' && url.trim() !== '')
}

/** The hosts of custom endpoints: every configured host that is not a
 *  known one, plus the plain http hosts the person confirmed. */
export function customHosts(settings: Settings, keys: KeysKnown, catalog: ProviderCatalog | null): string[] {
  const known = new Set(knownHosts(catalog))
  const hosts = new Set<string>()
  for (const url of settingsUrls(settings, keys)) {
    const host = hostOf(url.includes('://') ? url : `https://${url}`)
    if (host && !known.has(host)) hosts.add(host)
  }
  for (const host of settings.trustedHttpHosts) {
    const bare = hostOf(`http://${host}`)
    if (bare && !known.has(bare)) hosts.add(bare)
  }
  return [...hosts]
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export interface ScrubContext {
  home: string
  username: string
  known: string[]
  custom: string[]
  micLabels: string[]
}

/** Every way a path to the home folder can be spelled in a line. */
function homeSpellings(home: string): string[] {
  if (home.trim().length < 2) return []
  const forward = home.replace(/\\/g, '/')
  const back = home.replace(/\//g, '\\')
  const doubled = back.replace(/\\/g, '\\\\')
  const spellings = new Set([home, forward, back, doubled, encodeURI(forward), forward.replace(/ /g, '%20')])
  // Longest first, so a doubled spelling is not half replaced.
  return [...spellings].filter((s) => s.length >= 2).sort((a, b) => b.length - a.length)
}

/** Any address reduced to what it may say: a known host keeps its scheme
 *  and host, anything else on the web is a custom endpoint, and a local
 *  file keeps only its name. */
function reduceUrls(text: string, known: Set<string>): string {
  return text.replace(/\b([a-z][a-z0-9+.-]*):\/\/[^\s"'<>`]*/gi, (match, scheme: string) => {
    const lower = scheme.toLowerCase()
    if (lower === 'http' || lower === 'https') {
      const host = hostOf(match)
      return host && known.has(host) ? `${lower}://${host}` : '[custom endpoint]'
    }
    if (lower === 'file') {
      const name = match.split(/[?#]/)[0].split(/[/\\]/).pop() ?? ''
      return /^[\w.-]{1,60}$/.test(name) ? `file://…/${name}` : 'file://…'
    }
    return `${lower}://…`
  })
}

/** Takes the home folder, the username, custom hosts, and mic names out
 *  of any text. Used on every log line and on the details too, since a
 *  model name can be a path on a local server. */
export function scrubText(text: string, ctx: ScrubContext): string {
  let out = reduceUrls(text, new Set(ctx.known))
  // Nothing writes a key to the log; this is the belt with the braces.
  out = out.replace(/\bBearer\s+\S+/gi, 'Bearer [key]').replace(/\b(?:sk|gsk|xai|pk|rk|key)[-_][A-Za-z0-9_-]{8,}/g, '[key]')
  for (const spelling of homeSpellings(ctx.home)) {
    out = out.replace(new RegExp(escapeRegExp(spelling), 'gi'), '~')
  }
  const user = ctx.username.trim()
  if (user.length >= 2) {
    out = out.replace(new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(user)}(?![A-Za-z0-9_])`, 'gi'), '~')
  }
  for (const host of [...ctx.custom].sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(`(?<![A-Za-z0-9-])${escapeRegExp(host)}(?![A-Za-z0-9-])`, 'gi'), '[custom endpoint]')
  }
  for (const label of [...ctx.micLabels].filter((l) => l.trim().length >= 2).sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(escapeRegExp(label), 'gi'), '[mic]')
  }
  return out
}

/** The tags of lines murmur writes and knows to be content-free once
 *  scrubbed. A line with any other tag is left out. */
const KNOWN_TAGS = new Set([
  'audio',
  'catalog',
  'dictation',
  'hands-free',
  'hardening',
  'history',
  'hotkeys',
  'ipc',
  'look',
  'notes',
  'overlay',
  'polish',
  'problem',
  'quality',
  'receipt',
  'reminder',
  'retry',
  'sort',
  'timeback',
  'transcribe',
  'transform',
  'updater'
])

const STAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z) (.*)$/

/** An error message cut before anything it quotes or any path, the way
 *  the window's crash line is (Boundary.tsx). */
function cutMessage(message: string): string {
  return message.split(/["'`/\\]/)[0].replace(/\s+/g, ' ').trim().slice(0, 100)
}

/** A transcription failure's detail, kept only in a shape known to hold
 *  no address: an http status, a timeout, a network error code. */
const SAFE_DETAILS = ['response not json', 'response missing text', 'no API key configured', 'fetch failed', 'socket hang up']

function safeDetail(detail: string): string {
  const d = detail.trim()
  if (SAFE_DETAILS.includes(d) || /^(http \d{3}|no response in \d+ms)$/.test(d)) return d
  const code = /\bnet::ERR_[A-Z_]+\b/.exec(d) ?? /\b(E[A-Z]{3,}|ERR_[A-Z_]+|UND_ERR_[A-Z_]+)\b/.exec(d)
  return code ? code[0] : '[left out]'
}

// The audio window names mics in these 4 sentences (recorder.ts). The
// names go before anything else is read, so a name with an apostrophe
// can never leave half of itself behind.
const MIC_SENTENCES: Array<[RegExp, string]> = [
  [/capture could not move to .*; staying on .*$/, 'capture could not move to [mic]; staying on [mic]'],
  [/press found capture on .*?, not .*?; moving capture under the take$/, 'press found capture on [mic], not [mic]; moving capture under the take'],
  [/capture belongs on .*?, not .*?; (moving .*)$/, 'capture belongs on [mic], not [mic]; $1'],
  [/capture on .*$/, 'capture on [mic]']
]

/** A renderer error, kept as the window's own crash line, a known
 *  murmur sentence with its mic names taken out, or the error's kind. */
function rendererMessage(message: string): string {
  const crash = /\[settings\] problem in .*/.exec(message)
  if (crash) return crash[0].slice(0, 160)
  if (message.startsWith('[murmur] ')) {
    for (const [pattern, replacement] of MIC_SENTENCES) {
      if (pattern.test(message)) return message.replace(pattern, replacement).slice(0, 160)
    }
    return `[murmur] ${cutMessage(message.slice('[murmur] '.length))}`
  }
  const kind = /\b([A-Z][A-Za-z]*Error)\b/.exec(message)
  return kind ? `${kind[1]} (message left out)` : '(message left out)'
}

/** One log line made safe to show, or null when it is left out. */
export function scrubLogLine(line: string, ctx: ScrubContext): string | null {
  const stamped = STAMP.exec(line)
  if (!stamped) return null
  const [, stamp, rest] = stamped
  let body: string
  const crash = /^(uncaught exception|unhandled rejection): (.*)$/.exec(rest)
  const tagged = /^\[([a-z-]+(?::[a-z-]+)?)\] (.*)$/.exec(rest)
  if (crash) {
    const kind = /^([A-Z][A-Za-z]*Error|Error)\b/.exec(crash[2])
    body = `${crash[1]}: ${kind ? kind[1] : 'a value'} (message left out)`
  } else if (!tagged) {
    return null
  } else {
    const [, tag, text] = tagged
    if (tag.startsWith('window:')) {
      const name = tag.slice('window:'.length)
      if (!/^(settings|audio|overlay)$/.test(name)) return null
      const renderer = /^renderer-error \S+ (.*)$/.exec(text)
      const preload = /^preload-error path=.*? error=(.*)$/.exec(text)
      const failed = /^did-fail-load code=(-?\d+) desc=(\S*)/.exec(text)
      if (renderer) body = `[${tag}] renderer-error ${rendererMessage(renderer[1])}`
      else if (preload) body = `[${tag}] preload-error ${cutMessage(preload[1])}`
      else if (failed) body = `[${tag}] did-fail-load code=${failed[1]} desc=${failed[2]}`
      else if (/^(did-finish-load|unresponsive|render-process-gone reason=\S+ exitCode=-?\d+|reviving in \d+ms)$/.test(text)) body = `[${tag}] ${text}`
      else return null
    } else if (!KNOWN_TAGS.has(tag)) {
      return null
    } else if (tag === 'notes' || tag === 'reminder') {
      // A note's file name comes from the person's own template.
      body = `[${tag}] ${text.replace(/ file=.*?(?= bytes=\d+$|$)/, ' file=[note file]').replace(/ path=.*$/, ' path=[note file]')}`
    } else if (tag === 'transcribe') {
      // The base URL stays for the address rule below to reduce: a
      // catalog provider keeps its host, anything else is a custom endpoint.
      const failed = /^(failed kind=\S+) detail=(.*) (model=\S* baseUrl=\S*)(.*)$/.exec(text)
      body = failed ? `[transcribe] ${failed[1]} detail=${safeDetail(failed[2])} ${failed[3]}${failed[4]}` : `[transcribe] ${cutMessage(text)}`
    } else if (tag === 'transform') {
      body = `[transform] ${text.replace(/ detail=(.*?)(?=$)/, (_m, d: string) => ` detail=${safeDetail(d)}`)}`
    } else if (tag === 'sort') {
      // A decision connection's network failure carries the raw error
      // message (notes/decide.ts), which can name an address.
      body = `[sort] ${text.replace(/ reason=network (.*?)(?= model=| slot=|;|$)/, (_m, d: string) => ` reason=network ${safeDetail(d)}`)}`
    } else if (tag === 'receipt') {
      body = `[receipt] ${text.replace(/ reason=(.*)$/, (_m, r: string) => ` reason=${cutMessage(r)}`)}`
    } else {
      body = `[${tag}] ${text}`
    }
  }
  // A bare IPv4 address can be a custom endpoint resolved: none stays.
  const noIps = body.replace(/(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?![\w.])/g, '[address]')
  return `${stamp} ${scrubText(noIps, ctx)}`.slice(0, 300)
}

/** The newest lines of the log that pass the filter, at most max. */
export function scrubLog(raw: string, ctx: ScrubContext, max = LOG_LINES): { lines: string[]; withheld: number } {
  const lines: string[] = []
  let withheld = 0
  const all = raw.split('\n')
  for (let i = all.length - 1; i >= 0 && lines.length < max; i--) {
    const line = all[i]
    // Lines without a time are the rest of a stack or a message; they go
    // with the line they belong to, uncounted.
    if (!STAMP.test(line)) continue
    const safe = scrubLogLine(line, ctx)
    if (safe === null) withheld += 1
    else lines.unshift(safe)
  }
  return { lines, withheld }
}

function connectionLine(
  slot: string,
  now: ReturnType<typeof connectionsNow>[keyof ReturnType<typeof connectionsNow>],
  catalog: ProviderCatalog | null,
  ride: string,
  protocol?: string
): string {
  if (now === null) return `${slot}: off`
  if (!now.own && slot !== 'Speech') return `${slot}: same as ${ride}${now.waiting ? ' (its own connection has no key yet)' : ''}`
  const provider = catalog ? providerForBaseUrl(catalog, now.baseUrl) : null
  const kind = protocol === 'decide' ? ', a decision model' : ''
  return `${slot}: ${provider?.name ?? 'custom endpoint'}, ${now.model || '(no model)'}${kind}`
}

/** The details and the log for a report. Only the fields named here are
 *  read from the settings. */
export function buildProblemDetails(input: ProblemInput): ProblemDraft {
  const { settings, catalog, facts, view } = input
  const now = connectionsNow(settings, input.keys)
  const window =
    facts.windowSize === null
      ? 'window closed'
      : `window ${facts.windowSize.width} x ${facts.windowSize.height} at ${Math.round((facts.zoom ?? 1) * 100)}% zoom`
  const lines = [
    `murmur ${facts.version} on ${osName(facts.platform)} ${facts.osVersion} (${facts.arch})`,
    `Electron ${facts.electron}, Chrome ${facts.chrome}`,
    `Display scale ${facts.scaleFactor ?? 'unknown'}, ${window}`,
    `Look: ${facts.look}${facts.look === 'solid' && facts.lookReason ? ` (${facts.lookReason})` : ''}`,
    viewLine(view),
    `Language: ${facts.locale}`,
    connectionLine('Speech', now.speech, catalog, 'speech'),
    // Cleanup that rides speech still names its own model.
    now.cleanup !== null && !now.cleanup.own
      ? `Cleanup: same provider as speech, ${now.cleanup.model || '(no model)'}${now.cleanup.waiting ? ' (its own connection has no key yet)' : ''}`
      : connectionLine('Cleanup', now.cleanup, catalog, 'speech'),
    connectionLine('Notes sorting', now['notes sorting'], catalog, 'cleanup', settings.notes.connection.protocol),
    connectionLine('Transform', now.Transform, catalog, 'cleanup'),
    `Formatting: ${settings.formatting.level}; insert by ${settings.insertion.mode}`,
    `Hands-free: ${settings.hotkey.doubleTap ? 'on' : 'off'}`,
    `Mic: ${settings.micMode === 'press' ? 'opens on the press' : 'stays ready'}, ${settings.microphone.id === '' && settings.microphone.label === '' ? 'system default' : 'picked in Settings'}`
  ]
  const ctx: ScrubContext = {
    home: facts.home,
    username: facts.username,
    known: knownHosts(catalog),
    custom: customHosts(settings, input.keys, catalog),
    micLabels: [...facts.micLabels, settings.microphone.label]
  }
  const log = scrubLog(input.log, ctx)
  return { details: lines.map((line) => scrubText(line, ctx)).join('\n'), log: log.lines, withheld: log.withheld }
}

/** The issue's title: the first line of what happened, cut short. */
export function issueTitle(what: string): string {
  const first = what.trim().split('\n')[0].replace(/\s+/g, ' ').trim()
  if (first === '') return `${TITLE_PREFIX}(no summary)`
  if (first.length <= 60) return `${TITLE_PREFIX}${first}`
  const cut = first.slice(0, 60)
  const space = cut.lastIndexOf(' ')
  return `${TITLE_PREFIX}${(space > 30 ? cut.slice(0, space) : cut).trimEnd()}…`
}

function logLines(log: string): string[] {
  return log.split('\n').map((line) => line.trimEnd()).filter((line) => line.trim() !== '')
}

/** The details and the newest of the log lines, as 1 block. */
export function detailsBlock(details: string, log: string[]): string {
  const head = details.trim()
  if (log.length === 0) return head
  return `${head}${head ? '\n\n' : ''}Recent log (${log.length} ${log.length === 1 ? 'line' : 'lines'}):\n${log.join('\n')}`
}

/** The whole report as plain text: the email body, and what is copied
 *  when a link cannot hold it. */
export function problemText(fields: ProblemFields, keepLog?: number): string {
  const log = logLines(fields.log)
  const kept = keepLog === undefined ? log : log.slice(log.length - keepLog)
  return [
    'What happened:',
    fields.what.trim(),
    '',
    'What I expected:',
    fields.expected.trim() || '(not filled in)',
    '',
    detailsBlock(fields.details, kept)
  ].join('\n')
}

/** The link that opens the form with its fields filled in. */
export function issueUrl(parts: { title: string; what: string; expected: string; details: string }): string {
  const query = [`template=${encodeURIComponent(ISSUE_TEMPLATE)}`, `title=${encodeURIComponent(parts.title)}`, `what=${encodeURIComponent(parts.what)}`]
  if (parts.expected.trim() !== '') query.push(`expected=${encodeURIComponent(parts.expected)}`)
  if (parts.details.trim() !== '') query.push(`details=${encodeURIComponent(parts.details)}`)
  return ISSUE_BASE + query.join('&')
}

/** How a report goes to GitHub: the whole of it in the link, with the
 *  oldest log lines left out until it fits, or (when even that is too
 *  long) the full text on the clipboard and a short form to paste it in. */
export type IssuePlan =
  | { mode: 'link'; url: string; dropped: number }
  | { mode: 'paste'; url: string; report: string }

export function planIssue(fields: ProblemFields): IssuePlan {
  const title = issueTitle(fields.what)
  const log = logLines(fields.log)
  for (let keep = log.length; keep >= 0; keep--) {
    const url = issueUrl({ title, what: fields.what, expected: fields.expected, details: detailsBlock(fields.details, log.slice(log.length - keep)) })
    if (url.length <= MAX_ISSUE_URL_CHARS) return { mode: 'link', url, dropped: log.length - keep }
  }
  return { mode: 'paste', url: issueUrl({ title, what: PASTE_NOTE, expected: '', details: '' }), report: problemText(fields) }
}

/** How a report goes by email: the same trimming against the mail
 *  link's limit, or the full text to copy into a blank message. */
export type MailPlan = { mode: 'link'; message: string; dropped: number } | { mode: 'paste'; report: string }

export function planMail(fields: ProblemFields, kind: ReportKind = 'problem'): MailPlan {
  const total = logLines(fields.log).length
  for (let keep = total; keep >= 0; keep--) {
    const message = problemText(fields, keep)
    if (fitsMailto(message, kind)) return { mode: 'link', message, dropped: total - keep }
  }
  return { mode: 'paste', report: problemText(fields) }
}

/** The main process opens a problem link only when this holds: exactly
 *  murmur's own new issue page, and under the length GitHub accepts. */
export function isProblemIssueUrl(url: string): boolean {
  if (!url.startsWith(ISSUE_BASE) || url.length > MAX_ISSUE_URL_CHARS || /[\s#]/.test(url)) return false
  try {
    const parsed = new URL(url)
    return parsed.origin === 'https://github.com' && parsed.pathname === '/lbwalton/murmur/issues/new' && parsed.searchParams.get('template') === ISSUE_TEMPLATE
  } catch {
    return false
  }
}
