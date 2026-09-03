/**
 * Pure row-building for CSV/XLSX export: one tidy row per trial, plus a
 * per-event detail row for every hole investigation -- per the brief. Kept
 * separate from the actual file-writing (see `sheets.ts`) so the row shape
 * itself is unit-testable without touching SheetJS or the DOM.
 */

import type { EffectiveInvestigation, GroupedInvestigation } from '../core/investigationEdits.ts'
import { groupConsecutiveInvestigations } from '../core/investigationEdits.ts'
import type { InvestigationParams } from '../core/events.ts'
import type { TrialMeasures } from '../core/measures.ts'
import type { RoiDefinition } from '../core/roi.ts'
import { formatFps, type Timebase } from '../core/timebase.ts'
import { toolIdentifier } from '../core/version.ts'

export interface TrialRow {
  readonly video: string
  readonly frameRateFps: string
  readonly frameCount: number
  readonly durationSeconds: number
  readonly platformDiameterCm: number | null
  readonly targetHole: number | null
  readonly primaryLatencySeconds: number | null
  readonly totalLatencySeconds: number | null
  readonly primaryErrors: number
  readonly totalErrors: number
  readonly pathLengthCm: number | null
  readonly averageSpeedCmPerSecond: number | null
  readonly quadrant1TargetSeconds: number | null
  readonly quadrant2Seconds: number | null
  readonly quadrant3OppositeSeconds: number | null
  readonly quadrant4Seconds: number | null
  readonly searchStrategy: string | null
  readonly searchStrategyReasoning: string | null
  readonly investigationRadiusFactor: number
  readonly investigationMinFrames: number
  readonly toolVersion: string
}

export interface InvestigationRow {
  readonly video: string
  readonly visit: number
  readonly hole: number
  readonly isTarget: boolean
  readonly source: string
  readonly detectedBy: string
  readonly startFrame: number
  readonly endFrame: number
  readonly startSeconds: number
  readonly endSeconds: number
}

export function buildTrialRow(
  videoName: string,
  timebase: Timebase,
  roi: RoiDefinition,
  measures: Omit<TrialMeasures, 'investigations'>,
  strategy: { readonly label: string; readonly reasoning: string } | null,
  investigationParams: InvestigationParams,
): TrialRow {
  return {
    video: videoName,
    frameRateFps: formatFps(timebase.nominalFps),
    frameCount: timebase.frameCount,
    durationSeconds: Number(timebase.durationSeconds.toFixed(3)),
    platformDiameterCm: roi.platformDiameterCm,
    targetHole: roi.targetHole === null ? null : roi.targetHole + 1,
    primaryLatencySeconds: measures.primaryLatencySeconds,
    totalLatencySeconds: measures.totalLatencySeconds,
    primaryErrors: measures.primaryErrors,
    totalErrors: measures.totalErrors,
    pathLengthCm: measures.pathLengthCm,
    averageSpeedCmPerSecond: measures.averageSpeedCmPerSecond,
    quadrant1TargetSeconds: measures.quadrantTimeSeconds?.target ?? null,
    quadrant2Seconds: measures.quadrantTimeSeconds?.adjacentClockwise ?? null,
    quadrant3OppositeSeconds: measures.quadrantTimeSeconds?.opposite ?? null,
    quadrant4Seconds: measures.quadrantTimeSeconds?.adjacentCounterClockwise ?? null,
    searchStrategy: strategy?.label ?? null,
    searchStrategyReasoning: strategy?.reasoning ?? null,
    investigationRadiusFactor: investigationParams.proximityRadiusFactor,
    investigationMinFrames: investigationParams.minFrames,
    toolVersion: toolIdentifier(),
  }
}

export function buildInvestigationRows(
  videoName: string,
  timebase: Timebase,
  investigations: readonly EffectiveInvestigation[],
): InvestigationRow[] {
  const grouped: readonly GroupedInvestigation[] = groupConsecutiveInvestigations(
    [...investigations].sort((a, b) => a.startFrame - b.startFrame),
  )
  return grouped.map((event) => ({
    video: videoName,
    visit: event.group,
    hole: event.holeIndex + 1,
    isTarget: event.isTarget,
    source: event.source,
    detectedBy: event.kind,
    startFrame: event.startFrame + 1,
    endFrame: event.endFrame + 1,
    startSeconds: Number((timebase.frameTicks[event.startFrame]! / timebase.timescale).toFixed(3)),
    endSeconds: Number((timebase.frameTicks[event.endFrame]! / timebase.timescale).toFixed(3)),
  }))
}
