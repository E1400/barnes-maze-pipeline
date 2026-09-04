# Barnes Maze Analysis Pipeline

**Live demo:** https://e1400.github.io/barnes-maze-pipeline/
**Demo video (2–3 min):** TODO — record last, once the flow below is final.
Show all three sample videos start to finish: load, define the maze, track,
correct a frame by hand, watch the investigation list and measures update,
export the CSV. Link it here before submitting — the brief requires it and
the live URL alone is not a substitute.

A browser-based tool that turns a folder of Barnes maze behavior videos into
per-trial latency, error, and search-strategy measures, plus generous
visualizations and a downloadable spreadsheet — no terminal, no install, no
account required.

Built for [Task 1](https://github.com/salk-airc/rse-takehome-2026/blob/main/tasks/01-barnes-maze.md)
of the Salk AIRC Research Software Engineer take-home.

## Who this is for

A core facility manager or student who currently times Barnes maze trials by
hand with a stopwatch and a clicker, and needs consistent, defensible
latency/error/search-strategy numbers for a paper — without learning Python,
a notebook, or a command line.

## How to run it

**To just use it:** open the live demo URL above. There is nothing to install
— no Node, no Python, no account. Download `test50.mp4`, `test51.mp4`, and
`test53.mp4` from
[salk-airc/rse-takehome-2026](https://github.com/salk-airc/rse-takehome-2026/tree/main/data/barnes-maze)
and drag them onto the page to start.

The site is published by
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) on every push to
`main`, from the same `dist/` that `npm run build` produces locally. It serves
from `/barnes-maze-pipeline/`, which is why `base` is set in
[`vite.config.ts`](vite.config.ts); the end-to-end test asserts the built asset
URLs carry that prefix, because a wrong base is invisible locally and renders a
blank page in production.

**To run it from source** you need Node `^20.19` or `>=22.12` (what the Vite 8
toolchain requires). This repo is developed and verified against Node 24,
pinned in [`.nvmrc`](.nvmrc):

```bash
git clone https://github.com/E1400/barnes-maze-pipeline.git
cd barnes-maze-pipeline
nvm use          # optional — picks up the pinned Node version from .nvmrc
npm install      # exact versions come from package-lock.json
npm run dev      # dev server on http://localhost:5173
```

Other scripts:

```bash
npm run build      # tsc -b && vite build — production build into dist/
npm run preview    # serve the production build locally
npm run lint       # oxlint --deny-warnings (a warning fails the build, not just an error)
npm run typecheck  # tsc -b — building the referenced project configs, not `tsc --noEmit -p .`
npm test           # vitest, unit tests for src/core and src/io
npm run test:e2e   # playwright, against a real production build via `vite preview`
```

The end-to-end test drives a real browser, so the first run needs
`npx playwright install chromium` (about 100 MB, once per machine). Everything
except that step runs on a cold clone with nothing but `npm ci`.

Lint, typecheck, unit tests, build, and the end-to-end test all run in CI on
every push — see [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

The sample videos are not committed here (they're large, and they belong to
the take-home repo). To use the app, download `test50`, `test51`, and `test53`
from [salk-airc/rse-takehome-2026](https://github.com/salk-airc/rse-takehome-2026/tree/main/data/barnes-maze)
and drag them in.

To run the full test suite you need them on disk, because the timebase tests
assert measured ground truth against the real files:

```bash
npm run fetch:samples   # downloads the three clips into data/barnes-maze/
```

Without them, those tests skip rather than silently pass; CI always fetches
them, so the ground-truth assertions are always enforced there.

## What it does

A six-step workflow, all in the browser, all reachable without a terminal:

1. **Load videos** — drag and drop, one or many. Each file's frame rate,
   frame count, and duration are parsed from the MP4 container itself and
   shown, so timing is measured rather than assumed. Everything (videos,
   layouts, tracking, corrections) is saved to IndexedDB as you go — closing
   the tab or refreshing never loses work.
2. **Check the maze layout** — opening a video runs classical detection
   (platform edge, all 20 holes, centre, rotation) and proposes the whole
   ring with zero clicks; drag or nudge anything that's off, mark the target
   hole, and enter the platform diameter to calibrate real-world units. A
   layout can be copied onto another video that should be geometrically
   identical, so a facility films the same rig once and reuses it.
3. **Track the animal** — pure-TypeScript classical computer vision
   (background subtraction, connected components, PCA for a nose/tail axis)
   runs entirely client-side in a Web Worker, with a live progress bar. No
   GPU, no model download, nothing sent anywhere.
4. **Review, correct, and detect hole visits** — scrub to any frame, see the
   overlay, drag a mistracked point to fix it; every downstream number
   recomputes immediately. The hole-investigation threshold (nose-to-hole
   distance, minimum duration) is a visible, adjustable setting, not a
   buried constant, and its detected list is itself editable by hand. Every
   computed measure (latency, errors, path length, quadrant time, search
   strategy) is shown with its reasoning and can be manually overridden.
5. **Export** — CSV and XLSX, both a combined cohort file and a per-video
   download, one tidy row per trial plus one row per hole-investigation
   event. Every row carries the detection threshold and the tool version
   that produced it.
6. **Visualize** — an occupancy heatmap, a hole-visit timeline, a cohort
   learning curve, and a cohort comparison, all downloadable as SVG or PNG.

## What I chose not to build, and why

- **No portable project file.** Everything persists to IndexedDB, so a
  refresh or a closed tab never loses work — but that's per-browser, per-
  device storage, not an exportable/importable file a facility could hand
  between machines or archive separately from the browser profile. The
  brief asks for "a documented, reloadable file"; what's here is reload-safe
  but not yet *portable*. Scoped out to prioritize the core tracking/
  correction/measures/export pipeline within the time available — see
  "Known limitations" below.
- **No gap-filling/interpolation.** Deliberately conservative: CLAUDE.md's
  non-negotiable is "tracking failures must be visibly flagged, never
  silently interpolated." `LOST` frames are always shown as `LOST`,
  corrected only by hand, never bridged or held-position-filled.
- **No hosted vision API or ONNX/segmentation model.** The three sample
  clips are a genuinely easy classical-CV case — dark, high-contrast mouse,
  static camera, static background — so a few hundred lines of pure
  TypeScript (median-background subtraction, Otsu threshold, connected
  components) does the job with no GPU, nothing downloaded, and zero data
  leaving the browser. See "Where the data goes" below.
- **No MCP server or Claude skill for the product itself** (distinct from
  the `.claude/` *development* tooling described in `AI_NOTES.md`, which is
  real and used throughout the build). Explicitly optional in the brief;
  not attempted given the time left after the core pipeline.
- **No cross-video reuse of tracking work between videos** ("the second
  video is faster to process than the first, because the tool learned
  something from the first" — from the brief's own "what good looks like").
  Each video's background model and detection run independently; nothing
  learned tracking one video currently speeds up the next. A real, bigger
  piece of work, being scoped separately from this pass's performance
  fixes rather than folded in casually — see the perf branch notes.

## How the frame timing is read

`HTMLVideoElement` exposes a duration and nothing else — no frame rate, no
frame count. Dividing frame count by duration looks like measurement but gives
15.005 fps for `test51.mp4`, which rounds to "15" and is precisely the wrong
answer; the file is really 15000/1001 ≈ 14.985. All three sample clips also
have *variable* frame timing, so no single constant interval describes them.

So the app parses each MP4's `stts` table with mp4box.js, builds exact
per-frame presentation times by cumulative sum of integer ticks, and reports
the nominal rate as an exact rational (`30/1`, `15000/1001`) rather than a
float. Every latency measure is computed from those per-frame times, not from
`index / fps`, and the loader shows the per-file jitter instead of hiding it.
Measured ground truth and the reasoning: [`docs/timebase-findings.md`](docs/timebase-findings.md).

## Known limitations

Distinguishing real defects from deliberate scope decisions (the latter are
in "What I chose not to build," above) — these are things that don't work
right, or don't work yet, not things left out on purpose.

- **No fallback for a browser without WebCodecs.** Frame decoding uses the
  `VideoDecoder` API directly; a browser that doesn't support it (very old
  Safari, some embedded browsers) gets a clear error message instead of
  tracking, not a silent failure — but there's no slower fallback path
  (e.g. seek-and-draw playback capture) behind it yet.
- **Tracking is single-threaded per video and takes real time.** `test50`
  (5,539 frames) takes up to ~4.7 minutes end to end (two full decode
  passes — one for the background model, one for detection/tracking — see
  `pipeline.ts`). There's a progress bar and it runs off the main thread, so
  the tab never freezes, but a facility running sixty videos in one sitting
  will be waiting, one at a time — there's no batch queue.
- **Nose-vs-tail assignment can still momentarily flip** on a genuinely
  ambiguous frame (the animal nearly stationary, body axis ambiguous) even
  after widening the smoothing window twice this project; rare, but not
  eliminated, and worth a visible eye on any trial with unusually high
  hole-investigation counts.
- **A previously-tracked video's stored track has no version stamp.** If the
  tracking algorithm improves (as it did twice during this project), a video
  tracked before the improvement keeps showing pre-improvement numbers until
  someone explicitly clicks "Re-track this video" — there's no UI signal
  telling a user their tracking predates the current algorithm. A page
  reload alone does not re-run tracking; investigations and measures
  recompute live from whatever track is already stored.
- **No portable project file** (see "What I chose not to build" — listed
  again here because it's the closest thing to an actual defect against the
  brief's explicit ask, not purely a scope choice).
- **200% browser zoom has not been explicitly verified.** The layout uses
  relative units and the two edit-heavy screens (ROI editor, review
  workspace) already break out to a wider column, which should hold up, but
  this hasn't been tested at 200% zoom on a real browser and confirmed.
- **`demo-outputs/` is not yet populated.** The brief requires the real,
  committed per-trial summary, per-event detail, and quality report for all
  three sample videos. As of this commit the directory holds only its own
  README explaining what belongs there — the generation step (run all three
  clips through the deployed tool, export, commit the CSVs) hasn't happened
  yet. This is the single most important open item before submission.
- **The re-encoded sample clips are lower quality than the originals**
  (traded off deliberately by the brief's authors to keep the repo small and
  seekable — see `data/barnes-maze/README.md`). Not observed to matter for
  tracking quality on any of the three clips, but noted per the brief's own
  request to flag it if it turns out to matter.

## Where the data goes, and what it costs

**What leaves your machine:** nothing. Video files are never uploaded —
decoding (`VideoDecoder`, a native browser API) and tracking (a pure
TypeScript classical computer-vision pipeline: background subtraction,
thresholding, connected components) both run entirely client-side in your
browser tab, including inside a Web Worker so the UI never freezes. No frame,
coordinate, or measurement is ever sent to a server.

**Keys and cost:** none required. There's no API key, no account, and no
per-run cost — the whole pipeline runs on the CPU in the browser, for free,
for as many videos as you want to process.

## AI-assisted development

See [AI_NOTES.md](AI_NOTES.md) for tools, setup, and specific moments of
disagreement or correction, logged as they happened. `CLAUDE.md` (this repo's
root) is the running architecture-decision record everything above was built
against; `.claude/agents/cv-reviewer.md` and `.claude/commands/sample-check.md`
are the two pieces of custom Claude Code configuration built specifically for
this project, not generic scaffolding.

## Repo layout

```
src/core/       pure TS logic, no DOM — unit-tested with Vitest (timebase,
                geometry, the CV detector, tracking state machine, event
                detection, measures, search-strategy classifier)
src/workers/    tracking.worker.ts — decode/background/detection/tracking
                off the main thread, posting progress
src/state/      IndexedDB persistence layer
src/ui/         React components: VideoLoader, RoiEditor, TrackingPanel,
                ReviewWorkspace, ExportPanel, VisualizationsPanel
src/io/         CSV/XLSX export and chart SVG/PNG download
scripts/        helper scripts (fetching the sample clips)
tests/e2e/      Playwright end-to-end tests
demo-outputs/   committed real outputs for test50 / test51 / test53
                (not yet populated — see "Known limitations")
docs/           build plan and an archived copy of the take-home brief
```

## License

[MIT](LICENSE).
