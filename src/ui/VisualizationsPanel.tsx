/**
 * Step 6: cohort-level views on top of the per-trial numbers already shown
 * in step 4 -- where the animal spent its time, when each hole visit
 * happened, whether latency improved trial over trial, and how the tracked
 * videos compare to each other. Pure SVG/CSS, no charting library, matching
 * the rest of the app (see TrackViewer's shared-viewBox overlay pattern).
 *
 * Colorblind-safe by construction: every chart labels its values directly in
 * text rather than relying on a viewer distinguishing hues (heatmap cells
 * carry a `<title>` count, raster bars are shaped differently by kind, bars
 * print their own numbers) -- CLAUDE.md's "no meaning encoded by color
 * alone" applies to charts exactly as much as it does to the ROI editor.
 */

import { useMemo, useState } from 'react'
import { frameTimeSeconds } from '../core/timebase.ts'
import { computeOccupancyGrid } from '../core/occupancyGrid.ts'
import { groupConsecutiveInvestigations } from '../core/investigationEdits.ts'
import type { SearchStrategyLabel } from '../core/searchStrategy.ts'
import { useCohortData, type CohortVideo } from './useCohortData.ts'

interface Props {
  readonly trackingRefreshToken: number
}

const STRATEGY_LABEL: Record<SearchStrategyLabel, string> = {
  spatial: 'Spatial',
  serial: 'Serial',
  random: 'Random',
}

function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(1)}s`
}

/** One bar per visit (consecutive same-hole rows merged), not one per raw row -- an 8-row raster for 2 real visits would misread as 8 separate checks. */
function visitSpans(video: CohortVideo): { holeIndex: number; isTarget: boolean; kind: 'proximity' | 'occlusion' | 'manual'; startSeconds: number; endSeconds: number }[] {
  const grouped = groupConsecutiveInvestigations(video.investigations)
  const spans = new Map<number, { holeIndex: number; isTarget: boolean; kind: 'proximity' | 'occlusion' | 'manual'; startFrame: number; endFrame: number }>()
  for (const row of grouped) {
    const key = row.group
    const existing = spans.get(key)
    if (!existing) {
      spans.set(key, { holeIndex: row.holeIndex, isTarget: row.isTarget, kind: row.kind, startFrame: row.startFrame, endFrame: row.endFrame })
    } else {
      existing.startFrame = Math.min(existing.startFrame, row.startFrame)
      existing.endFrame = Math.max(existing.endFrame, row.endFrame)
      if (row.kind === 'occlusion') existing.kind = 'occlusion'
    }
  }
  return [...spans.values()].map((s) => ({
    holeIndex: s.holeIndex,
    isTarget: s.isTarget,
    kind: s.kind,
    startSeconds: frameTimeSeconds(video.video.timebase, s.startFrame),
    endSeconds: frameTimeSeconds(video.video.timebase, Math.min(s.endFrame, video.video.timebase.frameCount - 1)),
  }))
}

function OccupancyHeatmap({ video }: { video: CohortVideo }) {
  const grid = useMemo(() => computeOccupancyGrid(video.effective, video.roi, 16), [video])
  const roi = video.roi
  const originX = roi.center.x - roi.platformRadius
  const originY = roi.center.y - roi.platformRadius
  const size = roi.platformRadius * 2

  return (
    <div className="viz-chart">
      <svg
        viewBox={`${originX} ${originY} ${size} ${size}`}
        width={320}
        height={320}
        role="img"
        aria-label={`Occupancy heatmap for ${video.video.name}, busiest cell visited ${grid.maxCount} frames`}
      >
        {grid.counts.map((row, r) =>
          row.map((count, c) => {
            if (count === 0) return null
            const x = originX + c * grid.cellSize
            const y = originY + r * grid.cellSize
            const opacity = 0.12 + 0.75 * (count / grid.maxCount)
            return (
              <rect key={`${r}-${c}`} x={x} y={y} width={grid.cellSize} height={grid.cellSize} className="viz-heat-cell" style={{ opacity }}>
                <title>{count} frame{count === 1 ? '' : 's'}</title>
              </rect>
            )
          }),
        )}
        <circle cx={roi.center.x} cy={roi.center.y} r={roi.platformRadius} className="roi-platform" />
        {roi.holes.map((hole, i) => (
          <circle
            key={i}
            cx={hole.x}
            cy={hole.y}
            r={roi.holeRadius}
            className={roi.targetHole === i ? 'roi-hole--target' : 'roi-hole'}
          />
        ))}
      </svg>
      <p className="hint">
        Darker = more time spent there. Busiest cell: {grid.maxCount} tracked frame{grid.maxCount === 1 ? '' : 's'}.
      </p>
    </div>
  )
}

function HoleVisitRaster({ video }: { video: CohortVideo }) {
  const spans = useMemo(() => visitSpans(video), [video])
  const holeCount = video.roi.holes.length
  const duration = video.video.timebase.durationSeconds
  const rowHeight = 18
  const chartLeft = 40
  const chartWidth = 520
  const chartTop = 10
  const chartHeight = holeCount * rowHeight
  const width = chartLeft + chartWidth + 10
  const height = chartTop + chartHeight + 30

  const x = (seconds: number) => chartLeft + (seconds / duration) * chartWidth

  if (holeCount === 0) return <p className="hint">No holes defined for this video.</p>

  return (
    <div className="viz-chart">
      <svg viewBox={`0 0 ${width} ${height}`} width={600} height={Math.min(height, 420)} role="img" aria-label={`Hole visit timeline for ${video.video.name}`}>
        {Array.from({ length: holeCount }, (_, i) => (
          <g key={i}>
            <rect
              x={chartLeft}
              y={chartTop + i * rowHeight}
              width={chartWidth}
              height={rowHeight}
              className={i === video.roi.targetHole ? 'viz-raster-row viz-raster-row--target' : 'viz-raster-row'}
            />
            <text x={chartLeft - 6} y={chartTop + i * rowHeight + rowHeight / 2 + 4} textAnchor="end" className="viz-axis-label">
              {i === video.roi.targetHole ? 'T' : i + 1}
            </text>
          </g>
        ))}
        {spans.map((s, i) => {
          const barX = x(s.startSeconds)
          const barWidth = Math.max(2, x(s.endSeconds) - barX)
          return (
            <rect
              key={i}
              x={barX}
              y={chartTop + s.holeIndex * rowHeight + 2}
              width={barWidth}
              height={rowHeight - 4}
              className={s.kind === 'occlusion' ? 'viz-raster-bar viz-raster-bar--occlusion' : 'viz-raster-bar viz-raster-bar--proximity'}
            >
              <title>
                Hole {s.holeIndex + 1}{s.isTarget ? ' (target)' : ''}: {formatSeconds(s.startSeconds)}–{formatSeconds(s.endSeconds)} ({s.kind})
              </title>
            </rect>
          )
        })}
        <text x={chartLeft} y={chartTop + chartHeight + 16} className="viz-axis-label">0s</text>
        <text x={chartLeft + chartWidth} y={chartTop + chartHeight + 16} textAnchor="end" className="viz-axis-label">
          {formatSeconds(duration)}
        </text>
      </svg>
      <p className="hint">
        One bar per visit (consecutive same-hole checks merged). Solid border = tracker lost the
        animal near the hole (strong signal); thin border = nose came close while the body stayed
        visible.
      </p>
    </div>
  )
}

function LearningCurve({ cohort }: { cohort: readonly CohortVideo[] }) {
  const width = 520
  const height = 220
  const left = 50
  const top = 16
  const plotWidth = width - left - 20
  const plotHeight = height - top - 40
  const n = cohort.length
  const step = n > 1 ? plotWidth / (n - 1) : 0

  const maxLatency = Math.max(
    1,
    ...cohort.flatMap((v) => [v.measures.primaryLatencySeconds ?? 0, v.measures.totalLatencySeconds ?? 0]),
  )
  const yFor = (seconds: number) => top + plotHeight - (seconds / maxLatency) * plotHeight
  const xFor = (i: number) => left + i * step

  const line = (key: 'primaryLatencySeconds' | 'totalLatencySeconds') =>
    cohort
      .map((v, i) => (v.measures[key] !== null ? `${xFor(i)},${yFor(v.measures[key]!)}` : null))
      .filter((p): p is string => p !== null)
      .join(' ')

  return (
    <div className="viz-chart">
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label="Latency per video, in load order">
        <line x1={left} y1={top} x2={left} y2={top + plotHeight} className="viz-axis-line" />
        <line x1={left} y1={top + plotHeight} x2={left + plotWidth} y2={top + plotHeight} className="viz-axis-line" />
        <polyline points={line('primaryLatencySeconds')} className="viz-line viz-line--primary" />
        <polyline points={line('totalLatencySeconds')} className="viz-line viz-line--total" />
        {cohort.map((v, i) => (
          <g key={v.video.id}>
            {v.measures.primaryLatencySeconds !== null ? (
              <circle cx={xFor(i)} cy={yFor(v.measures.primaryLatencySeconds)} r={4} className="viz-point viz-point--primary">
                <title>{v.video.name}: to target {formatSeconds(v.measures.primaryLatencySeconds)}</title>
              </circle>
            ) : (
              <text x={xFor(i)} y={top + 12} textAnchor="middle" className="viz-never-marker">
                ⚠<title>{v.video.name}: never reached the target</title>
              </text>
            )}
            {v.measures.totalLatencySeconds !== null ? (
              <circle cx={xFor(i)} cy={yFor(v.measures.totalLatencySeconds)} r={4} className="viz-point viz-point--total">
                <title>{v.video.name}: to escape {formatSeconds(v.measures.totalLatencySeconds)}</title>
              </circle>
            ) : (
              <text x={xFor(i)} y={top + 26} textAnchor="middle" className="viz-never-marker">
                ⚠<title>{v.video.name}: never escaped</title>
              </text>
            )}
            <text x={xFor(i)} y={top + plotHeight + 16} textAnchor="middle" className="viz-axis-label">
              {v.video.name.length > 14 ? `${v.video.name.slice(0, 12)}…` : v.video.name}
            </text>
          </g>
        ))}
      </svg>
      <p className="hint">
        <span className="viz-legend-swatch viz-legend-swatch--primary" /> To target &nbsp;
        <span className="viz-legend-swatch viz-legend-swatch--total" /> To escape &nbsp; ⚠ never
        reached within the trial, not omitted. Order shown is load order, not necessarily trial
        order — rename or re-load videos in trial sequence if that matters for a given cohort.
      </p>
    </div>
  )
}

function CohortComparison({ cohort }: { cohort: readonly CohortVideo[] }) {
  const maxErrors = Math.max(1, ...cohort.map((v) => v.measures.totalErrors))
  return (
    <div className="viz-chart viz-comparison">
      {cohort.map((v) => (
        <div key={v.video.id} className="viz-comparison-row">
          <span className="viz-comparison-name">{v.video.name}</span>
          <div className="viz-bar-track">
            <div className="viz-bar viz-bar--primary" style={{ width: `${(v.measures.primaryErrors / maxErrors) * 100}%` }} />
          </div>
          <span className="viz-comparison-value">{v.measures.primaryErrors} before target</span>
          <div className="viz-bar-track">
            <div className="viz-bar viz-bar--total" style={{ width: `${(v.measures.totalErrors / maxErrors) * 100}%` }} />
          </div>
          <span className="viz-comparison-value">{v.measures.totalErrors} whole trial</span>
          <span className="status-chip">
            {v.strategy ? STRATEGY_LABEL[v.strategy.label] : 'Unclassified'}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function VisualizationsPanel({ trackingRefreshToken }: Props) {
  const { videos: cohort, loading } = useCohortData(trackingRefreshToken)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = cohort.find((v) => v.video.id === selectedId) ?? cohort[0] ?? null

  return (
    <section aria-labelledby="viz-heading" className="viz-panel">
      <h2 id="viz-heading" className="step-heading">
        6. Visualizations
      </h2>

      {loading ? (
        <p className="hint">Gathering tracked videos…</p>
      ) : cohort.length === 0 ? (
        <p className="hint">No tracked videos yet. Track at least one video above first.</p>
      ) : (
        <>
          <div className="viz-video-select">
            <label htmlFor="viz-video-picker">Video for occupancy and hole-visit views</label>
            <select id="viz-video-picker" value={selected?.video.id ?? ''} onChange={(e) => setSelectedId(e.target.value)}>
              {cohort.map((v) => (
                <option key={v.video.id} value={v.video.id}>
                  {v.video.name}
                </option>
              ))}
            </select>
          </div>

          {selected && (
            <div className="viz-grid">
              <div>
                <h3>Occupancy heatmap</h3>
                <OccupancyHeatmap video={selected} />
              </div>
              <div>
                <h3>Hole-visit timeline</h3>
                <HoleVisitRaster video={selected} />
              </div>
            </div>
          )}

          <div>
            <h3>Learning curve</h3>
            {cohort.length < 2 ? (
              <p className="hint">Track at least two videos to compare latency trial over trial.</p>
            ) : (
              <LearningCurve cohort={cohort} />
            )}
          </div>

          <div>
            <h3>Cohort comparison</h3>
            <CohortComparison cohort={cohort} />
          </div>
        </>
      )}
    </section>
  )
}
