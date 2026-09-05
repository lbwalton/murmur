// SPDX-License-Identifier: GPL-3.0-only
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

const container = document.getElementById('root')
if (!container) throw new Error('missing #root')
createRoot(container).render(<App />)
