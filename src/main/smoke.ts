// SPDX-License-Identifier: GPL-3.0-only
// Headless smoke harness. Subsystems register named checks as they
// initialize; in smoke mode the app runs every check, prints one
// SMOKE_RESULT JSON line, and exits with a matching code. Smoke must
// never need a mic, network, or API key: subsystems provide mock modes.
import { app } from 'electron'

type CheckFn = () => Promise<boolean> | boolean

const registry = new Map<string, CheckFn>()

export const isSmoke = process.env.MURMUR_SMOKE === '1'

const CHECK_TIMEOUT_MS = 10_000

export function registerSmokeCheck(name: string, fn: CheckFn): void {
  registry.set(name, fn)
}

async function withTimeout(fn: CheckFn): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), CHECK_TIMEOUT_MS)
  })
  try {
    return Boolean(await Promise.race([Promise.resolve(fn()), timeout]))
  } finally {
    clearTimeout(timer)
  }
}

export async function runSmokeAndExit(): Promise<void> {
  const checks: Record<string, boolean> = {}
  for (const [name, fn] of registry) {
    try {
      checks[name] = await withTimeout(fn)
    } catch {
      checks[name] = false
    }
    // Progress to stderr so a hung run shows exactly where it stopped.
    console.error(`smoke: ${name}=${checks[name]}`)
  }
  // Lets the harness prove that a failing check propagates to the exit code.
  if (process.env.MURMUR_SMOKE_FORCE_FAIL === '1') checks.forcedFailure = false

  const ok = Object.values(checks).every(Boolean)
  console.log(`SMOKE_RESULT ${JSON.stringify({ ok, checks })}`)
  app.exit(ok ? 0 : 1)
}
