// SPDX-License-Identifier: GPL-3.0-only
import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { Boundary, ROOT_OPTIONS } from './Boundary'
import { asLook } from '../../shared/look'
import { markScrollbars } from './scroller'
import './styles.css'

// The window's look (US-150) rides in the address, so the first paint
// wears it; main is then asked for the truth and tells of any change (a
// revived page keeps an old address).
const wear = (look: unknown): void => {
  const known = asLook(look)
  if (known) document.documentElement.dataset.look = known
}
wear(new URLSearchParams(window.location.search).get('look'))
void window.murmur?.getLook?.()?.then(wear)
window.murmur?.onLookChanged?.(wear)

// A system that always shows scroll bars (a mouse, or the setting) gives
// the page a gutter that paints as its own solid strip beside the glass.
// Only then does the look draw the scroll bar itself; trackpad overlay
// bars are left as they are.
// The page's box is drawn once settings arrive, so App marks them again
// then (scroller.ts).
window.addEventListener('load', markScrollbars)
window.addEventListener('focus', markScrollbars)

const container = document.getElementById('root')
if (!container) throw new Error('missing #root')
createRoot(container, ROOT_OPTIONS).render(
  <React.StrictMode>
    <Boundary kind="window" where="the window">
      <App />
    </Boundary>
  </React.StrictMode>
)
