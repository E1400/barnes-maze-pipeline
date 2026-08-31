/**
 * Application shell.
 *
 * Milestone 1 is the scaffold only: the shell exists so the toolchain, the
 * end-to-end test, and the deployment target have something real to run
 * against. The workflow steps below are placeholders until their milestone
 * lands (see docs/plan.md); each one gets replaced by the component named in
 * the CLAUDE.md repo layout.
 */

type Milestone = {
  readonly step: string
  readonly status: string
}

const MILESTONES: readonly Milestone[] = [
  { step: 'Load videos (drag and drop, stored in your browser)', status: 'not built yet' },
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

      <h2>Build status</h2>
      <ol className="milestones">
        {MILESTONES.map((milestone) => (
          <li key={milestone.step}>
            <span>{milestone.step}</span>
            <span className="status">{milestone.status}</span>
          </li>
        ))}
      </ol>
    </main>
  )
}
