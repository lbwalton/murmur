// SPDX-License-Identifier: GPL-3.0-only
// Overlay window preload. Channel allowlist grows with the overlay stories.
import { contextBridge } from 'electron'

const api = {}

export type OverlayApi = typeof api

contextBridge.exposeInMainWorld('murmurOverlay', api)
