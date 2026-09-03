/**
 * Step 5: hole-investigation detection and per-trial measures.
 *
 * The investigation threshold is a control here, not a constant, per
 * CLAUDE.md: "what counts as investigating a hole has no single right answer
 * in the literature." Every number below recomputes live as the threshold
 * changes or as corrections change upstream in step 4 -- nothing here is
 * cached, only the chosen threshold itself is persisted.
 */

import { useEffect, useRef, useState } from 'react'
import { applyCorrections, type Corrections, type EffectiveFrame } from '../core/corrections.ts'
import { DEFAULT_INVESTIGATION_PARAMS, type InvestigationParams } from '../core/events.ts'
import { computeTrialMeasures } from '../core/measures.ts'
import type { RoiDefinition } from '../core/roi.ts'
import { roiCompleteness } from '../core/roi.ts'
import type { FrameTrack } from '../core/tracking.ts'
import { loadCorrections } from '../state/correctionStore.ts'
import {
  loadInvestigationParams,
  saveInvestigationParams,
} from '../state/investigationParamsStore.ts'
import type { StoredVideoSummary } from '../state/schema.ts'
import { loadTracks } from '../state/trackStore.ts'
import type { TrackingJob } from './useTrackingJob.ts'

interface Props {
  readonly video: StoredVideoSummary
  readonly roi: RoiDefinition | null
  readonly trackingJob: TrackingJob
}

function formatSeconds(seconds: number | null): string {
  return seconds === null ? '—' : `${seconds.toFixed(2)} s`
}

const KIND_LABEL: Record<'proximity' | 'occlusion', string> = {
  proximity: 'nose came close',
  occlusion: 'blob vanished at this hole (shrank first, called a real visit, not a glitch)',
}

export default function MeasuresPanel({ video, roi, trackingJob }: Props) {
  const [tracks, setTracks] = useState<readonly FrameTrack[] | null>(null)
  const [corrections, setCorrections] = useState<Corrections>(new Map())
  const [params, setParams] = useState<InvestigationParams>(DEFAULT_INVESTIGATION_PARAMS)

  useEffect(() => {
    let cancelled = false
    void loadTracks(video.id).then((stored) => {
      if (!cancelled) setTracks(stored?.tracks ?? null)
    })
    void loadCorrections(video.id).then((stored) => {
      if (!cancelled) setCorrections(stored)
    })
    void loadInvestigationParams(video.id).then((stored) => {
      if (!cancelled) setParams(stored ?? DEFAULT_INVESTIGATION_PARAMS)
    })
    return () => {
      cancelled = true
    }
  }, [video.id, trackingJob.completedCount])

  // Debounced the same way the ROI editor and correction viewer persist --
  // every keystroke shouldn't be its own IndexedDB write.
  const isFirstParamsRender = useRef(true)
  useEffect(() => {
    if (isFirstParamsRender.current) {
      isFirstParamsRender.current = false
      return
    }
    const timer = setTimeout(() => void saveInvestigationParams(video.id, params), 250)
    return () => clearTimeout(timer)
  }, [params, video.id])

  const completeness = roiCompleteness(roi)

  if (!roi || !completeness.hasRing) {
    return (
      <section aria-labelledby="measures-heading" className="measures-panel">
        <h2 id="measures-heading">5. Detect hole visits and compute measures</h2>
        <p className="hint">Define the maze layout above first.</p>
      </section>
    )
  }

  if (!tracks) {
    return (
      <section aria-labelledby="measures-heading" className="measures-panel">
        <h2 id="measures-heading">5. Detect hole visits and compute measures</h2>
        <p className="hint">Track the video above first.</p>
      </section>
    )
  }

  const effective: EffectiveFrame[] = applyCorrections(tracks, corrections)
  const measures = computeTrialMeasures(effective, roi, video.timebase, params)

  return (
    <section aria-labelledby="measures-heading" className="measures-panel">
      <h2 id="measures-heading">5. Detect hole visits and compute measures — {video.name}</h2>

      {!completeness.hasTarget && (
        <p className="hint">
          Mark an escape target in step 2 to compute latency, errors and quadrant time — they&rsquo;re
          all defined relative to the target hole.
        </p>
      )}
      {!completeness.hasScale && (
        <p className="hint">
          Enter the platform diameter in step 2 to compute path length and speed in real units — pixels
          alone aren&rsquo;t publishable.
        </p>
      )}

      <fieldset className="investigation-params roi-controls">
        <legend>What counts as investigating a hole</legend>
        <p className="hint">
          There&rsquo;s no single right answer in the literature for this threshold — adjust it and
          watch the counts below change.
        </p>
        <label>
          Nose must come within (× hole radius)
          <input
            type="number"
            min={0.5}
            step={0.1}
            value={params.proximityRadiusFactor}
            onChange={(e) =>
              setParams((p) => ({ ...p, proximityRadiusFactor: Number(e.target.value) }))
            }
          />
        </label>
        <label>
          …for at least this many consecutive frames
          <input
            type="number"
            min={1}
            step={1}
            value={params.minFrames}
            onChange={(e) => setParams((p) => ({ ...p, minFrames: Number(e.target.value) }))}
          />
        </label>
      </fieldset>

      <ul className="measures">
        <li>Primary latency (first reached the target): {formatSeconds(measures.primaryLatencySeconds)}</li>
        <li>Total latency (entered the escape box): {formatSeconds(measures.totalLatencySeconds)}</li>
        <li>Primary errors (non-target visits before the target): {measures.primaryErrors}</li>
        <li>Total errors (non-target visits, whole trial): {measures.totalErrors}</li>
        <li>
          Path length:{' '}
          {measures.pathLengthCm === null ? '—' : `${measures.pathLengthCm.toFixed(1)} cm`}
        </li>
        <li>
          Average speed:{' '}
          {measures.averageSpeedCmPerSecond === null
            ? '—'
            : `${measures.averageSpeedCmPerSecond.toFixed(1)} cm/s`}
        </li>
      </ul>

      {measures.quadrantTimeSeconds && (
        <ul className="measures">
          <li>Time in target quadrant: {formatSeconds(measures.quadrantTimeSeconds.target)}</li>
          <li>Time in opposite quadrant: {formatSeconds(measures.quadrantTimeSeconds.opposite)}</li>
          <li>
            Time in adjacent quadrant (clockwise):{' '}
            {formatSeconds(measures.quadrantTimeSeconds.adjacentClockwise)}
          </li>
          <li>
            Time in adjacent quadrant (counter-clockwise):{' '}
            {formatSeconds(measures.quadrantTimeSeconds.adjacentCounterClockwise)}
          </li>
        </ul>
      )}

      <h3>Hole investigations ({measures.investigations.length})</h3>
      {measures.investigations.length === 0 ? (
        <p className="hint">None detected at the current threshold.</p>
      ) : (
        <table className="investigation-table">
          <thead>
            <tr>
              <th scope="col">Hole</th>
              <th scope="col">Target?</th>
              <th scope="col">How detected</th>
              <th scope="col">Frames</th>
              <th scope="col">Time</th>
            </tr>
          </thead>
          <tbody>
            {measures.investigations.map((event, i) => (
              <tr key={i} className={event.isTarget ? 'investigation-row--target' : undefined}>
                <td>{event.holeIndex + 1}</td>
                <td>{event.isTarget ? 'Yes' : ''}</td>
                <td>{KIND_LABEL[event.kind]}</td>
                <td>
                  {event.startFrame + 1}–{event.endFrame + 1}
                </td>
                <td>
                  {(video.timebase.frameTicks[event.startFrame]! / video.timebase.timescale).toFixed(2)}s
                  {'–'}
                  {(video.timebase.frameTicks[event.endFrame]! / video.timebase.timescale).toFixed(2)}s
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
