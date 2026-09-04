import { describe, expect, it } from 'vitest'
import { buildInvestigationRows, buildQualityRow, buildTrialRow } from './exportRows.ts'
import { DEFAULT_INVESTIGATION_PARAMS } from '../core/events.ts'
import type { EffectiveInvestigation } from '../core/investigationEdits.ts'
import type { TrialMeasures } from '../core/measures.ts'
import type { RoiDefinition } from '../core/roi.ts'
import { buildTimebase } from '../core/timebase.ts'
import type { FrameTrack, TrackState } from '../core/tracking.ts'

const TIMEBASE = buildTimebase(30, [{ count: 10, delta: 1 }])

const ROI: RoiDefinition = {
  center: { x: 0, y: 0 },
  platformRadius: 100,
  ring: { center: { x: 0, y: 0 }, ringRadius: 100, rotation: 0, holeCount: 4 },
  holes: [{ x: 100, y: 0 }, { x: 0, y: 100 }, { x: -100, y: 0 }, { x: 0, y: -100 }],
  nudgedHoles: [],
  targetHole: 0,
  platformDiameterCm: 92,
  holeRadius: 10,
  source: 'manual',
}

const MEASURES: TrialMeasures = {
  primaryLatencySeconds: 12.5,
  totalLatencySeconds: null,
  primaryErrors: 2,
  totalErrors: 3,
  pathLengthCm: 456.7,
  averageSpeedCmPerSecond: 9.1,
  quadrantTimeSeconds: { target: 10, opposite: 5, adjacentClockwise: 3, adjacentCounterClockwise: 2 },
  investigations: [],
}

function investigation(holeIndex: number, startFrame: number, isTarget = false): EffectiveInvestigation {
  return {
    id: `i-${startFrame}`,
    holeIndex,
    isTarget,
    startFrame,
    endFrame: startFrame + 1,
    kind: 'proximity',
    source: 'auto',
  }
}

describe('buildTrialRow', () => {
  it('produces one tidy row with real units and the tool version', () => {
    const row = buildTrialRow('test51.mp4', TIMEBASE, ROI, MEASURES, null, DEFAULT_INVESTIGATION_PARAMS)
    expect(row.video).toBe('test51.mp4')
    expect(row.targetHole).toBe(1) // 1-indexed
    expect(row.primaryLatencySeconds).toBe(12.5)
    expect(row.totalLatencySeconds).toBeNull()
    expect(row.quadrant1TargetSeconds).toBe(10)
    expect(row.toolVersion).toMatch(/barnes-maze-pipeline/)
    expect(row.investigationRadiusFactor).toBe(DEFAULT_INVESTIGATION_PARAMS.proximityRadiusFactor)
  })

  it('carries the search-strategy label and reasoning when classified', () => {
    const row = buildTrialRow(
      'test51.mp4',
      TIMEBASE,
      ROI,
      MEASURES,
      { label: 'spatial', reasoning: 'Direct path to the target.' },
      DEFAULT_INVESTIGATION_PARAMS,
    )
    expect(row.searchStrategy).toBe('spatial')
    expect(row.searchStrategyReasoning).toBe('Direct path to the target.')
  })

  it('reports null quadrant fields when quadrant time is unavailable', () => {
    const row = buildTrialRow('t.mp4', TIMEBASE, ROI, { ...MEASURES, quadrantTimeSeconds: null }, null, DEFAULT_INVESTIGATION_PARAMS)
    expect(row.quadrant1TargetSeconds).toBeNull()
    expect(row.quadrant2Seconds).toBeNull()
  })
})

describe('buildInvestigationRows', () => {
  it('collapses consecutive same-hole investigations into one visit number', () => {
    const investigations = [investigation(1, 0), investigation(1, 2), investigation(3, 5, true)]
    const rows = buildInvestigationRows('test51.mp4', TIMEBASE, investigations)
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.visit)).toEqual([1, 1, 2])
    expect(rows[2]!.isTarget).toBe(true)
    expect(rows[0]!.hole).toBe(2) // 1-indexed
    expect(rows[0]!.startSeconds).toBeCloseTo(0, 6)
  })

  it('returns an empty list for no investigations', () => {
    expect(buildInvestigationRows('t.mp4', TIMEBASE, [])).toEqual([])
  })
})

function frame(frameIndex: number, state: TrackState): FrameTrack {
  return { frameIndex, state, centroid: null, nose: null, area: 0, holeIndex: null }
}

describe('buildQualityRow', () => {
  it('tallies each state as a count and a percent of total frames', () => {
    const tracks = [
      frame(0, 'LOST'),
      frame(1, 'TRACKED'),
      frame(2, 'TRACKED'),
      frame(3, 'OCCLUDED_IN_HOLE'),
      frame(4, 'IN_ESCAPE_BOX'),
    ]
    const row = buildQualityRow('test51.mp4', TIMEBASE, tracks)
    expect(row.frameCount).toBe(5)
    expect(row.trackedFrames).toBe(2)
    expect(row.trackedPercent).toBe(40)
    expect(row.lostFrames).toBe(1)
    expect(row.lostPercent).toBe(20)
    expect(row.occludedInHoleFrames).toBe(1)
    expect(row.inEscapeBoxFrames).toBe(1)
    expect(row.toolVersion).toMatch(/barnes-maze-pipeline/)
  })

  it('finds the single longest LOST run, not just a total LOST count, and reports where it starts', () => {
    const tracks = [
      frame(0, 'LOST'),
      frame(1, 'TRACKED'),
      frame(2, 'LOST'),
      frame(3, 'LOST'),
      frame(4, 'LOST'),
      frame(5, 'TRACKED'),
    ]
    const row = buildQualityRow('test51.mp4', TIMEBASE, tracks)
    expect(row.lostFrames).toBe(4) // 1 + 3, two separate runs
    expect(row.longestLostRunFrames).toBe(3) // the run at frames 2-4, not the lone frame 0
    expect(row.longestLostRunStartSeconds).toBeCloseTo(2 / 30, 2)
  })

  it('reports no LOST run and a null start when every frame tracked cleanly', () => {
    const row = buildQualityRow('t.mp4', TIMEBASE, [frame(0, 'TRACKED'), frame(1, 'TRACKED')])
    expect(row.longestLostRunFrames).toBe(0)
    expect(row.longestLostRunStartSeconds).toBeNull()
  })

  it('handles an empty track list without dividing by zero', () => {
    const row = buildQualityRow('t.mp4', TIMEBASE, [])
    expect(row.frameCount).toBe(0)
    expect(row.trackedPercent).toBe(0)
    expect(row.longestLostRunStartSeconds).toBeNull()
  })
})
