// SPDX-License-Identifier: GPL-3.0-only
// Reading a tasks file back (US-052). Pure: the reminder asks how many
// items are still open and what the next few are, and the notification
// says exactly that. This module only ever reads; a checkbox the user
// ticked in their editor is the only thing that closes an item.
import { dayKey } from './history'
import { shouldFire } from './recap'

export interface TodoItem {
  text: string
  done: boolean
  /** The heading the item sits under, '' when it sits above them all. */
  group: string
}

// Every bullet markdown allows, and a file written on Windows keeps a
// carriage return on every line, so lines are split on both endings
// (review gate 2026-09-21: a CRLF todo.md parsed as zero tasks and
// reminders went silent on the machine this story exists for).
const CHECKBOX = /^\s*[-*+]\s+\[( |x|X)\]\s+(.*)$/
// A plain bullet with no box: how the ideas file is written. A bare
// empty box with nothing after it is a box, not a bullet reading "[ ]".
const BULLET = /^\s*[-*+]\s+(?!\[[ xX]\](?:\s|$))(.*)$/
const HEADING = /^\s*#{1,6}\s+(.*)$/
const FENCE = /^\s*(```|~~~)/
// The source link the sorter appends, stripped for display so a
// notification reads like the task rather than like markdown.
const TRAILING_LINK = /\s*\(\[[^\]]*\]\([^)]*\)\)\s*$/

/** Every checkbox line in a tasks file, in file order. A checkbox
 *  inside a fenced code block is sample text, not a task. */
export function parseTodo(text: string): TodoItem[] {
  const items: TodoItem[] = []
  let group = ''
  let fenced = false
  for (const line of text.split(/\r?\n/)) {
    if (FENCE.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced) continue
    const heading = HEADING.exec(line)
    if (heading) {
      group = heading[1].trim()
      continue
    }
    const box = CHECKBOX.exec(line)
    if (!box) continue
    const itemText = box[2].replace(TRAILING_LINK, '').trim()
    // An empty box is a placeholder the user is about to type into,
    // not an open task to be counted.
    if (itemText.length === 0) continue
    items.push({ text: itemText, done: box[1].toLowerCase() === 'x', group })
  }
  return items
}

export function openItems(items: readonly TodoItem[]): TodoItem[] {
  return items.filter((item) => !item.done)
}

export interface ListItem extends TodoItem {
  /** True for a checkbox line; a plain bullet (the ideas file) is not
   *  something that can be ticked. */
  checkbox: boolean
}

/** Every bullet in a file, checkbox or plain, in file order, with the
 *  same fences, headings, links, and empty lines handled as parseTodo. */
export function parseListItems(text: string): ListItem[] {
  const items: ListItem[] = []
  let group = ''
  let fenced = false
  for (const line of text.split(/\r?\n/)) {
    if (FENCE.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced) continue
    const heading = HEADING.exec(line)
    if (heading) {
      group = heading[1].trim()
      continue
    }
    const box = CHECKBOX.exec(line)
    if (box) {
      const itemText = box[2].replace(TRAILING_LINK, '').trim()
      if (itemText.length > 0) items.push({ text: itemText, done: box[1].toLowerCase() === 'x', group, checkbox: true })
      continue
    }
    const bullet = BULLET.exec(line)
    if (bullet) {
      const itemText = bullet[1].replace(TRAILING_LINK, '').trim()
      if (itemText.length > 0) items.push({ text: itemText, done: false, group, checkbox: false })
    }
  }
  return items
}

export type TickResult = { ok: true; text: string } | { ok: false; reason: 'not found' | 'already done' }

/**
 * Tick the nth checkbox of a file (nth counted the way parseTodo counts,
 * so a box inside a code fence or an empty box is skipped). The only
 * change to the file is the space inside that one box becoming an x:
 * every other byte, line ending, and blank line stays exactly as it was.
 */
export function tickLine(text: string, nth: number): TickResult {
  const lines = text.split(/(\r?\n)/)
  let count = -1
  let fenced = false
  for (let i = 0; i < lines.length; i += 2) {
    const line = lines[i]
    if (FENCE.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced) continue
    const box = CHECKBOX.exec(line)
    if (!box) continue
    if (box[2].replace(TRAILING_LINK, '').trim().length === 0) continue
    count += 1
    if (count !== nth) continue
    if (box[1].toLowerCase() === 'x') return { ok: false, reason: 'already done' }
    const at = line.indexOf('[ ]')
    lines[i] = `${line.slice(0, at)}[x]${line.slice(at + 3)}`
    return { ok: true, text: lines.join('') }
  }
  return { ok: false, reason: 'not found' }
}

/** One line for a notification: the count, then as much of the next
 *  items as fits. Empty when nothing is open, so nothing fires. */
export function reminderBody(items: readonly TodoItem[], maxChars = 180): string {
  const open = openItems(items)
  if (open.length === 0) return ''
  const count = `${open.length} open ${open.length === 1 ? 'task' : 'tasks'}`
  const parts: string[] = []
  let used = count.length + 2
  for (const item of open) {
    const cost = parts.length === 0 ? item.text.length : item.text.length + 2
    if (used + cost > maxChars) break
    parts.push(item.text)
    used += cost
  }
  if (parts.length > 0) return `${count}: ${parts.join('; ')}`
  // One long task still deserves a preview: show what fits of it.
  const room = maxChars - count.length - 3
  return room > 8 ? `${count}: ${open[0].text.slice(0, room).trimEnd()}…` : count
}

export interface DueReminder {
  /** Position in the configured times, which is what fired state is
   *  keyed by: editing a time must not re-fire it the same day. */
  index: number
  time: string
}

/**
 * Every configured time that is past due today and has not fired yet.
 * Each keeps its own last-fired day, so three reminders a day fire
 * once each, and a machine that was off all day comes back with them
 * all due at once: the caller marks them all fired and shows one.
 */
export function dueReminders(
  nowMs: number,
  times: readonly string[],
  firedDays: Readonly<Record<string, string>>
): DueReminder[] {
  const due: DueReminder[] = []
  times.forEach((time, index) => {
    if (typeof time !== 'string' || time.trim() === '') return
    if (shouldFire(nowMs, time, firedDays[String(index)] ?? null)) due.push({ index, time })
  })
  return due
}

/** Mark times as fired today, dropping days that are no longer today
 *  so the state file cannot grow without bound. */
export function markFired(
  nowMs: number,
  indexes: readonly number[],
  firedDays: Readonly<Record<string, string>>
): Record<string, string> {
  const today = dayKey(nowMs)
  const next: Record<string, string> = {}
  for (const [key, day] of Object.entries(firedDays)) {
    if (day === today) next[key] = day
  }
  for (const index of indexes) next[String(index)] = today
  return next
}

/** Every time already past today, ignoring what has fired. */
export function alreadyPast(nowMs: number, times: readonly string[]): number[] {
  return dueReminders(nowMs, times, {}).map((due) => due.index)
}

/**
 * Fired state after the times change or reminders are switched on: a
 * slot whose time has already passed today counts as fired, so neither
 * edit ever back-fires, and a slot whose time is still ahead is free to
 * fire at it. Setting a reminder for ten minutes from now therefore
 * arrives in ten minutes, even in a slot that already ran this morning.
 */
export function resettleFired(nowMs: number, times: readonly string[]): Record<string, string> {
  const today = dayKey(nowMs)
  const settled: Record<string, string> = {}
  for (const index of alreadyPast(nowMs, times)) settled[String(index)] = today
  return settled
}
