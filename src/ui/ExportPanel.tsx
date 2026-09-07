/**
 * Step 5: export every tracked video's trial measures and hole-investigation
 * detail to CSV/XLSX -- one tidy row per trial, one row per investigation,
 * parameters and the tool version embedded in both, per the brief.
 *
 * Combined (every video at once) and per-video export are kept as visibly
 * separate sections (Elvis's feedback, 2026-09-04): a facility either wants
 * one cohort file, or wants to hand a single collaborator just their own
 * video's numbers, and conflating the two into one set of buttons made it
 * unclear which a download actually contained.
 */

import { useMemo, useState } from 'react'
import { evaluateFormula, formulaVariables, parseFormula } from '../core/formula.ts'
import {
  buildInvestigationRows,
  buildQualityRow,
  buildTrialRow,
  FORMULA_VARIABLES,
  type InvestigationRow,
  type QualityRow,
  type TrialRow,
} from '../io/exportRows.ts'
import { downloadInvestigationsCsv, downloadQualityCsv, downloadRowsCsv, downloadTrialsCsv, downloadWorkbook } from '../io/sheets.ts'
import { useCohortData } from './useCohortData.ts'

const DEFAULT_COLUMN_NAME = 'custom'

interface Props {
  /** Changes whenever a tracking run finishes anywhere, prompting a rebuild. */
  readonly trackingRefreshToken: number
  /** Passed through purely to bust useCohortData's cache on a video switch -- see that hook's own doc comment. */
  readonly selectedVideoId?: string
}

interface VideoExport {
  readonly videoId: string
  readonly videoName: string
  readonly trial: TrialRow
  readonly investigations: readonly InvestigationRow[]
  readonly quality: QualityRow
}

interface FormulaColumnRow {
  readonly video: string
  readonly value: number | null
}

type FormulaResult =
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'ok'; readonly rows: readonly FormulaColumnRow[] }
  | null

function timestamp(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Filesystem-safe-ish stem for a per-video filename. */
function fileStem(videoName: string): string {
  return videoName.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '_')
}

export default function ExportPanel({ trackingRefreshToken, selectedVideoId }: Props) {
  const { videos: cohort, loading } = useCohortData(trackingRefreshToken, selectedVideoId)

  const videos: VideoExport[] = cohort.map((v) => ({
    videoId: v.video.id,
    videoName: v.video.name,
    trial: buildTrialRow(v.video.name, v.video.timebase, v.roi, v.measures, v.strategy, v.investigationParams),
    investigations: buildInvestigationRows(v.video.name, v.video.timebase, v.investigations),
    quality: buildQualityRow(v.video.name, v.video.timebase, v.effective),
  }))

  const allTrials = videos.map((v) => v.trial)
  const allInvestigations = videos.flatMap((v) => v.investigations)
  const allQuality = videos.map((v) => v.quality)

  const [formulaText, setFormulaText] = useState('')
  // Holds exactly what the user typed, including a transient empty string
  // while they're clearing the field -- forcing it back to a fallback name
  // on every keystroke (the previous version did this in onChange) fights
  // the user mid-edit, snapping the field back to "custom" the instant it
  // empties instead of letting them type a new name. The fallback is only
  // applied at the point of use (the preview header, the filename), not to
  // the field's own live value.
  const [columnName, setColumnName] = useState(DEFAULT_COLUMN_NAME)
  const effectiveColumnName = columnName.trim() === '' ? DEFAULT_COLUMN_NAME : columnName.trim()
  const formulaResult = useMemo<FormulaResult>(() => {
    if (formulaText.trim() === '') return null
    const node = parseFormula(formulaText)
    if ('error' in node) return { kind: 'error', message: node.error }
    const unknown = formulaVariables(node).filter((name) => !FORMULA_VARIABLES.includes(name as keyof TrialRow))
    if (unknown.length > 0) {
      return { kind: 'error', message: `Unknown field${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}` }
    }
    const rows = videos.map((v) => ({
      video: v.videoName,
      value: evaluateFormula(node, v.trial as unknown as Record<string, number | null>),
    }))
    return { kind: 'ok', rows }
  }, [formulaText, videos])
  const formulaError = formulaResult?.kind === 'error' ? formulaResult.message : null
  const formulaRows = formulaResult?.kind === 'ok' ? formulaResult.rows : null

  return (
    <section aria-labelledby="export-heading" className="export-panel">
      <h2 id="export-heading" className="step-heading">
        5. Export
      </h2>
      <p className="hint">
        Trials (one row per video), investigations (one row per hole visit), and a quality report
        (what fraction of each video tracked cleanly). Every format embeds the detection threshold
        and the tool version used, so an exported number can be traced back to the settings that
        produced it.
      </p>

      {loading ? (
        <p className="hint">Gathering tracked videos…</p>
      ) : videos.length === 0 ? (
        <p className="hint">No tracked videos yet. Track at least one video above first.</p>
      ) : (
        <>
          <div className="export-group">
            <h3>All videos combined</h3>
            <p className="hint">
              {videos.length} tracked video{videos.length === 1 ? '' : 's'}, {allInvestigations.length} hole
              investigation{allInvestigations.length === 1 ? '' : 's'}.
            </p>
            <div className="button-row">
              <button
                type="button"
                onClick={() => downloadTrialsCsv(allTrials, `barnes-maze-trials-${timestamp()}.csv`)}
              >
                Download trials (CSV)
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadInvestigationsCsv(allInvestigations, `barnes-maze-investigations-${timestamp()}.csv`)
                }
              >
                Download investigations (CSV)
              </button>
              <button
                type="button"
                title="What fraction of each video tracked cleanly, and where the failures cluster -- so the numbers above can be trusted before they go in a figure."
                onClick={() => downloadQualityCsv(allQuality, `barnes-maze-quality-${timestamp()}.csv`)}
              >
                Download quality report (CSV)
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadWorkbook(allTrials, allInvestigations, allQuality, `barnes-maze-export-${timestamp()}.xlsx`)
                }
              >
                Download XLSX (all sheets)
              </button>
            </div>
          </div>

          <div className="export-group">
            <h3>Per video</h3>
            <table className="export-table">
              <thead>
                <tr>
                  <th scope="col">Video</th>
                  <th scope="col">Investigations</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {videos.map((v) => (
                  <tr key={v.videoId}>
                    <td>{v.videoName}</td>
                    <td>{v.investigations.length}</td>
                    <td className="button-row">
                      <button
                        type="button"
                        onClick={() => downloadTrialsCsv([v.trial], `${fileStem(v.videoName)}-trial.csv`)}
                      >
                        Trial (CSV)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          downloadInvestigationsCsv(v.investigations, `${fileStem(v.videoName)}-investigations.csv`)
                        }
                      >
                        Investigations (CSV)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          downloadWorkbook([v.trial], v.investigations, [v.quality], `${fileStem(v.videoName)}.xlsx`)
                        }
                      >
                        XLSX
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="export-group">
            <h3>Custom column</h3>
            <p className="hint">
              Generates a custom spreadsheet: one derived value per video, from a formula over the
              fields already computed above -- e.g. <code>totalErrors / pathLengthCm</code> --
              without opening Excel.
            </p>
            <div className="formula-builder">
              <label>
                Formula
                <input
                  type="text"
                  value={formulaText}
                  placeholder="e.g. totalErrors / pathLengthCm"
                  onChange={(e) => setFormulaText(e.target.value)}
                />
              </label>
              <label>
                Column name
                <input
                  type="text"
                  value={columnName}
                  placeholder={DEFAULT_COLUMN_NAME}
                  onChange={(e) => setColumnName(e.target.value)}
                />
              </label>
            </div>
            <p className="hint">
              Available fields: {FORMULA_VARIABLES.join(', ')}. Supports +, -, *, /, and parentheses.
            </p>

            {formulaError !== null && (
              <p className="hint" role="alert">
                {formulaError}
              </p>
            )}

            {formulaRows !== null && (
              <>
                <table className="export-table">
                  <thead>
                    <tr>
                      <th scope="col">Video</th>
                      <th scope="col">{effectiveColumnName}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formulaRows.map((row) => (
                      <tr key={row.video}>
                        <td>{row.video}</td>
                        <td>{row.value === null ? '—' : row.value.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="button-row">
                  <button
                    type="button"
                    onClick={() =>
                      downloadRowsCsv(
                        formulaRows.map((row) => ({ video: row.video, [effectiveColumnName]: row.value })),
                        `barnes-maze-${fileStem(effectiveColumnName)}-${timestamp()}.csv`,
                      )
                    }
                  >
                    Download spreadsheet (CSV)
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </section>
  )
}
