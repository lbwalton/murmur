// SPDX-License-Identifier: GPL-3.0-only
import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { Boundary, ROOT_OPTIONS } from './Boundary'
import './styles.css'

const container = document.getElementById('root')
if (!container) throw new Error('missing #root')
createRoot(container, ROOT_OPTIONS).render(
  <React.StrictMode>
    <Boundary kind="window" where="the window">
      <App />
    </Boundary>
  </React.StrictMode>
)
