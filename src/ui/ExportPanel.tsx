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

import { buildInvestigationRows, buildQualityRow, buildTrialRow, type InvestigationRow, type QualityRow, type TrialRow } from '../io/exportRows.ts'
import { downloadInvestigationsCsv, downloadQualityCsv, downloadTrialsCsv, downloadWorkbook } from '../io/sheets.ts'
import { useCohortData } from './useCohortData.ts'

interface Props {
  /** Changes whenever a tracking run finishes anywhere, prompting a rebuild. */
  readonly trackingRefreshToken: number
}

interface VideoExport {
  readonly videoId: string
  readonly videoName: string
  readonly trial: TrialRow
  readonly investigations: readonly InvestigationRow[]
  readonly quality: QualityRow
}

function timestamp(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Filesystem-safe-ish stem for a per-video filename. */
function fileStem(videoName: string): string {
  return videoName.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '_')
}

export default function ExportPanel({ trackingRefreshToken }: Props) {
  const { videos: cohort, loading } = useCohortData(trackingRefreshToken)

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
        </>
      )}
    </section>
  )
}
