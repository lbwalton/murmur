// SPDX-License-Identifier: GPL-3.0-only
// Everything the page says that also feeds structured data. The FAQ
// renders twice from this one list, as visible answers and as FAQPage
// JSON-LD, so the two can never disagree. Facts that drift carry their
// verified-on date here, in the source, rather than on the page.

const REPO = 'https://github.com/lbwalton/murmur'

const links = {
  repo: REPO,
  // US-063: permanent names that always serve the newest release.
  mac: `${REPO}/releases/latest/download/murmur-mac.dmg`,
  windows: `${REPO}/releases/latest/download/murmur-windows.exe`,
  releases: `${REPO}/releases`,
  issues: `${REPO}/issues`,
  docs: `${REPO}/tree/main/docs`,
  doc: (name) => `${REPO}/blob/main/docs/${name}.md`,
  windowsScreen: `${REPO}/blob/main/docs/download.md#what-does-windows-protected-your-pc-mean-when-i-install-murmur`,
  groqKeys: 'https://console.groq.com/keys',
  license: 'https://www.gnu.org/licenses/gpl-3.0.html'
}

// Verified 2026-09-26: the macOS 13 and Windows 10 minimums are Electron
// 44's (electronjs.org breaking changes; the electron/electron README's
// platform support), and murmur Pro is $49 on the live Stripe checkout.
const facts = {
  macos: 'macOS 13 Ventura or later',
  windows: 'Windows 10 or later',
  proPrice: 49
}

const title = 'murmur: push-to-talk dictation for Mac and Windows'
const description =
  'Hold a key, speak, and clean text lands at your cursor in any app. Free, open source dictation for Mac and Windows. Bring your own key, no account.'

// An answer is a list of pieces: plain strings, or { text, href } links.
// The visible page renders the links; the JSON-LD and llms.txt use the
// same words as plain text.
const faq = [
  {
    q: 'What is murmur?',
    a: [
      'murmur is push-to-talk dictation for Mac and Windows. Hold your hotkey, speak, and release: murmur transcribes what you said, cleans it up, and types it at your cursor in whatever app you are using. A small waveform pill shows while you are live, and nothing records unless you are holding the key.'
    ]
  },
  {
    q: 'What does murmur cost?',
    a: [
      `The app is free, with every dictation feature included. Transcription runs on your own API key, so you pay your provider directly, and at Groq's rates typical use costs cents a month. murmur Pro is an optional one-time purchase of $${facts.proPrice} that adds provider profiles and early access to new conveniences, and it funds development. See `,
      { text: 'what Pro includes', href: links.doc('pro') },
      '.'
    ]
  },
  {
    q: 'Do I need an API key?',
    a: [
      'Yes. murmur is bring your own key: paste a ',
      { text: 'free key from Groq', href: links.groqKeys },
      ', the default, or a key from ',
      { text: 'any OpenAI-compatible provider', href: links.doc('providers') },
      ', including a server running on your own computer. The key is encrypted on your machine and sent only to that provider.'
    ]
  },
  {
    q: 'Is my audio private?',
    a: [
      'Audio records only while you hold the hotkey, silence is trimmed on your computer, and the recording goes only to the provider you chose. Your history, stats, and settings stay on your machine. There is no murmur account, no murmur server, and no telemetry.'
    ]
  },
  {
    q: 'Which computers does murmur run on?',
    a: [
      `Macs running ${facts.macos}, with Apple silicon or Intel, from one download. PCs running ${facts.windows}, standard or ARM, from one installer. Installed copies keep themselves up to date.`
    ]
  },
  {
    q: 'Why does Windows warn me when I install murmur?',
    a: [
      "murmur's Windows installer is not signed yet, so Windows shows a blue Windows protected your PC screen for it, as it does for any unsigned app. Click More info, then Run anyway. ",
      { text: 'More about that screen', href: links.windowsScreen },
      '.'
    ]
  },
  {
    q: 'Is murmur open source?',
    a: [
      'Yes. murmur is licensed under GPL-3.0 and every line is ',
      { text: 'on GitHub', href: links.repo },
      '. Building it yourself needs Node and nothing else: no compilers and no build tools.'
    ]
  },
  {
    q: 'Where is the documentation?',
    a: [
      'Setup, every setting, providers, notes, transform, and troubleshooting are in ',
      { text: 'the docs on GitHub', href: links.docs },
      ', written as answers to the questions people actually ask.'
    ]
  }
]

module.exports = { links, facts, title, description, faq }
