/**
 * Step 2: the maze layout.
 *
 * Detection comes first. Asking a user to click "the centre of the platform"
 * asks them to estimate a point that is not visible in the frame, by eye,
 * without a guide -- and then to accept whatever ring that produces. The frame
 * already contains the answer: the platform is a bright disc and the holes are
 * dark and evenly spaced, so a circle fitted to the detected holes locates the
 * centre far more accurately than a click can. The user's job is to check and
 * correct a proposal, not to produce one.
 *
 * Manual placement stays as the fallback for a frame detection cannot handle.
 * Every adjustment is available by drag and by keyboard.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { detectMaze } from '../core/cv/mazeDetect.ts'
import { rgbaToGray } from '../core/cv/image.ts'
import { nearestHoleIndex, ringFromClicks, type Point } from '../core/geometry.ts'
import {
  DEFAULT_HOLE_COUNT,
  createRoi,
  nudgeHole,
  regenerateRing,
  roiCompleteness,
  roiPixelsPerCm,
  rotateRing,
  scaleRing,
  setHoleRadius,
  setPlatformDiameterCm,
  setPlatformRadius,
  setTargetHole,
  translateRoi,
  type RoiDefinition,
} from '../core/roi.ts'
import { getVideo } from '../state/videoStore.ts'
import { loadRoi, loadRoiTemplate, saveRoi, saveRoiTemplate } from '../state/roiStore.ts'
import type { StoredVideoSummary } from '../state/schema.ts'
import { openFrameSource, type FrameSource } from './frameSource.ts'
import FrameScrubber from './FrameScrubber.tsx'

const SAVE_DEBOUNCE_MS = 250
/** Never leave a change unwritten longer than this, however fast the edits come. */
const MAX_SAVE_DELAY_MS = 750

type DragTarget =
  | { kind: 'center' }
  | { kind: 'platform' }
  | { kind: 'ring' }
  | { kind: 'hole'; index: number }

interface Props {
  readonly video: StoredVideoSummary
  /**
   * Notified on every change to the working ROI, not just saves. TrackingPanel
   * (a sibling, not a descendant) needs the *current* layout to gate and run
   * on, and reading it from IndexedDB independently raced the autosave debounce:
   * "define the maze, then immediately track" could start tracking against a
   * layout from before the last edit, or no layout at all.
   */
  readonly onRoiChange?: (roi: RoiDefinition | null) => void
}

export default function RoiEditor({ video, onRoiChange }: Props) {
  const [source, setSource] = useState<FrameSource | null>(null)
  const [frameUrl, setFrameUrl] = useState<string | null>(null)
  const [frameIndex, setFrameIndex] = useState(0)
  const [pins, setPins] = useState<number[]>([])
  const [error, setError] = useState('')
  const [roi, setRoi] = useState<RoiDefinition | null>(null)

  // Propagate every change immediately -- not just on the debounced save --
  // so a sibling always sees the layout as it exists right now.
  useEffect(() => {
    onRoiChange?.(roi)
  }, [roi, onRoiChange])
  const [clicks, setClicks] = useState<Point[]>([])
  const [manualMode, setManualMode] = useState(false)
  const [holeCount, setHoleCount] = useState(DEFAULT_HOLE_COUNT)
  const [selectedHole, setSelectedHole] = useState<number | null>(null)
  const [status, setStatus] = useState('')
  const [detecting, setDetecting] = useState(false)
  const [templateName, setTemplateName] = useState<string | null>(null)
  const [saveCount, setSaveCount] = useState(0)
  const [drag, setDrag] = useState<DragTarget | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragOrigin = useRef<Point | null>(null)

  const width = source?.width ?? 640
  const height = source?.height ?? 480

  // Open one decoder for the whole editing session rather than one per frame.
  useEffect(() => {
    let cancelled = false
    let opened: FrameSource | null = null
    void getVideo(video.id)
      .then(async (stored) => {
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
        setError('')
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError((cause as Error).message)
      })
    return () => {
      cancelled = true
      opened?.close()
    }
  }, [video.id])

  // Restore any saved layout and pins.
  useEffect(() => {
    let cancelled = false
    void loadRoi(video.id).then((stored) => {
      if (cancelled || !stored) return
      setRoi(stored.roi)
      setPins(stored.pins)
    })
    void loadRoiTemplate().then((template) => {
      if (!cancelled) setTemplateName(template?.sourceVideoName ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [video.id])

  // Show the requested frame.
  //
  // Guarded by session (source) liveness only, not by frameIndex: frameSource
  // resolves grabDataUrl calls strictly in request order, so during a scrub
  // every resolution can safely update the displayed frame as it lands rather
  // than being discarded in favour of only the very last one. Discarding
  // intermediate results is what previously made the video look like it only
  // updated after the cursor was released -- frameSource was already
  // producing frames along the way, this effect was just throwing them out.
  const sessionAlive = useRef(true)
  useEffect(() => {
    sessionAlive.current = true
    return () => {
      sessionAlive.current = false
    }
  }, [source])

  useEffect(() => {
    if (!source) return
    void source
      .grabDataUrl(frameIndex)
      .then((url) => {
        if (sessionAlive.current) {
          setFrameUrl(url)
          setError('')
        }
      })
      .catch((cause: unknown) => {
        if (sessionAlive.current) setError((cause as Error).message)
      })
  }, [source, frameIndex])

  const runDetection = useCallback(
    async (frameSource: FrameSource, index: number, announce: boolean) => {
      setDetecting(true)
      try {
        const pixels = await frameSource.grabImageData(index)
        const gray = rgbaToGray(pixels.data, pixels.width, pixels.height)
        const detection = detectMaze(gray)
        if (!detection.ok) {
          setStatus(`${detection.note} Place the maze by hand instead.`)
          setManualMode(true)
          return
        }
        setRoi((current) => {
          const next = createRoi(
            detection.center,
            detection.platformRadius,
            {
              center: detection.center,
              ringRadius: detection.ringRadius,
              rotation: detection.rotation,
              holeCount: detection.holeCount,
            },
            { holeRadius: detection.holeRadius, source: 'detected' },
          )
          // Detection replaces geometry but keeps what only a human can say.
          return {
            ...next,
            holes: detection.holes.map((h) => ({ x: h.x, y: h.y })),
            targetHole: current?.targetHole ?? null,
            platformDiameterCm: current?.platformDiameterCm ?? null,
          }
        })
        setHoleCount(detection.holeCount)
        setManualMode(false)
        if (announce) setStatus(`${detection.note} Check it and adjust anything that is off.`)
      } catch (cause) {
        setStatus(`Detection failed: ${(cause as Error).message}`)
        setManualMode(true)
      } finally {
        setDetecting(false)
      }
    },
    [],
  )

  // Detect automatically the first time a video is opened with no saved layout.
  const autoDetectedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!source || roi || autoDetectedFor.current === video.id) return
    autoDetectedFor.current = video.id
    void runDetection(source, frameIndex, true)
  }, [source, roi, video.id, frameIndex, runDetection])

  // Persist as the user works. The debounce coalesces rapid edits but never
  // delays a write more than MAX_SAVE_DELAY_MS past the first unsaved change,
  // so closing the tab mid-edit cannot lose everything.
  const pendingSince = useRef<number | null>(null)
  useEffect(() => {
    if (!roi) return
    pendingSince.current ??= Date.now()
    const elapsed = Date.now() - pendingSince.current
    const wait = Math.max(0, Math.min(SAVE_DEBOUNCE_MS, MAX_SAVE_DELAY_MS - elapsed))
    const timer = setTimeout(() => {
      pendingSince.current = null
      void saveRoi(video.id, roi, pins).then(() => setSaveCount((count) => count + 1))
    }, wait)
    return () => clearTimeout(timer)
  }, [roi, pins, video.id])

  const pointFromEvent = useCallback((event: { clientX: number; clientY: number }): Point | null => {
    const svg = svgRef.current
    if (!svg) return null
    const ctm = svg.getScreenCTM()
    if (!ctm) return null
    const local = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse())
    return { x: local.x, y: local.y }
  }, [])

  const onPointerDownHandle = useCallback(
    (target: DragTarget) => (event: React.PointerEvent) => {
      event.stopPropagation()
      const point = pointFromEvent(event)
      if (!point) return
      dragOrigin.current = point
      setDrag(target)
      if (target.kind === 'hole') setSelectedHole(target.index)
      ;(event.target as Element).setPointerCapture?.(event.pointerId)
    },
    [pointFromEvent],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (!drag || !roi) return
      const point = pointFromEvent(event)
      if (!point) return

      if (drag.kind === 'center') {
        const origin = dragOrigin.current ?? point
        dragOrigin.current = point
        setRoi(translateRoi(roi, point.x - origin.x, point.y - origin.y))
        return
      }
      if (drag.kind === 'platform') {
        setRoi(setPlatformRadius(roi, Math.hypot(point.x - roi.center.x, point.y - roi.center.y)))
        return
      }
      if (drag.kind === 'ring') {
        // One gesture does both: distance sets the radius, angle rotates the
        // whole ring, so a ring that is the right size but misaligned is fixed
        // without hunting for a second control.
        const origin = dragOrigin.current ?? point
        dragOrigin.current = point
        const angleBefore = Math.atan2(origin.y - roi.center.y, origin.x - roi.center.x)
        const angleAfter = Math.atan2(point.y - roi.center.y, point.x - roi.center.x)
        const radius = Math.hypot(point.x - roi.center.x, point.y - roi.center.y)
        setRoi(rotateRing(scaleRing(roi, radius), angleAfter - angleBefore))
        return
      }
      setRoi(nudgeHole(roi, drag.index, point))
    },
    [drag, pointFromEvent, roi],
  )

  const endDrag = useCallback(() => {
    dragOrigin.current = null
    setDrag(null)
  }, [])

  const onSvgClick = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (drag) return
      const point = pointFromEvent(event)
      if (!point) return

      if (roi) {
        const index = nearestHoleIndex(roi.holes, point)
        if (index >= 0) setSelectedHole(index)
        return
      }
      if (!manualMode) return

      const next = [...clicks, point]
      if (next.length < 3) {
        setClicks(next)
        return
      }
      const { platformRadius, ring } = ringFromClicks(next[0]!, next[1]!, next[2]!, holeCount)
      setRoi(createRoi(next[0]!, platformRadius, ring, { source: 'manual' }))
      setClicks([])
      setStatus(`${holeCount} holes placed by hand.`)
    },
    [clicks, drag, holeCount, manualMode, pointFromEvent, roi],
  )

  const moveSelectedHole = useCallback(
    (dx: number, dy: number) => {
      if (!roi || selectedHole === null) return
      const hole = roi.holes[selectedHole]!
      setRoi(nudgeHole(roi, selectedHole, { x: hole.x + dx, y: hole.y + dy }))
    },
    [roi, selectedHole],
  )

  const onSvgKeyDown = useCallback(
    (event: React.KeyboardEvent<SVGSVGElement>) => {
      if (!roi) return
      const step = event.shiftKey ? 10 : 1
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      }
      const move = moves[event.key]
      if (move) {
        event.preventDefault()
        // With no hole selected the arrows move the whole maze, which is the
        // keyboard equivalent of dragging the centre.
        if (selectedHole === null) setRoi(translateRoi(roi, move[0], move[1]))
        else moveSelectedHole(move[0], move[1])
        return
      }
      if ((event.key === 't' || event.key === 'T') && selectedHole !== null) {
        event.preventDefault()
        setRoi(setTargetHole(roi, selectedHole))
        setStatus(`Hole ${selectedHole + 1} marked as the escape target.`)
      }
      if (event.key === 'Escape') setSelectedHole(null)
    },
    [moveSelectedHole, roi, selectedHole],
  )

  const togglePin = useCallback((index: number) => {
    setPins((current) =>
      current.includes(index) ? current.filter((p) => p !== index) : [...current, index],
    )
  }, [])

  const completeness = roiCompleteness(roi)
  const scale = roi ? roiPixelsPerCm(roi) : null
  const rotationDegrees = useMemo(
    () => (roi ? Math.round(((roi.ring.rotation * 180) / Math.PI) * 10) / 10 : 0),
    [roi],
  )
  const cm = (px: number) => (scale === null ? null : px / scale)
  const bothUnits = (px: number) => {
    const value = cm(px)
    return value === null ? `${Math.round(px)} px` : `${Math.round(px)} px (${value.toFixed(1)} cm)`
  }

  // Offset half a slot from hole 0 rather than sitting on `rotation` exactly:
  // hole 0 is generated at that same angle, so a handle placed there is
  // painted over by the hole and never receives a pointer event. Halfway
  // between two holes keeps it clear of every hole regardless of count.
  const ringHandle = roi
    ? (() => {
        const halfSlot = Math.PI / Math.max(1, roi.holes.length)
        const angle = roi.ring.rotation + halfSlot
        return {
          x: roi.center.x + roi.ring.ringRadius * Math.cos(angle),
          y: roi.center.y + roi.ring.ringRadius * Math.sin(angle),
        }
      })()
    : null

  return (
    <section aria-labelledby="roi-heading" className="roi" data-save-count={saveCount}>
      <h2 id="roi-heading">2. Check the maze layout — {video.name}</h2>

      <p className="status" role="status" aria-live="polite">
        {status ||
          (detecting
            ? 'Looking for the platform and holes…'
            : manualMode && !roi
              ? 'Click the centre, then the platform edge, then any one hole.'
              : 'Drag the centre to move the maze, the ring handle to resize or rotate it, or any hole to correct it.')}
      </p>
      {error && <p className="errors">{error}</p>}

      <div className="roi-layout">
        <div className="roi-stage">
          {frameUrl ? (
            <svg
              ref={svgRef}
              className="roi-canvas"
              viewBox={`0 0 ${width} ${height}`}
              width={width}
              height={height}
              role="application"
              aria-label={`Frame ${frameIndex + 1} of ${video.name} with the maze overlay`}
              tabIndex={0}
              onClick={onSvgClick}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerLeave={endDrag}
              onKeyDown={onSvgKeyDown}
            >
              <image href={frameUrl} x={0} y={0} width={width} height={height} />

              {clicks.map((point, i) => (
                <circle key={i} cx={point.x} cy={point.y} r={5} className="roi-click" />
              ))}

              {roi && (
                <>
                  <circle
                    cx={roi.center.x}
                    cy={roi.center.y}
                    r={roi.platformRadius}
                    className="roi-platform"
                  />
                  {/* Platform resize handle, on the rim at 90 degrees. */}
                  <circle
                    cx={roi.center.x}
                    cy={roi.center.y + roi.platformRadius}
                    r={7}
                    className="roi-handle roi-handle--platform"
                    onPointerDown={onPointerDownHandle({ kind: 'platform' })}
                  >
                    <title>Drag to resize the platform boundary</title>
                  </circle>

                  {/* Ring handle: distance resizes, angle rotates. */}
                  {ringHandle && (
                    <circle
                      cx={ringHandle.x}
                      cy={ringHandle.y}
                      r={7}
                      className="roi-handle roi-handle--ring"
                      onPointerDown={onPointerDownHandle({ kind: 'ring' })}
                    >
                      <title>Drag to stretch, compress or rotate the ring of holes</title>
                    </circle>
                  )}

                  {/* Centre crosshair -- draggable, and it takes the ring with it. */}
                  <g
                    className="roi-center-handle"
                    onPointerDown={onPointerDownHandle({ kind: 'center' })}
                  >
                    <title>Drag to move the whole maze</title>
                    <circle cx={roi.center.x} cy={roi.center.y} r={10} className="roi-center-hit" />
                    <line
                      x1={roi.center.x - 12}
                      y1={roi.center.y}
                      x2={roi.center.x + 12}
                      y2={roi.center.y}
                      className="roi-crosshair"
                    />
                    <line
                      x1={roi.center.x}
                      y1={roi.center.y - 12}
                      x2={roi.center.x}
                      y2={roi.center.y + 12}
                      className="roi-crosshair"
                    />
                  </g>

                  {roi.holes.map((hole, index) => {
                    const isTarget = roi.targetHole === index
                    const isNudged = roi.nudgedHoles.includes(index)
                    const isSelected = selectedHole === index
                    return (
                      <g key={index} onPointerDown={onPointerDownHandle({ kind: 'hole', index })}>
                        <circle
                          cx={hole.x}
                          cy={hole.y}
                          r={roi.holeRadius}
                          className={[
                            'roi-hole',
                            isTarget ? 'roi-hole--target' : '',
                            isNudged ? 'roi-hole--nudged' : '',
                            isSelected ? 'roi-hole--selected' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        />
                        {isTarget && (
                          <circle
                            cx={hole.x}
                            cy={hole.y}
                            r={roi.holeRadius + 5}
                            className="roi-hole--target-ring"
                          />
                        )}
                        <text x={hole.x} y={hole.y + 4} className="roi-hole-label">
                          {isTarget ? 'T' : index + 1}
                        </text>
                      </g>
                    )
                  })}

                  {/* Scale bar: makes the cm calibration visible on the image
                      instead of only as a number in the sidebar. */}
                  {scale !== null && (
                    <g className="roi-scalebar">
                      <line
                        x1={12}
                        y1={height - 14}
                        x2={12 + scale * 10}
                        y2={height - 14}
                        className="roi-scalebar-line"
                      />
                      <text x={12} y={height - 20} className="roi-scalebar-label">
                        10 cm
                      </text>
                    </g>
                  )}
                </>
              )}
            </svg>
          ) : (
            <p>{error ? '' : 'Loading a frame…'}</p>
          )}

          {source && (
            <FrameScrubber
              timebase={video.timebase}
              frameIndex={frameIndex}
              onFrameChange={setFrameIndex}
              pins={pins}
              onTogglePin={togglePin}
            />
          )}
        </div>

        <div className="roi-controls">
          <div className="button-row">
            <button
              type="button"
              disabled={!source || detecting}
              onClick={() => source && void runDetection(source, frameIndex, true)}
            >
              {detecting ? 'Detecting…' : 'Detect from this frame'}
            </button>
            <button
              type="button"
              onClick={() => {
                setRoi(null)
                setClicks([])
                setSelectedHole(null)
                setManualMode(true)
                setStatus('Click the centre, then the platform edge, then any one hole.')
              }}
            >
              Place by hand
            </button>
          </div>
          {roi && (
            <p className="hint">
              Layout {roi.source === 'detected' ? 'found automatically' : roi.source === 'template' ? 'copied from another video' : 'placed by hand'}.
            </p>
          )}

          {roi && (
            <>
              <h3>Size and position</h3>
              <label>
                Holes
                <input
                  type="number"
                  min={4}
                  max={40}
                  value={holeCount}
                  onChange={(event) => {
                    const count = Number(event.target.value)
                    setHoleCount(count)
                    if (roi.nudgedHoles.length > 0) {
                      setStatus(`Ring rebuilt — ${roi.nudgedHoles.length} hand-adjusted hole(s) reset.`)
                    }
                    setRoi(regenerateRing(roi, { ...roi.ring, holeCount: count }))
                    setSelectedHole(null)
                  }}
                />
              </label>
              <label>
                Ring radius (px)
                <input
                  type="number"
                  min={1}
                  value={Math.round(roi.ring.ringRadius)}
                  onChange={(event) => setRoi(scaleRing(roi, Number(event.target.value)))}
                />
              </label>
              <label>
                Platform radius (px)
                <input
                  type="number"
                  min={1}
                  value={Math.round(roi.platformRadius)}
                  onChange={(event) => setRoi(setPlatformRadius(roi, Number(event.target.value)))}
                />
              </label>
              <label>
                Hole radius (px)
                <input
                  type="number"
                  min={1}
                  value={Math.round(roi.holeRadius)}
                  onChange={(event) => setRoi(setHoleRadius(roi, Number(event.target.value)))}
                />
              </label>
              <label>
                Rotation (°)
                <input
                  type="number"
                  step={1}
                  value={rotationDegrees}
                  onChange={(event) =>
                    setRoi(
                      rotateRing(
                        roi,
                        (Number(event.target.value) * Math.PI) / 180 - roi.ring.rotation,
                      ),
                    )
                  }
                />
              </label>

              <h3>Real-world scale</h3>
              <label>
                Platform diameter (cm)
                <input
                  type="number"
                  min={1}
                  step="any"
                  value={roi.platformDiameterCm ?? ''}
                  placeholder="e.g. 92"
                  onChange={(event) =>
                    setRoi(
                      setPlatformDiameterCm(
                        roi,
                        event.target.value === '' ? null : Number(event.target.value),
                      ),
                    )
                  }
                />
              </label>
              {scale === null ? (
                <p className="hint">
                  Enter the real platform diameter to get distances in cm rather than pixels.
                </p>
              ) : (
                <ul className="measures">
                  <li>Scale: {scale.toFixed(2)} px/cm</li>
                  <li>Platform: {bothUnits(roi.platformRadius * 2)} across</li>
                  <li>Hole ring: {bothUnits(roi.ring.ringRadius * 2)} across</li>
                  <li>Hole: {bothUnits(roi.holeRadius * 2)} across</li>
                  <li>
                    Gap between holes:{' '}
                    {bothUnits(
                      2 * roi.ring.ringRadius * Math.sin(Math.PI / Math.max(1, roi.holes.length)),
                    )}
                  </li>
                </ul>
              )}

              <h3>Escape target</h3>
              <label>
                Target hole number
                <input
                  type="number"
                  min={1}
                  max={roi.holes.length}
                  value={roi.targetHole === null ? '' : roi.targetHole + 1}
                  placeholder="none"
                  onChange={(event) => {
                    const raw = event.target.value
                    if (raw === '') {
                      setRoi(setTargetHole(roi, null))
                      return
                    }
                    const n = Math.round(Number(raw))
                    if (Number.isFinite(n) && n >= 1 && n <= roi.holes.length) {
                      setRoi(setTargetHole(roi, n - 1))
                    }
                  }}
                />
              </label>
              <p className="hint">
                Set directly by number, or select a hole below and press T.
              </p>

              <h3>Selected hole</h3>
              {selectedHole === null ? (
                <p className="hint">Click a hole to select it. Arrow keys then nudge it.</p>
              ) : (
                <>
                  <p>
                    Hole {selectedHole + 1} of {roi.holes.length}
                    {roi.nudgedHoles.includes(selectedHole) ? ' (moved by hand)' : ' (auto-placed)'}
                  </p>
                  <div className="button-row">
                    <button type="button" onClick={() => setRoi(setTargetHole(roi, selectedHole))}>
                      Mark as escape target
                    </button>
                    <button type="button" onClick={() => moveSelectedHole(-1, 0)}>←</button>
                    <button type="button" onClick={() => moveSelectedHole(1, 0)}>→</button>
                    <button type="button" onClick={() => moveSelectedHole(0, -1)}>↑</button>
                    <button type="button" onClick={() => moveSelectedHole(0, 1)}>↓</button>
                  </div>
                  <p className="hint">
                    Arrow keys nudge 1px, Shift for 10px, T marks the target. With nothing
                    selected the arrows move the whole maze.
                  </p>
                </>
              )}

              <h3>Status</h3>
              <ul className="checklist">
                <li>{completeness.hasRing ? '✓' : '·'} Holes placed ({roi.holes.length})</li>
                <li>
                  {completeness.hasTarget ? '✓' : '·'} Escape target marked
                  {roi.targetHole !== null ? ` (hole ${roi.targetHole + 1})` : ''}
                </li>
                <li>{completeness.hasScale ? '✓' : '·'} Platform diameter entered</li>
              </ul>
              <p className="hint">
                Hand-corrected holes:{' '}
                {roi.nudgedHoles.length > 0
                  ? roi.nudgedHoles.map((i) => i + 1).join(', ')
                  : 'none'}
              </p>

              <div className="button-row">
                <button
                  type="button"
                  onClick={() => {
                    void saveRoiTemplate(roi, video.name)
                    setTemplateName(video.name)
                    setStatus('Saved as the starting point for other videos.')
                  }}
                >
                  Reuse this layout on other videos
                </button>
              </div>
            </>
          )}

          {!roi && templateName && (
            <div className="button-row">
              <button
                type="button"
                onClick={() => {
                  void loadRoiTemplate().then((template) => {
                    if (!template) return
                    setRoi({ ...template.roi, source: 'template' })
                    setStatus(`Layout copied from ${template.sourceVideoName}. Check it against this video.`)
                  })
                }}
              >
                Use layout from {templateName}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
