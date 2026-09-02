/**
 * Decodes an MP4's video track to grayscale frames using WebCodecs, fed by
 * mp4box demuxing (the same parser `core/timebase.ts` uses for timing).
 *
 * Why not the seek-and-draw approach the ROI editor uses (frameSource.ts):
 * that costs a real `<video>` seek per frame, which is fine for the handful
 * of frames the editor needs but far too slow for a full clip -- `test50` is
 * 5539 frames. WebCodecs decodes the whole track directly.
 *
 * The one real wrinkle: `VideoDecoder` emits frames in *display* order, but
 * this app's frame indices are decode/storage order (the same order `stts`
 * describes -- see timebase.ts and AI_NOTES for why that convention was
 * chosen). All three sample clips have real B-frame reordering (measured
 * decode-vs-display displacement up to 8 frames), so decoder output is
 * pushed through a `ReorderBuffer` keyed by decode-order index before this
 * module hands frames to its caller, and callers never see display order.
 */

import { createFile, DataStream, Endianness, type Movie, type Sample } from 'mp4box'
import { rgbaToGray } from './image.ts'
import { ReorderBuffer } from './reorderBuffer.ts'
import type { GrayFrame } from './types.ts'

/** Generous margin over the measured worst case (8) on the sample clips. */
const REORDER_WINDOW = 32

export function isWebCodecsDecodingSupported(): boolean {
  return typeof VideoDecoder !== 'undefined' && typeof EncodedVideoChunk !== 'undefined'
}

interface DemuxedSample {
  readonly isKeyFrame: boolean
  readonly data: Uint8Array
}

interface DemuxedTrack {
  readonly codec: string
  readonly description: Uint8Array
  readonly width: number
  readonly height: number
  readonly samples: readonly DemuxedSample[]
}

/**
 * Serialises a parsed box back to bytes and strips its 8-byte header
 * (4-byte size + 4-byte fourcc), giving the raw AVCDecoderConfigurationRecord
 * `VideoDecoderConfig.description` expects.
 */
function boxPayloadBytes(box: { write: (stream: DataStream) => void }): Uint8Array {
  const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN)
  box.write(stream)
  return new Uint8Array(stream.buffer as ArrayBuffer).slice(8)
}

function demuxTrack(blob: Blob): Promise<DemuxedTrack> {
  return blob.arrayBuffer().then((data) => {
    const file = createFile()
    const buffer = data as ArrayBuffer & { fileStart: number }
    buffer.fileStart = 0

    // Reassigned from inside the onReady/onError callbacks below; TS can't
    // narrow a closure-captured `let` the way it would a local, so the
    // post-appendBuffer checks re-assert non-null explicitly instead of
    // relying on control-flow narrowing.
    let partial: Omit<DemuxedTrack, 'samples'> | undefined
    let demuxError: Error | undefined
    const samples: DemuxedSample[] = []

    file.onError = (error: string) => {
      demuxError = new Error(`Could not parse this MP4: ${error}`)
    }
    file.onSamples = (_id, _user, batch: Sample[]) => {
      for (const sample of batch) {
        if (!sample.data) continue
        samples.push({ isKeyFrame: sample.is_sync, data: sample.data })
      }
    }
    file.onReady = (info: Movie) => {
      const videoTrack = info.videoTracks[0]
      if (!videoTrack) {
        demuxError = new Error('This file has no video track')
        return
      }
      const trak = file.getTrackById(videoTrack.id)
      const entry = trak?.mdia?.minf?.stbl?.stsd?.entries?.[0] as
        | { avcC?: { write: (s: DataStream) => void } }
        | undefined
      if (!entry?.avcC) {
        demuxError = new Error(
          `Unsupported video codec "${videoTrack.codec}" -- only H.264 (avcC) clips are supported`,
        )
        return
      }
      partial = {
        codec: videoTrack.codec,
        description: boxPayloadBytes(entry.avcC),
        width: videoTrack.track_width,
        height: videoTrack.track_height,
      }
      file.setExtractionOptions(videoTrack.id, null, { nbSamples: videoTrack.nb_samples })
      file.start()
    }

    file.appendBuffer(buffer)
    file.flush()

    if (demuxError) throw demuxError as Error
    if (!partial) throw new Error('Could not read this MP4 (no moov box found)')
    return { ...(partial as Omit<DemuxedTrack, 'samples'>), samples }
  })
}

export interface DecodeProgress {
  readonly framesDecoded: number
  readonly totalFrames: number
}

/**
 * Decodes every frame in decode-order, calling `onFrame` once per frame in
 * strictly ascending order. `onFrame` may be async (e.g. running CV per
 * frame); each call is chained after the previous one, which also throttles
 * how far ahead of processing the decoder is allowed to run.
 */
export async function decodeVideo(
  blob: Blob,
  onFrame: (frameIndex: number, frame: GrayFrame) => void | Promise<void>,
  onProgress?: (progress: DecodeProgress) => void,
): Promise<void> {
  if (!isWebCodecsDecodingSupported()) {
    // No fallback decode path exists yet (CLAUDE.md's original plan called
    // for a playback-capture fallback; not built -- tracking simply isn't
    // available without WebCodecs support right now, and that has to be a
    // clear message here, not a cryptic "VideoDecoder is not defined" thrown
    // from deep inside the decode loop).
    throw new Error(
      'This browser does not support WebCodecs video decoding, which the tracking ' +
        'pipeline requires. Try a recent Chrome, Edge, or Safari 16.4+.',
    )
  }
  const track = await demuxTrack(blob)
  const totalFrames = track.samples.length
  if (totalFrames === 0) throw new Error('No video samples found to decode')

  const reorder = new ReorderBuffer<VideoFrame>(REORDER_WINDOW)
  let framesDecoded = 0
  let processingChain: Promise<void> = Promise.resolve()
  let decodeError: Error | null = null

  const emit = (frame: VideoFrame) => {
    const index = frame.timestamp // decode-order index, assigned below -- not real time.
    processingChain = processingChain
      .then(async () => {
        const buffer = new Uint8Array(frame.allocationSize({ format: 'RGBA' }))
        await frame.copyTo(buffer, { format: 'RGBA' })
        frame.close()
        const gray = rgbaToGray(buffer, track.width, track.height)
        await onFrame(index, gray)
        framesDecoded++
        onProgress?.({ framesDecoded, totalFrames })
      })
      .catch((cause: unknown) => {
        decodeError ??= cause instanceof Error ? cause : new Error(String(cause))
      })
  }

  const decoder = new VideoDecoder({
    output: (frame) => {
      for (const ready of reorder.push(frame.timestamp, frame)) emit(ready)
    },
    error: (error) => {
      decodeError ??= error instanceof Error ? error : new Error(String(error))
    },
  })
  decoder.configure({
    codec: track.codec,
    codedWidth: track.width,
    codedHeight: track.height,
    description: track.description,
  })

  for (let i = 0; i < track.samples.length; i++) {
    if (decodeError) break
    const sample = track.samples[i]!
    decoder.decode(
      new EncodedVideoChunk({
        type: sample.isKeyFrame ? 'key' : 'delta',
        // Decode-order index, not a real timestamp: WebCodecs only requires
        // this value to identify a chunk and order output by, not for it to
        // be real time -- using the index is what lets ReorderBuffer put
        // frames back in the order this app indexes by.
        timestamp: i,
        duration: 0,
        data: sample.data,
      }),
    )
  }
  await decoder.flush()
  decoder.close()

  for (const ready of reorder.flush()) emit(ready)
  await processingChain

  if (decodeError) throw decodeError
  if (framesDecoded !== totalFrames) {
    throw new Error(`Decoded ${framesDecoded} of ${totalFrames} frames -- some frames were dropped`)
  }
}
