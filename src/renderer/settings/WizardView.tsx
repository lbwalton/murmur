// SPDX-License-Identifier: GPL-3.0-only
// First-run wizard: the guided path from fresh install to first
// dictation. Steps and gates come from the pure machine in
// shared/wizard; this file only renders and gathers facts.
import { useEffect, useRef, useState } from 'react'
import type { KeyStatus, SettingsApi } from '../../preload/settings'
import type { Settings } from '../../shared/settings'
import {
  type WizardFacts,
  type WizardStep,
  canAdvance,
  nextStep,
  previousStep,
  stepsFor
} from '../../shared/wizard'

const bridge = (): SettingsApi => window.murmur

export function WizardView(props: {
  settings: Settings
  onSettings: (settings: Settings) => void
  onFinish: () => void
}): React.JSX.Element {
  const [step, setStep] = useState<WizardStep>('welcome')
  const [keyStatus, setKeyStatus] = useState<KeyStatus>({ present: false, masked: null })
  const [connected, setConnected] = useState(false)
  const [testing, setTesting] = useState(false)
  const [keyDraft, setKeyDraft] = useState('')
  const [perms, setPerms] = useState({ microphone: '', accessibility: false, inputMonitoring: false })
  const [bindingValid, setBindingValid] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const autoTested = useRef(false)
  const isMac = navigator.platform.toLowerCase().includes('mac')

  const refreshFacts = async (): Promise<void> => {
    const b = bridge()
    const [k, p, h] = await Promise.all([b.getApiKeyStatus(), b.getPermissions(), b.getHotkeysStatus()])
    setKeyStatus(k)
    setPerms(p)
    setBindingValid(h.bindingValid)
    // A key saved in an earlier run must count as connected without
    // retyping it: verify it once automatically, like the main page does.
    if (k.present && !autoTested.current) {
      autoTested.current = true
      setTesting(true)
      try {
        setConnected((await b.testProvider()).ok)
      } finally {
        setTesting(false)
      }
    }
  }

  useEffect(() => {
    void refreshFacts()
    const timer = setInterval(() => void refreshFacts(), 2500)
    return () => clearInterval(timer)
  }, [])

  const facts: WizardFacts = {
    keyPresent: keyStatus.present,
    connected,
    micGranted: perms.microphone === 'granted',
    accessibilityGranted: perms.accessibility,
    inputMonitoringActive: perms.inputMonitoring,
    bindingValid,
    isMac
  }

  const steps = stepsFor(facts)
  const index = steps.indexOf(step)
  const next = nextStep(step, facts)
  const back = previousStep(step, facts)

  const saveAndTestKey = async (): Promise<void> => {
    if (keyDraft.trim().length === 0) return
    setKeyStatus(await bridge().setApiKey(keyDraft.trim()))
    setKeyDraft('')
    setTesting(true)
    try {
      setConnected((await bridge().testProvider()).ok)
    } finally {
      setTesting(false)
    }
  }

  const capture = async (): Promise<void> => {
    setCapturing(true)
    try {
      const result = await bridge().captureHotkey()
      if (result.ok) {
        // The captured binding lands in main state; pull it back so the
        // wizard shows the new hotkey immediately (issue 3: the box kept
        // showing the old binding while the backend had the new one).
        props.onSettings(await bridge().getSettings())
        await refreshFacts()
      }
    } finally {
      setCapturing(false)
    }
  }

  return (
    <div className="wizard" data-wizard="">
      <section className="panel wizard-panel">
        <div className="wizard-progress">
          {steps.map((s, i) => (
            <span
              key={s}
              className={`wizard-dot ${i < index ? 'wizard-dot-done' : ''} ${i === index ? 'wizard-dot-active' : ''}`}
            />
          ))}
        </div>

        {step === 'welcome' && (
          <div className="wizard-body">
            <h2>Welcome to murmur.</h2>
            <p className="dim">
              Hold a key, speak, release: clean text lands wherever your cursor is. Setup takes
              about two minutes and your voice never touches a server you did not choose.
            </p>
          </div>
        )}

        {step === 'key' && (
          <div className="wizard-body">
            <h2>Connect your provider.</h2>
            <p className="dim">
              murmur is bring-your-own-key. Grab a free key at console.groq.com/keys and paste it
              here; it is stored encrypted on this machine.
            </p>
            <div className="inline wizard-controls">
              <input
                type="password"
                className="field"
                placeholder={keyStatus.present ? `saved (${keyStatus.masked ?? ''})` : 'gsk_…'}
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveAndTestKey()
                }}
              />
              <button className="btn" onClick={() => void saveAndTestKey()} disabled={!keyDraft.trim() || testing}>
                {testing ? 'Testing…' : 'Save and test'}
              </button>
              {keyStatus.present && (
                <span className={connected ? 'status-ok' : 'status-bad'}>
                  {connected ? 'connected' : testing ? '…' : 'not verified yet'}
                </span>
              )}
            </div>
          </div>
        )}

        {step === 'permissions' && (
          <div className="wizard-body">
            <h2>Three macOS permissions.</h2>
            <p className="dim">
              Microphone to hear you, Accessibility to press paste for you, Input Monitoring so the
              hotkey works everywhere. After granting Input Monitoring, quit and reopen murmur.
            </p>
            <div className="wizard-perms">
              {(
                [
                  ['Microphone', facts.micGranted, 'microphone'],
                  ['Accessibility', facts.accessibilityGranted, 'accessibility'],
                  ['Input monitoring', facts.inputMonitoringActive, 'input']
                ] as const
              ).map(([label, ok, pane]) => (
                <div className="inline" key={pane}>
                  <span className={ok ? 'status-ok' : 'status-bad'}>{ok ? '✓' : '✗'}</span>
                  <span>{label}</span>
                  {!ok && (
                    <button className="btn" onClick={() => void bridge().openPermissionPane(pane)}>
                      Open settings
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'hotkey' && (
          <div className="wizard-body">
            <h2>Pick your hotkey.</h2>
            <p className="dim">
              Press a combo, or press and release modifiers alone (Ctrl+Alt is a favorite). You can
              change it anytime in settings.
            </p>
            <div className="inline wizard-controls">
              <button className={`field capture ${capturing ? 'capture-live' : ''}`} onClick={() => void capture()}>
                {capturing ? 'press keys…' : props.settings.hotkey.binding}
              </button>
              {bindingValid && <span className="status-ok">ready</span>}
            </div>
          </div>
        )}

        {step === 'try' && (
          <div className="wizard-body">
            <h2>Say something.</h2>
            <p className="dim">
              Click the box, hold {props.settings.hotkey.binding}, speak a sentence, release. Watch
              the pill, then watch your words arrive.
            </p>
            <textarea className="field trybox wizard-try" rows={3} placeholder="dictate here…" />
          </div>
        )}

        {step === 'done' && (
          <div className="wizard-body">
            <h2>That is the whole trick.</h2>
            <p className="dim">
              Dictate into any app from here on. Your history lives in the home tab, your numbers in
              analytics, and everything stays on your machine.
            </p>
          </div>
        )}

        <div className="wizard-footer">
          <button className="btn quiet-btn" onClick={props.onFinish}>
            {step === 'done' ? 'Finish' : 'Skip for now'}
          </button>
          <div className="inline">
            {back && (
              <button className="btn" onClick={() => setStep(back)}>
                Back
              </button>
            )}
            {step !== 'done' && (
              <button
                className="btn"
                disabled={!canAdvance(step, facts) || next === null}
                onClick={() => next && setStep(next)}
              >
                Next
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
