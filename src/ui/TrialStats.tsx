/**
 * The computed per-trial numbers, under the video viewer.
 *
 * Grouped with one short description per group rather than one per card --
 * "Primary latency" and "Total latency" share a sentence about what latency
 * means here instead of each repeating it, so a card's own label can stay
 * short without becoming unclear (Elvis's feedback, 2026-09-03).
 */

import type { EffectiveFrame } from '../core/corrections.ts'
import { computeTrialMeasuresFromInvestigations } from '../core/measures.ts'
import type { RoiDefinition } from '../core/roi.ts'
import type { StoredVideoSummary } from '../state/schema.ts'
import type { EffectiveInvestigation } from '../core/investigationEdits.ts'

interface Props {
  readonly video: StoredVideoSummary
  readonly roi: RoiDefinition
  readonly effective: readonly EffectiveFrame[]
  readonly investigations: readonly EffectiveInvestigation[]
}

function formatSeconds(seconds: number | null): string {
  return seconds === null ? '—' : `${seconds.toFixed(2)}s`
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  )
}

export default function TrialStats({ video, roi, effective, investigations }: Props) {
  const measures = computeTrialMeasuresFromInvestigations(effective, roi, video.timebase, investigations)

  return (
    <div className="stat-groups">
      <div className="stat-group">
        <h4>Latency</h4>
        <p className="stat-group-desc">Time from the start of the trial.</p>
        <div className="stat-row">
          <StatCard label="To target" value={formatSeconds(measures.primaryLatencySeconds)} />
          <StatCard label="To escape" value={formatSeconds(measures.totalLatencySeconds)} />
        </div>
      </div>

      <div className="stat-group">
        <h4>Errors</h4>
        <p className="stat-group-desc">Non-target holes investigated.</p>
        <div className="stat-row">
          <StatCard label="Before target" value={String(measures.primaryErrors)} />
          <StatCard label="Whole trial" value={String(measures.totalErrors)} />
        </div>
      </div>

      <div className="stat-group">
        <h4>Path</h4>
        <div className="stat-row">
          <StatCard
            label="Length"
            value={measures.pathLengthCm === null ? '—' : `${measures.pathLengthCm.toFixed(1)} cm`}
          />
          <StatCard
            label="Avg. speed"
            value={
              measures.averageSpeedCmPerSecond === null
                ? '—'
                : `${measures.averageSpeedCmPerSecond.toFixed(1)} cm/s`
            }
          />
        </div>
      </div>

      {measures.quadrantTimeSeconds && (
        <div className="stat-group">
          <h4>Quadrant time</h4>
          <p className="stat-group-desc">
            Time spent in each quarter of the platform, oriented on the target — a standard
            spatial-memory readout: a search biased toward the target quadrant indicates the
            animal remembers where the target is.
          </p>
          <div className="stat-row">
            <StatCard label="Target" value={formatSeconds(measures.quadrantTimeSeconds.target)} />
            <StatCard
              label="Opposite"
              value={formatSeconds(measures.quadrantTimeSeconds.opposite)}
            />
            <StatCard
              label="Adjacent (CW)"
              value={formatSeconds(measures.quadrantTimeSeconds.adjacentClockwise)}
            />
            <StatCard
              label="Adjacent (CCW)"
              value={formatSeconds(measures.quadrantTimeSeconds.adjacentCounterClockwise)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
