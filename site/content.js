// SPDX-License-Identifier: GPL-3.0-only
// Everything the page says that also feeds structured data. The FAQ
// renders twice from this one list, as visible answers and as FAQPage
// JSON-LD, so the two can never disagree. Facts that drift carry their
// verified-on date here, in the source, rather than on the page. The
// docs live on the site itself (US-092), so their links need the site's
// address: content(siteUrl) builds everything for one.

const REPO = 'https://github.com/lbwalton/murmur'

function content(site) {
  const links = {
    site,
    repo: REPO,
    // US-063: permanent names that always serve the newest release.
    mac: `${REPO}/releases/latest/download/murmur-mac.dmg`,
    windows: `${REPO}/releases/latest/download/murmur-windows.exe`,
    releases: `${REPO}/releases`,
    issues: `${REPO}/issues`,
    docs: `${site}/docs/`,
    doc: (name, anchor) => `${site}/docs/${name}/${anchor ? `#${anchor}` : ''}`,
    docSource: (name) => `${REPO}/blob/main/docs/${name}.md`,
    compare: `${site}/wispr-flow-alternative/`,
    windowsScreen: `${site}/docs/download/#what-does-windows-protected-your-pc-mean-when-i-install-murmur`,
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

  const title = 'murmur: free, open source dictation app for Mac and Windows'
  const description =
    'Free, open source push-to-talk dictation for Mac and Windows. Hold a key, speak, and clean text lands at your cursor in any app. Bring your own key, no account.'

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
      q: 'Is murmur an alternative to Wispr Flow?',
      a: [
        'Yes. murmur does the same core job: hold a key, speak, and clean text lands at your cursor in any app on Mac or Windows. It is free and open source, needs no account, and sends your audio only to the provider you choose, including a Whisper server on your own computer. Wispr Flow adds phone apps, team controls, and a meeting notetaker. ',
        { text: 'murmur and Wispr Flow side by side', href: links.compare },
        '.'
      ]
    },
    {
      q: 'Can murmur work offline?',
      a: [
        'Yes, with a local server. Point murmur at a Whisper server running on your own computer, such as Speaches, and your audio never leaves the machine, so dictation works without an internet connection. With a cloud provider like Groq, murmur needs a connection to reach it. ',
        { text: 'Running murmur against a local server', href: links.doc('providers', 'can-i-run-murmur-against-a-local-or-self-hosted-server') },
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
        { text: 'the docs', href: links.docs },
        ', written as answers to the questions people actually ask.'
      ]
    }
  ]

  return { links, facts, title, description, faq, compare: compare(links, facts) }
}

// The docs in the order a newcomer reads them, with the short name each
// gets in the docs list and, where the doc's first paragraph is not a
// summary, the description search results show. Every file in docs/
// must be here.
const DOCS = [
  [
    'quickstart',
    'Quickstart',
    'Install murmur and make your first dictation in about five minutes: download it, paste a free Groq key, grant permissions, pick a hotkey, and speak.'
  ],
  [
    'download',
    'Download and install',
    'Download murmur for Mac or Windows, install it, get past the Windows protected your PC screen, and check which Macs and PCs murmur runs on.'
  ],
  [
    'settings',
    'Settings',
    'Every murmur setting explained: hotkeys, hold to talk or toggle, insert modes, formatting levels, Smart lists, the dictionary, history, sounds, and more.'
  ],
  [
    'providers',
    'Providers',
    'Connect murmur to Groq, OpenAI, Mistral, a local Whisper server, or any OpenAI-compatible endpoint: base URLs, keys, models, costs, and fixes.'
  ],
  ['notes', 'Notes'],
  ['transform', 'Transform'],
  ['journey', 'The journey'],
  ['pro', 'murmur Pro'],
  [
    'troubleshooting',
    'Troubleshooting',
    'Fix murmur problems fast: send diagnostics, retry a failed dictation, and get the microphone back when murmur hears nothing or stops after sleep.'
  ]
]

// The Wispr Flow comparison (US-092). Every claim about Wispr Flow comes
// from Wispr's own pages, checked 2026-10-03 (the sources list below):
// wisprflow.ai/pricing for the plans, prices, the free plan's weekly
// words, and which tier carries team billing, single sign-on, and the
// HIPAA agreement, and Wispr's help center ("What is Flow?") for the
// platforms, the account, and transcription needing an internet
// connection. That its source is not public is the absence of any
// published source, not a claim of Wispr's. Recheck
// them before changing a word here. murmur's side comes from facts above
// and docs/providers.md.
function compare(links, facts) {
  return {
    checked: '2026-10-03',
    title: 'An open source Wispr Flow alternative for Mac and Windows: murmur',
    description:
      'A free, open source Wispr Flow alternative: push-to-talk dictation for Mac and Windows with no account, no subscription, and your choice of speech provider.',
    h1: 'An open source alternative to Wispr Flow',
    answer:
      'murmur does the same core job as Wispr Flow: hold a key, speak, and clean text lands at your cursor in any app on Mac or Windows. The difference is who holds the keys. murmur is free and open source, needs no account, and sends your audio only to the speech provider you choose, including a Whisper server on your own computer that works with no internet at all.',
    rows: [
      ['Price', `Free, with every dictation feature. murmur Pro is an optional one-time purchase of $${facts.proPrice}.`, 'Free plan with 2,000 words a week on desktop. Pro is $15 a month, or $12 a month billed yearly.'],
      ['Paying for speech', "You pay your provider directly, on your own key. Groq's free tier charges nothing, and paid use typically costs cents a month.", 'Included in your plan.'],
      ['Source code', 'Open source under GPL-3.0. Every line is on GitHub.', 'Not public.'],
      ['Who transcribes your speech', 'The provider you pick: Groq, OpenAI, Mistral, any OpenAI-compatible service, or a Whisper server on your own computer.', 'Flow itself, over the internet.'],
      ['Without internet', 'Works, with a local Whisper server such as Speaches.', 'Transcription needs an internet connection.'],
      ['Account', 'None.', 'Required: Google, Apple, Microsoft, single sign-on, or email.'],
      ['Platforms', 'Mac (macOS 13 or later) and Windows (10 or later).', 'Mac, Windows, iPhone, and Android.'],
      ['Weekly limits', "None from murmur. Your provider's rate limits apply.", 'On the free plan, 2,000 words a week on desktop and 1,000 on mobile; unlimited on Pro.']
    ],
    why: [
      ['Your setup is yours.', 'Your key, your provider, your model. Switch providers in a minute, or run speech on your own computer.'],
      ['Private by design.', 'Nothing records unless you hold the key. History, stats, and settings stay on your computer. There is no murmur account, no murmur server, and no telemetry.'],
      ['No subscription.', 'The app is free and complete. Pro is a one-time purchase that funds development.'],
      ['Open source.', 'Read, build, or change every line. GPL-3.0 keeps it open for good.'],
      ['A dictation is never lost.', 'If the cleanup model errors or misbehaves, murmur types the plain transcript instead.']
    ],
    better: [
      ['You dictate on your phone.', 'Wispr Flow has iPhone and Android apps. murmur runs on Mac and Windows; an iPhone app is planned.'],
      ['Your team needs central controls.', 'Wispr Flow Pro adds central billing and user management, higher tiers add single sign-on and admin controls, and every plan offers HIPAA-ready dictation with a signed agreement.'],
      ['You want meeting notes.', 'Wispr Flow includes a Notetaker for meetings.'],
      ['You never want to touch an API key.', 'Wispr Flow bundles speech into its plans. murmur asks for a key once, in the setup wizard.']
    ],
    steps: [
      ['Download murmur', ' for Mac or Windows. A setup wizard opens on first launch.', links.doc('download')],
      ['Get a free Groq key', ' at console.groq.com/keys and paste it into the wizard.', links.doc('providers')],
      ['Grant permissions.', ' On a Mac: Microphone, Accessibility, and Input Monitoring; the wizard links each one.', null],
      ['Pick your hotkey.', ' Quit Wispr Flow first, or choose a different key, so only one app answers it.', null],
      ['Bring your words.', ' Add your names and jargon under Settings, Dictionary.', links.doc('settings')]
    ],
    faq: [
      {
        q: 'Is murmur a free Wispr Flow alternative?',
        a: [
          `Yes. The murmur app is free with every dictation feature and no weekly word limit. You pay your speech provider directly on your own key, and Groq's free tier charges nothing. murmur Pro is an optional one-time purchase of $${facts.proPrice}.`
        ]
      },
      {
        q: 'Does murmur work offline, like a local Whisper app?',
        a: [
          'Yes, when you run speech on your own computer. Point murmur at a local Whisper server such as Speaches and your audio never leaves the machine. ',
          { text: 'How to set up a local server', href: links.doc('providers', 'can-i-run-murmur-against-a-local-or-self-hosted-server') },
          '.'
        ]
      },
      {
        q: 'Which speech model does murmur use?',
        a: [
          "By default, OpenAI's Whisper (whisper-large-v3-turbo) running on Groq, which is fast and inexpensive. You can pick whisper-large-v3 for the highest accuracy, or any model your provider offers. ",
          { text: 'Providers and models', href: links.doc('providers') },
          '.'
        ]
      },
      {
        q: 'Can I use murmur on my phone?',
        a: ['Not yet. murmur runs on Mac and Windows. An iPhone app is planned as its own phase.']
      },
      {
        q: 'Is Whispr Flow the same as Wispr Flow?',
        a: ['Yes. People often search for Whispr Flow or Whisper Flow; the app is Wispr Flow, made by Wispr. murmur is a separate, open source project and is not affiliated with Wispr.']
      }
    ],
    sources: [
      ['Wispr Flow pricing', 'https://wisprflow.ai/pricing'],
      ['What is Flow? (Wispr help center)', 'https://docs.wisprflow.ai/articles/2772472373-what-is-flow']
    ]
  }
}

module.exports = { content, DOCS }
