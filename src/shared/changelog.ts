// SPDX-License-Identifier: GPL-3.0-only
// Pure changelog parsing: the app shows the running version's section
// from the bundled CHANGELOG.md, so the file is the single source for
// the repo, the GitHub release notes, and the What's new surface.

/**
 * The body of the section whose heading starts with "## <version>"
 * (suffixes like a date or unreleased marker are fine), up to the next
 * release heading. Null when the version has no section.
 */
export function sectionFor(markdown: string, version: string): string | null {
  const lines = markdown.split('\n')
  // Boundary after the version: 0.1.1 must never match the 0.1.10
  // heading that sits above it in a newest-first file.
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const heading = new RegExp(`^## ${escaped}(?:$|[ (])`)
  const start = lines.findIndex((line) => heading.test(line))
  if (start === -1) return null
  const body: string[] = []
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) break
    body.push(lines[i])
  }
  const text = body.join('\n').trim()
  return text.length > 0 ? text : null
}
