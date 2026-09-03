/**
 * Application shell.
 *
 * Steps 1-4 are real. The rest are placeholders until their milestone lands
 * -- see docs/plan.md.
 */

import { useState } from 'react'
import VideoLoader from './VideoLoader.tsx'
import RoiEditor from './RoiEditor.tsx'
import TrackingPanel from './TrackingPanel.tsx'
import CorrectionViewer from './CorrectionViewer.tsx'
import MeasuresPanel from './MeasuresPanel.tsx'
import { useTrackingJob } from './useTrackingJob.ts'
import type { StoredVideoSummary } from '../state/schema.ts'
import type { RoiDefinition } from '../core/roi.ts'

type Milestone = {
  readonly step: string
  readonly status: string
}

const REMAINING: readonly Milestone[] = [
  { step: 'Classify search strategy (spatial / serial / random)', status: 'not built yet' },
  { step: 'Visualize and export CSV / XLSX', status: 'not built yet' },
]

export default function App() {
  const [selected, setSelected] = useState<StoredVideoSummary | null>(null)
  // RoiEditor is remounted (via `key`) on every video change, so its own
  // effect notifies onRoiChange(null) immediately on mount before loading the
  // new video's saved layout -- no separate reset needed here.
  const [roi, setRoi] = useState<RoiDefinition | null>(null)
  // Lives here, not inside TrackingPanel, so a running job survives switching
  // to a different video -- see useTrackingJob.ts.
  const trackingJob = useTrackingJob()

  return (
    <main>
      <h1>Barnes Maze Analysis Pipeline</h1>
      <p className="lede">
        Turn a folder of Barnes maze videos into per-trial latency, error, and
        search-strategy measures — in your browser. Nothing is uploaded: video
        stays on your machine and the analysis runs locally.
      </p>

      <VideoLoader
        selectedVideoId={selected?.id ?? null}
        onSelectVideo={setSelected}
        activeVideoId={trackingJob.activeVideoId}
        activeProgress={trackingJob.activeProgress}
        trackingRefreshToken={trackingJob.completedCount}
      />

      {selected && (
        <>
          <RoiEditor key={`${selected.id}-roi`} video={selected} onRoiChange={setRoi} />
          <TrackingPanel
            key={`${selected.id}-tracking`}
            video={selected}
            roi={roi}
            trackingJob={trackingJob}
          />
          <CorrectionViewer
            key={`${selected.id}-correction`}
            video={selected}
            roi={roi}
            trackingJob={trackingJob}
          />
          <MeasuresPanel
            key={`${selected.id}-measures`}
            video={selected}
            roi={roi}
            trackingJob={trackingJob}
          />
        </>
      )}

      <section aria-labelledby="remaining-heading">
        <h2 id="remaining-heading">Remaining steps</h2>
        <ol className="milestones" start={6}>
          {REMAINING.map((milestone) => (
            <li key={milestone.step}>
              <span>{milestone.step}</span>
              <span className="status-chip">{milestone.status}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  )
}
