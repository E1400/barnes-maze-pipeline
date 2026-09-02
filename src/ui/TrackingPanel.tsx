/**
 * Step 3: run the tracker and see what it found.
 *
 * Decoding and per-frame CV run in a Web Worker (src/workers/tracking.worker.ts)
 * because they're synchronous, CPU-bound work that can take minutes on a long
 * clip -- on the main thread that would freeze the tab for the whole run with
 * no progress shown, which looks like a crash rather than work in progress.
 *
 * The trajectory plot never draws through a gap: LOST and OCCLUDED_IN_HOLE
 * frames break the line rather than being interpolated across, per the
 * brief's requirement that tracking failures stay visible.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { DetectionParams } from '../core/cv/detector.ts'
import { DEFAULT_DETECTION_PARAMS } from '../core/cv/detector.ts'
import type { PipelineProgress, TrackingRoi } from '../core/cv/pipeline.ts'
import type { RoiDefinition } from '../core/roi.ts'
import { roiCompleteness, roiPixelsPerCm } from '../core/roi.ts'
import type { FrameTrack, TrackerParams } from '../core/tracking.ts'
import { DEFAULT_TRACKER_PARAMS } from '../core/tracking.ts'
import type { StoredVideoSummary } from '../state/schema.ts'
import { loadTracks, saveTracks } from '../state/trackStore.ts'
import { getVideo } from '../state/videoStore.ts'
import { openFrameSource } from './frameSource.ts'
import type { TrackingWorkerRequest, TrackingWorkerResponse } from '../workers/tracking.worker.ts'

interface Props {
  readonly video: StoredVideoSummary
  /** The maze layout currently being edited above, kept live by the parent. */
  readonly roi: RoiDefinition | null
}

type RunState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'running'; readonly progress: PipelineProgress | null }
  | { readonly phase: 'error'; readonly message: string }

const STATE_LABEL: Record<FrameTrack['state'], string> = {
  TRACKED: 'Tracked',
  LOST: 'Tracking lost',
  OCCLUDED_IN_HOLE: 'In a hole',
  IN_ESCAPE_BOX: 'Escaped',
}

function toTrackingRoi(roi: RoiDefinition): TrackingRoi {
  return {
    holes: roi.holes,
    holeRadius: roi.holeRadius,
    targetHole: roi.targetHole,
    platformCenter: roi.center,
    platformRadius: roi.platformRadius,
  }
}

export default function TrackingPanel({ video, roi }: Props) {
  const [run, setRun] = useState<RunState>({ phase: 'idle' })
  const [tracks, setTracks] = useState<readonly FrameTrack[] | null>(null)
  const [frameUrl, setFrameUrl] = useState<string | null>(null)
  const workerRef = useRef<Worker | null>(null)

  useEffect(() => {
    let cancelled = false
    void loadTracks(video.id).then((stored) => {
      if (!cancelled && stored) setTracks(stored.tracks)
    })
    return () => {
      cancelled = true
    }
  }, [video.id])

  // A still frame to plot the trajectory on. Reuses the same decode path the
  // ROI editor uses (a handful of frames, not the whole clip -- this is not
  // the full-clip WebCodecs path the worker uses for tracking itself).
  useEffect(() => {
    let cancelled = false
    let source: Awaited<ReturnType<typeof openFrameSource>> | null = null
    void getVideo(video.id)
      .then((stored) => {
        if (!stored) throw new Error('Video is no longer stored in this browser')
        return openFrameSource(stored.blob, stored.timebase)
      })
      .then(async (opened) => {
        source = opened
        const url = await opened.grabDataUrl(0)
        if (!cancelled) setFrameUrl(url)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      source?.close()
    }
  }, [video.id])

  useEffect(() => () => workerRef.current?.terminate(), [])

  const startTracking = useCallback(async () => {
    if (!roi) return
    setRun({ phase: 'running', progress: null })
    setTracks(null)

    const stored = await getVideo(video.id)
    if (!stored) {
      setRun({ phase: 'error', message: 'Video is no longer stored in this browser' })
      return
    }

    workerRef.current?.terminate()
    const worker = new Worker(new URL('../workers/tracking.worker.ts', import.meta.url), {
      type: 'module',
    })
    workerRef.current = worker

    const detectionParams: DetectionParams = DEFAULT_DETECTION_PARAMS
    const trackerParams: TrackerParams = DEFAULT_TRACKER_PARAMS

    worker.onmessage = (event: MessageEvent<TrackingWorkerResponse>) => {
      const message = event.data
      if (message.type === 'progress') {
        setRun({ phase: 'running', progress: message.progress })
      } else if (message.type === 'done') {
        setTracks(message.tracks)
        setRun({ phase: 'idle' })
        void saveTracks(video.id, message.tracks, detectionParams, trackerParams)
      } else {
        setRun({ phase: 'error', message: message.message })
      }
    }
    worker.onerror = (event) => {
      setRun({ phase: 'error', message: event.message || 'Tracking worker crashed' })
    }

    const request: TrackingWorkerRequest = {
      type: 'track',
      video: stored.blob,
      frameCount: video.timebase.frameCount,
      roi: toTrackingRoi(roi),
      detectionParams,
      trackerParams,
    }
    worker.postMessage(request)
  }, [roi, video.id, video.timebase.frameCount])

  const completeness = roiCompleteness(roi)
  const scale = roi ? roiPixelsPerCm(roi) : null

  if (!roi || !completeness.hasRing) {
    return (
      <section aria-labelledby="tracking-heading" className="tracking">
        <h2 id="tracking-heading">3. Track the animal</h2>
        <p className="hint">Define the maze layout above first.</p>
      </section>
    )
  }

  const counts: Partial<Record<FrameTrack['state'], number>> = {}
  for (const t of tracks ?? []) counts[t.state] = (counts[t.state] ?? 0) + 1
  const total = tracks?.length ?? 0

  // Break the plotted path at every non-TRACKED frame, so a gap in the data
  // is a visible gap in the line, never a straight line drawn across it.
  const segments: { x: number; y: number }[][] = []
  let current: { x: number; y: number }[] = []
  for (const t of tracks ?? []) {
    if (t.state === 'TRACKED' && t.centroid) {
      current.push(t.centroid)
    } else if (current.length > 0) {
      segments.push(current)
      current = []
    }
  }
  if (current.length > 0) segments.push(current)

  return (
    <section aria-labelledby="tracking-heading" className="tracking">
      <h2 id="tracking-heading">3. Track the animal — {video.name}</h2>

      {!completeness.hasTarget && (
        <p className="hint">
          No escape target marked yet — tracking will still run, but hole visits can’t be
          distinguished from the escape.
        </p>
      )}

      <p className="status" role="status" aria-live="polite">
        {run.phase === 'running'
          ? run.progress
            ? `${run.progress.phase === 'background' ? 'Sampling the background' : 'Tracking'}: frame ${run.progress.framesProcessed} of ${run.progress.totalFrames}`
            : 'Starting…'
          : run.phase === 'error'
            ? run.message
            : tracks
              ? `${total} frames tracked. Runs entirely on this machine — nothing is uploaded.`
              : 'Not tracked yet.'}
      </p>

      <button type="button" disabled={run.phase === 'running'} onClick={() => void startTracking()}>
        {tracks ? 'Re-track this video' : 'Track this video'}
      </button>

      {tracks && (
        <>
          <ul className="checklist">
            {(Object.keys(STATE_LABEL) as FrameTrack['state'][]).map((state) => (
              <li key={state}>
                {STATE_LABEL[state]}: {counts[state] ?? 0} frame{(counts[state] ?? 0) === 1 ? '' : 's'}
                {total > 0 ? ` (${(((counts[state] ?? 0) / total) * 100).toFixed(1)}%)` : ''}
              </li>
            ))}
          </ul>

          {frameUrl && roi && (
            <svg
              className="tracking-plot"
              viewBox="0 0 640 480"
              width={640}
              height={480}
              role="img"
              aria-label={`Trajectory plot for ${video.name}: ${counts.TRACKED ?? 0} of ${total} frames tracked, path breaks wherever tracking was lost or the animal was in a hole`}
            >
              <image href={frameUrl} x={0} y={0} width={640} height={480} opacity={0.55} />
              <circle
                cx={roi.center.x}
                cy={roi.center.y}
                r={roi.platformRadius}
                className="roi-platform"
              />
              {roi.holes.map((hole, i) => (
                <circle
                  key={i}
                  cx={hole.x}
                  cy={hole.y}
                  r={roi.holeRadius}
                  className={roi.targetHole === i ? 'roi-hole--target' : 'roi-hole'}
                />
              ))}
              {segments.map((segment, i) => (
                <polyline
                  key={i}
                  points={segment.map((p) => `${p.x},${p.y}`).join(' ')}
                  className="tracking-path"
                />
              ))}
              {segments.length > 0 && (
                <circle
                  cx={segments[0]![0]!.x}
                  cy={segments[0]![0]!.y}
                  r={6}
                  className="tracking-start"
                />
              )}
            </svg>
          )}
          <p className="hint">
            The line breaks wherever tracking was lost or the animal entered a hole — those
            gaps are never drawn through.
            {scale !== null ? ` Scale: ${scale.toFixed(2)} px/cm.` : ''}
          </p>
        </>
      )}
    </section>
  )
}
