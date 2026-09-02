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

      // Seeks are serialised (overlapping currentTime writes on one element
      // resolve unpredictably), but a request superseded before its turn comes
      // up is skipped rather than seeked to. Without that, dragging the
      // scrubber queues one real seek per frame crossed, and the video only
      // catches up to the cursor after the drag ends -- it looks like nothing
      // updates until release, when really every intermediate frame is being
      // dutifully (and pointlessly) visited first. Only the most recent
      // request always actually seeks, which is what makes the video track
      // the cursor live.
      //
      // "Superseded" is judged by *frame index*, not call order: two
      // independent callers asking for the same frame close together (e.g.
      // the display effect and the auto-detect effect both grabbing frame 0
      // when the editor first opens) must not starve one of them. An earlier
      // token-identity check treated the second caller's request as
      // superseding the first's even though they wanted the same frame,
      // which skipped the first's seek entirely -- its caller then read
      // whatever the canvas held before any draw had happened (nothing),
      // silently showing a black frame while the second caller got real
      // pixels. Comparing frame indices instead means concurrent requests
      // for the same frame both still get a real seek.
      let queue: Promise<void> = Promise.resolve()
      let latestRequestedFrame = -1
      const drawFrame = (frameIndex: number): Promise<void> => {
        latestRequestedFrame = frameIndex
        const run = queue.then(
          () =>
            new Promise<void>((settle, fail) => {
              if (closed) return fail(new Error('Frame source is closed'))
              if (frameIndex !== latestRequestedFrame) return settle() // superseded; skip the seek
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
