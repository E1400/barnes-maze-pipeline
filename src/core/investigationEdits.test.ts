import { describe, expect, it } from 'vitest'
import {
  EMPTY_INVESTIGATION_EDITS,
  addManualInvestigation,
  applyInvestigationEdits,
  autoInvestigationId,
  deleteManualInvestigation,
  groupConsecutiveInvestigations,
  removeAutoInvestigation,
  updateManualInvestigation,
} from './investigationEdits.ts'
import type { HoleInvestigation } from './events.ts'

function auto(holeIndex: number, startFrame: number, endFrame: number, isTarget = false): HoleInvestigation {
  return { holeIndex, isTarget, startFrame, endFrame, kind: 'proximity' }
}

describe('applyInvestigationEdits', () => {
  it('passes auto investigations through unchanged with no edits', () => {
    const list = [auto(0, 0, 5), auto(1, 10, 15)]
    const effective = applyInvestigationEdits(list, EMPTY_INVESTIGATION_EDITS, null)
    expect(effective).toHaveLength(2)
    expect(effective[0]).toMatchObject({ holeIndex: 0, startFrame: 0, endFrame: 5, source: 'auto' })
    expect(effective[0]!.id).toBe(autoInvestigationId(list[0]!))
  })

  it('removes an auto investigation marked deleted', () => {
    const list = [auto(0, 0, 5), auto(1, 10, 15)]
    const edits = removeAutoInvestigation(EMPTY_INVESTIGATION_EDITS, autoInvestigationId(list[0]!))
    const effective = applyInvestigationEdits(list, edits, null)
    expect(effective).toHaveLength(1)
    expect(effective[0]!.holeIndex).toBe(1)
  })

  it('is a no-op to remove the same auto investigation twice', () => {
    const list = [auto(0, 0, 5)]
    const id = autoInvestigationId(list[0]!)
    const once = removeAutoInvestigation(EMPTY_INVESTIGATION_EDITS, id)
    const twice = removeAutoInvestigation(once, id)
    expect(twice.removedAutoIds).toEqual(['auto-0'])
  })

  it('appends a manually added investigation, tagged as manual and sorted into place', () => {
    const list = [auto(0, 0, 5), auto(1, 20, 25)]
    const edits = addManualInvestigation(EMPTY_INVESTIGATION_EDITS, {
      id: 'm1',
      holeIndex: 3,
      startFrame: 10,
      endFrame: 12,
    })
    const effective = applyInvestigationEdits(list, edits, null)
    expect(effective.map((e) => e.startFrame)).toEqual([0, 10, 20])
    expect(effective[1]).toMatchObject({ id: 'm1', holeIndex: 3, kind: 'manual', source: 'manual' })
  })

  it('marks a manual investigation as the target when its hole matches', () => {
    const edits = addManualInvestigation(EMPTY_INVESTIGATION_EDITS, {
      id: 'm1',
      holeIndex: 3,
      startFrame: 10,
      endFrame: 12,
    })
    const effective = applyInvestigationEdits([], edits, 3)
    expect(effective[0]!.isTarget).toBe(true)
  })

  it('updates a manual investigation in place', () => {
    let edits = addManualInvestigation(EMPTY_INVESTIGATION_EDITS, {
      id: 'm1',
      holeIndex: 3,
      startFrame: 10,
      endFrame: 12,
    })
    edits = updateManualInvestigation(edits, 'm1', { endFrame: 20 })
    const effective = applyInvestigationEdits([], edits, null)
    expect(effective[0]).toMatchObject({ startFrame: 10, endFrame: 20 })
  })

  it('deletes a manual investigation outright, not as a tombstone', () => {
    let edits = addManualInvestigation(EMPTY_INVESTIGATION_EDITS, {
      id: 'm1',
      holeIndex: 3,
      startFrame: 10,
      endFrame: 12,
    })
    edits = deleteManualInvestigation(edits, 'm1')
    expect(edits.manual).toHaveLength(0)
    expect(applyInvestigationEdits([], edits, null)).toEqual([])
  })

  it('combines a deletion and an addition together', () => {
    const list = [auto(0, 0, 5), auto(1, 20, 25)]
    let edits = removeAutoInvestigation(EMPTY_INVESTIGATION_EDITS, autoInvestigationId(list[0]!))
    edits = addManualInvestigation(edits, { id: 'm1', holeIndex: 2, startFrame: 30, endFrame: 32 })
    const effective = applyInvestigationEdits(list, edits, null)
    expect(effective.map((e) => `${e.source}:${e.holeIndex}`)).toEqual(['auto:1', 'manual:2'])
  })
})

describe('groupConsecutiveInvestigations', () => {
  it('gives consecutive rows at the same hole one group number', () => {
    const list = [auto(2, 0, 5), auto(2, 10, 15), auto(2, 20, 25), auto(10, 30, 35), auto(10, 40, 45)]
    const effective = applyInvestigationEdits(list, EMPTY_INVESTIGATION_EDITS, null)
    const grouped = groupConsecutiveInvestigations(effective)
    expect(grouped.map((g) => g.group)).toEqual([1, 1, 1, 2, 2])
  })

  it('starts a new group when the same hole reappears after a different hole', () => {
    const list = [auto(2, 0, 5), auto(10, 10, 15), auto(2, 20, 25)]
    const effective = applyInvestigationEdits(list, EMPTY_INVESTIGATION_EDITS, null)
    const grouped = groupConsecutiveInvestigations(effective)
    expect(grouped.map((g) => g.group)).toEqual([1, 2, 3])
  })

  it('handles a single investigation and an empty list', () => {
    expect(groupConsecutiveInvestigations([]).map((g) => g.group)).toEqual([])
    const single = applyInvestigationEdits([auto(0, 0, 5)], EMPTY_INVESTIGATION_EDITS, null)
    expect(groupConsecutiveInvestigations(single).map((g) => g.group)).toEqual([1])
  })
})
