# Barnes Maze Analysis Pipeline

**Live demo:** https://e1400.github.io/barnes-maze-pipeline/
**Demo video:** [watch](https://github.com/E1400/barnes-maze-pipeline/blob/main/demo-video.mov)

A browser-based tool for turning a folder of Barnes maze videos into
per-trial latency, error, and search-strategy measures. Runs entirely
client-side — no install, no server, no account.

## Who it's for

Core facility managers and researchers who currently time Barnes maze trials
by hand with a stopwatch, and need consistent, defensible numbers for a
paper without learning Python or a command line.

## Getting started

**To just use it:** open the live demo above. Download `test50.mp4`,
`test51.mp4`, and `test53.mp4` from
[salk-airc/rse-takehome-2026](https://github.com/salk-airc/rse-takehome-2026/tree/main/data/barnes-maze)
and drag them in — nothing to install.

**To run from source** (Node `^20.19` or `>=22.12`, pinned in
[`.nvmrc`](.nvmrc)):

```bash
git clone https://github.com/E1400/barnes-maze-pipeline.git
cd barnes-maze-pipeline
npm install          # exact versions from package-lock.json
npm run dev          # dev server on http://localhost:5173
```

Other scripts:

```bash
npm run build         # tsc -b && vite build → dist/
npm run preview       # serve the production build
npm run lint          # oxlint --deny-warnings
npm run typecheck     # tsc -b
npm test              # vitest — src/core and src/io
npm run fetch:samples # download the 3 sample clips into data/barnes-maze/
npm run test:e2e      # playwright, against a production build
```

`test:e2e` needs `npx playwright install chromium` once, plus the sample
clips on disk (`npm run fetch:samples`) — without them the timebase
ground-truth tests skip rather than pass silently. CI runs lint, typecheck,
unit tests, build, and e2e on every push
([`ci.yml`](.github/workflows/ci.yml)); the live demo deploys from `main`
([`deploy.yml`](.github/workflows/deploy.yml)).

## How it works

Six steps, all in the browser:

1. **Load videos** — drag and drop. Frame rate, frame count, and duration
   are read from each MP4's own container rather than assumed (`test51` is
   really 14.985 fps, not 15 — ground truth in
   [`docs/timebase-findings.md`](docs/timebase-findings.md)). Everything
   persists to IndexedDB as you go.
2. **Define the maze** — detects the platform, all 20 holes, and their
   rotation with zero clicks; drag or nudge anything that's off, mark the
   target hole (or confirm there wasn't one), and enter the platform
   diameter for real-world units.
3. **Track** — classical computer vision (background subtraction, connected
   components, PCA) runs client-side in a Web Worker. No GPU, nothing
   uploaded.
4. **Review & correct** — scrub to any frame and drag a mistracked point to
   fix it; every measure recomputes live. The hole-investigation threshold
   is adjustable in real units, not a buried constant, and tracking
   failures are always shown as failures rather than smoothed over.
5. **Export** — CSV/XLSX, combined or per video: trial summaries,
   hole-investigation detail, and a quality report (what fraction of each
   video tracked cleanly). A custom-formula column lets you derive your own
   metric (e.g. `totalErrors / pathLengthCm`).
6. **Visualize** — occupancy heatmap, hole-visit timeline, learning curve,
   cohort comparison, a custom-metric scatter plot, and a two-group
   statistical comparison (Mann-Whitney U) — all downloadable as SVG/PNG.

## Out of scope

- **A portable project file.** State persists to IndexedDB (reload-safe on
  the same browser/device) but isn't exportable or importable between
  machines — see Known limitations below.
- **Gap-filling or interpolation.** A `LOST` frame is always shown as
  `LOST` and corrected only by hand.
- **A hosted vision API or trained model.** These clips are an easy
  classical-CV case; a few hundred lines of pure TypeScript handle it with
  no GPU and no data leaving the browser.
- **Cross-video learning.** Each video's detection runs independently of
  every other.

## Known limitations

- **No portable project file** — see Out of scope above.
- **No fallback for browsers without WebCodecs.** Tracking requires it and
  fails with a clear error rather than falling back to a slower decode
  path.
- **Tracking takes real time.** `test50` (5,539 frames) takes roughly two
  minutes end to end. It runs in a Web Worker, so the tab never freezes,
  but there's no batch queue for multiple videos.
- **Nose-vs-tail assignment can momentarily flip** on a genuinely
  ambiguous, near-stationary frame, even after twice widening the
  smoothing window.
- **A tracked video's stored data has no version stamp.** If the tracking
  algorithm improves, a video tracked earlier keeps its old numbers until
  it's manually re-tracked.
- **The sample clips are lower quality than the originals** (re-encoded to
  keep the source repo small); not observed to affect tracking on any of
  the three.

## Accessibility

Keyboard-operable throughout: the maze editor's holes, ring, and boundary,
and the review workspace's correction points, are all focusable and
nudgeable with arrow keys (Shift = 10px) as an alternative to dragging. No
control relies on color alone — shape, stroke weight, and text all carry
meaning too. Every input has a real `<label>`. Verified at 200% browser
zoom.

## Privacy and cost

Nothing leaves your machine. Video decoding and tracking both run
client-side, with the CV pipeline in a Web Worker so the UI never freezes.
No API key, no account, no per-run cost.

## AI-assisted development

See [AI_NOTES.md](AI_NOTES.md) for the tools and setup used, and specific
moments of disagreement or correction, logged as they happened.
[`CLAUDE.md`](CLAUDE.md) is the running architecture-decision record;
`.claude/agents/cv-reviewer.md` and `.claude/commands/sample-check.md` are
project-specific review tooling, not generic scaffolding.

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
docs/           timebase ground truth and an archived copy of the original
                task brief
```

## Background

Originally built for the Barnes maze video-analysis take-home exercise for
a Research Software Engineer role at the Salk Institute's Center for AI
and Research Computing.

## License

[MIT](LICENSE).
