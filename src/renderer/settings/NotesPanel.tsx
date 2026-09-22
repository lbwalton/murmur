// SPDX-License-Identifier: GPL-3.0-only
// The notes section of settings (US-050): the note chord, the folder,
// where the last note landed, and the file layout templates with a
// live preview. Template math is the shared pure module, so what the
// preview says is exactly what the writer does.
import { useCallback, useEffect, useRef, useState } from 'react'
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
import { DEFAULT_FILED_HEADING_TEMPLATE, renderFiledHeading } from '../../shared/sorter'
import type { Settings } from '../../shared/settings'
import { ConnectionRows } from './ConnectionRows'
import { Row, TextSetting, TimeInput } from './controls'

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

/** Why a line was held, in the panel's own words, with the item it was
 *  tied to quoted from the file. */
function heldPhrase(line: NotesStatus['heldLines'][number]): string {
  const item = line.match?.text ?? ''
  if (line.reason === 'same') return `looks like a duplicate of: ${item}`
  if (line.reason === 'completes') return `sounds like you finished: ${item}`
  if (line.reason === 'done-before') return `you finished this before: ${item}`
  return 'the model was not sure what this is'
}

/** One phrase for the sort outcome on the Last note line. */
function sortSummary(report: NonNullable<NotesStatus['lastSort']>): string {
  const held = report.held > 0 ? `, ${plural(report.held, 'line', 'lines')} held in the inbox` : ''
  if (report.outcome === 'filed') {
    return `filed ${plural(report.tasks, 'task', 'tasks')} and ${plural(report.ideas, 'idea', 'ideas')}${held}`
  }
  if (report.outcome === 'rejected' && report.reason === 'low confidence') {
    return `held every line in the inbox as unsure (${plural(report.held, 'line', 'lines')}), nothing filed`
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
  const [acting, setActing] = useState<number | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [captureNote, setCaptureNote] = useState<string | null>(null)
  const [folderDraft, setFolderDraft] = useState(notes.folder)
  // The path draft lives here so the preview follows every keystroke;
  // it commits on blur or Enter like every other text setting.
  const [pathDraft, setPathDraft] = useState(notes.pathTemplate)
  const [opened, setOpened] = useState<'file' | 'folder' | 'none' | null>(null)
  const [reminderTest, setReminderTest] = useState<string | null>(null)
  const reminderTestTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (reminderTestTimer.current) clearTimeout(reminderTestTimer.current)
  }, [])

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

  const heldAction = async (
    id: number,
    action: 'file' | 'skip' | 'tick'
  ): Promise<void> => {
    if (acting !== null) return
    setActing(id)
    try {
      const next =
        action === 'file'
          ? await bridge().fileHeldLine(id)
          : action === 'skip'
            ? await bridge().skipHeldLine(id)
            : await bridge().tickHeldMatch(id)
      setStatus(next)
    } finally {
      setActing(null)
    }
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

  const reminders = notes.reminders
  const setReminderTime = (index: number, time: string): void => {
    const times = [...reminders.times]
    times[index] = time
    void update({ reminders: { ...reminders, times } })
  }
  const testReminder = async (): Promise<void> => {
    const result = await bridge().testNotesReminder()
    setReminderTest(
      result.outcome === 'shown'
        ? result.body
        : result.outcome === 'empty'
          ? 'nothing open right now, so a reminder would stay quiet'
          : result.outcome === 'suppressed'
            ? 'this system is not showing notifications; check its notification settings for murmur'
            : 'no tasks file yet, so there is nothing to read'
    )
    if (reminderTestTimer.current) clearTimeout(reminderTestTimer.current)
    reminderTestTimer.current = setTimeout(() => setReminderTest(null), 6000)
  }

  const preview = resolveNotePath(pathDraft, new Date())
  // The preview shows the real shape, with a stand-in where the model's
  // name for a note would go.
  const headingPreview = renderFiledHeading(
    notes.filedHeadingTemplate,
    new Date(),
    notes.topicHeadings ? 'travel plans' : ''
  )
  const headingCarriesTopic = notes.filedHeadingTemplate.includes('{topic}')
  const tasksPreview = resolveNotePath(notes.tasksTemplate, new Date())
  const ideasPreview = resolveNotePath(notes.ideasTemplate, new Date())
  const filePreview = (p: typeof preview, what: string): string => {
    if (!p.ok) return `Falls back to the default because ${PROBLEM_TEXT[p.reason]}.`
    if (preview.ok && p.relative === preview.relative) {
      return `Where ${what} are copied. This is the inbox file itself, so filed lines will follow each note in it: ${p.relative}`
    }
    return `Where ${what} are copied, relative to your notes folder. Give it a folder of its own (${
      what === 'tasks' ? 'murmur/tasks/{date}.md' : 'murmur/ideas/{date}.md'
    }) and murmur creates it. Today: ${p.relative}`
  }
  const entryLosesText = !notes.entryTemplate.includes('{text}')
  const customized =
    notes.pathTemplate !== DEFAULT_NOTE_PATH_TEMPLATE ||
    notes.entryTemplate !== DEFAULT_NOTE_ENTRY_TEMPLATE ||
    notes.tasksTemplate !== DEFAULT_TASKS_TEMPLATE ||
    notes.ideasTemplate !== DEFAULT_IDEAS_TEMPLATE ||
    notes.filedHeadingTemplate !== DEFAULT_FILED_HEADING_TEMPLATE
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

      {notes.sort && status && status.heldLines.length > 0 && (
        <div className="held-list">
          {status.lastAction && !status.lastAction.ok && (
            <p className="row-desc held-note">{status.lastAction.reason ?? 'that did not work'}</p>
          )}
          {status.heldLines.map((line) => (
            <Row
              key={line.id}
              label={`Held: ${line.text}`}
              desc={`${heldPhrase(line)}. It stays in the inbox as you said it.${
                line.label === 'note'
                  ? ''
                  : ` File it anyway lands it as ${
                      line.pieces && line.pieces.length > 1 ? `${line.pieces.length} ${line.label}s, one per item` : `a ${line.label}`
                    };`
              } Skip leaves it there.${
                line.reason === 'completes' && line.match?.file === 'tasks' && line.match.checkbox && !line.match.done
                  ? ' Tick it marks that item done in your tasks file, one box and nothing else.'
                  : ''
              }`}
            >
              <div className="inline">
                {line.reason === 'completes' && line.match?.file === 'tasks' && line.match.checkbox && !line.match.done && (
                  <button
                    className="btn"
                    onClick={() => void heldAction(line.id, 'tick')}
                    disabled={acting !== null}
                  >
                    Tick it
                  </button>
                )}
                {line.label !== 'note' && (
                  <button
                    className="btn quiet-btn"
                    onClick={() => void heldAction(line.id, 'file')}
                    disabled={acting !== null}
                  >
                    File it anyway
                  </button>
                )}
                <button
                  className="btn quiet-btn"
                  onClick={() => void heldAction(line.id, 'skip')}
                  disabled={acting !== null}
                >
                  Skip
                </button>
              </div>
            </Row>
          ))}
        </div>
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
          onChange={(connection) => update({ connection: { ...notes.connection, ...connection } })}
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
          protocol={{
            value: notes.connection.protocol,
            onChange: (protocol) => update({ connection: { ...notes.connection, protocol } }),
            label: 'Sort protocol',
            desc:
              notes.connection.protocol === 'decide'
                ? 'A decision model answers typed questions with probabilities and cannot write text: labels it cannot invent, about a tenth of a second, a fraction of a cent per note. It cannot name notes, so Name each note renders the date alone on this connection.'
                : 'A chat model returns JSON that murmur checks strictly. A decision model (TypeSafe) answers typed questions instead and can only ever return one of the three labels.'
          }}
          api={{
            setKey: (key) => bridge().setKeyFor(notes.connection.baseUrl, key),
            clearKey: () => bridge().clearKeyFor(notes.connection.baseUrl),
            status: () => bridge().getKeyStatusFor(notes.connection.baseUrl),
            test: () =>
              notes.connection.protocol === 'decide'
                ? bridge().testDecisionFor(notes.connection.baseUrl)
                : bridge().testConnectionFor(notes.connection.baseUrl)
          }}
        />
      )}

      {(notes.folder !== '' || reminders.enabled) && (
        <Row
          label="Task reminders"
          anchor="row-notes-reminders"
          desc={
            reminderTest ??
            'Desktop notifications that read your tasks file as it stands and say what is still open. Clicking one opens the list. Off by default, a file with nothing open stays quiet, and clearing a time switches that one off.'
          }
        >
          <div className="inline">
            <select
              className="field"
              value={reminders.enabled ? 'on' : 'off'}
              onChange={(e) =>
                void update({ reminders: { ...reminders, enabled: e.target.value === 'on' } })
              }
            >
              <option value="off">Off</option>
              <option value="on">On</option>
            </select>
            {reminders.times.map((time, index) => (
              <TimeInput
                key={index}
                value={time}
                disabled={!reminders.enabled}
                allowEmpty
                onCommit={(next) => setReminderTime(index, next)}
              />
            ))}
            <button className="btn" onClick={() => void testReminder()}>
              Test
            </button>
          </div>
        </Row>
      )}

      {notes.sort && notes.connection.enabled && notes.connection.protocol === 'decide' && (
        <Row
          label="Confidence threshold"
          anchor="row-sort-threshold"
          desc="A decision model says how sure it is of each label. A line below this stays in the inbox as unsure instead of filing, and Sort again sends just those lines back. Balanced keeps a line the model is at least half sure of; a chat model reports no confidence, so this never applies there."
        >
          <select
            className="field"
            value={String(notes.connection.threshold)}
            onChange={(e) =>
              void update({ connection: { ...notes.connection, threshold: Number(e.target.value) } })
            }
          >
            <option value="0">File everything (0)</option>
            <option value="0.3">Lenient (0.3)</option>
            <option value="0.5">Balanced (0.5), the default</option>
            <option value="0.7">Strict (0.7)</option>
            <option value="0.9">Very strict (0.9)</option>
          </select>
        </Row>
      )}

      <details className="fold">
        <summary className="fold-summary micro-label">
          file layout{customized ? ' (customized)' : ''}
        </summary>

        <Row
          label="Inbox file"
          anchor="row-inbox-file"
          desc={`Where notes land, relative to your notes folder. Tokens: {date} {time} {datetime} {year} {month} {day}, and any folders in the path are created for you. ${
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
            <Row
              label="Group under"
              desc={
                headingPreview === ''
                  ? 'No heading: filed lines make one flat list. Type a heading to group them again.'
                  : `Tasks and ideas from a note gather under this heading, written once per file. Tokens: {date} {time} {topic}. Today: ${headingPreview}`
              }
            >
              <TextSetting
                value={notes.filedHeadingTemplate}
                wide
                allowEmpty
                placeholder="no heading"
                onCommit={(value) => void update({ filedHeadingTemplate: value })}
              />
            </Row>
            <Row
              label="Name each note"
              desc={
                !headingCarriesTopic
                  ? 'Put {topic} in the heading above to use this, and the sort model will name each note there.'
                  : notes.connection.enabled && notes.connection.protocol === 'decide'
                    ? 'Your sort connection is a decision model, which cannot write text, so the heading carries the date alone while it is in use. Switch the sort protocol to a chat model to name notes.'
                    : notes.topicHeadings
                    ? "The sort model names what each note is about in at most five words, so a heading says travel plans rather than a date alone. The name goes in the heading only; your words are never changed. A name it cannot give safely leaves the rest of the heading standing."
                    : 'Off means headings carry the date alone. On asks the sort model for a short name for each note, so you can see what a group is about at a glance.'
              }
            >
              <select
                className="field"
                value={notes.topicHeadings ? 'on' : 'off'}
                disabled={!headingCarriesTopic}
                onChange={(e) => void update({ topicHeadings: e.target.value === 'on' })}
              >
                <option value="off">Off</option>
                <option value="on">On</option>
              </select>
            </Row>
          </>
        )}

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

        {customized && (
          <Row label="Defaults" desc="Back to the murmur inbox layout: a time heading per note, todo.md and ideas.md beside it.">
            <button
              className="btn quiet-btn"
              onClick={() =>
                void update({
                  pathTemplate: DEFAULT_NOTE_PATH_TEMPLATE,
                  entryTemplate: DEFAULT_NOTE_ENTRY_TEMPLATE,
                  tasksTemplate: DEFAULT_TASKS_TEMPLATE,
                  ideasTemplate: DEFAULT_IDEAS_TEMPLATE,
                  filedHeadingTemplate: DEFAULT_FILED_HEADING_TEMPLATE
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
