// SPDX-License-Identifier: GPL-3.0-only
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import bundledCatalog from '../../shared/provider-catalog.json'
import type { ProviderCatalog } from './catalog'
import {
  ISSUE_BASE,
  ISSUE_FIELDS,
  ISSUE_TEMPLATE,
  LOG_LINES,
  MAX_ISSUE_URL_CHARS,
  PASTE_NOTE,
  type ProblemFacts,
  type ProblemFields,
  type ProblemInput,
  asProblemView,
  buildProblemDetails,
  issueTitle,
  isProblemIssueUrl,
  planIssue,
  planMail,
  problemText,
  scrubLog,
  scrubLogLine,
  scrubText
} from './problem'
import { PROBLEM_SUBJECT, isReportMailto, mailtoUrl } from './report'
import { DEFAULT_SETTINGS, type Settings } from './settings'

const catalog = bundledCatalog as unknown as ProviderCatalog

const facts: ProblemFacts = {
  version: '0.1.18',
  platform: 'darwin',
  osVersion: '15.6',
  arch: 'arm64',
  electron: '44.9.3',
  chrome: '146.0.7680.80',
  scaleFactor: 2,
  windowSize: { width: 920, height: 640 },
  zoom: 1.25,
  look: 'glass',
  lookReason: null,
  locale: 'en-US',
  home: '/Users/siobhan',
  username: 'siobhan',
  micLabels: ['MARKEDMIC AirPods', "Siobhan's MARKEDHEADSET"]
}

/** A settings object with a marker in every field the report must not read. */
function markedSettings(): Settings {
  const s = structuredClone(DEFAULT_SETTINGS)
  s.provider.baseUrl = 'https://markedhost.example/v1'
  s.provider.sttModel = 'whisper-large-v3-turbo'
  s.provider.llmModel = 'openai/gpt-oss-120b'
  s.provider.keySavedForBaseUrl = 'https://markedsaved.example/v1'
  s.provider.profiles = [
    { id: 'p1', name: 'MARKEDPROFILE', baseUrl: 'https://markedprofile.example/v1', sttModel: 'm', llmModel: 'm' }
  ]
  s.polish = { enabled: true, baseUrl: 'https://markedpolish.example/v1', llmModel: 'polish-model' }
  s.dictionary = [{ from: 'MARKEDWORD', to: 'MARKEDSPELLING' }]
  s.expansions = [{ trigger: 'MARKEDTRIGGER', text: 'MARKEDEXPANSION text' }]
  s.microphone = { id: 'MARKEDMICID', label: 'MARKEDMIC AirPods' }
  s.notes.folder = '/Users/siobhan/MARKEDNOTES'
  s.notes.pathTemplate = 'MARKEDTEMPLATE/{date}.md'
  s.notes.sort = true
  s.notes.connection = { ...s.notes.connection, enabled: true, baseUrl: 'https://markedsort.example/v1', llmModel: 'sorter', protocol: 'decide' }
  s.transform.binding = 'Ctrl+Alt+T'
  s.transform.connection = { enabled: true, baseUrl: 'https://markedtransform.example', llmModel: 'tx' }
  s.trustedHttpHosts = ['markedlan.local']
  s.hotkey.binding = 'MARKEDHOTKEY'
  return s
}

const T = '2026-11-21T10:00:00.000Z'
const markedLog = [
  `${T} [dictation] delivered outcome=inserted words=12`,
  `${T} [quality] level=full lists=on corrections=off model=openai/gpt-oss-120b outcome=cleaned wordsIn=12 wordsOut=12 cuesIn=0 cuesOut=0 hint=0`,
  `${T} [transcribe] failed kind=network detail=getaddrinfo ENOTFOUND markedhost.example model=whisper-large-v3-turbo baseUrl=https://markedhost.example/v1`,
  `${T} [transcribe] failed kind=server detail=http 503 model=whisper-large-v3-turbo baseUrl=https://api.groq.com/openai/v1`,
  `${T} [transform] transcribe failed kind=network detail=connect ECONNREFUSED markedtransform.example:443`,
  `${T} [window:audio] renderer-error file:///Users/siobhan/murmur/out/renderer/audio/index.js:12 [murmur] capture on Siobhan's MARKEDHEADSET`,
  `${T} [window:audio] renderer-error file:///Users/siobhan/murmur/out/renderer/audio/index.js:12 [murmur] capture belongs on MARKEDMIC AirPods, not Siobhan's MARKEDHEADSET; moving between takes`,
  `${T} [window:audio] renderer-error file:///x.js:1 [murmur] capture could not move to MARKEDMIC AirPods; staying on Siobhan's MARKEDHEADSET`,
  `${T} [window:audio] renderer-error file:///x.js:1 [murmur] press found capture on Siobhan's MARKEDHEADSET, not MARKEDMIC AirPods; moving capture under the take`,
  `${T} [window:settings] renderer-error file:///Users/siobhan/murmur/out/renderer/assets/index.js:9 Uncaught SyntaxError: Unexpected token 'h', "MARKEDHISTORY words"... is not valid JSON`,
  `${T} [window:settings] renderer-error file:///x.js:1 [settings] problem in section notes: TypeError: Cannot read properties of undefined (reading`,
  `${T} uncaught exception: Error: ENOENT: no such file, open '/Users/siobhan/MARKEDNOTES/inbox.md'`,
  `    at Object.openSync (node:fs:573:3)`,
  `    at /Users/siobhan/MARKEDSTACK/out/main/index.js:44:1`,
  `${T} unhandled rejection: MARKEDREJECTION`,
  `${T} [notes] saved location=folder file=MARKEDNOTEFILE dated.md bytes=120`,
  `${T} [reminder] due=09:00 outcome=missing reason=no-file path=Tasks/MARKEDTASKS.md`,
  `${T} [window:settings] did-fail-load code=-6 desc=ERR_FILE_NOT_FOUND url=file:///Users/siobhan/MARKEDPATH/index.html`,
  `${T} [window:settings] preload-error path=/Users/siobhan/MARKEDPATH/preload.js error=Cannot find module '/Users/siobhan/MARKEDPATH'`,
  `${T} [hardening] navigation refused to https://markednav.example`,
  `${T} [polish] fell back reason=http 401 model=/Users/siobhan/models/local.gguf key=sk-MARKEDKEY12345 Bearer MARKEDBEARER`,
  `${T} [receipt] outcome=failed kind=note reason=could not show "MARKEDRECEIPT" now`,
  `${T} [mystery] MARKEDMYSTERY line`,
  `${T} MARKEDUNTAGGED line with no tag`,
  `${T} [ipc] refused settings:get from file:`,
  `${T} [window:settings] did-finish-load`,
  `${T} [updater] restarting to install 0.1.19`,
  `${T} [dictation] note saved under markedlan.local and MARKEDMIC AirPods by siobhan`,
  `${T} [sort] decision failed reason=network connect ECONNREFUSED 203.0.113.9:443 markedsortip model=sorter; falling back to the chat sorter`,
  `${T} [sort] failed reason=network getaddrinfo ENOTFOUND markedsort2.example model=sorter slot=sort`
].join('\n')

const input = (): ProblemInput => ({
  settings: markedSettings(),
  catalog,
  keys: { ring: ['https://markedring.example/v1', 'https://api.groq.com/openai/v1', 'https://markedsort.example/v1'], cleanupKey: true },
  facts,
  view: { page: 'setup', section: 'system' },
  log: markedLog
})

const fieldsFrom = (draft: ReturnType<typeof buildProblemDetails>, what = 'The pill froze.'): ProblemFields => ({
  what,
  expected: 'It should keep listening.',
  details: draft.details,
  log: draft.log.join('\n')
})

describe('buildProblemDetails', () => {
  it('carries the allowlist: version, system, window, look, place, language, connections, and the main switches', () => {
    const { details } = buildProblemDetails(input())
    const lines = details.split('\n')
    expect(lines).toEqual([
      'murmur 0.1.18 on macOS 15.6 (arm64)',
      'Electron 44.9.3, Chrome 146.0.7680.80',
      'Display scale 2, window 920 x 640 at 125% zoom',
      'Look: glass',
      'Showing: Settings, System',
      'Language: en-US',
      'Speech: custom endpoint, whisper-large-v3-turbo',
      'Cleanup: custom endpoint, polish-model',
      'Notes sorting: custom endpoint, sorter, a decision model',
      'Transform: same as cleanup (its own connection has no key yet)',
      'Formatting: full; insert by paste',
      'Hands-free: on',
      'Mic: stays ready, picked in Settings'
    ])
  })

  it('names a catalog provider, says solid and why, and the system default mic', () => {
    const s = structuredClone(DEFAULT_SETTINGS)
    s.hotkey.doubleTap = false
    s.micMode = 'press'
    const { details } = buildProblemDetails({
      ...input(),
      settings: s,
      keys: { ring: [], cleanupKey: false },
      facts: { ...facts, platform: 'win32', osVersion: '10.0.22631', look: 'solid', lookReason: 'glass is off on Windows for now', windowSize: null },
      view: { page: 'home', section: 'system' }
    })
    expect(details).toContain('on Windows 10.0.22631')
    expect(details).toContain('Look: solid (glass is off on Windows for now)')
    expect(details).toContain('window closed')
    expect(details).toContain('Showing: Home\n')
    expect(details).toMatch(/^Speech: Groq, /m)
    expect(details).toContain('Notes sorting: off')
    expect(details).toContain('Transform: off')
    expect(details).toContain('Hands-free: off')
    expect(details).toContain('Mic: opens on the press, system default')
  })

  it('never lets keys, base URLs, custom hosts, the dictionary, expansions, mic names, history, or the home folder in', () => {
    const marked = { ...input(), apiKey: 'sk-MARKEDKEY', history: [{ rawText: 'MARKEDHISTORY' }], audio: 'MARKEDAUDIO' }
    const draft = buildProblemDetails(marked as ProblemInput)
    const fields = fieldsFrom(draft)
    const issue = planIssue(fields)
    const mail = planMail(fields)
    const everything = [
      draft.details,
      draft.log.join('\n'),
      decodeURIComponent(issue.url),
      issue.mode === 'paste' ? issue.report : '',
      mail.mode === 'link' ? decodeURIComponent(mailtoUrl(mail.message, 'problem')) : mail.report,
      problemText(fields)
    ].join('\n')
    expect(everything).not.toMatch(/MARKED|marked/)
    expect(everything).not.toMatch(/siobhan/i)
    expect(everything).not.toMatch(/sk-|Bearer M/)
    expect(everything).not.toContain('/Users/')
    // The line about a take's words is gone, not its neighbors.
    expect(draft.log.length).toBeGreaterThan(15)
  })

  it('keeps every line it can, in a shape that says what happened', () => {
    const { log, withheld } = buildProblemDetails(input())
    const has = (part: string): void => {
      expect(log.some((line) => line.includes(part)), part).toBe(true)
    }
    has('[dictation] delivered outcome=inserted words=12')
    has('[transcribe] failed kind=network detail=ENOTFOUND model=whisper-large-v3-turbo baseUrl=[custom endpoint]')
    has('[transcribe] failed kind=server detail=http 503 model=whisper-large-v3-turbo baseUrl=https://api.groq.com')
    has('[transform] transcribe failed kind=network detail=ECONNREFUSED')
    has('[window:audio] renderer-error [murmur] capture on [mic]')
    has('[window:audio] renderer-error [murmur] capture belongs on [mic], not [mic]; moving between takes')
    has('capture could not move to [mic]; staying on [mic]')
    has('press found capture on [mic], not [mic]; moving capture under the take')
    has('[window:settings] renderer-error SyntaxError (message left out)')
    has('[window:settings] renderer-error [settings] problem in section notes: TypeError')
    has('uncaught exception: Error (message left out)')
    has('unhandled rejection: a value (message left out)')
    has('[notes] saved location=folder file=[note file] bytes=120')
    has('path=[note file]')
    has('[window:settings] did-fail-load code=-6 desc=ERR_FILE_NOT_FOUND')
    has('[window:settings] preload-error Cannot find module')
    has('[hardening] navigation refused to [custom endpoint]')
    has('model=~/models/local.gguf key=[key] Bearer [key]')
    has('[receipt] outcome=failed kind=note reason=could not show')
    has('[dictation] note saved under [custom endpoint] and [mic] by ~')
    has('[sort] decision failed reason=network ECONNREFUSED model=sorter; falling back to the chat sorter')
    has('[sort] failed reason=network ENOTFOUND model=sorter slot=sort')
    // The untagged line, the unknown tag, are left out and counted; the
    // stack's lines go with their exception, uncounted.
    expect(withheld).toBe(2)
    expect(log.join('\n')).not.toContain('openSync')
    for (const line of log) expect(line.startsWith(T)).toBe(true)
  })

  it('takes the newest 30 lines that pass, oldest first', () => {
    const raw = Array.from({ length: 50 }, (_, i) => `${T} [dictation] delivered outcome=inserted words=${i}`).join('\n')
    const ctx = { home: '/Users/siobhan', username: 'siobhan', known: [], custom: [], micLabels: [] }
    const { lines } = scrubLog(raw, ctx)
    expect(lines).toHaveLength(LOG_LINES)
    expect(lines[0]).toContain('words=20')
    expect(lines[LOG_LINES - 1]).toContain('words=49')
  })
})

describe('scrubText', () => {
  const ctx = { home: 'C:\\Users\\Siobhan Smith', username: 'Siobhan Smith', known: ['api.groq.com'], custom: ['10.0.0.7'], micLabels: [] }

  it('takes out a Windows home folder however it is spelled', () => {
    for (const path of ['C:\\Users\\Siobhan Smith\\AppData', 'c:/users/siobhan smith/AppData', 'C:\\\\Users\\\\Siobhan Smith\\\\AppData', 'C:/Users/Siobhan%20Smith/AppData']) {
      expect(scrubText(`at ${path}\\x.js`, ctx), path).not.toMatch(/siobhan/i)
    }
  })

  it('takes a bare IPv4 address out of a log line, and leaves version numbers alone', () => {
    const line = scrubLogLine(`${T} [dictation] reached 192.168.4.20:8080 on Chrome 152.0.7977.167 and 10.0.22631`, { ...ctx, home: '/Users/siobhan' })
    expect(line).toBe(`${T} [dictation] reached [address] on Chrome 152.0.7977.167 and 10.0.22631`)
  })

  it('reduces addresses: a known host keeps its host, others are custom, files keep their name', () => {
    expect(scrubText('to https://api.groq.com/openai/v1/audio?x=1', ctx)).toBe('to https://api.groq.com')
    expect(scrubText('to http://10.0.0.7:8080/v1 and 10.0.0.7', ctx)).toBe('to [custom endpoint] and [custom endpoint]')
    expect(scrubText('file:///C:/Users/Siobhan%20Smith/murmur/index.html', ctx)).toBe('file://…/index.html')
  })
})

describe('the GitHub link', () => {
  const draft = buildProblemDetails(input())

  it('opens the problem form with every field filled by its id', () => {
    const plan = planIssue(fieldsFrom(draft))
    expect(plan.mode).toBe('link')
    const url = new URL(plan.url)
    expect(plan.url.startsWith(ISSUE_BASE)).toBe(true)
    expect(url.searchParams.get('template')).toBe(ISSUE_TEMPLATE)
    expect(url.searchParams.get('title')).toBe('Problem: The pill froze.')
    expect(url.searchParams.get('what')).toBe('The pill froze.')
    expect(url.searchParams.get('expected')).toBe('It should keep listening.')
    expect(url.searchParams.get('details')).toContain('murmur 0.1.18 on macOS')
    expect(url.searchParams.get('details')).toContain('Recent log (')
    // No labels in the link: they work only for people allowed to set them.
    expect(url.searchParams.has('labels')).toBe(false)
    expect(isProblemIssueUrl(plan.url)).toBe(true)
  })

  it('survives what people type', () => {
    const plan = planIssue({ what: '50% & more? a=b\n#1 ü 日本語 🎙', expected: '', details: 'd', log: '' })
    expect(new URL(plan.url).searchParams.get('what')).toBe('50% & more? a=b\n#1 ü 日本語 🎙')
    expect(new URL(plan.url).searchParams.has('expected')).toBe(false)
    expect(isProblemIssueUrl(plan.url)).toBe(true)
  })

  it('leaves out the oldest log lines first to stay under the limit, measured encoded', () => {
    // Characters that grow 9 times when encoded: the limit must be read
    // from the link, not from the text.
    const what = '日本語'.repeat(150)
    const log = Array.from({ length: 30 }, (_, i) => `${T} [dictation] delivered outcome=inserted words=${i} ${'x'.repeat(60)}`).join('\n')
    const plan = planIssue({ what, expected: '', details: draft.details, log })
    expect(plan.mode).toBe('link')
    if (plan.mode !== 'link') return
    expect(plan.url.length).toBeLessThanOrEqual(MAX_ISSUE_URL_CHARS)
    expect(plan.dropped).toBeGreaterThan(0)
    const details = new URL(plan.url).searchParams.get('details') ?? ''
    expect(details).toContain('words=29')
    expect(details).not.toContain('words=0 ')
  })

  it('copies the whole report and opens a short form when even no log is too long', () => {
    const what = 'é'.repeat(4000)
    const plan = planIssue({ what, expected: 'x', details: draft.details, log: draft.log.join('\n') })
    expect(plan.mode).toBe('paste')
    if (plan.mode !== 'paste') return
    expect(plan.report).toContain(what)
    expect(plan.report).toContain('Recent log (')
    expect(new URL(plan.url).searchParams.get('what')).toBe(PASTE_NOTE)
    expect(isProblemIssueUrl(plan.url)).toBe(true)
  })

  it('titles the issue from the first line, cut short', () => {
    expect(issueTitle('  It froze  \nmore')).toBe('Problem: It froze')
    expect(issueTitle('')).toBe('Problem: (no summary)')
    const long = issueTitle('word '.repeat(40))
    expect(long.length).toBeLessThanOrEqual('Problem: '.length + 61)
    expect(long.endsWith('…')).toBe(true)
  })
})

describe('isProblemIssueUrl, the main process allowlist', () => {
  it('opens only murmur\'s own new issue form', () => {
    expect(isProblemIssueUrl(`${ISSUE_BASE}template=problem.yml&title=x&what=y`)).toBe(true)
    for (const url of [
      'https://github.com/lbwalton/murmur/issues/new',
      'https://github.com/lbwalton/murmur/issues/new?template=other.yml',
      'https://github.com/lbwalton/murmur/issues/new?title=x',
      'http://github.com/lbwalton/murmur/issues/new?template=problem.yml',
      'https://github.com.evil.example/lbwalton/murmur/issues/new?template=problem.yml',
      'https://github.com/lbwalton/murmurx/issues/new?template=problem.yml',
      'https://github.com/lbwalton/murmur/issues/new?template=problem.yml#x',
      'https://github.com/lbwalton/murmur/issues/new?template=problem.yml&what=a b',
      `${ISSUE_BASE}template=problem.yml&what=${'x'.repeat(MAX_ISSUE_URL_CHARS)}`,
      'file:///etc/passwd',
      'mailto:support@murmurapp.app'
    ]) {
      expect(isProblemIssueUrl(url), url).toBe(false)
    }
  })
})

describe('the email', () => {
  const draft = buildProblemDetails(input())

  it('goes to support with a subject the 90 day cleanup finds', () => {
    expect(PROBLEM_SUBJECT.startsWith('murmur report')).toBe(true)
    const plan = planMail({ what: 'It froze.', expected: '', details: 'murmur 0.1.18', log: '' })
    expect(plan.mode).toBe('link')
    if (plan.mode !== 'link') return
    const url = mailtoUrl(plan.message, 'problem')
    expect(isReportMailto(url)).toBe(true)
    expect(new URL(url).searchParams.get('subject')).toBe(PROBLEM_SUBJECT)
  })

  it('trims the log to fit a mail link, then falls back to copying', () => {
    const plan = planMail(fieldsFrom(draft))
    expect(plan.mode).toBe('link')
    if (plan.mode === 'link') expect(plan.dropped).toBeGreaterThan(0)
    const long = planMail({ ...fieldsFrom(draft), what: 'word '.repeat(600) })
    expect(long.mode).toBe('paste')
  })
})

describe('the window\'s view', () => {
  it('takes only pages and sections murmur has', () => {
    expect(asProblemView({ page: 'setup', section: 'system' })).toEqual({ page: 'setup', section: 'system' })
    expect(asProblemView({ page: 'home', section: null })).toEqual({ page: 'home', section: null })
    expect(asProblemView({ page: 'setup', section: '<img>' })).toEqual({ page: 'setup', section: null })
    expect(asProblemView({ page: 'MARKED' })).toBeNull()
    expect(asProblemView('setup')).toBeNull()
  })
})

describe('the issue form', () => {
  const form = readFileSync(join(__dirname, '..', '..', '.github', 'ISSUE_TEMPLATE', ISSUE_TEMPLATE), 'utf8')
  // A form that does not parse breaks every link to it, and that would
  // only show after a merge: read it with a real YAML parser (js-yaml,
  // already installed with the build tools).
  const { load } = createRequire(import.meta.url)('js-yaml') as { load: (text: string) => unknown }
  type Field = { type: string; id?: string; attributes: Record<string, unknown>; validations?: { required?: boolean } }
  const parsed = load(form) as { name: string; description: string; title: string; labels: string[]; body: Field[] }

  it('parses, with the keys GitHub requires and every element well formed', () => {
    expect(typeof parsed.name).toBe('string')
    expect(typeof parsed.description).toBe('string')
    expect(parsed.title).toBe('Problem: ')
    expect(parsed.labels).toEqual(['bug'])
    expect(parsed.body.map((field) => field.type)).toEqual(['markdown', 'textarea', 'textarea', 'textarea', 'textarea'])
    const byId = Object.fromEntries(parsed.body.filter((f) => f.id).map((f) => [f.id, f]))
    for (const id of [...ISSUE_FIELDS, 'screenshot']) expect(byId[id]?.attributes.label, id).toBeTruthy()
    expect(byId.what.validations?.required).toBe(true)
    expect(byId.details.attributes.render).toBe('text')
    expect(byId.what.attributes.render).toBeUndefined()
    expect(byId.screenshot.attributes.render).toBeUndefined()
    expect(String(parsed.body[0].attributes.value)).toMatch(/paste|drag/i)
  })

  it('has a field for every id the app fills, and the screenshot box the panel names', () => {
    const ids = [...form.matchAll(/^\s+id: ([\w-]+)$/gm)].map((m) => m[1])
    for (const id of ISSUE_FIELDS) expect(ids, id).toContain(id)
    expect(ids).toContain('screenshot')
    expect(form).toMatch(/^name: /m)
    expect(form).toMatch(/^description: /m)
    expect(form).toMatch(/^title: "Problem: "$/m)
    expect(form).toMatch(/^labels: \["bug"\]$/m)
  })

  it('lets what happened take a pasted screenshot, and keeps the log out of markdown', () => {
    const block = (id: string): string => form.split(/\n  - type: /).find((b) => b.includes(`id: ${id}\n`)) ?? ''
    expect(block('what')).not.toContain('render:')
    expect(block('screenshot')).not.toContain('render:')
    expect(block('details')).toContain('render: text')
    expect(block('what')).toContain('required: true')
  })

  it('keeps blank issues allowed', () => {
    expect(() => readFileSync(join(__dirname, '..', '..', '.github', 'ISSUE_TEMPLATE', 'config.yml'))).toThrow()
  })
})
