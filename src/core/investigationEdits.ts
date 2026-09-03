/**
 * Manual edits to the hole-investigation list, layered on top of the
 * detector's own output the same way `corrections.ts` layers manual
 * positions on top of the tracker's -- never mutating the detected list,
 * always an overlay that can be reverted.
 *
 * Two kinds of edit: deleting an auto-detected investigation the reviewer
 * judges wrong (recorded by id, not removed from the detector's own output),
 * and adding one by hand for a real visit the threshold missed -- e.g. the
 * detector never confirmed an escape, but the reviewer watched the mouse
 * enter the target hole and can mark exactly when.
 */

import type { HoleInvestigation } from './events.ts'

export interface ManualInvestigation {
  readonly id: string
  readonly holeIndex: number
  readonly startFrame: number
  readonly endFrame: number
}

export interface InvestigationEdits {
  readonly removedAutoIds: readonly string[]
  readonly manual: readonly ManualInvestigation[]
}

export const EMPTY_INVESTIGATION_EDITS: InvestigationEdits = { removedAutoIds: [], manual: [] }

export interface EffectiveInvestigation {
  readonly id: string
  readonly holeIndex: number
  readonly isTarget: boolean
  readonly startFrame: number
  readonly endFrame: number
  readonly kind: 'proximity' | 'occlusion' | 'manual'
  readonly source: 'auto' | 'manual'
}

/** Stable id for an auto-detected investigation: its start frame is unique across the list detectInvestigations produces (runs never overlap). */
export function autoInvestigationId(investigation: Pick<HoleInvestigation, 'startFrame'>): string {
  return `auto-${investigation.startFrame}`
}

/** Merges manual edits onto the detector's output: deletions filtered out, additions appended, in frame order. */
export function applyInvestigationEdits(
  auto: readonly HoleInvestigation[],
  edits: InvestigationEdits,
  targetHole: number | null,
): EffectiveInvestigation[] {
  const removed = new Set(edits.removedAutoIds)
  const fromAuto: EffectiveInvestigation[] = auto
    .filter((investigation) => !removed.has(autoInvestigationId(investigation)))
    .map((investigation) => ({
      id: autoInvestigationId(investigation),
      holeIndex: investigation.holeIndex,
      isTarget: investigation.isTarget,
      startFrame: investigation.startFrame,
      endFrame: investigation.endFrame,
      kind: investigation.kind,
      source: 'auto',
    }))
  const fromManual: EffectiveInvestigation[] = edits.manual.map((manual) => ({
    id: manual.id,
    holeIndex: manual.holeIndex,
    isTarget: manual.holeIndex === targetHole,
    startFrame: manual.startFrame,
    endFrame: manual.endFrame,
    kind: 'manual',
    source: 'manual',
  }))
  return [...fromAuto, ...fromManual].sort((a, b) => a.startFrame - b.startFrame)
}

/** Marks an auto-detected investigation as deleted. A no-op if it's already removed. */
export function removeAutoInvestigation(edits: InvestigationEdits, id: string): InvestigationEdits {
  return edits.removedAutoIds.includes(id)
    ? edits
    : { ...edits, removedAutoIds: [...edits.removedAutoIds, id] }
}

export function addManualInvestigation(
  edits: InvestigationEdits,
  manual: ManualInvestigation,
): InvestigationEdits {
  return { ...edits, manual: [...edits.manual, manual] }
}

export function updateManualInvestigation(
  edits: InvestigationEdits,
  id: string,
  patch: Partial<Omit<ManualInvestigation, 'id'>>,
): InvestigationEdits {
  return {
    ...edits,
    manual: edits.manual.map((m) => (m.id === id ? { ...m, ...patch } : m)),
  }
}

export function deleteManualInvestigation(edits: InvestigationEdits, id: string): InvestigationEdits {
  return { ...edits, manual: edits.manual.filter((m) => m.id !== id) }
}

export interface GroupedInvestigation extends EffectiveInvestigation {
  /** 1-indexed. Consecutive rows at the same hole (in start-frame order, no other hole visited in between) share a group. */
  readonly group: number
}

/**
 * Coarser granularity than the raw per-row list: five consecutive "nose came
 * close" rows at hole 2 followed by three at hole 10 are two investigations
 * (a visit to 2, then a visit to 10), not eight. Investigations must already
 * be in start-frame order (as `applyInvestigationEdits` returns them).
 */
export function groupConsecutiveInvestigations(
  investigations: readonly EffectiveInvestigation[],
): readonly GroupedInvestigation[] {
  let group = 0
  let previousHole: number | null = null
  return investigations.map((investigation) => {
    if (investigation.holeIndex !== previousHole) group++
    previousHole = investigation.holeIndex
    return { ...investigation, group }
  })
}
