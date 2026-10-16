# CLAUDE.md

Context for any Claude Code session working on this repository. Read this
before making changes. This file is a short index; the full record lives in
the files it points to. When you make a consequential decision, add it to
[`docs/decisions.md`](docs/decisions.md) under the matching topic rather than
changing code silently. (A parallel claude.ai Project, "Salk Projects", holds
the higher-level planning record; tell the user to mirror a decision there if
a non-coding planning session would care about it.)

## What this is

A take-home exercise for a Research Software Engineer I role at the Salk
Institute's Center for AI and Research Computing (AIRC), requisition
RESEA002823. **Task 1 only, deep**: a browser-based tool that turns a folder
of Barnes maze behavior videos into a spreadsheet a neuroscientist can use in
a paper, without a terminal.

**Status:** finished and submitted (due 2026-09-08, 9:00 AM Pacific, as a repo
link emailed to talmo@salk.edu). Treat further work as maintenance that keeps
the non-negotiables below intact.

## Where to look

- [`docs/decisions.md`](docs/decisions.md): every architecture decision, why,
  and how it was verified, grouped by topic (summarized below).
- [`docs/timebase-findings.md`](docs/timebase-findings.md): measured timebase
  ground truth. [`docs/brief-archive.md`](docs/brief-archive.md): the brief,
  verbatim (do not edit). [`AI_NOTES.md`](AI_NOTES.md): setup and logged
  disagreement moments. `demo-outputs/`: real outputs for all three clips.
- `.claude/agents/cv-reviewer.md` (after tracking/events/measures changes),
  `.claude/commands/sample-check.md` (all three clips), `src/*/README.md`.
- External: https://github.com/salk-airc/rse-takehome-2026 (brief; sample data
  under `data/barnes-maze`, linked, never committed) and
  https://github.com/talmolab/vibes (reference patterns: borrow, don't copy).

## Non-negotiable requirements (from the evaluation rubric)

- **100% static and client-side:** no server, install, terminal, GPU, or
  login screen (Task 1 is exempt from auth).
- **Works on all three clips** (`test50`, `test51`, `test53`). They are not
  interchangeable; a fix validated on one must survive the other two.
- **Tracking failures are visibly flagged, never silently interpolated**, and
  "tracking lost" is kept distinct from "mouse entered a hole."
- **Manual correction:** fix a point or event, everything downstream
  recomputes, it survives reload, and auto vs. human-touched is obvious.
- **ROI step must not cost ~20 clicks/video:** auto-generate the hole ring,
  then nudge holes and mark the target.
- **Real-world units** from a user-entered platform diameter.
- **Timebase from each file's own container metadata**, never an assumed fps
  (`test51` is 15000/1001 ≈ 14.985 fps; `frameCount / duration` is
  plausibly wrong). See `docs/timebase-findings.md`.
- **Visualizations** that export, are colorblind-safe, and read in grayscale.
- **CSV + XLSX export**: tidy per-trial and per-event rows, with parameters
  and tool version embedded.
- **Re-analysis without re-tracking.** Met for same-browser reload only; no
  portable project file (a deliberate final cut, see decisions).
- **Accessibility:** keyboard-navigable (ROI editor included), no meaning by
  color alone, usable at 200% zoom, real labels on controls.
- **Commit real outputs** for all three clips; never the videos themselves.

## Architecture at a glance

One summary per section of [`docs/decisions.md`](docs/decisions.md). Read the
full entry before changing anything it covers.

- **Stack, platform and persistence:** React + TypeScript + Vite on GitHub
  Pages; `mp4box` for container parsing; IndexedDB for all state (reload-safe,
  not portable); SheetJS export; Vitest + Playwright.
- **CV and tracking pipeline:** classical median-background subtraction and
  blob extraction masked to the platform ROI, in pure TS behind a `Detector`
  interface (OpenCV.js not ruled out, and its size is not an "install").
  WebCodecs decode plus a reorder buffer (no non-WebCodecs fallback). Runs in
  a Worker owned by `App` via `useTrackingJob`, one job at a time. Two decode
  passes to bound memory. Morphology performance work, including null results.
- **Tracker states and classification:** `TRACKED` / `LOST` /
  `OCCLUDED_IN_HOLE` / `IN_ESCAPE_BOX`. Lost vs. in-hole is conservative and
  decided once per vanish streak. Escape is a `finalize()` post-pass,
  including the residual-blob case. No gap-filling. Nose end picked from
  smoothed velocity. `LOST` reads "Mouse not in view" in the UI only.
- **ROI / maze definition and calibration:** detection-first editor with a
  3-click fallback, every part drag-adjustable; holes stored
  materialized with nudges tracked; global default platform diameter,
  self-healed in `loadRoi()`; pins written only via `updatePins()`; target
  hole uses `fill: transparent`, not `none`; explicit "no escape" state.
- **Review workspace and manual correction:** every manual edit is an overlay,
  never a mutation (`corrections.ts`, `investigationEdits.ts`,
  `measureOverrides.ts`), so it stays visible and revertible. Correction moves
  points on `TRACKED` frames only; state relabeling is not built. Shared
  `useTrackReview` / `useInvestigations` hooks.
- **Events, measures and overrides:** occlusion and proximity investigations
  on the corrected track; a global threshold shown in real units; rows grouped
  into visits; errors count distinct holes; rule-based search strategy that
  always states its reasoning.
- **Export, visualizations and statistics:** `useCohortData` is the shared
  cohort aggregation; pure row builders in `io/exportRows.ts`; SVG charts with
  SVG/PNG download; Mann-Whitney U; a hand-written formula parser (no
  `eval`).
- **App shell, layout and accessibility:** the video table doubles as the
  status dashboard; wide breakout for steps 2–6; nothing past step 1 renders
  until a video is selected; 200% zoom verified (`overflow-x` on both `html`
  and `body`).

## Repo layout

```
src/core/       pure TS logic, no DOM/React, fully unit-testable
src/workers/    tracking.worker.ts (decode + CV off the main thread)
src/state/      IndexedDB persistence layer
src/ui/         React components and hooks
src/io/         CSV/XLSX and chart (SVG/PNG) export
demo-outputs/   committed real outputs for test50/test51/test53
docs/           decisions, timebase findings, archived brief
```

## Commands

```
npm install
npm run dev        # local dev server
npm test           # vitest (unit)
npm run test:e2e   # playwright (e2e smoke)
npm run build      # production build (tsc -b && vite build)
npm run typecheck  # tsc -b -- use this, not `tsc --noEmit -p .`
npm run lint
```
Versions are pinned in package-lock.json; a cold clone must run from the
README alone.

**Typecheck gotcha:** `tsc --noEmit -p .` against the root config silently
passes real type errors that `tsc -b` catches. Always verify with
`npm run typecheck` or `npm run build`.

## Domain facts worth keeping straight

- **Primary latency**: time to first reach the target hole. **Total
  latency**: time to actually enter the escape box.
- **Primary / total errors**: non-target hole investigations before vs.
  across the whole trial.
- **Search strategy**: *spatial* (direct to target), *serial* (works the ring
  hole by hole), *random* (crosses center, unsystematic). Often the most
  sensitive readout and the most inconsistently scored by eye, so show the
  reasoning and let the user override it.
- "What counts as investigating a hole" has no single right answer in the
  literature. The threshold must be visible and adjustable, never a buried
  constant.
- Key references: Barnes (1979), the original assay. Gawel et al. (2019, open
  access), the best methodological overview. Illouz et al. (2020), on
  search-strategy scoring.

## Working agreements

- Never gitignore `.claude/`, `CLAUDE.md`, `docs/decisions.md`, or
  `AI_NOTES.md`. The brief asks to see them.
- Real, incremental commit history. No squashing.
- **Log real disagreement/correction moments in `AI_NOTES.md`** as they
  happen: what was proposed, what was decided, why, and who was right.
- When proposing a preemptive fix, say whether the failure has been
  **demonstrated** (observed in this repo) or **predicted** (a pattern from
  training data), and don't present a framework default as a bespoke decision.
- New decisions go in `docs/decisions.md`, with the date and how they were
  verified; delete confirmed-unused code rather than keep it as scaffolding.
