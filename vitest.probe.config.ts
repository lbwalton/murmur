// SPDX-License-Identifier: GPL-3.0-only
// Live model probes only. Kept apart from vitest.config.ts so npm test
// and CI never call out.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.probe.ts'],
    // The scoreboard is the point of the run, so it always prints.
    silent: false,
    disableConsoleIntercept: true
  }
})
