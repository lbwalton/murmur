// SPDX-License-Identifier: GPL-3.0-only
// Cosmetic unlock logic. Pure: given the progression report and earned
// achievements, answer what is unlocked and resolve the active accent
// color. Cosmetics never gate function; locked items stay visible with
// their earn hints so the path is always legible.
import type { EarnedAchievement } from './achievements'
import type { ProgressReport } from './ranks'

export interface UnlockRule {
  rank?: string
  achievement?: string
}

export interface CosmeticItem {
  id: string
  name: string
  hint: string
  color?: string | null
  /** Swatch colors for the settings preview (themes: ink and panel). */
  preview?: string[]
  unlock: UnlockRule | null
}

export interface CosmeticsFile {
  beltColors: Record<string, string>
  founderGold: string
  overlayStyles: CosmeticItem[]
  accents: CosmeticItem[]
  uiThemes: CosmeticItem[]
}

/** Is one item unlocked for this user? Null rule means always. */
export function isUnlocked(
  item: CosmeticItem,
  progress: ProgressReport,
  earned: readonly EarnedAchievement[]
): boolean {
  if (!item.unlock) return true
  if (progress.founder) return true
  if (item.unlock.rank) {
    // Unlocked when the user's ladder index is at or past the rank.
    const ownIndex = progress.index
    const requiredId = item.unlock.rank
    // Promotions carry every earned rank id; the current rank counts too.
    if (progress.rank.id === requiredId) return true
    return progress.promotions.some((p) => p.id === requiredId) && ownIndex >= 0
  }
  if (item.unlock.achievement) {
    return earned.some((e) => e.id === item.unlock?.achievement)
  }
  return false
}

export interface CosmeticsReport {
  overlayStyles: Array<CosmeticItem & { unlocked: boolean }>
  accents: Array<CosmeticItem & { unlocked: boolean }>
  uiThemes: Array<CosmeticItem & { unlocked: boolean }>
  /** The belt fabric color for the current rank. A 10th degree belt is
   *  solid red per IBJJF; founder gold lives on the crown and in the
   *  founder-only accent, never on the fabric. */
  beltColor: string
}

export function computeCosmetics(
  spec: CosmeticsFile,
  progress: ProgressReport,
  earned: readonly EarnedAchievement[]
): CosmeticsReport {
  const tag = (items: CosmeticItem[]) =>
    items.map((item) => ({ ...item, unlocked: isUnlocked(item, progress, earned) }))
  return {
    overlayStyles: tag(spec.overlayStyles),
    accents: tag(spec.accents),
    uiThemes: tag(spec.uiThemes),
    beltColor: spec.beltColors[progress.rank.belt] ?? spec.beltColors.none
  }
}

/**
 * Resolve the accent id a user selected into a concrete color. The
 * special id belt follows the current rank. Locked or unknown ids fall
 * back to the first always-unlocked accent.
 */
export function resolveAccentColor(
  accentId: string,
  spec: CosmeticsFile,
  progress: ProgressReport,
  earned: readonly EarnedAchievement[]
): string {
  const item = spec.accents.find((a) => a.id === accentId)
  const fallback = spec.accents.find((a) => !a.unlock)?.color ?? '#f0a44b'
  if (!item || !isUnlocked(item, progress, earned)) return fallback
  if (item.id === 'belt' || item.color === null || item.color === undefined) {
    return spec.beltColors[progress.rank.belt] ?? fallback
  }
  return item.color
}
