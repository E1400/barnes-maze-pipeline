/**
 * The detection half of the review workspace: the criteria that decide what
 * counts as a hole visit, the resulting per-trial measures, and the
 * investigation list itself -- reviewable, jumpable, and correctable by
 * hand, right beside the video viewer rather than in a separate section a
 * reviewer has to scroll back and forth to (Elvis's feedback, 2026-09-03).
 */

import { useEffect, useRef, useState } from 'react'
import { nearestHoleIndex } from '../core/geometry.ts'
import { DEFAULT_INVESTIGATION_PARAMS, detectInvestigations, type InvestigationParams } from '../core/events.ts'
import {
  EMPTY_INVESTIGATION_EDITS,
  addManualInvestigation,
  applyInvestigationEdits,
  deleteManualInvestigation,
  removeAutoInvestigation,
  updateManualInvestigation,
  type EffectiveInvestigation,
  type InvestigationEdits,
} from '../core/investigationEdits.ts'
import { computeTrialMeasuresFromInvestigations } from '../core/measures.ts'
import { roiPixelsPerCm, type RoiDefinition } from '../core/roi.ts'
import { frameTimeSeconds, rationalToNumber } from '../core/timebase.ts'
import {
  loadInvestigationEdits,
  saveInvestigationEdits,
} from '../state/investigationEditsStore.ts'
import {
  loadInvestigationParams,
  saveInvestigationParams,
} from '../state/investigationParamsStore.ts'
import type { StoredVideoSummary } from '../state/schema.ts'
import type { TrackReview } from './useTrackReview.ts'

interface Props {
  readonly video: StoredVideoSummary
  readonly roi: RoiDefinition
  readonly review: TrackReview
}

const EDIT_DEBOUNCE_MS = 250

function formatSeconds(seconds: number | null): string {
  return seconds === null ? '—' : `${seconds.toFixed(2)}s`
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

const KIND_LABEL: Record<EffectiveInvestigation['kind'], string> = {
  proximity: 'nose came close',
  occlusion: 'blob vanished here',
  manual: 'added by hand',
}

export default function InvestigationPanel({ video, roi, review }: Props) {
  const [params, setParams] = useState<InvestigationParams>(DEFAULT_INVESTIGATION_PARAMS)
  const [edits, setEdits] = useState<InvestigationEdits>(EMPTY_INVESTIGATION_EDITS)

  useEffect(() => {
    let cancelled = false
    void loadInvestigationParams(video.id).then((stored) => {
      if (!cancelled) setParams(stored ?? DEFAULT_INVESTIGATION_PARAMS)
    })
    void loadInvestigationEdits(video.id).then((stored) => {
      if (!cancelled) setEdits(stored)
    })
    return () => {
      cancelled = true
    }
  }, [video.id])

  const isFirstParamsRender = useRef(true)
  useEffect(() => {
    if (isFirstParamsRender.current) {
      isFirstParamsRender.current = false
      return
    }
    const timer = setTimeout(() => void saveInvestigationParams(video.id, params), EDIT_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [params, video.id])

  const isFirstEditsRender = useRef(true)
  useEffect(() => {
    if (isFirstEditsRender.current) {
      isFirstEditsRender.current = false
      return
    }
    const timer = setTimeout(() => void saveInvestigationEdits(video.id, edits), EDIT_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [edits, video.id])

  const effective = review.effective
  if (!effective) return null

  const scale = roiPixelsPerCm(roi) // px per cm, null until step 1/2's diameter is set
  const fps = rationalToNumber(video.timebase.nominalFps)

  const radiusPx = roi.holeRadius * params.proximityRadiusFactor
  const radiusUnit = scale === null ? 'px' : 'cm'
  const radiusValue = scale === null ? radiusPx : radiusPx / scale
  const setRadius = (value: number) => {
    if (!(value > 0)) return
    const px = scale === null ? value : value * scale
    setParams((p) => ({ ...p, proximityRadiusFactor: px / roi.holeRadius }))
  }

  const minSeconds = params.minFrames / fps
  const setMinSeconds = (value: number) => {
    if (!(value > 0)) return
    setParams((p) => ({ ...p, minFrames: Math.max(1, Math.round(value * fps)) }))
  }

  const auto = detectInvestigations(effective, roi, params)
  const investigations = applyInvestigationEdits(auto, edits, roi.targetHole)
  const measures = computeTrialMeasuresFromInvestigations(effective, roi, video.timebase, investigations)

  const addInvestigation = () => {
    const holeIndex = review.current?.centroid
      ? Math.max(0, nearestHoleIndex(roi.holes, review.current.centroid))
      : 0
    const id = crypto.randomUUID()
    setEdits((e) =>
      addManualInvestigation(e, {
        id,
        holeIndex,
        startFrame: review.frameIndex,
        endFrame: review.frameIndex,
      }),
    )
  }

  const clampFrame = (value: number) => Math.min(Math.max(0, Math.round(value)), video.timebase.frameCount - 1)
  const clampHole = (value: number) => Math.min(Math.max(0, Math.round(value)), roi.holes.length - 1)

  return (
    <div className="investigation-panel">
      <fieldset className="detection-criteria" title="No single threshold fits every study. Adjust it and watch the list below change.">
        <legend>Detection criteria</legend>
        <label>
          Radius ({radiusUnit})
          <input
            type="number"
            min={0}
            step="any"
            value={round(radiusValue, 2)}
            onChange={(e) => setRadius(Number(e.target.value))}
          />
        </label>
        <label>
          Min. time (s)
          <input
            type="number"
            min={0}
            step="any"
            value={round(minSeconds, 2)}
            onChange={(e) => setMinSeconds(Number(e.target.value))}
          />
        </label>
      </fieldset>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-label">Primary latency</span>
          <span className="stat-value">{formatSeconds(measures.primaryLatencySeconds)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total latency</span>
          <span className="stat-value">{formatSeconds(measures.totalLatencySeconds)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Primary errors</span>
          <span className="stat-value">{measures.primaryErrors}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total errors</span>
          <span className="stat-value">{measures.totalErrors}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Path length</span>
          <span className="stat-value">
            {measures.pathLengthCm === null ? '—' : `${measures.pathLengthCm.toFixed(1)} cm`}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Avg. speed</span>
          <span className="stat-value">
            {measures.averageSpeedCmPerSecond === null
              ? '—'
              : `${measures.averageSpeedCmPerSecond.toFixed(1)} cm/s`}
          </span>
        </div>
        {measures.quadrantTimeSeconds && (
          <>
            <div className="stat-card">
              <span className="stat-label">Target quadrant</span>
              <span className="stat-value">{formatSeconds(measures.quadrantTimeSeconds.target)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Opposite quadrant</span>
              <span className="stat-value">{formatSeconds(measures.quadrantTimeSeconds.opposite)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Adjacent (CW)</span>
              <span className="stat-value">
                {formatSeconds(measures.quadrantTimeSeconds.adjacentClockwise)}
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Adjacent (CCW)</span>
              <span className="stat-value">
                {formatSeconds(measures.quadrantTimeSeconds.adjacentCounterClockwise)}
              </span>
            </div>
          </>
        )}
      </div>

      <div className="investigation-table-header">
        <h3>Hole investigations ({investigations.length})</h3>
        <button type="button" onClick={addInvestigation}>
          + Add at current frame
        </button>
      </div>

      {investigations.length === 0 ? (
        <p className="hint">None detected at the current threshold.</p>
      ) : (
        <div className="investigation-table-scroll">
          <table className="investigation-table">
            <thead>
              <tr>
                <th scope="col">Hole</th>
                <th scope="col">Target</th>
                <th scope="col">Detected</th>
                <th scope="col">Frames</th>
                <th scope="col">Time</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {investigations.map((event) => {
                const isManual = event.source === 'manual'
                return (
                  <tr key={event.id} className={event.isTarget ? 'investigation-row--target' : undefined}>
                    <td>
                      {isManual ? (
                        <input
                          type="number"
                          min={1}
                          max={roi.holes.length}
                          value={event.holeIndex + 1}
                          onChange={(e) =>
                            setEdits((edit) =>
                              updateManualInvestigation(edit, event.id, {
                                holeIndex: clampHole(Number(e.target.value) - 1),
                              }),
                            )
                          }
                        />
                      ) : (
                        event.holeIndex + 1
                      )}
                    </td>
                    <td>{event.isTarget ? '✓' : ''}</td>
                    <td>{KIND_LABEL[event.kind]}</td>
                    <td className="investigation-frames">
                      {isManual ? (
                        <>
                          <input
                            type="number"
                            min={1}
                            max={video.timebase.frameCount}
                            value={event.startFrame + 1}
                            onChange={(e) =>
                              setEdits((edit) =>
                                updateManualInvestigation(edit, event.id, {
                                  startFrame: clampFrame(Number(e.target.value) - 1),
                                }),
                              )
                            }
                          />
                          –
                          <input
                            type="number"
                            min={1}
                            max={video.timebase.frameCount}
                            value={event.endFrame + 1}
                            onChange={(e) =>
                              setEdits((edit) =>
                                updateManualInvestigation(edit, event.id, {
                                  endFrame: clampFrame(Number(e.target.value) - 1),
                                }),
                              )
                            }
                          />
                        </>
                      ) : (
                        `${event.startFrame + 1}–${event.endFrame + 1}`
                      )}
                    </td>
                    <td>
                      {frameTimeSeconds(video.timebase, event.startFrame).toFixed(2)}–
                      {frameTimeSeconds(video.timebase, event.endFrame).toFixed(2)}s
                    </td>
                    <td className="investigation-actions">
                      <button
                        type="button"
                        title="Jump the viewer to this moment"
                        onClick={() => review.setFrameIndex(event.startFrame)}
                      >
                        Jump
                      </button>
                      <button
                        type="button"
                        title="Delete this investigation"
                        onClick={() =>
                          setEdits((edit) =>
                            isManual
                              ? deleteManualInvestigation(edit, event.id)
                              : removeAutoInvestigation(edit, event.id),
                          )
                        }
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
