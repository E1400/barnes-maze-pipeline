/**
 * Step 2: define the platform, the ring of holes, and the escape target.
 *
 * The brief calls this the make-or-break UX moment: 20 holes x 60 videos must
 * not mean 1200 clicks. So the ring is generated from three clicks -- centre,
 * platform edge, one hole -- and then adjusted, and the whole ROI can be
 * carried to the next video as a template.
 *
 * Every action has a keyboard route. The three clicks have numeric equivalents
 * in the "Set up by numbers" fields, holes are focusable and nudge with the
 * arrow keys, and the target is set with a button. Nothing here requires a
 * drag.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { nearestHoleIndex, ringFromClicks, type Point } from '../core/geometry.ts'
import {
  DEFAULT_HOLE_COUNT,
  createRoi,
  nudgeHole,
  regenerateRing,
  roiCompleteness,
  roiPixelsPerCm,
  setPlatformDiameterCm,
  setTargetHole,
  type RoiDefinition,
} from '../core/roi.ts'
import { getVideo } from '../state/videoStore.ts'
import { loadRoi, loadRoiTemplate, saveRoi, saveRoiTemplate } from '../state/roiStore.ts'
import type { StoredVideoSummary } from '../state/schema.ts'
import { grabFrame, type GrabbedFrame } from './frameGrabber.ts'

const SAVE_DEBOUNCE_MS = 250
/** Never leave a change unwritten longer than this, however fast the edits come. */
const MAX_SAVE_DELAY_MS = 750

type SetupStage = 'center' | 'edge' | 'hole' | 'done'

const STAGE_PROMPT: Record<SetupStage, string> = {
  center: 'Click the centre of the platform.',
  edge: 'Click the outer edge of the platform.',
  hole: 'Click any one hole. The other holes are placed from it.',
  done: 'Click a hole to select it, then nudge it with the arrow keys.',
}

interface Props {
  readonly video: StoredVideoSummary
}

export default function RoiEditor({ video }: Props) {
  const [frame, setFrame] = useState<GrabbedFrame | null>(null)
  const [frameIndex, setFrameIndex] = useState(0)
  const [frameError, setFrameError] = useState('')
  const [roi, setRoi] = useState<RoiDefinition | null>(null)
  const [clicks, setClicks] = useState<Point[]>([])
  const [holeCount, setHoleCount] = useState(DEFAULT_HOLE_COUNT)
  const [selectedHole, setSelectedHole] = useState<number | null>(null)
  const [status, setStatus] = useState('')
  const [templateName, setTemplateName] = useState<string | null>(null)
  // Counts completed autosaves. Surfaced as a data attribute so the end-to-end
  // test can wait for a write instead of sleeping and hoping.
  const [saveCount, setSaveCount] = useState(0)
  const svgRef = useRef<SVGSVGElement>(null)

  const stage: SetupStage = roi
    ? 'done'
    : clicks.length === 0
      ? 'center'
      : clicks.length === 1
        ? 'edge'
        : 'hole'

  // Load the saved ROI for this video, and note whether a template exists.
  // No state reset needed here: App keys this component by video id, so
  // switching videos remounts it with fresh state.
  useEffect(() => {
    let cancelled = false
    void loadRoi(video.id).then((stored) => {
      if (!cancelled && stored) setRoi(stored)
    })
    void loadRoiTemplate().then((template) => {
      if (!cancelled) setTemplateName(template?.sourceVideoName ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [video.id])

  // Grab the frame to draw on.
  useEffect(() => {
    let cancelled = false
    void getVideo(video.id)
      .then(async (stored) => {
        if (!stored) throw new Error('Video is no longer in this browser')
        return grabFrame(stored.blob, stored.timebase, frameIndex)
      })
      .then((grabbed) => {
        if (cancelled) return
        setFrame(grabbed)
        setFrameError('')
      })
      .catch((error: unknown) => {
        if (!cancelled) setFrameError((error as Error).message)
      })
    return () => {
      cancelled = true
    }
  }, [video.id, frameIndex])

  // Persist as the user works -- there is no save button in this tool.
  //
  // A plain debounce is wrong here: every edit would clear the pending timer,
  // so a user editing continuously (or just typing a diameter digit by digit)
  // could go arbitrarily long with nothing written, and lose it all by closing
  // the tab. So the debounce coalesces rapid edits but never delays a write
  // more than MAX_SAVE_DELAY_MS past the first unsaved change.
  const pendingSince = useRef<number | null>(null)
  useEffect(() => {
    if (!roi) return
    pendingSince.current ??= Date.now()
    const elapsed = Date.now() - pendingSince.current
    const wait = Math.max(0, Math.min(SAVE_DEBOUNCE_MS, MAX_SAVE_DELAY_MS - elapsed))
    const timer = setTimeout(() => {
      pendingSince.current = null
      void saveRoi(video.id, roi).then(() => {
        setSaveCount((count) => count + 1)
      })
    }, wait)
    return () => clearTimeout(timer)
  }, [roi, video.id])

  /** Converts a pointer event into video-pixel coordinates. */
  const pointFromEvent = useCallback((event: React.MouseEvent<SVGSVGElement>): Point | null => {
    const svg = svgRef.current
    if (!svg) return null
    const screenPoint = new DOMPoint(event.clientX, event.clientY)
    const ctm = svg.getScreenCTM()
    if (!ctm) return null
    const local = screenPoint.matrixTransform(ctm.inverse())
    return { x: local.x, y: local.y }
  }, [])

  const onSvgClick = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      const point = pointFromEvent(event)
      if (!point) return

      if (roi) {
        const index = nearestHoleIndex(roi.holes, point)
        if (index >= 0) setSelectedHole(index)
        return
      }

      const next = [...clicks, point]
      if (next.length < 3) {
        setClicks(next)
        return
      }
      const { platformRadius, ring } = ringFromClicks(next[0]!, next[1]!, next[2]!, holeCount)
      setRoi(createRoi(next[0]!, platformRadius, ring))
      setClicks([])
      setStatus(`${holeCount} holes placed from 3 clicks. Adjust any that are off.`)
    },
    [clicks, holeCount, pointFromEvent, roi],
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
      if (!roi || selectedHole === null) return
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
        moveSelectedHole(move[0], move[1])
        return
      }
      if (event.key === 't' || event.key === 'T') {
        event.preventDefault()
        setRoi(setTargetHole(roi, selectedHole))
        setStatus(`Hole ${selectedHole + 1} marked as the escape target.`)
      }
    },
    [moveSelectedHole, roi, selectedHole],
  )

  const applyRingChange = useCallback(
    (changes: Partial<{ ringRadius: number; rotationDegrees: number; holeCount: number }>) => {
      if (!roi) return
      const ring = {
        ...roi.ring,
        ...(changes.ringRadius !== undefined ? { ringRadius: changes.ringRadius } : {}),
        ...(changes.rotationDegrees !== undefined
          ? { rotation: (changes.rotationDegrees * Math.PI) / 180 }
          : {}),
        ...(changes.holeCount !== undefined ? { holeCount: changes.holeCount } : {}),
      }
      if (roi.nudgedHoles.length > 0) {
        setStatus(
          `Ring regenerated — ${roi.nudgedHoles.length} hand-adjusted hole(s) were reset.`,
        )
      }
      setRoi(regenerateRing(roi, ring))
      setSelectedHole(null)
    },
    [roi],
  )

  const completeness = roiCompleteness(roi)
  const scale = roi ? roiPixelsPerCm(roi) : null
  const rotationDegrees = useMemo(
    () => (roi ? Math.round(((roi.ring.rotation * 180) / Math.PI) * 10) / 10 : 0),
    [roi],
  )

  return (
    <section aria-labelledby="roi-heading" className="roi" data-save-count={saveCount}>
      <h2 id="roi-heading">2. Define the maze — {video.name}</h2>

      <p className="status" role="status" aria-live="polite">
        {status || STAGE_PROMPT[stage]}
      </p>
      {frameError && <p className="errors">{frameError}</p>}

      <div className="roi-layout">
        <div>
          {frame ? (
            // One SVG coordinate system for the frame and the overlay, so the
            // whole thing scales together and click coordinates need no maths.
            <svg
              ref={svgRef}
              className="roi-canvas"
              viewBox={`0 0 ${frame.width} ${frame.height}`}
              width={frame.width}
              height={frame.height}
              role="application"
              aria-label={`Frame ${frameIndex + 1} of ${video.name} with the maze overlay. ${STAGE_PROMPT[stage]}`}
              tabIndex={0}
              onClick={onSvgClick}
              onKeyDown={onSvgKeyDown}
            >
              <image href={frame.dataUrl} x={0} y={0} width={frame.width} height={frame.height} />

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
                  <circle cx={roi.center.x} cy={roi.center.y} r={4} className="roi-center" />
                  {roi.holes.map((hole, index) => {
                    const isTarget = roi.targetHole === index
                    const isNudged = roi.nudgedHoles.includes(index)
                    const isSelected = selectedHole === index
                    return (
                      <g key={index}>
                        <circle
                          cx={hole.x}
                          cy={hole.y}
                          r={12}
                          className={[
                            'roi-hole',
                            isTarget ? 'roi-hole--target' : '',
                            isNudged ? 'roi-hole--nudged' : '',
                            isSelected ? 'roi-hole--selected' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        />
                        {/* Target is marked by a second ring and a letter, not
                            by colour alone. */}
                        {isTarget && (
                          <circle cx={hole.x} cy={hole.y} r={17} className="roi-hole--target-ring" />
                        )}
                        <text x={hole.x} y={hole.y + 4} className="roi-hole-label">
                          {isTarget ? 'T' : index + 1}
                        </text>
                      </g>
                    )
                  })}
                </>
              )}
            </svg>
          ) : (
            <p>{frameError ? '' : 'Loading a frame…'}</p>
          )}

          <label className="frame-picker">
            Frame {frameIndex + 1} of {video.timebase.frameCount}
            <input
              type="range"
              min={0}
              max={video.timebase.frameCount - 1}
              value={frameIndex}
              onChange={(event) => setFrameIndex(Number(event.target.value))}
            />
          </label>
          <p className="hint">
            Move the frame slider if the mouse is sitting on a hole you need to see.
          </p>
        </div>

        <div className="roi-controls">
          <h3>Set up by numbers</h3>
          <p className="hint">
            The same settings the three clicks produce — usable without a mouse.
          </p>

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
                if (roi) applyRingChange({ holeCount: count })
              }}
            />
          </label>

          {roi && (
            <>
              <label>
                Ring radius (px)
                <input
                  type="number"
                  min={1}
                  value={Math.round(roi.ring.ringRadius)}
                  onChange={(event) => applyRingChange({ ringRadius: Number(event.target.value) })}
                />
              </label>
              <label>
                Rotation (°)
                <input
                  type="number"
                  step={1}
                  value={rotationDegrees}
                  onChange={(event) =>
                    applyRingChange({ rotationDegrees: Number(event.target.value) })
                  }
                />
              </label>
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
              <p className="hint">
                {scale === null
                  ? 'Needed to report distances in cm instead of pixels.'
                  : `${scale.toFixed(2)} px/cm — path lengths will be in cm.`}
              </p>

              <h3>Selected hole</h3>
              {selectedHole === null ? (
                <p className="hint">
                  Click a hole, or focus the image and press Tab, to select one.
                </p>
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
                    <button type="button" onClick={() => moveSelectedHole(-1, 0)}>
                      ← 1px
                    </button>
                    <button type="button" onClick={() => moveSelectedHole(1, 0)}>
                      → 1px
                    </button>
                    <button type="button" onClick={() => moveSelectedHole(0, -1)}>
                      ↑ 1px
                    </button>
                    <button type="button" onClick={() => moveSelectedHole(0, 1)}>
                      ↓ 1px
                    </button>
                  </div>
                  <p className="hint">Arrow keys nudge 1px; hold Shift for 10px. T marks target.</p>
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
                Holes moved by hand:{' '}
                {roi.nudgedHoles.length === 0
                  ? 'none — all auto-placed'
                  : roi.nudgedHoles.map((i) => i + 1).join(', ')}
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
                <button
                  type="button"
                  onClick={() => {
                    setRoi(null)
                    setClicks([])
                    setSelectedHole(null)
                    setStatus('')
                  }}
                >
                  Start over
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
                    setRoi(template.roi)
                    setStatus(
                      `Layout copied from ${template.sourceVideoName}. Check it against this video and nudge anything off.`,
                    )
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
