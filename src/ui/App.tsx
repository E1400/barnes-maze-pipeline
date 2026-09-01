/**
 * Application shell.
 *
 * Step 1 is real (see VideoLoader). The remaining steps are placeholders until
 * their milestone lands -- see docs/plan.md -- and each is replaced by the
 * component named in the CLAUDE.md repo layout.
 */

import VideoLoader from './VideoLoader.tsx'

type Milestone = {
  readonly step: string
  readonly status: string
}

const REMAINING: readonly Milestone[] = [
  { step: 'Define the platform, the 20 holes, and the target hole', status: 'not built yet' },
  { step: 'Track the animal (OpenCV.js, on your machine)', status: 'not built yet' },
  { step: 'Review tracking quality and correct it by hand', status: 'not built yet' },
  { step: 'Detect hole visits and compute per-trial measures', status: 'not built yet' },
  { step: 'Visualize and export CSV / XLSX', status: 'not built yet' },
]

export default function App() {
  return (
    <main>
      <h1>Barnes Maze Analysis Pipeline</h1>
      <p className="lede">
        Turn a folder of Barnes maze videos into per-trial latency, error, and
        search-strategy measures — in your browser. Nothing is uploaded: video
        stays on your machine and the analysis runs locally.
      </p>

      <VideoLoader />

      <section aria-labelledby="remaining-heading">
        <h2 id="remaining-heading">Remaining steps</h2>
        <ol className="milestones" start={2}>
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
