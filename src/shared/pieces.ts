// SPDX-License-Identifier: GPL-3.0-only
// A related sentence the model also cut (US-055 meets US-056), pure
// half. The relation vote was about the sentence as spoken; when the
// same reply confirmed cuts in it, the sentence is several items and
// the vote can only truly belong to one of them. So the pieces are cut
// first and compared on their own in a second, smaller request: only
// the matching piece is held, the rest file. If that request cannot be
// answered, the whole sentence is held as before, carrying its pieces
// so File it anyway still lands one line per item.
import { type ContextItem, type RelatedLine, type RelationVote, type RelationVotes, pickRelated } from './compare'
import { type Seam, type SeamVotes, type SortLabel, cutAtSeams } from './sorter'

export interface PieceSet {
  /** Index of the sentence among the ones sent. */
  local: number
  label: SortLabel
  pieces: string[]
}

/**
 * Split the related lines into the ones to compare piece by piece (a
 * task or idea with confirmed cuts that yield more than one piece) and
 * the ones held whole.
 */
export function piecesToCompare(
  related: readonly RelatedLine[],
  sentences: readonly string[],
  labels: readonly SortLabel[],
  seamsBySentence: readonly Seam[][],
  votes: SeamVotes
): { cut: PieceSet[]; whole: RelatedLine[] } {
  const cut: PieceSet[] = []
  const whole: RelatedLine[] = []
  for (const line of related) {
    const label = labels[line.local]
    const confirmed = votes[line.local + 1]
    const pieces =
      (label === 'task' || label === 'idea') && confirmed && confirmed.length > 0
        ? cutAtSeams(sentences[line.local] ?? '', seamsBySentence[line.local] ?? [], confirmed)
        : []
    if (pieces.length > 1 && (label === 'task' || label === 'idea')) cut.push({ local: line.local, label, pieces })
    else whole.push(line)
  }
  return { cut, whole }
}

/** The pieces as one numbered list for the second request, each with
 *  its sentence's label, in sentence order. */
export function flattenPieces(cut: readonly PieceSet[]): { sentences: string[]; labels: SortLabel[] } {
  const out: { sentences: string[]; labels: SortLabel[] } = { sentences: [], labels: [] }
  for (const set of cut) {
    for (const piece of set.pieces) {
      out.sentences.push(piece)
      out.labels.push(set.label)
    }
  }
  return out
}

export interface HeldPiece {
  local: number
  text: string
  label: SortLabel
  vote: RelationVote
  item: ContextItem
}

export interface FiledPiece {
  local: number
  text: string
  label: SortLabel
}

/**
 * Read the second request's votes back onto the pieces: a piece the
 * vote tied to a real item is held, every other piece files. A reply
 * that relates nothing files every piece: the sentence-level vote was
 * the coarser answer and the piece-level one replaces it.
 */
export function assignPieceVotes(
  cut: readonly PieceSet[],
  relations: RelationVotes,
  items: readonly ContextItem[]
): { held: HeldPiece[]; filed: FiledPiece[] } {
  const owners: FiledPiece[] = []
  for (const set of cut) for (const piece of set.pieces) owners.push({ local: set.local, text: piece, label: set.label })
  const flat = flattenPieces(cut)
  const all = flat.sentences.map((_, i) => i)
  const { related, kept } = pickRelated(all, flat.labels, relations, items)
  return {
    held: related.map((r) => ({ ...owners[r.local], vote: r.vote, item: r.item })),
    filed: kept.map((i) => owners[i])
  }
}
