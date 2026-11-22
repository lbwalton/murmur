// SPDX-License-Identifier: GPL-3.0-only
// Import and export for the dictionary (US-183), the main process half:
// the file dialogs, the capped read, and the write. A picked file is
// read and counted here, the settings window asks with those counts,
// and only a yes changes the list. Nothing goes anywhere but the file
// the person names, and the log gets counts, never words or file names.
import { randomUUID } from 'node:crypto'
import { basename, extname } from 'node:path'
import type { BrowserWindow } from 'electron'
import {
  type DictionaryExported,
  type DictionaryImported,
  type DictionaryPick,
  MAX_DICTIONARY_FILE_BYTES,
  decodeWordList,
  dictionaryCsv,
  dictionaryFileText,
  exportable,
  mergeDictionary,
  parseDictionaryFile
} from '../shared/dictionary-file'
import type { DictionaryEntry } from '../shared/dictionary'
import type { Settings } from '../shared/settings'
import { ipc } from './ipc'
import { MAX_NAME_CHARS, boundedText } from './ipc-rules'
import { readCappedFile } from './read-capped'
import { getSettings, updateSettings } from './settings'
import { registerSmokeCheck } from './smoke'
import { writeAppLog } from './window-watch'

// The 1 import waiting on a yes. Picking another file, a no, and an
// import all clear it, so a file's words are held no longer than the
// question is open.
let waiting: { token: string; entries: DictionaryEntry[] } | null = null

/** Count what a file's text would do to the list, and hold its words
 *  for the answer. */
export function stageImport(text: string, fileName: string): DictionaryPick {
  waiting = null
  const parsed = parseDictionaryFile(text, extname(fileName).slice(1))
  if (!parsed.ok) return { status: 'unreadable' }
  const plan = mergeDictionary(getSettings().dictionary, parsed.entries)
  const token = randomUUID()
  if (plan.added + plan.changed > 0) waiting = { token, entries: parsed.entries }
  return {
    status: 'ready',
    token,
    name: basename(fileName),
    added: plan.added,
    addedWords: plan.addedWords,
    changed: plan.changed,
    changedWords: plan.changedWords,
    same: plan.same,
    left: plan.left,
    unread: parsed.unread,
    heading: parsed.heading
  }
}

/** The yes: fold the waiting words into the list as it is now, which
 *  may have changed while the question was open. `changed` hears the
 *  new settings: the settings window holds its own copy of the list,
 *  and would write the old one back with the next word added there. */
export function applyImport(token: unknown, changed?: (settings: Settings) => void): DictionaryImported {
  const held = waiting
  if (!held || boundedText(token, MAX_NAME_CHARS) !== held.token) return { status: 'stale' }
  waiting = null
  const plan = mergeDictionary(getSettings().dictionary, held.entries)
  if (plan.added + plan.changed > 0) changed?.(updateSettings({ dictionary: plan.next }))
  writeAppLog(`[dictionary] imported added=${plan.added} changed=${plan.changed} left=${plan.left}`)
  return { status: 'done', added: plan.added, changed: plan.changed }
}

export function initDictionaryFile(settingsWindow: () => BrowserWindow | null): void {
  // Parented to the settings window, so a dialog never opens buried
  // behind the app in front (US-047).
  const liveWindow = (): BrowserWindow | null => {
    const target = settingsWindow()
    return target && !target.isDestroyed() ? target : null
  }

  ipc.handle('dictionary:pick', async (): Promise<DictionaryPick> => {
    // Asking about another file drops the one that was waiting, even
    // when the file window is then closed without a pick.
    waiting = null
    const target = liveWindow()
    if (!target) return { status: 'cancelled' }
    const { dialog } = await import('electron')
    const { canceled, filePaths } = await dialog.showOpenDialog(target, {
      properties: ['openFile'],
      filters: [{ name: 'Word list', extensions: ['csv', 'json', 'txt', 'tsv'] }]
    })
    const path = filePaths[0]
    if (canceled || !path) return { status: 'cancelled' }
    let bytes: Buffer | null
    try {
      bytes = await readCappedFile(path, MAX_DICTIONARY_FILE_BYTES)
    } catch (error) {
      writeAppLog(`[dictionary] import read failed reason=${(error as NodeJS.ErrnoException | null)?.code ?? 'unknown'}`)
      return { status: 'unreadable' }
    }
    if (bytes === null) return { status: 'too-big' }
    return stageImport(decodeWordList(bytes), path)
  })

  // The window hears the new list at once, as it does for Hide words
  // from the tray: its own copy is what Add and Remove write back.
  ipc.handle('dictionary:import', (_event, token: unknown): DictionaryImported => {
    return applyImport(token, (settings) => liveWindow()?.webContents.send('settings:pushed', settings))
  })

  ipc.handle('dictionary:drop', (): void => {
    waiting = null
  })

  ipc.handle('dictionary:export', async (): Promise<DictionaryExported> => {
    const target = liveWindow()
    if (!target) return { status: 'cancelled' }
    const entries = exportable(getSettings().dictionary)
    if (entries.length === 0) return { status: 'empty' }
    const { dialog } = await import('electron')
    const { writeFile } = await import('node:fs/promises')
    const { canceled, filePath } = await dialog.showSaveDialog(target, {
      defaultPath: `murmur-dictionary-${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [
        { name: 'CSV, for a spreadsheet', extensions: ['csv'] },
        { name: 'JSON', extensions: ['json'] }
      ]
    })
    if (canceled || !filePath) return { status: 'cancelled' }
    const { text, format } = dictionaryFileText(entries, filePath)
    // A full disk or a folder without write access says so in the row.
    try {
      await writeFile(filePath, text, 'utf8')
    } catch (error) {
      writeAppLog(`[dictionary] export failed reason=${(error as NodeJS.ErrnoException | null)?.code ?? 'unknown'}`)
      return { status: 'failed' }
    }
    writeAppLog(`[dictionary] exported count=${entries.length} format=${format}`)
    return { status: 'saved', count: entries.length }
  })

  registerSmokeCheck('dictionaryFile', async () => {
    // The whole path short of the dialogs, against the real settings
    // store: a list goes out as CSV, comes back with 1 spelling changed
    // and 1 word new, waits for its yes, lands on the list as it is by
    // then, tells the window, cannot land twice, and leaves only counts
    // in the log.
    const { buildDiagnosticsReport } = await import('./diagnostics')
    const before = getSettings().dictionary
    updateSettings({ dictionary: [{ from: 'smokeheard', to: 'SmokeWritten' }] })
    try {
      const csv = dictionaryCsv([
        { from: 'smokeheard', to: 'SmokeRewritten' },
        { from: 'smokenew', to: '@SmokeNew' }
      ])
      const pick = stageImport(decodeWordList(Buffer.from(csv, 'utf8')), '/somewhere/private/smokefile-names.csv')
      const untouched = getSettings().dictionary.length === 1
      const refused = applyImport('not-the-token').status === 'stale'
      // A word typed in Settings while the question is open stays.
      updateSettings({ dictionary: [...getSettings().dictionary, { from: 'smoketyped', to: 'SmokeTyped' }] })
      let told: Settings | null = null
      const done =
        pick.status === 'ready'
          ? applyImport(pick.token, (settings) => {
              told = settings
            })
          : null
      const after = getSettings().dictionary
      const again = pick.status === 'ready' ? applyImport(pick.token).status : ''
      const log = buildDiagnosticsReport()
      return (
        pick.status === 'ready' &&
        pick.name === 'smokefile-names.csv' &&
        pick.added === 1 &&
        pick.changed === 1 &&
        untouched &&
        refused &&
        done?.status === 'done' &&
        after.length === 3 &&
        after[0].to === 'SmokeRewritten' &&
        after[1].from === 'smoketyped' &&
        after[2].from === 'smokenew' &&
        after[2].to === '@SmokeNew' &&
        (told as Settings | null)?.dictionary.length === 3 &&
        again === 'stale' &&
        log.includes('[dictionary] imported added=1 changed=1 left=0') &&
        !/smokeheard|smokenew|smoketyped|smokefile|somewhere/i.test(log) &&
        stageImport('PK\u0003\u0004\u0000', 'book.csv').status === 'unreadable'
      )
    } finally {
      waiting = null
      updateSettings({ dictionary: before })
    }
  })
}
