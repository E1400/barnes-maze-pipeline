/**
 * Application shell.
 *
 * Steps 1-3 are real. The rest are placeholders until their milestone lands
 * -- see docs/plan.md.
 */

import { useState } from 'react'
import VideoLoader from './VideoLoader.tsx'
import RoiEditor from './RoiEditor.tsx'
import TrackingPanel from './TrackingPanel.tsx'
import type { StoredVideoSummary } from '../state/schema.ts'
import type { RoiDefinition } from '../core/roi.ts'

type Milestone = {
  readonly step: string
  readonly status: string
}

const REMAINING: readonly Milestone[] = [
  { step: 'Review tracking quality and correct it by hand', status: 'not built yet' },
  { step: 'Detect hole visits and compute per-trial measures', status: 'not built yet' },
  { step: 'Visualize and export CSV / XLSX', status: 'not built yet' },
]

export default function App() {
  const [selected, setSelected] = useState<StoredVideoSummary | null>(null)
  // RoiEditor is remounted (via `key`) on every video change, so its own
  // effect notifies onRoiChange(null) immediately on mount before loading the
  // new video's saved layout -- no separate reset needed here.
  const [roi, setRoi] = useState<RoiDefinition | null>(null)

  return (
    <main>
      <h1>Barnes Maze Analysis Pipeline</h1>
      <p className="lede">
        Turn a folder of Barnes maze videos into per-trial latency, error, and
        search-strategy measures — in your browser. Nothing is uploaded: video
        stays on your machine and the analysis runs locally.
      </p>

      <VideoLoader selectedVideoId={selected?.id ?? null} onSelectVideo={setSelected} />

      {selected && (
        <>
          <RoiEditor key={`${selected.id}-roi`} video={selected} onRoiChange={setRoi} />
          <TrackingPanel key={`${selected.id}-tracking`} video={selected} roi={roi} />
        </>
      )}

      <section aria-labelledby="remaining-heading">
        <h2 id="remaining-heading">Remaining steps</h2>
        <ol className="milestones" start={4}>
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
