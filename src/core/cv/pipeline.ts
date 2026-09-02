/**
 * End-to-end tracking pipeline for one video: decode -> background model ->
 * per-frame detection -> classified track.
 *
 * Two full decode passes, not one. The background model needs frames spread
 * across the *whole* clip (including near the very end) before it can be
 * computed, and buffering every frame until the last background sample
 * arrives would mean holding the entire clip in memory -- about 1.7 GB of
 * raw grayscale for `test50`'s 5539 frames. Decoding twice (measured: ~37s
 * total for test50 on this machine, no CV work yet counted) keeps memory
 * bounded to a couple of frames at a time and stays simple to reason about,
 * at a real but acceptable time cost for a one-time per-video action.
 */

import { backgroundSampleIndices, medianBackground } from './background.ts'
import { circleMask } from './image.ts'
import { decodeVideo, type DecodeProgress } from './decode.ts'
import { DEFAULT_DETECTION_PARAMS, TypeScriptDetector, type DetectionParams } from './detector.ts'
import type { BinaryMask, GrayFrame } from './types.ts'
import { DEFAULT_TRACKER_PARAMS, Tracker, type FrameTrack, type HoleRoi, type TrackerParams } from '../tracking.ts'

const BACKGROUND_SAMPLE_COUNT = 30

export interface PipelineProgress {
  readonly phase: 'background' | 'tracking'
  readonly framesProcessed: number
  readonly totalFrames: number
}

/** First pass: builds the background model from frames spread across the clip. */
export async function buildBackgroundModel(
  blob: Blob,
  frameCount: number,
  onProgress?: (progress: PipelineProgress) => void,
): Promise<GrayFrame> {
  const sampleIndices = new Set(backgroundSampleIndices(frameCount, BACKGROUND_SAMPLE_COUNT))
  const samples: GrayFrame[] = []

  await decodeVideo(
    blob,
    (frameIndex, frame) => {
      if (sampleIndices.has(frameIndex)) samples.push(frame)
    },
    (progress: DecodeProgress) =>
      onProgress?.({ phase: 'background', framesProcessed: progress.framesDecoded, totalFrames: progress.totalFrames }),
  )

  if (samples.length === 0) throw new Error('No frames were sampled for the background model')
  return medianBackground(samples)
}

export interface TrackingRoi extends HoleRoi {
  readonly platformCenter: { x: number; y: number }
  readonly platformRadius: number
}

/** Second pass: detects and classifies the animal in every frame. */
export async function trackVideo(
  blob: Blob,
  background: GrayFrame,
  roi: TrackingRoi,
  detectionParams: DetectionParams = DEFAULT_DETECTION_PARAMS,
  trackerParams: TrackerParams = DEFAULT_TRACKER_PARAMS,
  onProgress?: (progress: PipelineProgress) => void,
): Promise<FrameTrack[]> {
  const detector = new TypeScriptDetector()
  const tracker = new Tracker(roi, trackerParams)
  let mask: BinaryMask | null = null

  await decodeVideo(
    blob,
    (frameIndex, frame) => {
      // Built lazily so the platform mask always matches the decoded frame's
      // actual dimensions, rather than assuming the ROI's stored size is
      // still correct.
      mask ??= circleMask(frame.width, frame.height, roi.platformCenter.x, roi.platformCenter.y, roi.platformRadius)
      const detection = detector.detect(frame, background, mask, detectionParams)
      tracker.push(frameIndex, detection)
    },
    (progress: DecodeProgress) =>
      onProgress?.({ phase: 'tracking', framesProcessed: progress.framesDecoded, totalFrames: progress.totalFrames }),
  )

  return tracker.finalize()
}
