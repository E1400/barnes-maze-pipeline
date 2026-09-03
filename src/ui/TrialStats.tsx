/**
 * The computed per-trial numbers, under the video viewer.
 *
 * Grouped with one description per group rather than one per card --
 * "Primary latency" and "Total latency" share a sentence about what latency
 * means here instead of each repeating it, so a card's own label can stay
 * short without becoming unclear (Elvis's feedback, 2026-09-03).
 *
 * Every card is editable via the single "Edit" toggle at the top, not a
 * per-card control -- a manual override overlays the computed value exactly
 * like a position correction overlays a raw detection (see
 * core/measureOverrides.ts), never mutating the computation itself.
 */

import { useState } from 'react'
import type { EffectiveFrame } from '../core/corrections.ts'
import type { EffectiveInvestigation } from '../core/investigationEdits.ts'
import { computeTrialMeasuresFromInvestigations } from '../core/measures.ts'
import type { MeasureOverrides } from '../core/measureOverrides.ts'
import type { RoiDefinition } from '../core/roi.ts'
import { classifySearchStrategy, type SearchStrategyLabel } from '../core/searchStrategy.ts'
import type { StoredVideoSummary } from '../state/schema.ts'
import { useMeasureOverrides } from './useMeasureOverrides.ts'

interface Props {
  readonly video: StoredVideoSummary
  readonly roi: RoiDefinition
  readonly effective: readonly EffectiveFrame[]
  readonly investigations: readonly EffectiveInvestigation[]
}

function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(2)}s`
}

interface FieldProps {
  readonly label: string
  readonly computedValue: number | null
  readonly overrideValue: number | undefined
  readonly format: (value: number) => string
  readonly editing: boolean
  readonly onChange: (value: number) => void
  readonly onRevert: () => void
}

function NumericField({ label, computedValue, overrideValue, format, editing, onChange, onRevert }: FieldProps) {
  const isOverridden = overrideValue !== undefined
  const displayValue = isOverridden ? overrideValue : computedValue
  return (
    <div className={`stat-card${isOverridden ? ' stat-card--overridden' : ''}`}>
      <span className="stat-label">{label}</span>
      {editing ? (
        <div className="stat-edit">
          <input
            type="number"
            step="any"
            value={displayValue ?? ''}
            onChange={(e) => onChange(Number(e.target.value))}
          />
          {isOverridden && (
            <button type="button" title="Revert to the computed value" onClick={onRevert}>
              ↺
            </button>
          )}
        </div>
      ) : (
        <span className="stat-value">
          {displayValue === null ? '—' : format(displayValue)}
          {isOverridden && (
            <span className="stat-overridden-tag" title="Manually entered, not computed">
              {' '}
              (manual)
            </span>
          )}
        </span>
      )}
    </div>
  )
}

const STRATEGY_LABEL: Record<SearchStrategyLabel, string> = {
  spatial: 'Spatial',
  serial: 'Serial',
  random: 'Random',
}

export default function TrialStats({ video, roi, effective, investigations }: Props) {
  const measures = computeTrialMeasuresFromInvestigations(effective, roi, video.timebase, investigations)
  const strategy = classifySearchStrategy(effective, roi, investigations)
  const overrides = useMeasureOverrides(video)
  const [editing, setEditing] = useState(false)

  const field = (key: keyof MeasureOverrides, computedValue: number | null) => ({
    computedValue,
    overrideValue: overrides.overrides[key] as number | undefined,
    editing,
    onChange: (value: number) => overrides.set(key, value),
    onRevert: () => overrides.clear(key),
  })

  const strategyOverride = overrides.overrides.searchStrategy
  const strategyLabel = strategyOverride ?? strategy?.label ?? null

  return (
    <div className="stat-groups">
      <div className="stat-groups-header">
        <h3>Trial measures</h3>
        <button
          type="button"
          title={editing ? 'Finish editing' : 'Manually correct any value the computation got wrong'}
          onClick={() => setEditing((e) => !e)}
        >
          {editing ? 'Done editing' : 'Edit'}
        </button>
      </div>

      <div className="stat-group">
        <h4>Latency</h4>
        <p className="stat-group-desc">Time from the start of the trial.</p>
        <div className="stat-row">
          <NumericField label="To target" format={formatSeconds} {...field('primaryLatencySeconds', measures.primaryLatencySeconds)} />
          <NumericField label="To escape" format={formatSeconds} {...field('totalLatencySeconds', measures.totalLatencySeconds)} />
        </div>
      </div>

      <div className="stat-group">
        <h4>Errors</h4>
        <p className="stat-group-desc">
          Distinct non-target holes investigated — a hole checked repeatedly still counts once.
        </p>
        <div className="stat-row">
          <NumericField label="Before target" format={(v) => String(v)} {...field('primaryErrors', measures.primaryErrors)} />
          <NumericField label="Whole trial" format={(v) => String(v)} {...field('totalErrors', measures.totalErrors)} />
        </div>
      </div>

      <div className="stat-group">
        <h4>Path</h4>
        <div className="stat-row">
          <NumericField
            label="Length"
            format={(v) => `${v.toFixed(1)} cm`}
            {...field('pathLengthCm', measures.pathLengthCm)}
          />
          <NumericField
            label="Avg. speed"
            format={(v) => `${v.toFixed(1)} cm/s`}
            {...field('averageSpeedCmPerSecond', measures.averageSpeedCmPerSecond)}
          />
        </div>
      </div>

      {measures.quadrantTimeSeconds && (
        <div className="stat-group">
          <h4>Quadrant time</h4>
          <p className="stat-group-desc">
            Time spent in each quarter of the platform, oriented on the target — a standard
            spatial-memory readout: a search biased toward quadrant 1 (the target&rsquo;s own
            quadrant) indicates the animal remembers where the target is. Quadrant 1-4 are numbered
            clockwise from the target; see the legend in step 2 for which is which on this video.
          </p>
          <div className="stat-row">
            <NumericField
              label="Quadrant 1"
              format={formatSeconds}
              {...field('quadrantTargetSeconds', measures.quadrantTimeSeconds.target)}
            />
            <NumericField
              label="Quadrant 2"
              format={formatSeconds}
              {...field('quadrantAdjacentClockwiseSeconds', measures.quadrantTimeSeconds.adjacentClockwise)}
            />
            <NumericField
              label="Quadrant 3"
              format={formatSeconds}
              {...field('quadrantOppositeSeconds', measures.quadrantTimeSeconds.opposite)}
            />
            <NumericField
              label="Quadrant 4"
              format={formatSeconds}
              {...field('quadrantAdjacentCounterClockwiseSeconds', measures.quadrantTimeSeconds.adjacentCounterClockwise)}
            />
          </div>
        </div>
      )}

      <div className="stat-group">
        <h4>Search strategy</h4>
        <p className="stat-group-desc">
          {strategy === null
            ? 'Set a target hole and track the video to classify the search.'
            : strategy.reasoning}
        </p>
        <div className={`stat-card${strategyOverride !== undefined ? ' stat-card--overridden' : ''}`}>
          <span className="stat-label">Label</span>
          {editing ? (
            <div className="stat-edit">
              <select
                value={strategyLabel ?? ''}
                disabled={strategy === null}
                onChange={(e) => overrides.set('searchStrategy', e.target.value as SearchStrategyLabel)}
              >
                <option value="" disabled>
                  Choose…
                </option>
                <option value="spatial">Spatial</option>
                <option value="serial">Serial</option>
                <option value="random">Random</option>
              </select>
              {strategyOverride !== undefined && (
                <button
                  type="button"
                  title="Revert to the computed classification"
                  onClick={() => overrides.clear('searchStrategy')}
                >
                  ↺
                </button>
              )}
            </div>
          ) : (
            <span className="stat-value">
              {strategyLabel === null ? '—' : STRATEGY_LABEL[strategyLabel]}
              {strategyOverride !== undefined && (
                <span className="stat-overridden-tag" title="Manually set, not computed">
                  {' '}
                  (manual)
                </span>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
