// SPDX-License-Identifier: GPL-3.0-only
// The notes section of settings (US-050): the note chord, the folder,
// where the last note landed, and the file layout templates with a
// live preview. Template math is the shared pure module, so what the
// preview says is exactly what the writer does.
import { useCallback, useEffect, useState } from 'react'
import type { HotkeysStatus, KeyStatus, NotesStatus, SettingsApi } from '../../preload/settings'
import type { ProviderCatalog } from '../../shared/catalog'
import {
  DEFAULT_IDEAS_TEMPLATE,
  DEFAULT_NOTE_ENTRY_TEMPLATE,
  DEFAULT_NOTE_PATH_TEMPLATE,
  DEFAULT_TASKS_TEMPLATE,
  type NotePathProblem,
  resolveNotePath
} from '../../shared/notes'
import type { Settings } from '../../shared/settings'
import { ConnectionRows } from './ConnectionRows'
import { Row, TextSetting } from './controls'

const bridge = (): SettingsApi => window.murmur

const PROBLEM_TEXT: Record<NotePathProblem, string> = {
  empty: 'the template is empty',
  absolute: 'the path must be relative to your notes folder',
  escapes: 'the path must stay inside your notes folder',
  extension: 'the file must end in .md or .txt',
  characters: 'a segment holds a character file names cannot',
  reserved: 'that name is a Windows device name'
}

function timeOf(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** One phrase for the sort outcome on the Last note line. */
function sortSummary(report: NonNullable<NotesStatus['lastSort']>): string {
  if (report.outcome === 'filed') {
    return `filed ${plural(report.tasks, 'task', 'tasks')} and ${plural(report.ideas, 'idea', 'ideas')}`
  }
  if (report.outcome === 'rejected') return `sort rejected (${report.reason ?? 'unknown'}), nothing filed`
  if (report.outcome === 'failed') {
    const landed = report.tasks + report.ideas
    return landed > 0
      ? `sort failed (${report.reason ?? 'unknown'}) after ${plural(report.tasks, 'task', 'tasks')} and ${plural(report.ideas, 'idea', 'ideas')} landed; check the files`
      : `sort failed (${report.reason ?? 'unknown'}), nothing filed`
  }
  return `sort skipped (${report.reason ?? 'unknown'})`
}

/** Multi-line template field that commits on blur; an emptied field
 *  snaps back rather than saving nothing. */
function EntryTemplateField(props: {
  value: string
  onCommit: (value: string) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(props.value)
  useEffect(() => setDraft(props.value), [props.value])
  const commit = (): void => {
    if (draft.trim().length > 0 && draft !== props.value) props.onCommit(draft)
    else setDraft(props.value)
  }
  return (
    <textarea
      className="field mono-field wide-field entry-field"
      rows={4}
      value={draft}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
    />
  )
}

export function NotesPanel(props: {
  settings: Settings
  catalog: ProviderCatalog | null
  hotkeys: HotkeysStatus | null
  onUpdate: (partial: Partial<Settings>) => Promise<void>
  onRefresh: () => Promise<unknown>
}): React.JSX.Element {
  const notes = props.settings.notes
  const [status, setStatus] = useState<NotesStatus | null>(null)
  const [sortKeyStatus, setSortKeyStatus] = useState<KeyStatus>({ present: false, masked: null })
  const [sorting, setSorting] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [captureNote, setCaptureNote] = useState<string | null>(null)
  const [folderDraft, setFolderDraft] = useState(notes.folder)
  // The path draft lives here so the preview follows every keystroke;
  // it commits on blur or Enter like every other text setting.
  const [pathDraft, setPathDraft] = useState(notes.pathTemplate)
  const [opened, setOpened] = useState<'file' | 'folder' | 'none' | null>(null)

  useEffect(() => setFolderDraft(notes.folder), [notes.folder])
  useEffect(() => setPathDraft(notes.pathTemplate), [notes.pathTemplate])
  useEffect(() => {
    void bridge().getKeyStatusFor(notes.connection.baseUrl).then(setSortKeyStatus)
  }, [notes.connection.baseUrl])

  const loadStatus = useCallback((): Promise<void> => {
    return bridge()
      .getNotesStatus()
      .then(setStatus)
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    void loadStatus()
    // A note landing is a history append, so the status line follows
    // it live; the slow poll catches a folder appearing or vanishing.
    const unsubscribe = bridge().onHistoryAppended(() => void loadStatus())
    const timer = setInterval(() => void loadStatus(), 5000)
    return () => {
      unsubscribe()
      clearInterval(timer)
    }
  }, [loadStatus])

  const update = async (partial: Partial<Settings['notes']>): Promise<void> => {
    // The store deep-merges, so only the changed field travels and a
    // value main changed since the last refresh is never overwritten.
    await props.onUpdate({ notes: partial as Settings['notes'] })
    await loadStatus()
  }

  const startCapture = async (): Promise<void> => {
    if (capturing) return
    setCapturing(true)
    setCaptureNote(null)
    try {
      const result = await bridge().captureHotkey('note')
      if (result.ok) {
        await props.onRefresh()
      } else if (result.reason === 'needs-key') {
        setCaptureNote('this chord needs a regular key too, like Ctrl+F11; modifiers alone fire by accident')
      } else if (result.reason === 'collides') {
        setCaptureNote('that combo contains your dictation hotkey or is already another chord; pick a different one')
      } else {
        setCaptureNote('not captured; click and try again, Esc cancels')
      }
    } finally {
      setCapturing(false)
    }
  }

  const chooseFolder = async (): Promise<void> => {
    setStatus(await bridge().chooseNotesFolder())
    await props.onRefresh()
  }

  const commitFolder = (): void => {
    const next = folderDraft.trim()
    if (next !== notes.folder) void update({ folder: next })
    else setFolderDraft(notes.folder)
  }

  const openToday = async (): Promise<void> => {
    setOpened(await bridge().openTodayNote())
    setTimeout(() => setOpened(null), 2500)
  }

  const commitPath = (): void => {
    const next = pathDraft.trim()
    if (next.length > 0 && next !== notes.pathTemplate) void update({ pathTemplate: next })
    else setPathDraft(notes.pathTemplate)
  }

  const sortAgain = async (): Promise<void> => {
    if (sorting) return
    setSorting(true)
    try {
      setStatus(await bridge().sortLastNote())
    } finally {
      setSorting(false)
    }
  }

  const preview = resolveNotePath(pathDraft, new Date())
  const tasksPreview = resolveNotePath(notes.tasksTemplate, new Date())
  const ideasPreview = resolveNotePath(notes.ideasTemplate, new Date())
  const filePreview = (p: typeof preview, what: string): string => {
    if (!p.ok) return `Falls back to the default because ${PROBLEM_TEXT[p.reason]}.`
    if (preview.ok && p.relative === preview.relative) {
      return `Where ${what} are copied. This is the inbox file itself, so filed lines will follow each note in it: ${p.relative}`
    }
    return `Where ${what} are copied. Today: ${p.relative}`
  }
  const entryLosesText = !notes.entryTemplate.includes('{text}')
  const customized =
    notes.pathTemplate !== DEFAULT_NOTE_PATH_TEMPLATE ||
    notes.entryTemplate !== DEFAULT_NOTE_ENTRY_TEMPLATE ||
    notes.tasksTemplate !== DEFAULT_TASKS_TEMPLATE ||
    notes.ideasTemplate !== DEFAULT_IDEAS_TEMPLATE
  const disarmed = notes.binding !== '' && props.hotkeys !== null && !props.hotkeys.noteBindingValid
  const folderMissing = status !== null && status.configured && !status.folderExists
  const lastSave = status?.lastSave ?? null

  return (
    <section className="panel">
      <p className="micro-label">notes</p>

      <Row
        label="Note chord"
        anchor="row-note-chord"
        desc={
          captureNote ??
          (disarmed
            ? 'This chord is currently disarmed: it clashes with your dictation hotkey or the paste chord, or no longer parses. Capture a new one.'
            : 'Hold it and speak: the words go to a file in your notes folder instead of your cursor, formatted like any dictation. Off until you set one. A modifier plus an F-key is safest.')
        }
      >
        <div className="inline">
          <button
            className={`field capture ${capturing ? 'capture-live' : ''}`}
            onClick={() => void startCapture()}
          >
            {capturing ? 'press keys…' : notes.binding === '' ? 'not set' : notes.binding}
          </button>
          {notes.binding !== '' && (
            <button
              className="btn quiet-btn"
              onClick={() => {
                setCaptureNote(null)
                void update({ binding: '' })
              }}
            >
              Clear
            </button>
          )}
        </div>
      </Row>

      <Row
        label="Notes folder"
        anchor="row-notes-folder"
        desc={
          folderMissing
            ? "That folder is not there right now. Notes go to murmur's own data folder until it is back, and nothing is lost."
            : 'Any folder: an Obsidian vault, a Logseq graph, a synced drive. Notes append as markdown files, and the app that reads them need not be running. Empty keeps note mode off.'
        }
      >
        <div className="inline">
          <button className="btn" onClick={() => void chooseFolder()}>
            Choose folder
          </button>
          <input
            className="field mono-field wide-field"
            value={folderDraft}
            placeholder="no folder set"
            spellCheck={false}
            onChange={(e) => setFolderDraft(e.target.value)}
            onBlur={commitFolder}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
          />
          {notes.folder !== '' && (
            <button className="btn quiet-btn" onClick={() => void update({ folder: '' })}>
              Clear
            </button>
          )}
        </div>
      </Row>

      {notes.folder !== '' && (
        <Row
          label="Last note"
          desc={
            lastSave
              ? `${timeOf(lastSave.at)}, ${
                  lastSave.location === 'folder'
                    ? 'saved to your notes folder'
                    : "saved to murmur's data folder because the notes folder was unreachable"
                }: ${lastSave.relative}${
                  notes.sort && status?.lastSort ? `. Then ${sortSummary(status.lastSort)}.` : ''
                }`
              : 'No note since launch. Hold the chord and speak.'
          }
        >
          <div className="inline">
            {opened && (
              <span className="dim mono-inline">
                {opened === 'file'
                  ? 'opened'
                  : opened === 'folder'
                    ? 'no note yet today, opened the folder'
                    : 'nothing to open yet'}
              </span>
            )}
            {notes.sort && status?.canSortAgain && (
              <button className="btn quiet-btn" onClick={() => void sortAgain()} disabled={sorting}>
                {sorting ? 'Sorting…' : 'Sort again'}
              </button>
            )}
            <button className="btn quiet-btn" onClick={() => void openToday()}>
              Open today&apos;s inbox
            </button>
          </div>
        </Row>
      )}

      <Row
        label="Sort into tasks and ideas"
        anchor="row-notes-sort"
        desc="After a note lands, a model labels each sentence a task, an idea, or a note, and murmur copies tasks to todo.md and ideas to ideas.md with links back. Nothing is reworded and the inbox stays as you said it. Off writes the inbox only, for people who feed raw notes to their own tools."
      >
        <select
          className="field"
          value={notes.sort ? 'on' : 'off'}
          onChange={(e) => void update({ sort: e.target.value === 'on' })}
        >
          <option value="off">Off</option>
          <option value="on">On</option>
        </select>
      </Row>

      {notes.sort && (
        <ConnectionRows
          value={notes.connection}
          catalog={props.catalog}
          keyStatus={sortKeyStatus}
          onKeyStatus={setSortKeyStatus}
          onChange={(connection) => update({ connection })}
          labels={{
            connection: 'Sort connection',
            connectionDesc:
              'Same runs the sort on your cleanup connection, which is your speech provider unless you set cleanup apart. Separate lets sorting run elsewhere with its own key.',
            sameOption: 'Same as cleanup',
            provider: 'Sort provider',
            baseUrl: 'Sort base URL',
            model: 'Sort model id',
            key: 'Sort key',
            keyDesc:
              'This connection has its own key, stored encrypted like the others. Until one is saved, sorting keeps riding your cleanup connection.',
            sharedDesc:
              'Shares a key with your speech or cleanup connection: one provider, one key. Manage it in the setup panel.'
          }}
          sharedWith={[
            props.settings.provider.baseUrl,
            props.settings.polish.enabled ? props.settings.polish.baseUrl : ''
          ]}
          anchor="row-sort-connection"
          api={{
            setKey: (key) => bridge().setKeyFor(notes.connection.baseUrl, key),
            clearKey: () => bridge().clearKeyFor(notes.connection.baseUrl),
            status: () => bridge().getKeyStatusFor(notes.connection.baseUrl),
            test: () => bridge().testConnectionFor(notes.connection.baseUrl)
          }}
        />
      )}

      <details className="fold">
        <summary className="fold-summary micro-label">
          file layout{customized ? ' (customized)' : ''}
        </summary>

        <Row
          label="File path"
          desc={`Relative to your notes folder. Tokens: {date} {time} {datetime} {year} {month} {day}. ${
            preview.ok
              ? `Today: ${preview.relative}`
              : `Falls back to the default because ${PROBLEM_TEXT[preview.reason]}.`
          }`}
        >
          <input
            className="field mono-field wide-field"
            value={pathDraft}
            spellCheck={false}
            onChange={(e) => setPathDraft(e.target.value)}
            onBlur={commitPath}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
          />
        </Row>

        <Row
          label="Entry"
          desc={
            entryLosesText
              ? 'This template has no {text}, so it would drop your words. murmur writes the default entry instead until {text} is back.'
              : 'How each note is written into the file. {text} is what you said; the time tokens work here too. End with a blank line to space entries apart, or a single line break to keep them tight.'
          }
        >
          <EntryTemplateField
            value={notes.entryTemplate}
            onCommit={(value) => void update({ entryTemplate: value })}
          />
        </Row>

        {notes.sort && (
          <>
            <Row label="Tasks file" desc={filePreview(tasksPreview, 'tasks')}>
              <TextSetting
                value={notes.tasksTemplate}
                wide
                onCommit={(value) => void update({ tasksTemplate: value })}
              />
            </Row>
            <Row label="Ideas file" desc={filePreview(ideasPreview, 'ideas')}>
              <TextSetting
                value={notes.ideasTemplate}
                wide
                onCommit={(value) => void update({ ideasTemplate: value })}
              />
            </Row>
          </>
        )}

        {customized && (
          <Row label="Defaults" desc="Back to the murmur inbox layout: a time heading per note, todo.md and ideas.md beside it.">
            <button
              className="btn quiet-btn"
              onClick={() =>
                void update({
                  pathTemplate: DEFAULT_NOTE_PATH_TEMPLATE,
                  entryTemplate: DEFAULT_NOTE_ENTRY_TEMPLATE,
                  tasksTemplate: DEFAULT_TASKS_TEMPLATE,
                  ideasTemplate: DEFAULT_IDEAS_TEMPLATE
                })
              }
            >
              Reset to default
            </button>
          </Row>
        )}
      </details>
    </section>
  )
}
