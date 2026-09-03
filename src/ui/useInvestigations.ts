/**
 * Shared state for the hole-investigation list: the (global) detection
 * threshold, the detector's own output, and manual add/edit/delete edits
 * layered on top -- with an undo stack, since a deleted row used to be gone
 * for good (Elvis's feedback, 2026-09-03).
 *
 * Lifted out of any one component because the trial-stats cards (under the
 * viewer) and the investigation table (beside it) both need the exact same
 * computed list -- see ReviewWorkspace.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
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
/** How many past states of the investigation list an "Undo" click can step back through. */
const UNDO_HISTORY_LIMIT = 20

export interface UseInvestigationsResult {
  readonly params: InvestigationParams
  readonly setParams: (updater: (p: InvestigationParams) => InvestigationParams) => void
  readonly investigations: readonly EffectiveInvestigation[]
  readonly addInvestigation: (manual: ManualInvestigation) => void
  readonly updateInvestigation: (id: string, patch: Partial<Omit<ManualInvestigation, 'id'>>) => void
  readonly deleteInvestigation: (event: EffectiveInvestigation) => void
  readonly canUndo: boolean
  readonly undo: () => void
  /** Clears every manual edit for this video, back to the detector's raw output. Does not re-run tracking. */
  readonly regenerate: () => void
}

interface EditsState {
  readonly edits: InvestigationEdits
  /** Past states, most recent last -- "Undo" pops the end. */
  readonly history: readonly InvestigationEdits[]
}

const INITIAL_EDITS_STATE: EditsState = { edits: EMPTY_INVESTIGATION_EDITS, history: [] }

export function useInvestigations(
  video: StoredVideoSummary,
  roi: RoiDefinition | null,
  effective: readonly EffectiveFrame[] | null,
): UseInvestigationsResult {
  const [params, setParamsState] = useState<InvestigationParams>(DEFAULT_INVESTIGATION_PARAMS)
  const [editsState, setEditsState] = useState<EditsState>(INITIAL_EDITS_STATE)

  useEffect(() => {
    let cancelled = false
    void loadInvestigationParams().then((stored) => {
      if (!cancelled) setParamsState(stored ?? DEFAULT_INVESTIGATION_PARAMS)
    })
    void loadInvestigationEdits(video.id).then((stored) => {
      if (!cancelled) setEditsState({ edits: stored, history: [] })
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
    const timer = setTimeout(() => void saveInvestigationParams(params), EDIT_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [params])

  const isFirstEditsRender = useRef(true)
  useEffect(() => {
    if (isFirstEditsRender.current) {
      isFirstEditsRender.current = false
      return
    }
    const timer = setTimeout(() => void saveInvestigationEdits(video.id, editsState.edits), EDIT_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [editsState.edits, video.id])

  // Every edit pushes the *previous* edits onto the undo stack first, so
  // "Undo" always has something to pop back to regardless of which kind of
  // edit (add/update/delete) it was. edits + history update together in one
  // setState call, so there's no window where they're out of sync.
  const applyEdit = useCallback((updater: (e: InvestigationEdits) => InvestigationEdits) => {
    setEditsState((state) => ({
      edits: updater(state.edits),
      history: [...state.history, state.edits].slice(-UNDO_HISTORY_LIMIT),
    }))
  }, [])

  const undo = useCallback(() => {
    setEditsState((state) => {
      const previous = state.history.at(-1)
      if (previous === undefined) return state
      return { edits: previous, history: state.history.slice(0, -1) }
    })
  }, [])

  const regenerate = useCallback(() => {
    setEditsState(INITIAL_EDITS_STATE)
  }, [])

  const auto = effective && roi ? detectInvestigations(effective, roi, params) : []
  const investigations = applyInvestigationEdits(auto, editsState.edits, roi?.targetHole ?? null)

  return {
    params,
    setParams: (updater) => setParamsState(updater),
    investigations,
    addInvestigation: (manual) => applyEdit((e) => addManualInvestigation(e, manual)),
    updateInvestigation: (id, patch) => applyEdit((e) => updateManualInvestigation(e, id, patch)),
    deleteInvestigation: (event) =>
      applyEdit((e) =>
        event.source === 'manual' ? deleteManualInvestigation(e, event.id) : removeAutoInvestigation(e, event.id),
      ),
    canUndo: editsState.history.length > 0,
    undo,
    regenerate,
  }
}
