/**
 * Application shell.
 *
 * Steps 1 and 2 are real. The rest are placeholders until their milestone
 * lands -- see docs/plan.md.
 */

import { useState } from 'react'
import VideoLoader from './VideoLoader.tsx'
import RoiEditor from './RoiEditor.tsx'
import type { StoredVideoSummary } from '../state/schema.ts'

type Milestone = {
  readonly step: string
  readonly status: string
}

const REMAINING: readonly Milestone[] = [
  { step: 'Track the animal (OpenCV.js, on your machine)', status: 'not built yet' },
  { step: 'Review tracking quality and correct it by hand', status: 'not built yet' },
  { step: 'Detect hole visits and compute per-trial measures', status: 'not built yet' },
  { step: 'Visualize and export CSV / XLSX', status: 'not built yet' },
]

export default function App() {
  const [selected, setSelected] = useState<StoredVideoSummary | null>(null)

  return (
    <main>
      <h1>Barnes Maze Analysis Pipeline</h1>
      <p className="lede">
        Turn a folder of Barnes maze videos into per-trial latency, error, and
        search-strategy measures — in your browser. Nothing is uploaded: video
        stays on your machine and the analysis runs locally.
      </p>

      <VideoLoader selectedVideoId={selected?.id ?? null} onSelectVideo={setSelected} />

      {selected && <RoiEditor key={selected.id} video={selected} />}

      <section aria-labelledby="remaining-heading">
        <h2 id="remaining-heading">Remaining steps</h2>
        <ol className="milestones" start={3}>
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
