/**
 * Step 3: run the tracker and see the results at a glance.
 *
 * Decoding and per-frame CV run in a Web Worker owned by `useTrackingJob`
 * (App level, not this component) because a run can take minutes, and
 * because the job has to survive the user switching to a different video --
 * see useTrackingJob.ts for why that has to live above this component.
 *
 * The frame-by-frame trajectory view and manual correction live in
 * CorrectionViewer, step 4 -- this panel is just run-it-and-see-the-count.
 */

import { useEffect, useState } from 'react'
import type { RoiDefinition } from '../core/roi.ts'
import { roiCompleteness } from '../core/roi.ts'
import type { FrameTrack } from '../core/tracking.ts'
import type { StoredVideoSummary } from '../state/schema.ts'
import { loadTracks } from '../state/trackStore.ts'
import type { TrackingJob } from './useTrackingJob.ts'

interface Props {
  readonly video: StoredVideoSummary
  /** The maze layout currently being edited above, kept live by the parent. */
  readonly roi: RoiDefinition | null
  readonly trackingJob: TrackingJob
}

export default function TrackingPanel({ video, roi, trackingJob }: Props) {
  const [tracks, setTracks] = useState<readonly FrameTrack[] | null>(null)

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

  const completeness = roiCompleteness(roi)

  if (!roi || !completeness.hasRing) {
    return (
      <section aria-labelledby="tracking-heading" className="tracking">
        <h2 id="tracking-heading" className="step-heading">3. Track the animal</h2>
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

  // Leads with the total processed, not "{tracked} of {total}" -- read in
  // isolation, the latter phrasing looks like an incomplete run even when
  // every frame was processed and simply ended up in a state other than
  // TRACKED (occluded in a hole, escaped). Caught by misreading it myself
  // while verifying the escape-detection refinement -- see AI_NOTES.md.
  const doneText = tracks
    ? `${total} frames processed: ${counts.TRACKED ?? 0} tracked${
        (counts.LOST ?? 0) > 0
          ? `, ${counts.LOST} with the mouse not in view (${(((counts.LOST ?? 0) / total) * 100).toFixed(1)}%)`
          : ''
      }.`
    : 'Not tracked yet.'

  const statusText = isThisVideoTracking
    ? trackingJob.activeProgress
      ? `${trackingJob.activeProgress.phase === 'background' ? 'Sampling the background' : 'Tracking'}: frame ${trackingJob.activeProgress.framesProcessed} of ${trackingJob.activeProgress.totalFrames}`
      : 'Starting…'
    : isAnotherVideoTracking
      ? 'Another video is tracking in the background. This will start once it finishes.'
      : trackingJob.activeError
        ? trackingJob.activeError
        : doneText

  return (
    <section aria-labelledby="tracking-heading" className="tracking">
      <h2 id="tracking-heading" className="step-heading">3. Track the animal — {video.name}</h2>

      {!completeness.hasTarget && (
        <p className="hint">Mark an escape target above to detect the escape separately from other holes.</p>
      )}

      <p
        className="status"
        role="status"
        aria-live="polite"
        title={
          tracks
            ? 'Frames where no animal was visible on the platform -- never guessed at, always counted honestly. Most of this is simply the mouse not yet placed at the start of the clip. A genuine tracking gap inside a trial looks the same and can be fixed with a manual correction below.'
            : undefined
        }
      >
        {statusText}
      </p>

      <button
        type="button"
        disabled={isThisVideoTracking || isAnotherVideoTracking}
        onClick={() => trackingJob.startTracking(video, roi)}
      >
        {tracks ? 'Re-track this video' : 'Track this video'}
      </button>
    </section>
  )
}
