/**
 * Pulls a single frame out of a video file for the ROI editor to draw on.
 *
 * Uses a detached <video> element and a canvas -- no OpenCV involved. Seeking
 * targets the midpoint between a frame's start and the next frame's start
 * rather than the exact boundary: browsers resolve a seek to the frame
 * *containing* the requested time, and asking for the exact start tick lands
 * on the previous frame about as often as not.
 */

import { frameTimeSeconds, type Timebase } from '../core/timebase.ts'

export interface GrabbedFrame {
  /** JPEG data URL, sized to the video's natural dimensions. */
  readonly dataUrl: string
  readonly width: number
  readonly height: number
}

/** Seek target for a frame index: safely inside the frame, never on its edge. */
export function seekTimeForFrame(timebase: Timebase, index: number): number {
  const start = frameTimeSeconds(timebase, index)
  const nextStart =
    index + 1 < timebase.frameCount
      ? frameTimeSeconds(timebase, index + 1)
      : timebase.durationSeconds
  return (start + nextStart) / 2
}

export function grabFrame(
  blob: Blob,
  timebase: Timebase,
  frameIndex: number,
): Promise<GrabbedFrame> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    // Some browsers will not decode frames for a video that never plays unless
    // it is allowed to render off-document.
    video.playsInline = true

    const cleanup = () => {
      URL.revokeObjectURL(url)
      video.removeAttribute('src')
      video.load()
    }

    const fail = (message: string) => {
      cleanup()
      reject(new Error(message))
    }

    video.onerror = () => fail('Could not decode this video in the browser')

    video.onloadeddata = () => {
      video.currentTime = seekTimeForFrame(timebase, frameIndex)
    }

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const context = canvas.getContext('2d')
        if (!context) return fail('Could not get a 2D canvas context')
        context.drawImage(video, 0, 0)
        const frame: GrabbedFrame = {
          dataUrl: canvas.toDataURL('image/jpeg', 0.9),
          width: canvas.width,
          height: canvas.height,
        }
        cleanup()
        resolve(frame)
      } catch (error) {
        fail(`Could not read a frame: ${(error as Error).message}`)
      }
    }

    video.src = url
  })
}
