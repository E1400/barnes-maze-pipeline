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
 *
 * Every chart is a real, standalone `<svg>`, so each gets its own SVG/PNG
 * download via chartExport.ts -- "visualizations, generously... exportable"
 * per CLAUDE.md's non-negotiables means exportable as files, not just
 * visible on screen (Elvis's feedback, 2026-09-04).
 */

import { useMemo, useRef, useState } from 'react'
import { frameTimeSeconds } from '../core/timebase.ts'
import { computeOccupancyGrid } from '../core/occupancyGrid.ts'
import { groupConsecutiveInvestigations } from '../core/investigationEdits.ts'
import type { SearchStrategyLabel } from '../core/searchStrategy.ts'
import { downloadSvgAsPng, downloadSvgFile } from '../io/chartExport.ts'
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

function fileStem(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '_')
}

/** The chart's own background is transparent (it sits on `.viz-chart`'s surface); a downloaded PNG needs a real fill or it loses its axis lines and text against a dark viewer. */
function currentBackground(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
  return value || '#ffffff'
}

function ChartDownloadButtons({ svgRef, filenameBase }: { svgRef: React.RefObject<SVGSVGElement | null>; filenameBase: string }) {
  return (
    <div className="button-row viz-download-row">
      <button
        type="button"
        onClick={() => svgRef.current && downloadSvgFile(svgRef.current, `${filenameBase}.svg`)}
      >
        Download SVG
      </button>
      <button
        type="button"
        onClick={() => {
          if (!svgRef.current) return
          void downloadSvgAsPng(svgRef.current, `${filenameBase}.png`, currentBackground())
        }}
      >
        Download PNG
      </button>
    </div>
  )
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
  const svgRef = useRef<SVGSVGElement>(null)
  const grid = useMemo(() => computeOccupancyGrid(video.effective, video.roi, 16), [video])
  const roi = video.roi
  const originX = roi.center.x - roi.platformRadius
  const originY = roi.center.y - roi.platformRadius
  const size = roi.platformRadius * 2

  return (
    <div className="viz-chart">
      <svg
        ref={svgRef}
        viewBox={`${originX} ${originY} ${size} ${size}`}
        width={320}
        height={320}
        role="img"
        aria-label={`Occupancy heatmap for ${video.video.name}, busiest cell visited ${grid.maxCount} frames`}
      >
        <rect x={originX} y={originY} width={size} height={size} className="viz-chart-bg" />
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
      <ChartDownloadButtons svgRef={svgRef} filenameBase={`${fileStem(video.video.name)}-occupancy`} />
    </div>
  )
}

function HoleVisitRaster({ video }: { video: CohortVideo }) {
  const svgRef = useRef<SVGSVGElement>(null)
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
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        width={600}
        height={Math.min(height, 420)}
        role="img"
        aria-label={`Hole visit timeline for ${video.video.name}`}
      >
        <rect x={0} y={0} width={width} height={height} className="viz-chart-bg" />
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
      <ChartDownloadButtons svgRef={svgRef} filenameBase={`${fileStem(video.video.name)}-hole-visits`} />
    </div>
  )
}

/** "Nice" tick step for an axis spanning 0..max, in a 1/2/5 x 10^n progression, so labels read as round numbers rather than an arbitrary quarter-fraction of the busiest trial. */
function niceTickStep(max: number, targetTicks: number): number {
  const rawStep = max / targetTicks
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const normalized = rawStep / magnitude
  const step = normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10
  return step * magnitude
}

function LearningCurve({ cohort }: { cohort: readonly CohortVideo[] }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const width = 560
  const height = 240
  const left = 56
  const top = 16
  const plotWidth = width - left - 20
  const plotHeight = height - top - 40
  const n = cohort.length
  const step = n > 1 ? plotWidth / (n - 1) : 0

  const rawMax = Math.max(
    1,
    ...cohort.flatMap((v) => [v.measures.primaryLatencySeconds ?? 0, v.measures.totalLatencySeconds ?? 0]),
  )
  const tickStep = niceTickStep(rawMax, 4)
  const maxLatency = Math.ceil(rawMax / tickStep) * tickStep
  const ticks = Array.from({ length: Math.round(maxLatency / tickStep) + 1 }, (_, i) => i * tickStep)

  const yFor = (seconds: number) => top + plotHeight - (seconds / maxLatency) * plotHeight
  const xFor = (i: number) => left + i * step

  const line = (key: 'primaryLatencySeconds' | 'totalLatencySeconds') =>
    cohort
      .map((v, i) => (v.measures[key] !== null ? `${xFor(i)},${yFor(v.measures[key]!)}` : null))
      .filter((p): p is string => p !== null)
      .join(' ')

  return (
    <div className="viz-chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label="Latency per video, in load order"
      >
        <rect x={0} y={0} width={width} height={height} className="viz-chart-bg" />
        {ticks.map((seconds) => (
          <g key={seconds}>
            <line x1={left} y1={yFor(seconds)} x2={left + plotWidth} y2={yFor(seconds)} className="viz-gridline" />
            <text x={left - 6} y={yFor(seconds) + 3} textAnchor="end" className="viz-axis-label">
              {seconds}s
            </text>
          </g>
        ))}
        <text
          x={14}
          y={top + plotHeight / 2}
          textAnchor="middle"
          className="viz-axis-label"
          transform={`rotate(-90 14 ${top + plotHeight / 2})`}
        >
          Latency (s)
        </text>
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
      <ChartDownloadButtons svgRef={svgRef} filenameBase="cohort-learning-curve" />
    </div>
  )
}

function CohortComparison({ cohort }: { cohort: readonly CohortVideo[] }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const maxErrors = Math.max(1, ...cohort.map((v) => v.measures.totalErrors))

  const rowHeight = 30
  const nameWidth = 110
  const barWidth = 110
  const barGap = 44
  const barLeft = 12 + nameWidth
  const strategyLeft = barLeft + barWidth + barGap + barWidth + 36
  const width = strategyLeft + 90
  const height = cohort.length * rowHeight + 40
  const barScale = (value: number) => (value / maxErrors) * barWidth

  return (
    <div className="viz-chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        width={Math.min(width, 640)}
        height={height}
        role="img"
        aria-label="Errors and search strategy per video"
      >
        <rect x={0} y={0} width={width} height={height} className="viz-chart-bg" />
        <text x={barLeft} y={16} className="viz-axis-label">Errors before target</text>
        <text x={barLeft + barWidth + barGap} y={16} className="viz-axis-label">Errors, whole trial</text>
        <text x={strategyLeft} y={16} className="viz-axis-label">Strategy</text>
        {cohort.map((v, i) => {
          const y = 26 + i * rowHeight
          return (
            <g key={v.video.id}>
              <text x={8} y={y + 14} className="viz-axis-label viz-comparison-name-label">
                {v.video.name.length > 16 ? `${v.video.name.slice(0, 14)}…` : v.video.name}
              </text>
              <rect x={barLeft} y={y} width={barWidth} height={12} className="viz-bar-track-svg" />
              <rect x={barLeft} y={y} width={barScale(v.measures.primaryErrors)} height={12} className="viz-bar-svg viz-bar-svg--primary" />
              <text x={barLeft + barWidth + 6} y={y + 10} className="viz-axis-label">{v.measures.primaryErrors}</text>

              <rect x={barLeft + barWidth + barGap} y={y} width={barWidth} height={12} className="viz-bar-track-svg" />
              <rect
                x={barLeft + barWidth + barGap}
                y={y}
                width={barScale(v.measures.totalErrors)}
                height={12}
                className="viz-bar-svg viz-bar-svg--total"
              />
              <text x={barLeft + barWidth + barGap + barWidth + 6} y={y + 10} className="viz-axis-label">
                {v.measures.totalErrors}
              </text>

              <text x={strategyLeft} y={y + 10} className="viz-axis-label viz-strategy-label">
                {v.strategy ? STRATEGY_LABEL[v.strategy.label] : 'Unclassified'}
              </text>
            </g>
          )
        })}
      </svg>
      <p className="hint">
        Distinct non-target holes checked, before the target and across the whole trial. Search
        strategy is printed as text, never color alone.
      </p>
      <ChartDownloadButtons svgRef={svgRef} filenameBase="cohort-comparison" />
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
