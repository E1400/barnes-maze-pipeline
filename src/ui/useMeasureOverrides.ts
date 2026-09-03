/**
 * Manual overrides on one video's computed measures -- every stat card is
 * editable, not just the investigation list underneath them (Elvis's
 * feedback, 2026-09-03): a reviewer who watched something the computation
 * missed needs to be able to say so directly on the number itself.
 */

import { useEffect, useRef, useState } from 'react'
import { clearOverride, EMPTY_MEASURE_OVERRIDES, setOverride, type MeasureOverrides } from '../core/measureOverrides.ts'
import { loadMeasureOverrides, saveMeasureOverrides } from '../state/measureOverridesStore.ts'
import type { StoredVideoSummary } from '../state/schema.ts'

const SAVE_DEBOUNCE_MS = 250

export interface UseMeasureOverridesResult {
  readonly overrides: MeasureOverrides
  readonly set: <K extends keyof MeasureOverrides>(key: K, value: MeasureOverrides[K]) => void
  readonly clear: (key: keyof MeasureOverrides) => void
}

export function useMeasureOverrides(video: StoredVideoSummary): UseMeasureOverridesResult {
  const [overrides, setOverrides] = useState<MeasureOverrides>(EMPTY_MEASURE_OVERRIDES)

  useEffect(() => {
    let cancelled = false
    void loadMeasureOverrides(video.id).then((stored) => {
      if (!cancelled) setOverrides(stored)
    })
    return () => {
      cancelled = true
    }
  }, [video.id])

  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    const timer = setTimeout(() => void saveMeasureOverrides(video.id, overrides), SAVE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [overrides, video.id])

  return {
    overrides,
    set: (key, value) => setOverrides((o) => setOverride(o, key, value)),
    clear: (key) => setOverrides((o) => clearOverride(o, key)),
  }
}
