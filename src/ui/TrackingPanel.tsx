/**
 * Step 3: run the tracker and see what it found.
 *
 * Decoding and per-frame CV run in a Web Worker owned by `useTrackingJob`
 * (App level, not this component) because a run can take minutes, and
 * because the job has to survive the user switching to a different video --
 * see useTrackingJob.ts for why that has to live above this component.
 *
 * The trajectory plot never draws through a gap: a non-TRACKED frame breaks
 * the line rather than being interpolated across, per the brief's
 * requirement that tracking failures stay visible.
 */

import { useEffect, useState } from 'react'
import type { RoiDefinition } from '../core/roi.ts'
import { roiCompleteness, roiPixelsPerCm } from '../core/roi.ts'
import type { FrameTrack } from '../core/tracking.ts'
import type { StoredVideoSummary } from '../state/schema.ts'
import { loadTracks } from '../state/trackStore.ts'
import { getVideo } from '../state/videoStore.ts'
import { openFrameSource } from './frameSource.ts'
import type { TrackingJob } from './useTrackingJob.ts'

interface Props {
  readonly video: StoredVideoSummary
  /** The maze layout currently being edited above, kept live by the parent. */
  readonly roi: RoiDefinition | null
  readonly trackingJob: TrackingJob
}

const STATE_LABEL: Record<FrameTrack['state'], string> = {
  TRACKED: 'Tracked',
  LOST: 'Tracking lost',
  OCCLUDED_IN_HOLE: 'In a hole',
  IN_ESCAPE_BOX: 'Escaped',
}

export default function TrackingPanel({ video, roi, trackingJob }: Props) {
  const [tracks, setTracks] = useState<readonly FrameTrack[] | null>(null)
  const [frameUrl, setFrameUrl] = useState<string | null>(null)

  // Reloads whenever a run finishes anywhere (completedCount changes), so a
  // job that completes for this video while the user is looking at it shows
  // up without a manual refresh.
  useEffect(() => {
    let cancelled = false
    void loadTracks(video.id).then((stored) => {
      if (!cancelled && stored) setTracks(stored.tracks)
    })
    return () => {
      cancelled = true
    }
  }, [video.id, trackingJob.completedCount])

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

  const isThisVideoTracking = trackingJob.activeVideoId === video.id
  const isAnotherVideoTracking =
    trackingJob.activeVideoId !== null && trackingJob.activeVideoId !== video.id

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

  const statusText = isThisVideoTracking
    ? trackingJob.activeProgress
      ? `${trackingJob.activeProgress.phase === 'background' ? 'Sampling the background' : 'Tracking'}: frame ${trackingJob.activeProgress.framesProcessed} of ${trackingJob.activeProgress.totalFrames}`
      : 'Starting…'
    : isAnotherVideoTracking
      ? 'Another video is tracking in the background. This will start once it finishes.'
      : trackingJob.activeError
        ? trackingJob.activeError
        : tracks
          ? `${total} frames tracked.`
          : 'Not tracked yet.'

  return (
    <section aria-labelledby="tracking-heading" className="tracking">
      <h2 id="tracking-heading">3. Track the animal — {video.name}</h2>

      {!completeness.hasTarget && (
        <p className="hint">Mark an escape target above to detect the escape separately from other holes.</p>
      )}

      <p className="status" role="status" aria-live="polite">
        {statusText}
      </p>

      <button
        type="button"
        disabled={isThisVideoTracking || isAnotherVideoTracking}
        onClick={() => trackingJob.startTracking(video, roi)}
      >
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
                <g>
                  <circle
                    cx={segments[0]![0]!.x}
                    cy={segments[0]![0]!.y}
                    r={6}
                    className="tracking-start"
                  />
                  <text
                    x={segments[0]![0]!.x}
                    y={segments[0]![0]!.y - 10}
                    className="tracking-start-label"
                  >
                    Start
                  </text>
                </g>
              )}
            </svg>
          )}
          <p className="hint">
            Gaps in the line mark frames where tracking was lost or the animal was in a hole.
            {scale !== null ? ` Scale: ${scale.toFixed(2)} px/cm.` : ''}
          </p>
        </>
      )}
    </section>
  )
}
