/**
 * Runs the tracking pipeline off the main thread.
 *
 * Decoding and per-frame CV are synchronous, CPU-bound JS with no natural
 * yield points -- measured at several minutes for the longest sample clip.
 * Run on the main thread, that freezes the tab for the whole duration: no
 * progress bar renders, no interaction is possible, and it looks like a
 * crash rather than work in progress. WebCodecs and mp4box both work fine in
 * a dedicated worker (neither needs the DOM), so the whole pipeline moves
 * here and only progress/result messages cross back to the page.
 */

import { buildBackgroundModel, trackVideo, type PipelineProgress, type TrackingRoi } from '../core/cv/pipeline.ts'
import { DEFAULT_DETECTION_PARAMS, type DetectionParams } from '../core/cv/detector.ts'
import { DEFAULT_TRACKER_PARAMS, type FrameTrack, type TrackerParams } from '../core/tracking.ts'

export interface TrackingWorkerRequest {
  readonly type: 'track'
  readonly video: Blob
  readonly frameCount: number
  readonly roi: TrackingRoi
  readonly detectionParams?: DetectionParams
  readonly trackerParams?: TrackerParams
}

export type TrackingWorkerResponse =
  | { readonly type: 'progress'; readonly progress: PipelineProgress }
  | { readonly type: 'done'; readonly tracks: FrameTrack[] }
  | { readonly type: 'error'; readonly message: string }

self.onmessage = (event: MessageEvent<TrackingWorkerRequest>) => {
  const request = event.data
  if (request.type !== 'track') return

  const post = (response: TrackingWorkerResponse) => self.postMessage(response)

  void (async () => {
    try {
      const background = await buildBackgroundModel(request.video, request.frameCount, (progress) =>
        post({ type: 'progress', progress }),
      )
      const tracks = await trackVideo(
        request.video,
        background,
        request.roi,
        request.detectionParams ?? DEFAULT_DETECTION_PARAMS,
        request.trackerParams ?? DEFAULT_TRACKER_PARAMS,
        (progress) => post({ type: 'progress', progress }),
      )
      post({ type: 'done', tracks })
    } catch (cause) {
      post({ type: 'error', message: (cause as Error).message })
    }
  })()
}
