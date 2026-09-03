/**
 * Step 4: review the track frame by frame, and fix a point that's wrong.
 *
 * Scope, stated plainly because it's easy to assume more is here than is:
 * this lets you reposition a point on a frame the tracker already called
 * TRACKED. It does not (yet) let you relabel a frame's state -- turn a LOST
 * or OCCLUDED_IN_HOLE frame into a tracked one, or mark a hole investigation
 * by hand. That's real, planned work, just not this pass (see CLAUDE.md).
 *
 * Corrections are stored separately from the tracker's own output (see
 * core/corrections.ts) so a corrected frame is always visually distinct from
 * an automatic one, and reverting just deletes the override.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { applyCorrections, type Corrections, type EffectiveFrame } from '../core/corrections.ts'
import type { Point } from '../core/geometry.ts'
import type { RoiDefinition } from '../core/roi.ts'
import type { FrameTrack } from '../core/tracking.ts'
import { loadCorrections, saveCorrections } from '../state/correctionStore.ts'
import { loadRoi, updatePins } from '../state/roiStore.ts'
import type { StoredVideoSummary } from '../state/schema.ts'
import { loadTracks } from '../state/trackStore.ts'
import { getVideo } from '../state/videoStore.ts'
import FrameScrubber from './FrameScrubber.tsx'
import { openFrameSource, type FrameSource } from './frameSource.ts'
import type { TrackingJob } from './useTrackingJob.ts'

interface Props {
  readonly video: StoredVideoSummary
  readonly roi: RoiDefinition | null
  readonly trackingJob: TrackingJob
}

const SAVE_DEBOUNCE_MS = 250
const MAX_SAVE_DELAY_MS = 750

/** How close (view units) a click has to land to jump to that frame. */
const PATH_CLICK_TOLERANCE = 14

const STATE_LABEL: Record<FrameTrack['state'], string> = {
  TRACKED: 'Tracked',
  LOST: 'Tracking lost',
  OCCLUDED_IN_HOLE: 'In a hole',
  IN_ESCAPE_BOX: 'Escaped',
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export default function CorrectionViewer({ video, roi, trackingJob }: Props) {
  const [tracks, setTracks] = useState<readonly FrameTrack[] | null>(null)
  const [corrections, setCorrections] = useState<Corrections>(new Map())
  const [pins, setPins] = useState<number[]>([])
  const [frameIndex, setFrameIndex] = useState(0)
  const [frameUrl, setFrameUrl] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [drag, setDrag] = useState<'centroid' | 'nose' | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  // Reloads whenever a run finishes anywhere, so a fresh run's results show
  // up without a manual refresh.
  useEffect(() => {
    let cancelled = false
    void loadTracks(video.id).then((stored) => {
      if (!cancelled) setTracks(stored?.tracks ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [video.id, trackingJob.completedCount])

  useEffect(() => {
    let cancelled = false
    void loadCorrections(video.id).then((stored) => {
      if (!cancelled) setCorrections(stored)
    })
    void loadRoi(video.id).then((stored) => {
      if (!cancelled) setPins(stored?.pins ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [video.id])

  // State, not a ref: the frame-grab effect below needs to re-run once the
  // source finishes opening (an async step), and mutating a ref doesn't
  // trigger that -- it would only ever see the ref's value from the instant
  // the effect first ran, which is always null (opening hasn't resolved
  // yet). This mirrors RoiEditor's frame-source handling exactly.
  const [source, setSource] = useState<FrameSource | null>(null)
  useEffect(() => {
    let cancelled = false
    let opened: FrameSource | null = null
    void getVideo(video.id)
      .then((stored) => {
        if (!stored) throw new Error('Video is no longer stored in this browser')
        return openFrameSource(stored.blob, stored.timebase)
      })
      .then((frameSource) => {
        opened = frameSource
        if (cancelled) {
          frameSource.close()
          return
        }
        setSource(frameSource)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      opened?.close()
    }
  }, [video.id])

  const sessionAlive = useRef(true)
  useEffect(() => {
    sessionAlive.current = true
    return () => {
      sessionAlive.current = false
    }
  }, [source])

  useEffect(() => {
    if (!source) return
    void source.grabDataUrl(frameIndex).then((url) => {
      if (sessionAlive.current) setFrameUrl(url)
    })
  }, [source, frameIndex])

  // Persist corrections as they're made, coalesced but never delayed past a
  // maximum -- same reasoning as the ROI editor's autosave.
  const pendingSince = useRef<number | null>(null)
  const isFirstCorrectionsRender = useRef(true)
  useEffect(() => {
    if (isFirstCorrectionsRender.current) {
      isFirstCorrectionsRender.current = false
      return
    }
    pendingSince.current ??= Date.now()
    const elapsed = Date.now() - pendingSince.current
    const wait = Math.max(0, Math.min(SAVE_DEBOUNCE_MS, MAX_SAVE_DELAY_MS - elapsed))
    const timer = setTimeout(() => {
      pendingSince.current = null
      void saveCorrections(video.id, corrections)
    }, wait)
    return () => clearTimeout(timer)
  }, [corrections, video.id])

  // Pins-only: never re-supplies `roi` (a prop from a shared ancestor, and
  // briefly stale right after switching videos -- see updatePins' docstring
  // for why writing roi here would be a real, demonstrated bug).
  useEffect(() => {
    void updatePins(video.id, pins)
  }, [pins, video.id])

  const pointFromEvent = useCallback((event: { clientX: number; clientY: number }): Point | null => {
    const svg = svgRef.current
    if (!svg) return null
    const ctm = svg.getScreenCTM()
    if (!ctm) return null
    const local = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse())
    return { x: local.x, y: local.y }
  }, [])

  const effective: EffectiveFrame[] | null = tracks ? applyCorrections(tracks, corrections) : null
  const current = effective?.[frameIndex] ?? null

  const setCorrection = useCallback(
    (point: Point, which: 'centroid' | 'nose') => {
      setCorrections((prev) => {
        const next = new Map(prev)
        const existing = next.get(frameIndex)
        const base = existing ?? { centroid: current?.centroid ?? point, nose: current?.nose ?? point }
        next.set(
          frameIndex,
          which === 'centroid' ? { ...base, centroid: point } : { ...base, nose: point },
        )
        return next
      })
    },
    [frameIndex, current],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (!drag) return
      const point = pointFromEvent(event)
      if (!point) return
      setCorrection(point, drag)
    },
    [drag, pointFromEvent, setCorrection],
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
    [drag, effective, pointFromEvent],
  )

  const togglePin = useCallback((index: number) => {
    setPins((prevPins) =>
      prevPins.includes(index) ? prevPins.filter((p) => p !== index) : [...prevPins, index],
    )
  }, [])

  if (!tracks) {
    return (
      <section aria-labelledby="correction-heading" className="correction">
        <h2 id="correction-heading">4. Review the track</h2>
        <p className="hint">Track the video above first.</p>
      </section>
    )
  }

  const correctedFrames = [...corrections.keys()].sort((a, b) => a - b)
  const points = effective!
    .filter((f) => f.state === 'TRACKED' && f.centroid)
    .map((f) => f.centroid!)

  return (
    <section aria-labelledby="correction-heading" className="correction">
      <h2 id="correction-heading">4. Review the track — {video.name}</h2>
      <p className="hint">
        Scrub to a frame, or click the path, to see where the tracker put the animal. Drag the
        point to fix it when it&rsquo;s wrong.
      </p>

      <div className="correction-toolbar">
        <button type="button" onClick={() => setExpanded((e) => !e)}>
          {expanded ? 'Shrink viewer' : 'Expand viewer'}
        </button>
        {roi && (
          <span className="hint">
            Corrected frames: {correctedFrames.length === 0 ? 'none' : correctedFrames.map((i) => i + 1).join(', ')}
          </span>
        )}
      </div>

      {frameUrl && roi && (
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
          {roi.holes.map((hole, i) => (
            <circle
              key={i}
              cx={hole.x}
              cy={hole.y}
              r={roi.holeRadius}
              className={roi.targetHole === i ? 'roi-hole--target' : 'roi-hole'}
            />
          ))}

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
          disabled={!corrections.has(frameIndex)}
          onClick={() =>
            setCorrections((prev) => {
              const next = new Map(prev)
              next.delete(frameIndex)
              return next
            })
          }
        >
          Revert this frame to automatic
        </button>
      </div>

      {current && current.state !== 'TRACKED' && (
        <p className="hint">
          This frame is {STATE_LABEL[current.state].toLowerCase()}, so there&rsquo;s no automatic
          point to correct here. Relabeling a frame&rsquo;s state by hand is planned but not built
          yet.
        </p>
      )}
    </section>
  )
}
