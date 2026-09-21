// SPDX-License-Identifier: GPL-3.0-only
// Settings shape, defaults, and the pure merge logic. IO lives in
// src/main/settings; keeping this file pure keeps it unit-testable.
import {
  DEFAULT_IDEAS_TEMPLATE,
  DEFAULT_NOTE_ENTRY_TEMPLATE,
  DEFAULT_NOTE_PATH_TEMPLATE,
  DEFAULT_TASKS_TEMPLATE
} from './notes'
import { DEFAULT_FILED_HEADING_TEMPLATE } from './sorter'

export interface Settings {
  hotkey: {
    mode: 'hold' | 'toggle'
    binding: string
    /** Chord that pastes the newest history entry. Empty means the
     *  feature is disarmed; it only works once the user captures one. */
    pasteLastBinding: string
  }
  provider: {
    baseUrl: string
    sttModel: string
    llmModel: string
    /** The base URL that was active when the API key was saved. Not a
     *  secret: it lets every surface say honestly that the saved key
     *  belongs to a different provider after a switch. Empty means
     *  unknown (keys saved before this field existed). */
    keySavedForBaseUrl: string
    /** Saved provider setups (murmur Pro): switch endpoint, models,
     *  and the matching key in one click. The active fields above stay
     *  the single source of truth for what runs. */
    profiles: Array<{ id: string; name: string; baseUrl: string; sttModel: string; llmModel: string }>
  }
  /** Separate cleanup connection, so speech and cleanup can run on
   *  different providers (Groq speech, DeepSeek cleanup). It joins the
   *  pipeline only when enabled AND fully configured with its own key;
   *  anything less and cleanup rides the provider block above, exactly
   *  as before the slot existed. */
  polish: {
    enabled: boolean
    baseUrl: string
    llmModel: string
  }
  formatting: {
    level: 'off' | 'light' | 'full'
    numbers: 'auto' | 'words' | 'digits'
    /** Smart lists: spoken sequences and item run-ons become real lists
     *  (polish prompt plus spoken list commands). Off keeps today's
     *  behavior exactly. */
    smartLists: boolean
  }
  insertion: {
    mode: 'paste' | 'copy'
  }
  overlay: {
    style: string
  }
  cosmetics: {
    accent: string
    uiTheme: string
    /** Activity-wall fill: 'orange' (the default), 'belt' (follows
     *  rank), or any earned belt-color accent id. Unknown or locked
     *  ids fall back to orange at render time. */
    heat: string
    /** Paper mode for the wall: white squares, fills darken. Earned
     *  with the black belt; dark fills invert automatically anyway. */
    heatInverted: boolean
  }
  dictionary: Array<{ from: string; to: string }>
  expansions: Array<{ trigger: string; text: string }>
  sounds: {
    enabled: boolean
    volume: number
  }
  history: {
    retentionDays: number
  }
  recap: {
    enabled: boolean
    time: string
  }
  /** Brain dump: a second chord dictates into a markdown file instead
   *  of the cursor. The folder is any folder (an Obsidian vault is one);
   *  empty keeps the whole feature dormant. Templates are relative to
   *  the folder and rendered by shared/notes.ts. */
  notes: {
    binding: string
    folder: string
    pathTemplate: string
    entryTemplate: string
    /** Sorting (US-051): after a note lands, a model labels each
     *  sentence task, idea, or note and murmur copies tasks and ideas
     *  to their files with links back. Off writes the inbox only. */
    sort: boolean
    tasksTemplate: string
    ideasTemplate: string
    /** Heading a day's filed lines gather under in the tasks and ideas
     *  files. Empty writes one flat list. */
    filedHeadingTemplate: string
    /** Ask the sort model to name each note, so {topic} in the heading
     *  says what a group is about at a glance. */
    topicHeadings: boolean
    /** Desktop reminders that read the tasks file and say what is
     *  still open. Off by default: notifications are opt in. */
    reminders: {
      enabled: boolean
      times: string[]
    }
    /** The sort connection, shaped like the cleanup slot: enabled false
     *  means same as cleanup; a complete separate slot runs on its own. */
    connection: {
      enabled: boolean
      baseUrl: string
      llmModel: string
    }
  }
  autostart: boolean
  showDockIcon: boolean
  /** Refresh the bundled provider catalog (rates, presets, nuances)
   *  from the murmur repo at launch: a read-only file fetch to the same
   *  GitHub host the updater already contacts, carrying no user data. */
  catalogRefresh: boolean
  /** Last app version whose what's new section the user opened; the
   *  home tab shows a quiet marker while it trails the running one. */
  whatsNewSeenVersion: string
  onboarding: {
    completed: boolean
  }
}

// This module loads in main AND in sandboxed renderers, where the node
// process global does not exist. Never touch process directly here.
function isMacPlatform(): boolean {
  if (typeof process !== 'undefined' && typeof process.platform === 'string') {
    return process.platform === 'darwin'
  }
  if (typeof navigator !== 'undefined') {
    return navigator.platform.toLowerCase().includes('mac')
  }
  return false
}

export const DEFAULT_SETTINGS: Settings = {
  hotkey: {
    mode: 'hold',
    binding: isMacPlatform() ? 'Alt+Space' : 'Ctrl+Space',
    pasteLastBinding: ''
  },
  provider: {
    baseUrl: 'https://api.groq.com/openai/v1',
    keySavedForBaseUrl: '',
    sttModel: 'whisper-large-v3-turbo',
    // Groq decommissioned the llama defaults 2026-08-16; gpt-oss-120b is
    // their documented replacement (console.groq.com/docs/deprecations).
    llmModel: 'openai/gpt-oss-120b',
    profiles: []
  },
  polish: {
    enabled: false,
    baseUrl: '',
    llmModel: ''
  },
  formatting: {
    level: 'full',
    numbers: 'auto',
    smartLists: false
  },
  insertion: {
    mode: 'paste'
  },
  overlay: {
    style: 'bars'
  },
  cosmetics: {
    accent: 'amber',
    uiTheme: 'ember',
    heat: 'orange',
    heatInverted: false
  },
  dictionary: [],
  expansions: [],
  sounds: {
    enabled: true,
    volume: 0.5
  },
  history: {
    retentionDays: 90
  },
  recap: {
    enabled: false,
    time: '17:30'
  },
  notes: {
    binding: '',
    folder: '',
    pathTemplate: DEFAULT_NOTE_PATH_TEMPLATE,
    entryTemplate: DEFAULT_NOTE_ENTRY_TEMPLATE,
    sort: false,
    tasksTemplate: DEFAULT_TASKS_TEMPLATE,
    ideasTemplate: DEFAULT_IDEAS_TEMPLATE,
    filedHeadingTemplate: DEFAULT_FILED_HEADING_TEMPLATE,
    topicHeadings: false,
    reminders: {
      enabled: false,
      times: ['08:30', '13:00', '17:30']
    },
    connection: {
      enabled: false,
      baseUrl: '',
      llmModel: ''
    }
  },
  autostart: false,
  showDockIcon: false,
  catalogRefresh: true,
  whatsNewSeenVersion: '',
  onboarding: {
    completed: false
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Deep-merge stored settings over defaults. Objects merge recursively,
 * arrays and scalars replace, and keys this build does not know about
 * are preserved so an older build never destroys a newer one's settings.
 * A stored value whose type disagrees with the default is discarded:
 * foreign or corrupt settings must never break the app.
 */
export function mergeSettings<T extends object>(defaults: T, stored: unknown): T {
  if (!isPlainObject(stored)) return structuredClone(defaults)
  const out = structuredClone(defaults) as Record<string, unknown>
  for (const [key, value] of Object.entries(stored)) {
    const base = out[key]
    if (isPlainObject(base)) {
      if (isPlainObject(value)) out[key] = mergeSettings(base, value)
      continue
    }
    if (Array.isArray(base)) {
      if (Array.isArray(value)) out[key] = structuredClone(value)
      continue
    }
    if (base !== undefined && typeof base !== typeof value) continue
    out[key] = structuredClone(value)
  }
  return sanitizeEntryLists(out) as T
}

// Entry lists must hold exactly their declared shapes: a malformed
// entry that slips into the stored file (issue 1 killed the whole
// settings window over an expansion with no text) is dropped on load
// rather than trusted. Fail open: the rest of the file survives.
function stringPair(value: unknown, a: string, b: string): boolean {
  if (!isPlainObject(value)) return false
  const v = value as Record<string, unknown>
  return typeof v[a] === 'string' && typeof v[b] === 'string'
}

function sanitizeEntryLists(out: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(out.dictionary)) {
    out.dictionary = out.dictionary.filter((e) => stringPair(e, 'from', 'to'))
  }
  if (Array.isArray(out.expansions)) {
    out.expansions = out.expansions.filter((e) => stringPair(e, 'trigger', 'text'))
  }
  // Reminder times feed a scheduler that runs every minute, so a
  // non-string here would throw on a timer forever (review gate
  // 2026-09-21), the same class of failure the entry lists guard.
  const notes = out.notes as Record<string, unknown> | undefined
  const reminders = notes?.reminders as Record<string, unknown> | undefined
  if (reminders && Array.isArray(reminders.times)) {
    reminders.times = reminders.times.filter((t) => typeof t === 'string')
  }
  const provider = out.provider as Record<string, unknown> | undefined
  if (provider && Array.isArray(provider.profiles)) {
    provider.profiles = provider.profiles.filter(
      (p) =>
        stringPair(p, 'id', 'name') &&
        stringPair(p, 'baseUrl', 'sttModel') &&
        typeof (p as Record<string, unknown>).llmModel === 'string'
    )
  }
  return out
}

/** Mask an API key for display: never send the real key to a renderer. */
export function maskKey(key: string): string {
  if (key.length <= 8) return '••••'
  return `${key.slice(0, 4)}…${key.slice(-4)}`
}
