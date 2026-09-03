/**
 * Step 5: export every tracked video's trial measures and hole-investigation
 * detail to CSV/XLSX -- one tidy row per trial, one row per investigation,
 * parameters and the tool version embedded in both, per the brief.
 *
 * Recomputes from scratch on each load (tracks + corrections + ROI +
 * investigation edits/overrides), the same pipeline the review workspace
 * uses -- there's no separately cached "export" copy of a trial's numbers
 * to go stale.
 */

import { useEffect, useState } from 'react'
import { applyCorrections } from '../core/corrections.ts'
import { DEFAULT_INVESTIGATION_PARAMS, detectInvestigations } from '../core/events.ts'
import { applyInvestigationEdits } from '../core/investigationEdits.ts'
import { applyMeasureOverrides } from '../core/measureOverrides.ts'
import { computeTrialMeasuresFromInvestigations } from '../core/measures.ts'
import { classifySearchStrategy } from '../core/searchStrategy.ts'
import { loadCorrections } from '../state/correctionStore.ts'
import { loadInvestigationEdits } from '../state/investigationEditsStore.ts'
import { loadInvestigationParams } from '../state/investigationParamsStore.ts'
import { loadMeasureOverrides } from '../state/measureOverridesStore.ts'
import { loadRoi } from '../state/roiStore.ts'
import { loadTracks, listTrackedVideoIds } from '../state/trackStore.ts'
import { listVideos } from '../state/videoStore.ts'
import { buildInvestigationRows, buildTrialRow, type InvestigationRow, type TrialRow } from '../io/exportRows.ts'
import { downloadInvestigationsCsv, downloadTrialsCsv, downloadWorkbook } from '../io/sheets.ts'

interface Props {
  /** Changes whenever a tracking run finishes anywhere, prompting a rebuild. */
  readonly trackingRefreshToken: number
}

function timestamp(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function ExportPanel({ trackingRefreshToken }: Props) {
  const [trials, setTrials] = useState<readonly TrialRow[]>([])
  const [investigations, setInvestigations] = useState<readonly InvestigationRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function build() {
      setLoading(true)
      const [videos, trackedIds, globalParams] = await Promise.all([
        listVideos(),
        listTrackedVideoIds(),
        loadInvestigationParams(),
      ])
      const params = globalParams ?? DEFAULT_INVESTIGATION_PARAMS
      const trialRows: TrialRow[] = []
      const investigationRows: InvestigationRow[] = []

      for (const video of videos) {
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
        const effectiveInvestigations = applyInvestigationEdits(auto, edits, storedRoi.roi.targetHole)
        const measures = applyMeasureOverrides(
          computeTrialMeasuresFromInvestigations(effective, storedRoi.roi, video.timebase, effectiveInvestigations),
          overrides,
        )
        const computedStrategy = classifySearchStrategy(effective, storedRoi.roi, effectiveInvestigations)
        const strategy = overrides.searchStrategy
          ? { label: overrides.searchStrategy, reasoning: computedStrategy?.reasoning ?? 'Manually set.' }
          : computedStrategy

        trialRows.push(buildTrialRow(video.name, video.timebase, storedRoi.roi, measures, strategy, params))
        investigationRows.push(...buildInvestigationRows(video.name, video.timebase, effectiveInvestigations))
      }

      if (!cancelled) {
        setTrials(trialRows)
        setInvestigations(investigationRows)
        setLoading(false)
      }
    }
    void build()
    return () => {
      cancelled = true
    }
  }, [trackingRefreshToken])

  return (
    <section aria-labelledby="export-heading" className="export-panel">
      <h2 id="export-heading" className="step-heading">
        5. Export
      </h2>
      <p className="hint">
        One row per tracked video, plus one row per hole-investigation event. Both formats embed
        the detection threshold and the tool version used, so an exported number can be traced
        back to the settings that produced it.
      </p>

      {loading ? (
        <p className="hint">Gathering tracked videos…</p>
      ) : trials.length === 0 ? (
        <p className="hint">No tracked videos yet. Track at least one video above first.</p>
      ) : (
        <>
          <p className="status">
            {trials.length} tracked video{trials.length === 1 ? '' : 's'}, {investigations.length} hole
            investigation{investigations.length === 1 ? '' : 's'} ready to export.
          </p>
          <div className="button-row">
            <button
              type="button"
              onClick={() => downloadTrialsCsv(trials, `barnes-maze-trials-${timestamp()}.csv`)}
            >
              Download trials (CSV)
            </button>
            <button
              type="button"
              onClick={() =>
                downloadInvestigationsCsv(investigations, `barnes-maze-investigations-${timestamp()}.csv`)
              }
            >
              Download investigations (CSV)
            </button>
            <button
              type="button"
              onClick={() => downloadWorkbook(trials, investigations, `barnes-maze-export-${timestamp()}.xlsx`)}
            >
              Download XLSX (both sheets)
            </button>
          </div>
        </>
      )}
    </section>
  )
}
