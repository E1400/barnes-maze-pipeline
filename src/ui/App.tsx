/**
 * Application shell. Steps 1-6 are real.
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
      <h1>Barnes Maze Analysis</h1>
      <p className="lede">Video in, publishable measures out — entirely in your browser.</p>

      <VideoLoader
        selectedVideoId={selected?.id ?? null}
        onSelectVideo={setSelected}
        activeVideoId={trackingJob.activeVideoId}
        activeProgress={trackingJob.activeProgress}
        trackingRefreshToken={trackingJob.completedCount}
      />

      {/* Nothing past step 1 renders until a video is actually selected --
          previously Export and Visualizations rendered unconditionally, so
          a browser with videos tracked in an earlier session showed their
          combined results immediately on a fresh page load, before the
          current session had done anything. Confusing even when the data
          is genuinely accurate: it reads as output appearing from nowhere.
          Gating everything on `selected` also makes "click Define maze to
          start" the only way forward, instead of an easy-to-miss first
          step among several visible sections. */}
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
          <ExportPanel trackingRefreshToken={trackingJob.completedCount} selectedVideoId={selected.id} />
          <VisualizationsPanel
            trackingRefreshToken={trackingJob.completedCount}
            selectedVideoId={selected.id}
          />
        </>
      )}
    </main>
  )
}
