// SPDX-License-Identifier: GPL-3.0-only
// Everything the page says that also feeds structured data. The FAQ
// renders twice from this one list, as visible answers and as FAQPage
// JSON-LD, so the two can never disagree. Facts that drift carry their
// verified-on date here, in the source, rather than on the page. The
// docs live on the site itself (US-092), so their links need the site's
// address: content(siteUrl) builds everything for one.

const REPO = 'https://github.com/lbwalton/murmur'
// The Pro price lives in shared/pro.json, which the app's Get Pro button
// reads too, so the app and the site never disagree (US-107).
const PRO = require('../shared/pro.json')

// The founders window (LaBroi, 2026-10-24): through December 31, 2026,
// murmur Pro is $39 on the website with the Stripe code FOUNDERS, which
// the checkout link fills in; then it is $49. Website only: the App Store
// price stays $49. A build made after the window drops every founders
// line, so the site is redeployed on January 1. It closes at midnight
// Pacific time, the end of December 31 where LaBroi is.
const FOUNDERS = { price: 39, code: 'FOUNDERS', ends: 'December 31, 2026', endsOn: '2026-12-31', closes: Date.parse('2027-01-01T08:00:00Z') }

function content(site, { supportEmail = '', now = Date.now() } = {}) {
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
    docSource: (name, ref = 'main') => `${REPO}/blob/${ref}/docs/${name}.md`,
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
    proPrice: PRO.price,
    // null once the window closes, so nothing says it any more.
    founders: now < FOUNDERS.closes ? { ...FOUNDERS, buy: `${PRO.buyUrl}?prefilled_promo_code=${FOUNDERS.code}` } : null
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
        '.',
        ...(facts.founders
          ? [
              ` Through ${facts.founders.ends}, Pro is $${facts.founders.price} with the code ${facts.founders.code}, and everyone who buys at that price is a founding member, with 10% off every future paid product.`
            ]
          : [])
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

  return { links, facts, title, description, faq, compare: compare(links, facts), privacy: privacy(links, supportEmail), support: support(links, supportEmail) }
}

/** The address as a link, or the issues page when the build has none. */
const ask = (links, supportEmail) => (supportEmail ? { text: supportEmail, href: `mailto:${supportEmail}` } : { text: 'open an issue on GitHub', href: links.issues })

// The privacy page the App Store listing links to (ios/prd.json IOS-026),
// for every murmur app. Each claim was checked against the code on the
// day in updated: the iPhone app names no address but the provider's, the
// keyboard no networking API (scripts/lib/keyboard-network.test.js), the
// desktop main process only the provider, GitHub's releases (src/main/
// updater.ts), and the provider list on GitHub (src/main/catalog.ts); the
// site's own policy allows nothing but its own files (site/headers.js).
function privacy(links, supportEmail) {
  return {
    title: 'Privacy: murmur collects nothing',
    description: 'murmur has no server, no account, and no analytics. Your voice goes only to the provider you choose, with your own key. What leaves each device, and why.',
    h1: 'murmur collects nothing.',
    lede: 'murmur is made by Eze Media LLC, which runs no server for the apps and receives nothing from them. Your voice goes only to the transcription provider you chose, under your own key. Here is what leaves your device, and why.',
    updated: '2026-10-22',
    items: [
      {
        q: 'Does murmur collect my data?',
        a: [
          "No. murmur has no server, no account, no analytics, no ads, and no tracking, on Mac, Windows, or iPhone. Nothing you say or type reaches Eze Media LLC. For the App Store's privacy label, the iPhone app answers Data Not Collected."
        ]
      },
      {
        q: 'Where does my voice go when I dictate?',
        a: [
          'To the transcription provider you chose (Groq unless you picked another), over an encrypted connection, under your own key, and only what you recorded while dictating. The provider handles it under its own privacy terms, which you agreed to when you made your key. Pointed at a server on your own computer, your voice never leaves it. ',
          { text: 'Choosing a provider', href: links.doc('providers') },
          '.'
        ]
      },
      {
        q: 'What else leaves my device?',
        a: ['Only these, each because you asked for it or to keep the app working:'],
        points: [
          ['Cleanup.', ['With cleanup at Full and polish on, the words of a take go to your cleanup provider, the same one unless you chose a separate one. Transform sends the text you selected and what you asked for.']],
          ['Your dictionary.', ['The words in your dictionary go along with your takes as spelling hints for your providers.']],
          [
            'Note sorting.',
            ['With Sort into tasks and ideas on, the sentences of a note go to the provider you set for sorting (your cleanup provider on iPhone), which says which file each one belongs in.']
          ],
          ['Test connection.', ['It asks your provider for its list of models, with your key.']],
          [
            'Updates, on Mac and Windows.',
            ['murmur checks GitHub for an update every few hours and reads its list of providers from GitHub. Nothing about you or your dictations is sent; GitHub sees the request as it would any web visit.']
          ],
          ['The iPhone keyboard.', ['The murmur keyboard sends nothing anywhere. It hands your take to the murmur app on the phone and types only the words you dictated.']],
          ['Your notes, if their folder syncs.', ['Notes are files in the folder you pick. If that folder syncs, like iCloud Drive or a synced vault, the sync service carries them under its own terms.']],
          [
            'Buying murmur Pro.',
            [
              "On iPhone, Apple handles the purchase and murmur reads the App Store's record of it on the phone. On Mac and Windows, Stripe handles the payment in your browser, and Eze Media LLC gets your email address and order from Stripe to send your license key, which murmur then checks offline, with no licensing server."
            ]
          ],
          ['Help you ask for.', ['A diagnostics report or log leaves only when you send it yourself, and an email to support comes with your address.']]
        ]
      },
      {
        q: 'What stays on my device?',
        a: [
          'Everything else: your history, settings, numbers, belts and paintings, recordings waiting to be retried, your dictionary apart from those hints, and your notes. Your keys stay encrypted by your system: on Mac and Windows with its secure storage, and on iPhone in the Keychain.'
        ]
      },
      {
        q: 'How do I delete my data?',
        a: ['Clear all empties your history (on the home tab on Mac and Windows, above your takes on iPhone). To remove everything murmur keeps:'],
        points: [
          ['Mac.', ['Quit murmur, move it to the Trash, and delete the folder Library/Application Support/murmur in your home folder.']],
          ['Windows.', ['Uninstall murmur, then delete the folder %APPDATA%\\murmur. Uninstalling keeps it, so a reinstall picks up where you left off.']],
          ['iPhone.', ['In murmur, tap the gear, then Provider and key, and tap Remove key for each key, since iOS keeps keys after an app is deleted. Then delete murmur.']],
          ['Your provider.', ['To have a provider delete what it keeps, ask the provider; murmur never had it.']],
          [
            'Eze Media LLC.',
            [
              'It keeps only what a purchase or an email gives it: for a Mac or Windows purchase, your email address, your order, and the license key it sent; for help, your email. It keeps them as long as your license and tax records need, and deletes them when you ask, unless the law requires keeping them. Write to ',
              ask(links, supportEmail),
              '.'
            ]
          ]
        ]
      },
      {
        q: 'Does this website track me?',
        a: [
          'No. murmurapp.app has no analytics, no cookies of its own, and no scripts but its own. Cloudflare hosts it and handles each request as any web host does.'
        ]
      },
      {
        q: 'Who do I ask about privacy?',
        a: ['Eze Media LLC makes murmur. Write to ', ask(links, supportEmail), '. If any of this changes, this page changes first, with its date.']
      }
    ]
  }
}

// The support page the App Store listing links to (ios/prd.json IOS-026).
// Apple requires that it leads to real contact information, so a deploy
// build refuses to run without the support address (site/build.js).
function support(links, supportEmail) {
  return {
    title: 'Support: get help with murmur',
    description: 'How to get help with murmur on Mac, Windows, or iPhone: email support, read the docs and troubleshooting, or report a bug on GitHub.',
    h1: 'Get help with murmur.',
    lede: 'Most answers are in the docs. When they are not, write, and a person answers.',
    items: [
      {
        q: 'How do I get help with murmur?',
        a: supportEmail
          ? ['Email ', ask(links, supportEmail), ' from any device. Say which device you use (Mac, Windows, or iPhone), which version of murmur, what you did, and what happened.']
          : ['Please ', ask(links, supportEmail), ': say which device you use, which version of murmur, what you did, and what happened.']
      },
      {
        q: 'Where are the answers to common problems?',
        a: [
          { text: 'Troubleshooting', href: links.doc('troubleshooting') },
          ' covers dictation that does not land, keys, permissions, and providers, and ',
          { text: 'the docs', href: links.docs },
          ' answer every setting.'
        ]
      },
      {
        q: 'How do I send a diagnostics report?',
        a: [
          'On iPhone, open murmur, tap the gear, then Diagnostics, and tap Save report. On Mac and Windows, open Settings, System, Diagnostics, and click Save report. Either way you get one plain text file to read before you share it: it never holds your words or your key, and nothing is sent until you send it. ',
          { text: 'What a report holds', href: links.doc('troubleshooting') },
          '.'
        ]
      },
      {
        q: 'How do I report a bug or ask for a feature?',
        a: ['Open an issue on ', { text: "murmur's GitHub", href: links.issues }, ', or email if you would rather not.']
      },
      {
        q: 'How do I get murmur Pro on my other device?',
        // The Pro doc as a whole: a deploy reads the docs at the release it
        // serves, which may not have this question's heading yet.
        a: [
          'One purchase covers Mac, Windows, and iPhone: email ',
          ask(links, supportEmail),
          ' with your order id, and you get a license key for the computer or a free App Store code for the iPhone. ',
          { text: 'About murmur Pro', href: links.doc('pro') },
          '.'
        ]
      }
    ]
  }
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
    'iphone',
    'murmur on iPhone',
    'murmur on iPhone: add the murmur keyboard, talk in any app, keep notes by voice, and set up your key, cleanup, sessions, belts, and murmur Pro.'
  ],
  [
    'settings',
    'Settings',
    'Every murmur setting explained: hotkeys, hold to talk or toggle, insert modes, formatting levels, Smart lists, Apply corrections, the dictionary, history, sounds, and more.'
  ],
  [
    'microphone',
    'Microphone',
    'Choose the microphone murmur listens to, and how murmur follows your default mic after a display wakes, a dock reconnects, or a mic is unplugged.'
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
