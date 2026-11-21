// SPDX-License-Identifier: GPL-3.0-only
// Report a problem (US-182). Everything that would go is on screen and
// editable first: what happened, what was expected, a screenshot of
// murmur's own window, and the details and log murmur adds. It goes only
// through the person's own browser (a GitHub issue) or mail app, by
// their click there. murmur sends nothing.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { SettingsApi } from '../../preload/settings'
import type { IssueOutcome } from '../../main/problem'
import { type ProblemFields, type ProblemView, issueLimitFor, planIssue, planMail, problemText, viewLine } from '../../shared/problem'
import { REPORT_ADDRESS } from '../../shared/report'
import type { Settings } from '../../shared/settings'
import { pageScroller } from './scroller'

const bridge = (): SettingsApi => window.murmur

/** How the panel was opened, and the picture taken before it covered
 *  the page. */
export interface ProblemOpen {
  /** New for every opening, so each starts fresh. */
  id: number
  view: ProblemView
  shot: Uint8Array | null
  /** Why there is no picture: the window was closed or minimized when
   *  the tray item was clicked, or the capture came back empty. */
  noShot: 'closed' | 'minimized' | 'failed' | null
  /** Whether Hide words was on when the picture was taken. */
  hiddenAtShot: boolean
}

/** The settings section in view, by the rail's own rule: the last one
 *  whose heading has passed the band under the top bar. */
export function sectionInView(): string | null {
  const secs = Array.from(document.querySelectorAll<HTMLElement>('.settings-content .sec[data-sec]'))
  if (secs.length === 0 || secs[0].getClientRects().length === 0) return null
  const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--masthead-h')) || 56
  let current = secs[0].dataset.sec ?? null
  for (const s of secs) if (s.getBoundingClientRect().top <= header + 84) current = s.dataset.sec ?? current
  const box = pageScroller()
  if (box && box.clientHeight + box.scrollTop >= box.scrollHeight - 4) current = secs[secs.length - 1].dataset.sec ?? current
  return current
}

interface Shot {
  /** Flattened over ink: what is copied, saved, and pasted. */
  png: Uint8Array
  bitmap: ImageBitmap
  hiddenWords: boolean
}

/** The picture over solid ink. Under glass the window's page is partly
 *  see-through, and a see-through screenshot would show cream text on
 *  GitHub's white page; this also keeps the desktop out of it. Drawn
 *  from bytes, so the page's policy needs no image addresses. */
async function flatten(raw: Uint8Array, hiddenWords: boolean): Promise<Shot | null> {
  try {
    const source = await createImageBitmap(new Blob([new Uint8Array(raw)], { type: 'image/png' }))
    const canvas = document.createElement('canvas')
    canvas.width = source.width
    canvas.height = source.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || 'black'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(source, 0, 0)
    source.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) return null
    const png = new Uint8Array(await blob.arrayBuffer())
    return { png, bitmap: await createImageBitmap(canvas), hiddenWords }
  } catch {
    return null
  }
}

const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()))

type Sent =
  | { via: 'github'; result: IssueOutcome }
  | { via: 'mail'; mode: 'link' | 'paste' | 'failed'; dropped: number; shotCopied: boolean }

export function ProblemReport(props: {
  open: ProblemOpen
  settings: Settings
  /** Where the person is looking now, for a retaken picture. */
  view: () => ProblemView
  onClose: () => void
}): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [returnTo] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null))
  const [what, setWhat] = useState('')
  const [expected, setExpected] = useState('')
  const [details, setDetails] = useState('')
  const [log, setLog] = useState('')
  const [withheld, setWithheld] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [shot, setShot] = useState<Shot | null>(null)
  const [shotNote, setShotNote] = useState<string | null>(null)
  // form: the panel; aiming: the panel is out of the way while the
  // person goes to what they want to show; taking: the picture is being
  // taken, with nothing of the report on screen.
  const [stage, setStage] = useState<'form' | 'aiming' | 'taking'>('form')
  const [sent, setSent] = useState<Sent | null>(null)
  const [busy, setBusy] = useState(false)
  const [copiedShot, setCopiedShot] = useState(false)
  // A plain line when something did not work; the words stay.
  const [trouble, setTrouble] = useState<string | null>(null)
  const [saveNote, setSaveNote] = useState<string | null>(null)
  const isMac = navigator.platform.toLowerCase().includes('mac')
  // The same limit main uses: Windows links stay short (issueLimitFor).
  const limit = issueLimitFor(navigator.platform.toLowerCase().startsWith('win') ? 'win32' : 'darwin')
  const paste = isMac ? 'Cmd+V' : 'Ctrl+V'
  const hideWords = props.settings.history.hideWords

  // The details and log, read fresh, and the first picture flattened.
  useEffect(() => {
    let live = true
    void bridge()
      .getProblemDraft(props.open.view)
      .then((draft) => {
        if (!live) return
        setDetails(draft.details)
        setLog(draft.log.join('\n'))
        setWithheld(draft.withheld)
        setLoaded(true)
      })
    if (props.open.shot) {
      void flatten(props.open.shot, props.open.hiddenAtShot).then((flat) => {
        if (!live) return
        setShot(flat)
        if (!flat) setShotNote('murmur could not take a screenshot of its window. Press Retake to try again.')
      })
    } else {
      setShotNote(
        props.open.noShot === 'closed' || props.open.noShot === 'minimized'
          ? `No screenshot: murmur's window was ${props.open.noShot}. To add one, go to the page with the problem and press Retake.`
          : 'murmur could not take a screenshot of its window. Press Retake to try again.'
      )
    }
    return () => {
      live = false
    }
  }, [props.open])

  // The panel is a modal while it is the form, and out of the way while
  // the person picks what to show.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (stage === 'form' && !dialog.open) dialog.showModal()
    if (stage !== 'form' && dialog.open) dialog.close()
  }, [stage])

  // A picture taken with your words showing goes the moment Hide words
  // comes on (US-145): the screen hides them, and so does the report.
  useEffect(() => {
    if (hideWords && shot && !shot.hiddenWords) {
      setShot(null)
      setShotNote('Hide words came on, so the screenshot is gone. Press Retake for one with your words hidden.')
    }
  }, [hideWords, shot])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !shot) return
    const width = Math.min(shot.bitmap.width, 1200)
    canvas.width = width
    canvas.height = Math.round((shot.bitmap.height * width) / shot.bitmap.width)
    canvas.getContext('2d')?.drawImage(shot.bitmap, 0, 0, canvas.width, canvas.height)
  }, [shot, stage])

  const closed = useRef(false)
  const typedRef = useRef(false)
  typedRef.current = what.trim() !== '' || expected.trim() !== ''
  const stageRef = useRef(stage)
  stageRef.current = stage
  const close = (): void => {
    if (closed.current) return
    closed.current = true
    dialogRef.current?.close()
    returnTo?.focus({ preventScroll: true })
    props.onClose()
  }

  const take = async (): Promise<void> => {
    setStage('taking')
    // 2 frames, then a beat for the window to draw itself without the
    // report on it.
    await nextFrame()
    await nextFrame()
    await new Promise((resolve) => setTimeout(resolve, 120))
    const view = props.view()
    const raw = await bridge().captureProblemShot()
    const flat = raw ? await flatten(raw, hideWords) : null
    setShot(flat)
    setCopiedShot(false)
    setShotNote(flat ? null : 'murmur could not take a screenshot of its window. Press Retake to try again.')
    // The details say where the new picture was taken, if that line is
    // still there.
    setDetails((text) => text.replace(/^Showing: .*$/m, viewLine(view)))
    setStage('form')
  }

  const fields: ProblemFields = { what, expected, details, log }
  const ready = loaded && what.trim() !== ''
  // Worked out once per change of the words, not on every paint.
  const plans = useMemo(() => {
    if (!ready) return { issue: null, mail: null }
    try {
      const f = { what, expected, details, log }
      return { issue: planIssue(f, limit), mail: planMail(f) }
    } catch {
      return { issue: null, mail: null }
    }
  }, [ready, what, expected, details, log, limit])
  const issuePlan = plans.issue
  const mailPlan = plans.mail
  // Said before anything goes: what will not fit a link, and what happens instead.
  const fitNote = [
    issuePlan?.mode === 'paste'
      ? 'This is too long for a GitHub link, so murmur will copy the whole report for you to paste in.'
      : issuePlan && issuePlan.dropped > 0
        ? `To fit the GitHub link, the ${issuePlan.dropped} oldest log ${issuePlan.dropped === 1 ? 'line is' : 'lines are'} left out.`
        : '',
    mailPlan?.mode === 'paste' ? 'An email copies the whole report for you to paste into a blank message.' : ''
  ]
    .filter((line) => line !== '')
    .join(' ')

  const openGitHub = async (): Promise<void> => {
    setBusy(true)
    setTrouble(null)
    try {
      const result = await bridge().openProblemIssue(fields, shot?.png ?? null)
      setSent({ via: 'github', result })
      setCopiedShot(result.outcome === 'opened' && result.copied === 'shot')
    } catch {
      setTrouble('murmur could not open GitHub just now. Your report is still here: try again, or press Email it instead.')
    } finally {
      setBusy(false)
    }
  }

  const openMail = async (): Promise<void> => {
    setBusy(true)
    setTrouble(null)
    try {
      const plan = planMail(fields)
      if (plan.mode === 'link') {
        const shotCopied = shot ? await bridge().copyProblemShot(shot.png) : false
        if (await bridge().openReportMail(plan.message, 'problem')) {
          setSent({ via: 'mail', mode: 'link', dropped: plan.dropped, shotCopied })
          setCopiedShot(shotCopied)
          return
        }
      } else {
        await bridge().copyText(plan.report)
        if (await bridge().openReportMail(null, 'problem')) {
          setSent({ via: 'mail', mode: 'paste', dropped: 0, shotCopied: false })
          setCopiedShot(false)
          return
        }
      }
      // No mail app opened: the whole report is copied instead.
      await bridge().copyText(problemText(fields))
      setSent({ via: 'mail', mode: 'failed', dropped: 0, shotCopied: false })
      setCopiedShot(false)
    } catch {
      await bridge()
        .copyText(problemText(fields))
        .catch(() => undefined)
      setSent({ via: 'mail', mode: 'failed', dropped: 0, shotCopied: false })
    } finally {
      setBusy(false)
    }
  }

  const copyShot = async (): Promise<void> => {
    if (shot) setCopiedShot(await bridge().copyProblemShot(shot.png))
  }

  const lineCount = log.split('\n').filter((line) => line.trim() !== '').length

  return (
    <>
      <dialog
        ref={dialogRef}
        className="share-dialog problem-dialog"
        aria-labelledby="problem-title"
        data-problem="panel"
        onCancel={(e) => {
          e.preventDefault()
          // Escape never throws away words you typed: Cancel does.
          if (what.trim() === '' && expected.trim() === '') close()
        }}
        onClose={() => {
          // The browser can close a modal on a 2nd Escape even though the
          // 1st was refused. Closed while it is the form, the panel comes
          // back if you typed anything, so no words are lost, and is a
          // Cancel if not, so it never lingers unseen. Retake closes it
          // too, out of the form stage.
          if (stageRef.current !== 'form' || closed.current) return
          if (typedRef.current) dialogRef.current?.showModal()
          else close()
        }}
      >
        <div className="share-head">
          <h2 id="problem-title">Report a problem</h2>
          <p className="dim">
            This fills in a GitHub issue in your browser, or an email, for you. You see every word first and can change
            any of it. murmur sends nothing itself: nothing goes until you press Submit or Send there.
          </p>
        </div>

        <label className="report-field">
          <span className="micro-label">what happened?</span>
          <textarea
            className="field entry-field"
            rows={4}
            value={what}
            required
            aria-required="true"
            data-problem="what"
            onChange={(e) => setWhat(e.target.value)}
          />
        </label>
        <label className="report-field">
          <span className="micro-label">what did you expect? (optional)</span>
          <textarea
            className="field entry-field"
            rows={2}
            value={expected}
            data-problem="expected"
            onChange={(e) => setExpected(e.target.value)}
          />
        </label>

        <div className="report-field">
          <span className="micro-label">screenshot of murmur&apos;s window</span>
          {shot ? (
            <>
              <canvas
                ref={canvasRef}
                className="problem-shot"
                role="img"
                aria-label="Screenshot of murmur's window, as it will be copied"
                data-problem="shot"
              />
              <p className="row-note problem-note">
                {shot.hiddenWords
                  ? 'This picture shows what was on screen, such as masked keys and server addresses on Provider and keys. Remove or Retake it if it shows anything private.'
                  : 'This picture shows what was on screen: your dictated words, and masked keys and server addresses on Provider and keys. Turn on Hide words and press Retake to leave out words, or Remove it.'}
              </p>
            </>
          ) : (
            <p className="row-note problem-note" data-problem="no-shot">
              {shotNote ?? 'No screenshot.'}
            </p>
          )}
          <p className="problem-actions">
            {shot && (
              <button
                className="btn quiet-btn"
                onClick={() => {
                  setShot(null)
                  setCopiedShot(false)
                  setShotNote('Screenshot removed. Press Retake to add one.')
                }}
              >
                Remove
              </button>
            )}
            <button className="btn quiet-btn" onClick={() => setStage('aiming')}>
              Retake
            </button>
            {shot && (
              <button
                className="btn quiet-btn"
                onClick={() => {
                  setSaveNote(null)
                  void bridge()
                    .saveProblemShot(shot.png)
                    .then((outcome) =>
                      setSaveNote(outcome === 'saved' ? 'Screenshot saved.' : outcome === 'failed' ? 'murmur could not save the screenshot there. Try another folder.' : null)
                    )
                    .catch(() => setSaveNote('murmur could not save the screenshot there. Try another folder.'))
                }}
              >
                Save screenshot…
              </button>
            )}
            {saveNote && (
              <span className="mono-inline dim" aria-live="polite">
                {saveNote}
              </span>
            )}
          </p>
        </div>

        <label className="report-field">
          <span className="micro-label">details murmur adds</span>
          <textarea
            className="field entry-field mono-field problem-block"
            rows={14}
            value={details}
            spellCheck={false}
            data-problem="details"
            onChange={(e) => setDetails(e.target.value)}
          />
        </label>
        <label className="report-field">
          <span className="micro-label">recent log ({lineCount} {lineCount === 1 ? 'line' : 'lines'})</span>
          <textarea
            className="field entry-field mono-field problem-block"
            rows={10}
            value={log}
            spellCheck={false}
            data-problem="log"
            onChange={(e) => setLog(e.target.value)}
          />
        </label>
        <p className="row-note problem-note">
          The details and log never hold your keys, base URLs, dictionary, expansions, mic names, or dictations: your
          home folder shows as ~, a web address keeps only a known provider&apos;s host (any other reads custom
          endpoint), and a mic reads [mic].
          {withheld > 0 && ` ${withheld} log ${withheld === 1 ? 'line' : 'lines'} that could hold a name or a path ${withheld === 1 ? 'was' : 'were'} left out.`}{' '}
          The screenshot shows whatever was on screen.
        </p>

        <p className="row-note problem-note problem-public">
          GitHub issues are public, so check that the screenshot and details show nothing private. Email goes to{' '}
          {REPORT_ADDRESS} instead, and is kept 90 days. We read every report.
        </p>

        {sent && <SentNote sent={sent} paste={paste} hasShot={shot !== null} copiedShot={copiedShot} onCopyShot={copyShot} />}

        {!sent && fitNote !== '' && (
          <p className="row-note problem-note" aria-live="polite">
            {fitNote}
          </p>
        )}

        {trouble && (
          <p className="row-note problem-note" role="alert" data-problem="trouble">
            {trouble}
          </p>
        )}

        {!sent && (
          <p className="row-note problem-note">
            Open on GitHub and Email it instead put the screenshot (or the report) on your clipboard, in place of what is
            there.
          </p>
        )}

        <div className="share-actions">
          <span className="dim">{ready ? '' : loaded ? 'Say what happened to send it.' : 'Reading the details…'}</span>
          <button className="btn" disabled={!ready || busy} onClick={() => void openGitHub()} data-problem="github">
            Open on GitHub
          </button>
          <button className="btn" disabled={!ready || busy} onClick={() => void openMail()} data-problem="mail">
            Email it instead
          </button>
          <button className="btn quiet-btn" onClick={close} data-problem="cancel">
            {sent ? 'Done' : 'Cancel'}
          </button>
        </div>
      </dialog>

      {stage === 'aiming' && (
        <div className="panel problem-aim" role="dialog" aria-label="Retake the screenshot" data-problem="aim">
          <p>Go to what you want to show, then press Take screenshot. Your report is kept.</p>
          <span className="problem-actions">
            <button className="btn" autoFocus onClick={() => void take()}>
              Take screenshot
            </button>
            <button className="btn quiet-btn" onClick={() => setStage('form')}>
              Back to the report
            </button>
          </span>
        </div>
      )}
    </>
  )
}

/** What just happened and what to do next, in the person's browser or
 *  mail app. Says what is on the clipboard at each step. */
function SentNote(props: {
  sent: Sent
  paste: string
  hasShot: boolean
  copiedShot: boolean
  onCopyShot: () => Promise<void>
}): React.JSX.Element {
  const { sent, paste } = props
  const lines: string[] = []
  let offerShot = props.hasShot
  if (sent.via === 'github') {
    const r = sent.result
    if (r.outcome === 'refused') {
      lines.push('murmur could not open that link. Nothing was sent.')
      offerShot = false
    } else if (r.outcome === 'failed') {
      lines.push(
        `Your browser did not open, so murmur copied the whole report. Paste it with ${paste} into a new issue at github.com/lbwalton/murmur/issues, or into an email to ${REPORT_ADDRESS}.`
      )
    } else if (r.mode === 'paste') {
      lines.push(
        `The report was too long for a link, so murmur copied all of it. On GitHub, select the line in What happened and press ${paste} to paste over it.`
      )
      if (props.hasShot) lines.push('Then press Copy screenshot here, click in the Screenshot box on GitHub, and paste it too.')
      lines.push('Then press Submit new issue.')
    } else {
      if (r.dropped > 0) lines.push(`The ${r.dropped} oldest log ${r.dropped === 1 ? 'line was' : 'lines were'} left out to fit the link.`)
      lines.push(
        r.copied === 'shot'
          ? `Your browser has the form open, and the screenshot is copied: click in the Screenshot box and press ${paste}, then press Submit new issue.`
          : 'Your browser has the form open. Check it, then press Submit new issue.'
      )
      offerShot = props.hasShot && r.copied !== 'shot'
    }
  } else if (sent.mode === 'failed') {
    lines.push(
      `No mail app opened, so murmur copied the whole report. Paste it with ${paste} into an email to ${REPORT_ADDRESS}, or press Open on GitHub instead.`
    )
    if (props.hasShot) lines.push('Then press Copy screenshot and paste it too, or attach it with Save screenshot.')
  } else if (sent.mode === 'link') {
    if (sent.dropped > 0) lines.push(`The ${sent.dropped} oldest log ${sent.dropped === 1 ? 'line was' : 'lines were'} left out to fit a mail link.`)
    lines.push(
      sent.shotCopied
        ? `Your mail app has the message open, and the screenshot is copied: click in the message and press ${paste}, or attach it with Save screenshot. Then press Send.`
        : 'Your mail app has the message open. Check it, then press Send.'
    )
    offerShot = props.hasShot && !sent.shotCopied
  } else {
    lines.push(
      `The report was too long for a mail link, so murmur copied it and opened a blank message to ${REPORT_ADDRESS}. Click in the message and press ${paste}.`
    )
    if (props.hasShot) lines.push('Then press Copy screenshot and paste it too, or attach it with Save screenshot. Then press Send.')
  }
  return (
    <div className="problem-sent" aria-live="polite" data-problem="sent">
      {lines.map((line) => (
        <p key={line} className="row-note problem-note">
          {line}
        </p>
      ))}
      {offerShot && (
        <p className="problem-actions">
          <button className="btn" onClick={() => void props.onCopyShot()}>
            {props.copiedShot ? 'Screenshot copied' : 'Copy screenshot'}
          </button>
        </p>
      )}
    </div>
  )
}
