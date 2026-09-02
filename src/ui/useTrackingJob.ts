/**
 * Owns the single running tracking job, independent of which video is
 * currently selected.
 *
 * TrackingPanel used to create and terminate its own Worker, tied to the
 * selected video's component lifecycle -- so switching to a different video
 * unmounted it and killed the job mid-run, silently losing the work. This
 * hook lives at the App level instead: the Worker's lifetime is tied to the
 * app being open, not to which video happens to be on screen. Only one job
 * runs at a time by design (the user doesn't need concurrent tracking, and
 * running several CV pipelines at once would be a real memory concern for
 * long clips) -- `startTracking` refuses to start a second one.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { DetectionParams } from '../core/cv/detector.ts'
import { DEFAULT_DETECTION_PARAMS } from '../core/cv/detector.ts'
import type { PipelineProgress, TrackingRoi } from '../core/cv/pipeline.ts'
import type { RoiDefinition } from '../core/roi.ts'
import type { FrameTrack, TrackerParams } from '../core/tracking.ts'
import { DEFAULT_TRACKER_PARAMS } from '../core/tracking.ts'
import { saveTracks } from '../state/trackStore.ts'
import { getVideo } from '../state/videoStore.ts'
import type { StoredVideoSummary } from '../state/schema.ts'
import type { TrackingWorkerRequest, TrackingWorkerResponse } from '../workers/tracking.worker.ts'

function toTrackingRoi(roi: RoiDefinition): TrackingRoi {
  return {
    holes: roi.holes,
    holeRadius: roi.holeRadius,
    targetHole: roi.targetHole,
    platformCenter: roi.center,
    platformRadius: roi.platformRadius,
  }
}

export interface TrackingJob {
  /** The video currently being tracked, or null if nothing is running. */
  readonly activeVideoId: string | null
  readonly activeProgress: PipelineProgress | null
  readonly activeError: string | null
  /** Bumped each time a job finishes, so listeners know to re-check IndexedDB. */
  readonly completedCount: number
  startTracking: (video: StoredVideoSummary, roi: RoiDefinition) => void
}

export function useTrackingJob(): TrackingJob {
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null)
  const [activeProgress, setActiveProgress] = useState<PipelineProgress | null>(null)
  const [activeError, setActiveError] = useState<string | null>(null)
  const [completedCount, setCompletedCount] = useState(0)
  const workerRef = useRef<Worker | null>(null)

  // Tied to the app, not to any per-video component -- this is what makes a
  // running job survive navigating to a different video.
  useEffect(() => () => workerRef.current?.terminate(), [])

  const startTracking = useCallback((video: StoredVideoSummary, roi: RoiDefinition) => {
    if (workerRef.current) return // one job at a time, by design

    setActiveVideoId(video.id)
    setActiveProgress(null)
    setActiveError(null)

    void getVideo(video.id).then((stored) => {
      if (!stored) {
        setActiveError('Video is no longer stored in this browser')
        setActiveVideoId(null)
        return
      }

      const worker = new Worker(new URL('../workers/tracking.worker.ts', import.meta.url), {
        type: 'module',
      })
      workerRef.current = worker

      const detectionParams: DetectionParams = DEFAULT_DETECTION_PARAMS
      const trackerParams: TrackerParams = DEFAULT_TRACKER_PARAMS

      const finish = () => {
        worker.terminate()
        workerRef.current = null
        setActiveVideoId(null)
        setActiveProgress(null)
      }

      worker.onmessage = (event: MessageEvent<TrackingWorkerResponse>) => {
        const message = event.data
        if (message.type === 'progress') {
          setActiveProgress(message.progress)
        } else if (message.type === 'done') {
          const tracks: readonly FrameTrack[] = message.tracks
          void saveTracks(video.id, tracks, detectionParams, trackerParams).finally(() => {
            setCompletedCount((count) => count + 1)
            finish()
          })
        } else {
          setActiveError(message.message)
          finish()
        }
      }
      worker.onerror = (event) => {
        setActiveError(event.message || 'Tracking worker crashed')
        finish()
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
    })
  }, [])

  return { activeVideoId, activeProgress, activeError, completedCount, startTracking }
}
