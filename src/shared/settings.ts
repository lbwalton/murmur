// SPDX-License-Identifier: GPL-3.0-only
// Settings shape, defaults, and the pure merge logic. IO lives in
// src/main/settings; keeping this file pure keeps it unit-testable.

export interface Settings {
  hotkey: {
    mode: 'hold' | 'toggle'
    binding: string
  }
  provider: {
    baseUrl: string
    sttModel: string
    llmModel: string
  }
  formatting: {
    level: 'off' | 'light' | 'full'
    numbers: 'auto' | 'words' | 'digits'
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
    /** Activity-wall fill: 'cream', 'belt' (follows rank), or any
     *  earned belt-color accent id. Unknown or locked ids fall back
     *  to cream at render time. */
    heat: string
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
  autostart: boolean
  showDockIcon: boolean
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
    binding: isMacPlatform() ? 'Alt+Space' : 'Ctrl+Space'
  },
  provider: {
    baseUrl: 'https://api.groq.com/openai/v1',
    sttModel: 'whisper-large-v3-turbo',
    // Groq decommissioned the llama defaults 2026-08-16; gpt-oss-120b is
    // their documented replacement (console.groq.com/docs/deprecations).
    llmModel: 'openai/gpt-oss-120b'
  },
  formatting: {
    level: 'full',
    numbers: 'auto'
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
    heat: 'cream'
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
  autostart: false,
  showDockIcon: false,
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
  return out as T
}

/** Mask an API key for display: never send the real key to a renderer. */
export function maskKey(key: string): string {
  if (key.length <= 8) return '••••'
  return `${key.slice(0, 4)}…${key.slice(-4)}`
}
