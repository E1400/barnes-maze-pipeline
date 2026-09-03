/**
 * The full hole-investigation list, beside the video viewer: the detection
 * threshold that produced it, and every row -- reviewable, jumpable, and
 * correctable by hand. Deliberately not a scrolling sub-panel: a reviewer
 * comparing rows against the viewer shouldn't lose rows to an inner
 * scrollbar (Elvis's feedback, 2026-09-03) -- the table takes whatever
 * height it needs and the page scrolls, same as everything else.
 */

import { nearestHoleIndex } from '../core/geometry.ts'
import { frameTimeSeconds, rationalToNumber } from '../core/timebase.ts'
import { roiPixelsPerCm, type RoiDefinition } from '../core/roi.ts'
import type { EffectiveInvestigation } from '../core/investigationEdits.ts'
import type { StoredVideoSummary } from '../state/schema.ts'
import type { TrackReview } from './useTrackReview.ts'
import type { UseInvestigationsResult } from './useInvestigations.ts'

interface Props {
  readonly video: StoredVideoSummary
  readonly roi: RoiDefinition
  readonly review: TrackReview
  readonly inv: UseInvestigationsResult
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

export default function InvestigationTable({ video, roi, review, inv }: Props) {
  const {
    params,
    setParams,
    investigations,
    addInvestigation,
    updateInvestigation,
    deleteInvestigation,
    canUndo,
    undo,
    regenerate,
  } = inv

  const onRegenerate = () => {
    if (
      window.confirm(
        'Reset every manual investigation edit for this video back to the detector’s output? This does not re-run tracking, and cannot be undone.',
      )
    ) {
      regenerate()
    }
  }

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

  const addAtCurrentFrame = () => {
    const holeIndex = review.current?.centroid
      ? Math.max(0, nearestHoleIndex(roi.holes, review.current.centroid))
      : 0
    addInvestigation({
      id: crypto.randomUUID(),
      holeIndex,
      startFrame: review.frameIndex,
      endFrame: review.frameIndex,
    })
  }

  const clampFrame = (value: number) => Math.min(Math.max(0, Math.round(value)), video.timebase.frameCount - 1)
  const clampHole = (value: number) => Math.min(Math.max(0, Math.round(value)), roi.holes.length - 1)

  return (
    <div className="investigation-panel">
      <fieldset className="detection-criteria">
        <legend>Detection criteria</legend>
        <p className="stat-group-desc">
          A hole counts as investigated when the animal&rsquo;s nose stays within the radius below,
          for at least the time below. Narrow both to catch only deliberate investigations; widen
          either if real visits are being missed. There is no single correct value in the
          literature — set what matches your own criteria and the list updates live.{' '}
          <strong>This is a global setting, shared by every video</strong> (see step 1) — a value
          set here becomes the standard for every video after it, not just this one.
        </p>
        <div className="detection-criteria-fields">
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
        </div>
      </fieldset>

      <div className="investigation-table-header">
        <h3>Hole investigations ({investigations.length})</h3>
        <div className="button-row">
          <button type="button" onClick={addAtCurrentFrame}>
            + Add at current frame
          </button>
          <button
            type="button"
            disabled={!canUndo}
            title={canUndo ? 'Undo the last add, edit, or delete' : 'No edit to undo'}
            onClick={undo}
          >
            Undo
          </button>
          <button
            type="button"
            title="Clear every manual edit for this video and recompute from the tracked data -- does not re-run tracking"
            onClick={onRegenerate}
          >
            Regenerate stats
          </button>
        </div>
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
                          updateInvestigation(event.id, { holeIndex: clampHole(Number(e.target.value) - 1) })
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
                            updateInvestigation(event.id, { startFrame: clampFrame(Number(e.target.value) - 1) })
                          }
                        />
                        –
                        <input
                          type="number"
                          min={1}
                          max={video.timebase.frameCount}
                          value={event.endFrame + 1}
                          onChange={(e) =>
                            updateInvestigation(event.id, { endFrame: clampFrame(Number(e.target.value) - 1) })
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
                      onClick={() => deleteInvestigation(event)}
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
