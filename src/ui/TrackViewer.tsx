/**
 * The video viewer half of the review workspace: scrub to a frame, see the
 * overlay, drag a point to fix it.
 *
 * Scope, stated plainly because it's easy to assume more is here than is:
 * this lets you reposition a point on a frame the tracker already called
 * TRACKED. It does not (yet) let you relabel a frame's state -- turn a LOST
 * or OCCLUDED_IN_HOLE frame into a tracked one. That's real, planned work,
 * just not this pass (see CLAUDE.md).
 *
 * Data (tracks, corrections, frame index, the decoded image) is owned by
 * `useTrackReview`, one level up, so the investigation panel beside this
 * viewer can share the exact same frame index -- see ReviewWorkspace.
 */

import { useCallback, useRef, useState } from 'react'
import type { Point } from '../core/geometry.ts'
import type { RoiDefinition } from '../core/roi.ts'
import type { FrameTrack } from '../core/tracking.ts'
import type { StoredVideoSummary } from '../state/schema.ts'
import FrameScrubber from './FrameScrubber.tsx'
import type { TrackReview } from './useTrackReview.ts'

interface Props {
  readonly video: StoredVideoSummary
  readonly roi: RoiDefinition
  readonly review: TrackReview
}

/** How close (view units) a click has to land to jump to that frame. */
const PATH_CLICK_TOLERANCE = 14

// "LOST" reads as a tracking failure; most of it is just the animal not yet
// placed on the platform at the start of a clip, which is normal, not an
// error (Elvis's feedback, 2026-09-03). A genuine tracking failure inside a
// trial looks the same here and is fixable the same way: scrub to it and
// correct it by hand once state-relabeling ships.
const STATE_LABEL: Record<FrameTrack['state'], string> = {
  TRACKED: 'Tracked',
  LOST: 'Mouse not in view',
  OCCLUDED_IN_HOLE: 'In a hole',
  IN_ESCAPE_BOX: 'Escaped',
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export default function TrackViewer({ video, roi, review }: Props) {
  const [expanded, setExpanded] = useState(true)
  const [drag, setDrag] = useState<'centroid' | 'nose' | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const { effective, current, frameIndex, setFrameIndex, frameUrl, pins, togglePin } = review

  const pointFromEvent = useCallback((event: { clientX: number; clientY: number }): Point | null => {
    const svg = svgRef.current
    if (!svg) return null
    const ctm = svg.getScreenCTM()
    if (!ctm) return null
    const local = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse())
    return { x: local.x, y: local.y }
  }, [])

  const onPointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (!drag) return
      const point = pointFromEvent(event)
      if (!point) return
      review.setCorrection(point, drag)
    },
    [drag, pointFromEvent, review],
  )

  const onSvgClick = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (drag || !effective) return
      const point = pointFromEvent(event)
      if (!point) return
      let bestIndex: number | null = null
      let bestDistance = PATH_CLICK_TOLERANCE
      for (const frame of effective) {
        if (frame.state !== 'TRACKED' || !frame.centroid) continue
        const d = distance(point, frame.centroid)
        if (d < bestDistance) {
          bestDistance = d
          bestIndex = frame.frameIndex
        }
      }
      if (bestIndex !== null) setFrameIndex(bestIndex)
    },
    [drag, effective, pointFromEvent, setFrameIndex],
  )

  const correctedFrames = [...review.corrections.keys()].sort((a, b) => a - b)
  const points = (effective ?? [])
    .filter((f) => f.state === 'TRACKED' && f.centroid)
    .map((f) => f.centroid!)

  return (
    <div className="track-viewer">
      <div className="correction-toolbar">
        <button type="button" onClick={() => setExpanded((e) => !e)}>
          {expanded ? 'Shrink viewer' : 'Expand viewer'}
        </button>
        <span className="hint">
          Corrected: {correctedFrames.length === 0 ? 'none' : correctedFrames.map((i) => i + 1).join(', ')}
        </span>
      </div>

      {frameUrl && (
        <svg
          ref={svgRef}
          className={`correction-canvas${expanded ? ' correction-canvas--expanded' : ''}`}
          viewBox="0 0 640 480"
          width={640}
          height={480}
          role="application"
          aria-label={`Frame ${frameIndex + 1} of ${video.name}, tracker state: ${current ? STATE_LABEL[current.state] : 'unknown'}`}
          onClick={onSvgClick}
          onPointerMove={onPointerMove}
          onPointerUp={() => setDrag(null)}
          onPointerLeave={() => setDrag(null)}
        >
          <image href={frameUrl} x={0} y={0} width={640} height={480} />

          <circle cx={roi.center.x} cy={roi.center.y} r={roi.platformRadius} className="roi-platform" />
          {roi.holes.map((hole, i) => {
            const isTarget = roi.targetHole === i
            // Label sits outside the ring, along the line from the platform
            // centre through the hole, so it never covers the hole itself or
            // the animal passing through it (Elvis's feedback, 2026-09-03).
            const dx = hole.x - roi.center.x
            const dy = hole.y - roi.center.y
            const len = Math.hypot(dx, dy) || 1
            const labelOffset = roi.holeRadius + 12
            const labelX = hole.x + (dx / len) * labelOffset
            const labelY = hole.y + (dy / len) * labelOffset
            return (
              <g key={i}>
                <circle
                  cx={hole.x}
                  cy={hole.y}
                  r={roi.holeRadius}
                  className={isTarget ? 'roi-hole--target' : 'roi-hole'}
                />
                {isTarget && (
                  <circle
                    cx={hole.x}
                    cy={hole.y}
                    r={roi.holeRadius + 5}
                    className="roi-hole--target-ring"
                  />
                )}
                <text x={labelX} y={labelY + 4} className="roi-hole-label roi-hole-label--outside">
                  {isTarget ? 'T' : i + 1}
                </text>
              </g>
            )
          })}

          <polyline
            points={points.map((p) => `${p.x},${p.y}`).join(' ')}
            className="tracking-path"
          />

          {current?.state === 'TRACKED' && current.centroid && (
            <g>
              <line
                x1={current.centroid.x}
                y1={current.centroid.y}
                x2={current.nose?.x ?? current.centroid.x}
                y2={current.nose?.y ?? current.centroid.y}
                className="correction-axis"
              />
              <circle
                cx={current.centroid.x}
                cy={current.centroid.y}
                r={8}
                className={`correction-point${current.isCorrected ? ' correction-point--manual' : ''}`}
                onPointerDown={(event) => {
                  event.stopPropagation()
                  setDrag('centroid')
                }}
              >
                <title>Drag to correct the body position</title>
              </circle>
              {current.nose && (
                <circle
                  cx={current.nose.x}
                  cy={current.nose.y}
                  r={5}
                  className={`correction-point correction-point--nose${current.isCorrected ? ' correction-point--manual' : ''}`}
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    setDrag('nose')
                  }}
                >
                  <title>Drag to correct the nose position</title>
                </circle>
              )}
            </g>
          )}

          {current && current.state !== 'TRACKED' && (
            <text x={320} y={30} className="correction-state-badge">
              {STATE_LABEL[current.state]}
              {current.holeIndex !== null ? ` — hole ${current.holeIndex + 1}` : ''}
            </text>
          )}
        </svg>
      )}

      <FrameScrubber
        timebase={video.timebase}
        frameIndex={frameIndex}
        onFrameChange={setFrameIndex}
        pins={pins}
        onTogglePin={togglePin}
      />

      <div className="button-row">
        <button
          type="button"
          disabled={!review.corrections.has(frameIndex)}
          title={
            review.corrections.has(frameIndex)
              ? "Undo your manual fix for this frame and restore the tracker's original detected position."
              : 'No manual correction on this frame to undo.'
          }
          onClick={() => review.revertCorrection()}
        >
          Undo correction on this frame
        </button>
      </div>

      {current && current.state !== 'TRACKED' && (
        <p className="hint">
          This frame is marked &ldquo;{STATE_LABEL[current.state]}&rdquo;, so there&rsquo;s no
          automatic point to correct here. Relabeling a frame&rsquo;s state by hand is planned but
          not built yet.
        </p>
      )}
    </div>
  )
}
