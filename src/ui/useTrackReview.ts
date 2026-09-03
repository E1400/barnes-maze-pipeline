/**
 * Shared state for reviewing a tracked video: the track itself, manual
 * position corrections, frame navigation, and the decoded frame image.
 *
 * Lifted out of the viewer component so the investigation panel can share
 * the same frame index and corrected track -- a "jump to this investigation"
 * button and the video viewer have to be looking at the same frame, which
 * means one owner, not two components independently loading the same data.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { applyCorrections, type Corrections, type EffectiveFrame } from '../core/corrections.ts'
import type { Point } from '../core/geometry.ts'
import type { FrameTrack } from '../core/tracking.ts'
import { loadCorrections, saveCorrections } from '../state/correctionStore.ts'
import { loadRoi, updatePins } from '../state/roiStore.ts'
import type { StoredVideoSummary } from '../state/schema.ts'
import { loadTracks } from '../state/trackStore.ts'
import { getVideo } from '../state/videoStore.ts'
import { openFrameSource, type FrameSource } from './frameSource.ts'
import type { TrackingJob } from './useTrackingJob.ts'

const SAVE_DEBOUNCE_MS = 250
/** Never leave a correction unwritten longer than this, however fast the edits come. */
const MAX_SAVE_DELAY_MS = 750

export interface TrackReview {
  readonly tracks: readonly FrameTrack[] | null
  /** Tracks with corrections merged in. Null until tracks load. */
  readonly effective: readonly EffectiveFrame[] | null
  readonly current: EffectiveFrame | null
  readonly corrections: Corrections
  readonly setCorrection: (point: Point, which: 'centroid' | 'nose') => void
  readonly revertCorrection: () => void
  readonly frameIndex: number
  readonly setFrameIndex: (index: number) => void
  readonly pins: number[]
  readonly togglePin: (index: number) => void
  readonly frameUrl: string | null
  readonly source: FrameSource | null
}

export function useTrackReview(video: StoredVideoSummary, trackingJob: TrackingJob): TrackReview {
  const [tracks, setTracks] = useState<readonly FrameTrack[] | null>(null)
  const [corrections, setCorrections] = useState<Corrections>(new Map())
  const [pins, setPins] = useState<number[]>([])
  const [frameIndex, setFrameIndex] = useState(0)
  const [frameUrl, setFrameUrl] = useState<string | null>(null)

  // Reloads whenever a run finishes anywhere, so a fresh run's results show
  // up without a manual refresh.
  useEffect(() => {
    let cancelled = false
    void loadTracks(video.id).then((stored) => {
      if (!cancelled) setTracks(stored?.tracks ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [video.id, trackingJob.completedCount])

  useEffect(() => {
    let cancelled = false
    void loadCorrections(video.id).then((stored) => {
      if (!cancelled) setCorrections(stored)
    })
    void loadRoi(video.id).then((stored) => {
      if (!cancelled) setPins(stored?.pins ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [video.id])

  // State, not a ref -- the frame-grab effect below needs to re-run once the
  // source finishes opening (an async step), and mutating a ref doesn't
  // trigger that. Mirrors RoiEditor's frame-source handling exactly.
  const [source, setSource] = useState<FrameSource | null>(null)
  useEffect(() => {
    let cancelled = false
    let opened: FrameSource | null = null
    void getVideo(video.id)
      .then((stored) => {
        if (!stored) throw new Error('Video is no longer stored in this browser')
        return openFrameSource(stored.blob, stored.timebase)
      })
      .then((frameSource) => {
        opened = frameSource
        if (cancelled) {
          frameSource.close()
          return
        }
        setSource(frameSource)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      opened?.close()
    }
  }, [video.id])

  const sessionAlive = useRef(true)
  useEffect(() => {
    sessionAlive.current = true
    return () => {
      sessionAlive.current = false
    }
  }, [source])

  useEffect(() => {
    if (!source) return
    void source.grabDataUrl(frameIndex).then((url) => {
      if (sessionAlive.current) setFrameUrl(url)
    })
  }, [source, frameIndex])

  // Persist corrections as they're made, coalesced but never delayed past a
  // maximum -- same reasoning as the ROI editor's autosave.
  const pendingSince = useRef<number | null>(null)
  const isFirstCorrectionsRender = useRef(true)
  useEffect(() => {
    if (isFirstCorrectionsRender.current) {
      isFirstCorrectionsRender.current = false
      return
    }
    pendingSince.current ??= Date.now()
    const elapsed = Date.now() - pendingSince.current
    const wait = Math.max(0, Math.min(SAVE_DEBOUNCE_MS, MAX_SAVE_DELAY_MS - elapsed))
    const timer = setTimeout(() => {
      pendingSince.current = null
      void saveCorrections(video.id, corrections)
    }, wait)
    return () => clearTimeout(timer)
  }, [corrections, video.id])

  // Pins-only: never re-supplies `roi` (a prop from a shared ancestor, and
  // briefly stale right after switching videos -- see updatePins' docstring).
  useEffect(() => {
    void updatePins(video.id, pins)
  }, [pins, video.id])

  const effective: EffectiveFrame[] | null = tracks ? applyCorrections(tracks, corrections) : null
  const current = effective?.[frameIndex] ?? null

  const setCorrection = useCallback(
    (point: Point, which: 'centroid' | 'nose') => {
      setCorrections((prev) => {
        const next = new Map(prev)
        const existing = next.get(frameIndex)
        const base = existing ?? { centroid: current?.centroid ?? point, nose: current?.nose ?? point }
        next.set(
          frameIndex,
          which === 'centroid' ? { ...base, centroid: point } : { ...base, nose: point },
        )
        return next
      })
    },
    [frameIndex, current],
  )

  const revertCorrection = useCallback(() => {
    setCorrections((prev) => {
      const next = new Map(prev)
      next.delete(frameIndex)
      return next
    })
  }, [frameIndex])

  const togglePin = useCallback((index: number) => {
    setPins((prevPins) =>
      prevPins.includes(index) ? prevPins.filter((p) => p !== index) : [...prevPins, index],
    )
  }, [])

  return {
    tracks,
    effective,
    current,
    corrections,
    setCorrection,
    revertCorrection,
    frameIndex,
    setFrameIndex,
    pins,
    togglePin,
    frameUrl,
    source,
  }
}
