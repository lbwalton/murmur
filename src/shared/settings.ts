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
}

export const DEFAULT_SETTINGS: Settings = {
  hotkey: {
    mode: 'hold',
    binding: process.platform === 'darwin' ? 'Alt+Space' : 'Ctrl+Space'
  },
  provider: {
    baseUrl: 'https://api.groq.com/openai/v1',
    sttModel: 'whisper-large-v3-turbo',
    llmModel: 'llama-3.3-70b-versatile'
  },
  formatting: {
    level: 'full',
    numbers: 'auto'
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
  showDockIcon: false
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Deep-merge stored settings over defaults. Objects merge recursively,
 * arrays and scalars replace, and keys this build does not know about
 * are preserved so an older build never destroys a newer one's settings.
 */
export function mergeSettings<T extends object>(defaults: T, stored: unknown): T {
  if (!isPlainObject(stored)) return structuredClone(defaults)
  const out = structuredClone(defaults) as Record<string, unknown>
  for (const [key, value] of Object.entries(stored)) {
    const base = out[key]
    if (isPlainObject(base) && isPlainObject(value)) {
      out[key] = mergeSettings(base, value)
    } else {
      out[key] = structuredClone(value)
    }
  }
  return out as T
}

/** Mask an API key for display: never send the real key to a renderer. */
export function maskKey(key: string): string {
  if (key.length <= 8) return '••••'
  return `${key.slice(0, 4)}…${key.slice(-4)}`
}
