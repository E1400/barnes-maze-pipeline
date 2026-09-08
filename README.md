# Barnes Maze Analysis Pipeline

**Live demo:** https://e1400.github.io/barnes-maze-pipeline/
**Demo video:** TODO — record last. Must show all three sample videos loaded,
tracked, corrected, and exported live (see the brief's "what your demo has to
show" — one video and an assurance the others work is not enough).

Turns a folder of Barnes maze videos into per-trial latency, error, and
search-strategy measures — entirely in the browser. No install, no server, no
account.

Built for [Task 1](https://github.com/salk-airc/rse-takehome-2026/blob/main/tasks/01-barnes-maze.md)
of the Salk AIRC Research Software Engineer take-home.

## Who it's for

A core facility manager or student who times Barnes maze trials by hand with a
stopwatch, and needs consistent, defensible numbers for a paper without
learning Python or a command line.

## How to run it

**To use it:** open the live demo above. Download `test50.mp4`, `test51.mp4`,
`test53.mp4` from
[salk-airc/rse-takehome-2026](https://github.com/salk-airc/rse-takehome-2026/tree/main/data/barnes-maze)
and drag them in — nothing to install.

**From source** (Node `^20.19` or `>=22.12`, pinned in [`.nvmrc`](.nvmrc)):

```bash
git clone https://github.com/E1400/barnes-maze-pipeline.git
cd barnes-maze-pipeline
npm install          # exact versions from package-lock.json
npm run dev          # dev server on http://localhost:5173
```

```bash
npm run build         # tsc -b && vite build → dist/
npm run preview       # serve the production build
npm run lint          # oxlint --deny-warnings
npm run typecheck     # tsc -b
npm test              # vitest — src/core and src/io
npm run fetch:samples # download the 3 sample clips into data/barnes-maze/
npm run test:e2e      # playwright, against a production build
```

`test:e2e` needs `npx playwright install chromium` once, and the sample clips
on disk (`fetch:samples`) — without them the timebase ground-truth tests skip
rather than pass silently. CI runs lint, typecheck, unit tests, build, and e2e
on every push ([`ci.yml`](.github/workflows/ci.yml)); the live demo deploys
from `main` ([`deploy.yml`](.github/workflows/deploy.yml)).

## What it does

Six steps, all in the browser:

1. **Load videos** — drag and drop. Frame rate/count/duration are read from
   each MP4's own container, not assumed (`test51` is really 14.985 fps, not
   15 — ground truth in [`docs/timebase-findings.md`](docs/timebase-findings.md)).
   Everything persists to IndexedDB as you go.
2. **Define the maze** — auto-detects the platform, all 20 holes, and
   rotation with zero clicks; drag or nudge anything off, mark the target
   hole (or "N/A" if the mouse never escapes), enter the platform diameter
   for real-world units.
3. **Track** — classical computer vision (background subtraction, connected
   components, PCA) runs client-side in a Web Worker. No GPU, nothing
   uploaded.
4. **Review & correct** — scrub to any frame, drag a mistracked point to fix
   it; every measure recomputes live. The hole-investigation threshold is
   adjustable in real units, not a buried constant. Tracking failures are
   always shown as failures, never smoothed over.
5. **Export** — CSV/XLSX, combined or per-video: trials, hole-investigation
   detail, and a quality report (what fraction of each video tracked
   cleanly). A custom-formula column lets you derive your own metric (e.g.
   `totalErrors / pathLengthCm`).
6. **Visualize** — occupancy heatmap, hole-visit timeline, learning curve,
   cohort comparison, a custom-metric scatter plot, and a two-group
   statistical comparison (Mann-Whitney U) — downloadable as SVG/PNG.

## What I chose not to build

- **A portable project file.** IndexedDB persistence is reload-safe (same
  browser/device) but not exportable/importable between machines — see
  Known limitations.
- **Gap-filling/interpolation.** `LOST` frames are always shown as `LOST`,
  corrected only by hand.
- **A hosted vision API or ONNX model.** The sample clips are an easy
  classical-CV case; a few hundred lines of pure TypeScript does the job
  with no GPU and no data leaving the browser.
- **An MCP server or Claude skill for the product itself.** Explicitly
  optional in the brief; not attempted given the time available.
- **Cross-video learning** (a second video processing faster because the
  tool learned from the first). Each video's detection runs independently.

## Known limitations

- **No portable project file** — the closest thing to an actual gap against
  the brief's explicit ask (see above).
- **No fallback for browsers without WebCodecs.** A clear error instead of
  tracking; no seek-and-draw fallback path.
- **Tracking is single-threaded per video and takes real time** — `test50`
  (5,539 frames) takes ~2 minutes end to end. Runs in a Worker, so the tab
  never freezes, but there's no batch queue.
- **Nose-vs-tail assignment can momentarily flip** on a genuinely ambiguous,
  near-stationary frame, even after twice widening the smoothing window.
- **A tracked video's stored data has no version stamp.** If the tracking
  algorithm improves, a video tracked earlier keeps showing old numbers
  until it's manually re-tracked.
- **The re-encoded sample clips are lower quality than the originals** (the
  brief's own tradeoff); not observed to affect tracking on any of the
  three.

## Accessibility

Keyboard-operable throughout — the ROI editor's holes/ring/boundary and the
review workspace's correction points are all focusable and nudgeable with
arrow keys (Shift = 10px) as an alternative to dragging. No control relies on
color alone (shape, stroke weight, or text carry meaning too). Every input
has a real `<label>`. Verified at 200% browser zoom.

## Privacy and cost

Nothing leaves your machine. Video decoding and tracking both run
client-side — the CV pipeline in a Web Worker so the UI never freezes. No API
key, no account, no per-run cost.

## AI-assisted development

See [AI_NOTES.md](AI_NOTES.md) for tools, setup, and specific moments of
disagreement or correction, logged as they happened. [`CLAUDE.md`](CLAUDE.md)
is the running architecture-decision record. `.claude/agents/cv-reviewer.md`
and `.claude/commands/sample-check.md` are project-specific tooling, not
generic scaffolding.

## Repo layout

```
src/core/       pure TS logic, unit-tested (timebase, CV detector, tracking,
                event detection, measures, search strategy, statistics)
src/workers/    tracking.worker.ts — decode/detect/track off the main thread
src/state/      IndexedDB persistence
src/ui/         React components (VideoLoader, RoiEditor, TrackingPanel,
                ReviewWorkspace, ExportPanel, VisualizationsPanel)
src/io/         CSV/XLSX export, chart SVG/PNG download
tests/e2e/      Playwright end-to-end tests
demo-outputs/   committed real outputs for test50 / test51 / test53
docs/           timebase ground truth and an archived copy of the take-home brief
```

## License

[MIT](LICENSE).
