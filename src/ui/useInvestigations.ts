/**
 * Shared state for the hole-investigation list: the detection threshold, the
 * detector's own output, and manual add/edit/delete edits layered on top.
 *
 * Lifted out of any one component because the trial-stats cards (under the
 * viewer) and the investigation table (beside it) both need the exact same
 * computed list -- see ReviewWorkspace.
 */

import { useEffect, useRef, useState } from 'react'
import type { EffectiveFrame } from '../core/corrections.ts'
import { DEFAULT_INVESTIGATION_PARAMS, detectInvestigations, type InvestigationParams } from '../core/events.ts'
import {
  EMPTY_INVESTIGATION_EDITS,
  addManualInvestigation,
  applyInvestigationEdits,
  deleteManualInvestigation,
  removeAutoInvestigation,
  updateManualInvestigation,
  type EffectiveInvestigation,
  type InvestigationEdits,
  type ManualInvestigation,
} from '../core/investigationEdits.ts'
import type { RoiDefinition } from '../core/roi.ts'
import {
  loadInvestigationEdits,
  saveInvestigationEdits,
} from '../state/investigationEditsStore.ts'
import {
  loadInvestigationParams,
  saveInvestigationParams,
} from '../state/investigationParamsStore.ts'
import type { StoredVideoSummary } from '../state/schema.ts'

const EDIT_DEBOUNCE_MS = 250

export interface UseInvestigationsResult {
  readonly params: InvestigationParams
  readonly setParams: (updater: (p: InvestigationParams) => InvestigationParams) => void
  readonly investigations: readonly EffectiveInvestigation[]
  readonly addInvestigation: (manual: ManualInvestigation) => void
  readonly updateInvestigation: (id: string, patch: Partial<Omit<ManualInvestigation, 'id'>>) => void
  readonly deleteInvestigation: (event: EffectiveInvestigation) => void
}

export function useInvestigations(
  video: StoredVideoSummary,
  roi: RoiDefinition | null,
  effective: readonly EffectiveFrame[] | null,
): UseInvestigationsResult {
  const [params, setParamsState] = useState<InvestigationParams>(DEFAULT_INVESTIGATION_PARAMS)
  const [edits, setEdits] = useState<InvestigationEdits>(EMPTY_INVESTIGATION_EDITS)

  useEffect(() => {
    let cancelled = false
    void loadInvestigationParams(video.id).then((stored) => {
      if (!cancelled) setParamsState(stored ?? DEFAULT_INVESTIGATION_PARAMS)
    })
    void loadInvestigationEdits(video.id).then((stored) => {
      if (!cancelled) setEdits(stored)
    })
    return () => {
      cancelled = true
    }
  }, [video.id])

  const isFirstParamsRender = useRef(true)
  useEffect(() => {
    if (isFirstParamsRender.current) {
      isFirstParamsRender.current = false
      return
    }
    const timer = setTimeout(() => void saveInvestigationParams(video.id, params), EDIT_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [params, video.id])

  const isFirstEditsRender = useRef(true)
  useEffect(() => {
    if (isFirstEditsRender.current) {
      isFirstEditsRender.current = false
      return
    }
    const timer = setTimeout(() => void saveInvestigationEdits(video.id, edits), EDIT_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [edits, video.id])

  const auto = effective && roi ? detectInvestigations(effective, roi, params) : []
  const investigations = applyInvestigationEdits(auto, edits, roi?.targetHole ?? null)

  return {
    params,
    setParams: (updater) => setParamsState(updater),
    investigations,
    addInvestigation: (manual) => setEdits((e) => addManualInvestigation(e, manual)),
    updateInvestigation: (id, patch) => setEdits((e) => updateManualInvestigation(e, id, patch)),
    deleteInvestigation: (event) =>
      setEdits((e) =>
        event.source === 'manual' ? deleteManualInvestigation(e, event.id) : removeAutoInvestigation(e, event.id),
      ),
  }
}
