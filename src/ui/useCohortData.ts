/**
 * Every tracked video's full computed state -- track, ROI, investigations,
 * measures, search strategy -- recomputed from stored data on each load.
 * Shared by ExportPanel and VisualizationsPanel so the same aggregation
 * (and its IndexedDB reads) isn't duplicated between them... except it is,
 * once per panel, since each calls this hook independently. Deliberate
 * simplification: this data is cheap to recompute (no video decoding, just
 * IndexedDB reads and in-memory math), so a shared cache wasn't worth the
 * extra plumbing for two panels that happen to sit next to each other.
 */

import { useEffect, useState } from 'react'
import { applyCorrections, type EffectiveFrame } from '../core/corrections.ts'
import { DEFAULT_INVESTIGATION_PARAMS, detectInvestigations, type InvestigationParams } from '../core/events.ts'
import { applyInvestigationEdits, type EffectiveInvestigation } from '../core/investigationEdits.ts'
import { applyMeasureOverrides } from '../core/measureOverrides.ts'
import { computeTrialMeasuresFromInvestigations, type TrialMeasures } from '../core/measures.ts'

/**
 * `computeTrialMeasuresFromInvestigations` is generic over its investigations
 * type so a caller's edited (id/source-tagged) list comes back out unnarrowed
 * -- see its own doc comment. `EffectiveInvestigation.kind` includes
 * `'manual'`, which the concrete `TrialMeasures.investigations` (typed for
 * the narrower `HoleInvestigation`) can't hold, so `CohortVideo.measures`
 * needs this wider alias rather than the plain `TrialMeasures` type.
 */
type EffectiveTrialMeasures = Omit<TrialMeasures, 'investigations'> & {
  readonly investigations: readonly EffectiveInvestigation[]
}
import type { RoiDefinition } from '../core/roi.ts'
import { classifySearchStrategy, type SearchStrategyLabel } from '../core/searchStrategy.ts'
import { loadCorrections } from '../state/correctionStore.ts'
import { loadInvestigationEdits } from '../state/investigationEditsStore.ts'
import { loadInvestigationParams } from '../state/investigationParamsStore.ts'
import { loadMeasureOverrides } from '../state/measureOverridesStore.ts'
import { loadRoi } from '../state/roiStore.ts'
import type { StoredVideoSummary } from '../state/schema.ts'
import { listTrackedVideoIds, loadTracks } from '../state/trackStore.ts'
import { listVideos } from '../state/videoStore.ts'

export interface CohortVideo {
  readonly video: StoredVideoSummary
  readonly roi: RoiDefinition
  readonly effective: readonly EffectiveFrame[]
  readonly investigations: readonly EffectiveInvestigation[]
  readonly measures: EffectiveTrialMeasures
  readonly strategy: { readonly label: SearchStrategyLabel; readonly reasoning: string } | null
  readonly investigationParams: InvestigationParams
}

export function useCohortData(refreshToken: number): { videos: readonly CohortVideo[]; loading: boolean } {
  const [videos, setVideos] = useState<readonly CohortVideo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function build() {
      setLoading(true)
      const [allVideos, trackedIds, globalParams] = await Promise.all([
        listVideos(),
        listTrackedVideoIds(),
        loadInvestigationParams(),
      ])
      const params = globalParams ?? DEFAULT_INVESTIGATION_PARAMS
      const results: CohortVideo[] = []

      for (const video of allVideos) {
        if (!trackedIds.has(video.id)) continue
        const [stored, storedRoi, corrections, edits, overrides] = await Promise.all([
          loadTracks(video.id),
          loadRoi(video.id),
          loadCorrections(video.id),
          loadInvestigationEdits(video.id),
          loadMeasureOverrides(video.id),
        ])
        if (!stored || !storedRoi) continue

        const effective = applyCorrections(stored.tracks, corrections)
        const auto = detectInvestigations(effective, storedRoi.roi, params)
        const investigations = applyInvestigationEdits(auto, edits, storedRoi.roi.targetHole)
        const measures = applyMeasureOverrides(
          computeTrialMeasuresFromInvestigations(effective, storedRoi.roi, video.timebase, investigations),
          overrides,
        )
        const computedStrategy = classifySearchStrategy(effective, storedRoi.roi, investigations)
        const strategy = overrides.searchStrategy
          ? { label: overrides.searchStrategy, reasoning: computedStrategy?.reasoning ?? 'Manually set.' }
          : computedStrategy

        results.push({ video, roi: storedRoi.roi, effective, investigations, measures, strategy, investigationParams: params })
      }

      if (!cancelled) {
        setVideos(results)
        setLoading(false)
      }
    }
    void build()
    return () => {
      cancelled = true
    }
  }, [refreshToken])

  return { videos, loading }
}
