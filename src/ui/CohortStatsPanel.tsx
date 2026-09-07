/**
 * Cohort statistics: a two-group comparison computed entirely in the
 * browser, so a facility can ask "is group A different from group B" on a
 * measure without exporting to R, SPSS, or Prism first.
 *
 * Mann-Whitney U (src/core/statistics.ts), not a t-test -- see that
 * module's own doc comment for why a rank-based test is the more
 * defensible default for small, likely-non-normal animal cohorts.
 *
 * Group assignment is local UI state, not persisted: which videos count as
 * "control" vs "treatment" is a framing decision for a given question, not
 * a property of the video itself, and different questions may group the
 * same cohort differently.
 */

import { useMemo, useState } from 'react'
import type { TrialMeasures } from '../core/measures.ts'
import { mannWhitneyU } from '../core/statistics.ts'
import { useCohortData } from './useCohortData.ts'

type Group = 'A' | 'B' | null

type MeasureKey = keyof Pick<
  TrialMeasures,
  'primaryLatencySeconds' | 'totalLatencySeconds' | 'primaryErrors' | 'totalErrors' | 'pathLengthCm' | 'averageSpeedCmPerSecond'
>

const MEASURES: { readonly key: MeasureKey; readonly label: string; readonly unit: string }[] = [
  { key: 'primaryLatencySeconds', label: 'Primary latency', unit: 's' },
  { key: 'totalLatencySeconds', label: 'Total latency', unit: 's' },
  { key: 'primaryErrors', label: 'Primary errors', unit: '' },
  { key: 'totalErrors', label: 'Total errors', unit: '' },
  { key: 'pathLengthCm', label: 'Path length', unit: 'cm' },
  { key: 'averageSpeedCmPerSecond', label: 'Average speed', unit: 'cm/s' },
]

function formatNumber(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '—'
}

interface Props {
  readonly trackingRefreshToken: number
}

export default function CohortStatsPanel({ trackingRefreshToken }: Props) {
  const { videos: cohort, loading } = useCohortData(trackingRefreshToken)
  const [groups, setGroups] = useState<Record<string, Group>>({})
  const [measureKey, setMeasureKey] = useState<MeasureKey>('primaryLatencySeconds')
  const measure = MEASURES.find((m) => m.key === measureKey)!

  const groupOf = (videoId: string): Group => groups[videoId] ?? null

  const { valuesA, valuesB, excludedNull } = useMemo(() => {
    const a: number[] = []
    const b: number[] = []
    let excluded = 0
    for (const video of cohort) {
      const group = groups[video.video.id] ?? null
      if (group === null) continue
      const value = video.measures[measureKey]
      if (value === null) {
        excluded++
        continue
      }
      if (group === 'A') a.push(value)
      else b.push(value)
    }
    return { valuesA: a, valuesB: b, excludedNull: excluded }
  }, [cohort, groups, measureKey])

  const result = useMemo(() => mannWhitneyU(valuesA, valuesB), [valuesA, valuesB])

  return (
    <div className="viz-card">
      <h3>Cohort statistics</h3>
      <p className="hint">
        Assign videos to two groups, pick a measure, and compare them with a Mann-Whitney U test
        (no assumption of a normal distribution, appropriate for small cohorts).
      </p>

      {loading ? (
        <p className="hint">Gathering tracked videos…</p>
      ) : cohort.length === 0 ? (
        <p className="hint">No tracked videos yet.</p>
      ) : (
        <>
          <table className="stats-assign-table">
            <thead>
              <tr>
                <th scope="col">Video</th>
                <th scope="col">Group</th>
              </tr>
            </thead>
            <tbody>
              {cohort.map((video) => (
                <tr key={video.video.id}>
                  <th scope="row">{video.video.name}</th>
                  <td>
                    <div className="stats-group-radios" role="radiogroup" aria-label={`Group for ${video.video.name}`}>
                      {(['A', 'B', null] as const).map((option) => (
                        <label key={option ?? 'none'}>
                          <input
                            type="radio"
                            name={`group-${video.video.id}`}
                            checked={groupOf(video.video.id) === option}
                            onChange={() => setGroups((g) => ({ ...g, [video.video.id]: option }))}
                          />
                          {option ?? 'None'}
                        </label>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <label className="stats-measure-picker">
            Measure
            <select value={measureKey} onChange={(e) => setMeasureKey(e.target.value as MeasureKey)}>
              {MEASURES.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          {excludedNull > 0 && (
            <p className="hint">
              {excludedNull} assigned video{excludedNull === 1 ? '' : 's'} skipped -- {measure.label.toLowerCase()}{' '}
              isn&rsquo;t available for {excludedNull === 1 ? 'it' : 'them'} yet.
            </p>
          )}

          {valuesA.length === 0 || valuesB.length === 0 ? (
            <p className="hint">Assign at least one video to each group to run the test.</p>
          ) : (
            <>
              <div className="stats-groups-row">
                <div className="stats-group-summary">
                  <span className="stats-group-summary-label">Group A (n={result.groupA.n})</span>
                  <span>
                    mean {formatNumber(result.groupA.mean)}
                    {measure.unit}, median {formatNumber(result.groupA.median)}
                    {measure.unit}
                  </span>
                </div>
                <div className="stats-group-summary">
                  <span className="stats-group-summary-label">Group B (n={result.groupB.n})</span>
                  <span>
                    mean {formatNumber(result.groupB.mean)}
                    {measure.unit}, median {formatNumber(result.groupB.median)}
                    {measure.unit}
                  </span>
                </div>
              </div>
              <p className="stats-result">
                Mann-Whitney U = {formatNumber(result.u, 1)}, p = {result.pValue === null ? '—' : formatNumber(result.pValue, 4)}
                {result.pValue !== null && result.pValue < 0.05 ? ' (significant at α=0.05)' : ' (not significant at α=0.05)'}
              </p>
              {result.smallSample && (
                <p className="hint">
                  Fewer than 8 videos in at least one group -- the normal approximation used for the
                  p-value is a rough guide here, not a precise result.
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
