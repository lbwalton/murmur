// SPDX-License-Identifier: GPL-3.0-only
// The fix a word panel (US-184): the word that was selected, and 1 box
// to type how it should be written. Enter saves, Esc closes. It holds
// no state of its own beyond the question main last asked.
import '../tokens.css'
import './styles.css'
import type { FixApi, FixAsk } from '../../preload/fix'

declare global {
  interface Window {
    murmurFix: FixApi
  }
}

const form = document.getElementById('fix') as HTMLFormElement
const heard = document.getElementById('fix-heard') as HTMLSpanElement
const written = document.getElementById('fix-written') as HTMLInputElement
let asked: FixAsk | null = null

window.murmurFix.onAsk((ask) => {
  asked = ask
  heard.textContent = ask.heard
  // The word as it stands, selected: a small change is a few keys, and
  // typing replaces it whole.
  written.value = ask.heard
  written.focus()
  written.select()
})

form.addEventListener('submit', (event) => {
  event.preventDefault()
  if (asked !== null) window.murmurFix.save(asked.id, written.value)
})

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    if (asked !== null) window.murmurFix.cancel(asked.id)
  }
})
