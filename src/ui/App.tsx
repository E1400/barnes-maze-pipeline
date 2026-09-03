/**
 * Application shell. Steps 1-6 are real -- see docs/plan.md for the
 * remaining, non-UI compliance/ship work (accessibility pass, docs, README).
 */

import { useState } from 'react'
import VideoLoader from './VideoLoader.tsx'
import RoiEditor from './RoiEditor.tsx'
import TrackingPanel from './TrackingPanel.tsx'
import ReviewWorkspace from './ReviewWorkspace.tsx'
import ExportPanel from './ExportPanel.tsx'
import VisualizationsPanel from './VisualizationsPanel.tsx'
import { useTrackingJob } from './useTrackingJob.ts'
import type { StoredVideoSummary } from '../state/schema.ts'
import type { RoiDefinition } from '../core/roi.ts'

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
          <ReviewWorkspace
            key={`${selected.id}-review`}
            video={selected}
            roi={roi}
            trackingJob={trackingJob}
          />
        </>
      )}

      <ExportPanel trackingRefreshToken={trackingJob.completedCount} />

      <VisualizationsPanel trackingRefreshToken={trackingJob.completedCount} />
    </main>
  )
}
