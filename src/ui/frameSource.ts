/**
 * A reusable decode session for one video.
 *
 * The previous implementation built a fresh <video> element per frame, which
 * costs a load and a seek every time -- fine for one frame, hopeless for the
 * dozens the editor and detection ask for. This keeps one element and one
 * canvas open for the session and just seeks.
 *
 * Seeking targets the midpoint between a frame's start and the next frame's
 * start rather than the exact boundary: browsers resolve a seek to the frame
 * *containing* the requested time, and asking for the exact start tick lands
 * on the previous frame about as often as not.
 */

import { frameTimeSeconds, type Timebase } from '../core/timebase.ts'

export interface FrameSource {
  readonly width: number
  readonly height: number
  /** Raw RGBA pixels, for the CV code. */
  grabImageData(frameIndex: number): Promise<ImageData>
  /** JPEG data URL, for display. */
  grabDataUrl(frameIndex: number): Promise<string>
  close(): void
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

export function openFrameSource(blob: Blob, timebase: Timebase): Promise<FrameSource> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true

    let closed = false
    const dispose = () => {
      if (closed) return
      closed = true
      URL.revokeObjectURL(url)
      video.removeAttribute('src')
      video.load()
    }

    video.onerror = () => {
      dispose()
      reject(new Error('Could not decode this video in the browser'))
    }

    video.onloadeddata = () => {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) {
        dispose()
        reject(new Error('Could not get a 2D canvas context'))
        return
      }

      // Seeks are serialised: overlapping currentTime writes on one element
      // resolve unpredictably, and a frame drawn for the wrong index is worse
      // than a slow one.
      let queue: Promise<void> = Promise.resolve()
      const drawFrame = (frameIndex: number): Promise<void> => {
        const run = queue.then(
          () =>
            new Promise<void>((settle, fail) => {
              if (closed) return fail(new Error('Frame source is closed'))
              const target = seekTimeForFrame(timebase, frameIndex)
              const onSeeked = () => {
                video.removeEventListener('seeked', onSeeked)
                try {
                  context.drawImage(video, 0, 0)
                  settle()
                } catch (cause) {
                  fail(new Error(`Could not read frame ${frameIndex}: ${(cause as Error).message}`))
                }
              }
              video.addEventListener('seeked', onSeeked)
              video.currentTime = target
            }),
        )
        // Keep the chain alive even if one grab fails.
        queue = run.catch(() => undefined)
        return run
      }

      resolve({
        width: canvas.width,
        height: canvas.height,
        async grabImageData(frameIndex: number) {
          await drawFrame(frameIndex)
          return context.getImageData(0, 0, canvas.width, canvas.height)
        },
        async grabDataUrl(frameIndex: number) {
          await drawFrame(frameIndex)
          return canvas.toDataURL('image/jpeg', 0.9)
        },
        close: dispose,
      })
    }

    video.src = url
  })
}
