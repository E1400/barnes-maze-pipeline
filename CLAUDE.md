# CLAUDE.md

Context for any Claude Code session working on this repository. Read this
before making changes. If you make a consequential decision that isn't
captured here, add it — this file is the single source of truth for the
project once building starts (a parallel claude.ai Cowork Project called
"Salk Projects" holds the higher-level planning record; tell the user to
mirror a decision there if it's the kind of thing a non-coding planning
session would care about).

## What this is

A take-home exercise for a Research Software Engineer I role at the Salk
Institute's Center for AI and Research Computing (AIRC), requisition
RESEA002823. Completing **Task 1 only, deep**: a browser-based tool that
turns a folder of Barnes maze behavior videos into a spreadsheet a
neuroscientist can use in a paper, without a terminal.

- Full original brief, verbatim: [`docs/brief-archive.md`](docs/brief-archive.md)
  (do not edit — it's a snapshot of the take-home repo for offline reference)
- Build plan / milestones: [`docs/plan.md`](docs/plan.md)
- Live take-home repo: https://github.com/salk-airc/rse-takehome-2026
- Sample data (not committed here — link to it, per the brief's instructions):
  https://github.com/salk-airc/rse-takehome-2026/tree/main/data/barnes-maze
- Reference patterns: https://github.com/talmolab/vibes — especially
  `video-player` (frame-accurate seeking), `labelroi`, `sam3-segmenter`,
  `pixel-scale-tool`, `event-annotator`. Borrow patterns, don't copy a tool
  wholesale.

## Deadline

Due **2026-09-08, 9:00 AM Pacific**. Submitted as a GitHub repo link emailed
to talmo@salk.edu (add `talmo` as a collaborator if private).

## Non-negotiable requirements (from the evaluation rubric — do not trade these away for polish elsewhere)

- **100% static, client-side, no server, no install, no terminal for the end
  user.** Task 1 is explicitly exempt from auth — do not add a login screen.
- Must work on **all three sample videos** (`test50`, `test51`, `test53`) —
  never hardcode to one. They are not interchangeable; a fix validated on one
  needs to survive the other two.
- **No GPU assumed**, nothing for the user to install for the CV to run.
- **Tracking failures must be visibly flagged, never silently interpolated.**
  A beautiful, wrong trajectory is worse than an honest gap.
- **Manual correction is mandatory:** scrub to a frame, see the overlay, fix
  the point or event, everything downstream recomputes, corrections survive a
  reload, and it's visually obvious afterward which values are automatic vs.
  human-touched.
- **Distinguish "tracking lost" from "mouse entered a hole."** Both look like
  the blob vanishing; they mean opposite things and drive different measures.
- **The ROI step must not cost ~20 clicks/video.** Auto-generate the 20-hole
  ring from a couple of clicks (platform center + edge), let the user nudge
  individual holes and mark the target. This is the single most-watched UX
  decision in the brief.
- **Real-world units:** calibrate px→cm from a user-entered platform diameter.
  Path length in pixels is not publishable.
- **Timebase from each file's own container metadata**, never an assumed fps
  — `test51.mp4` is 15000/1001 ≈ 14.985 fps, not 15. All three clips have
  *variable* frame timing in their `stts` tables, and `frameCount / duration`
  gives a plausible wrong answer (15.005 for `test51`). Measured ground truth
  and the required approach: [`docs/timebase-findings.md`](docs/timebase-findings.md).
- **Visualizations, generously** — trajectory overlays, path plots colored by
  time, occupancy heatmaps, hole-visit rasters, learning curves, cohort
  comparisons — exportable, colorblind-safe, legible in grayscale.
- **CSV + XLSX export**, one tidy row per trial plus per-event detail,
  parameters and tool version embedded in the export.
- **A documented, reloadable project file** so the facility can re-analyze
  without re-tracking.
- **Accessibility:** keyboard-navigable (including the ROI editor — plan a
  keyboard alternative to click-and-drag), no meaning encoded by color alone,
  usable at 200% browser zoom, real labels on controls.
- **Commit the real generated outputs** for all three clips into the repo
  (per-trial summary, per-event detail, quality report) — do not commit the
  sample videos themselves, link to the source repo instead.
- **`AI_NOTES.md`**: log real disagreement/correction moments **as they
  happen**, not reconstructed at the end. See the skeleton already in the
  repo root — fill it in incrementally.

## Architecture decisions

Recorded here so we don't relitigate them mid-build. Add to this list, don't
just change code silently, when a decision changes.

- **Stack:** React + TypeScript + Vite, deployed to GitHub Pages (fully
  static hosting is a natural fit for a fully static app).
- **CV approach:** classical background subtraction (median-of-frames
  background model) + blob extraction, masked to the platform ROI (this is
  what rejects the cable/hardware visible outside the platform edge in
  `test51`). Chosen over an ONNX segmentation model or a hosted vision API
  because the sample frames are a genuinely easy classical-CV case (dark,
  high-contrast mouse, static camera, static background) — no GPU, nothing
  downloaded, zero data leaving the browser.
- **CV engine (revised 2026-09-01):** pure TypeScript in `src/core/cv/`,
  behind a `Detector` interface, rather than OpenCV.js as originally decided.
  The operations needed (median background, abs-diff, Otsu threshold,
  morphological open, connected components, centroid, PCA axis) are a few
  hundred lines of pure functions that unit-test directly on synthetic frames.
  **OpenCV.js is not ruled out** — the interface exists so an OpenCV backend
  can be implemented and compared on identical frames. Note for future
  sessions: OpenCV.js's size is *not* a violation of the brief's "nothing to
  install" requirement (it is a cached static asset, not an installation);
  do not repeat that argument.
- **Frame decoding:** WebCodecs `VideoDecoder`, fed by mp4box demuxing (the
  same parser already used for the timebase), with a playback-capture fallback
  for browsers without WebCodecs. Seek-and-draw per frame is far too slow —
  `test50` is 5539 frames — and playback capture is real-time-bound and can
  drop frames, which is a correctness problem, not just a slow one.
- **Lost vs in-hole policy:** conservative. A vanished blob is only called
  `OCCLUDED_IN_HOLE` on strong evidence (near a hole ROI *and* shrinking
  beforehand); ambiguous disappearances are `LOST` and flagged for review. An
  honest gap beats a beautiful wrong answer.
- **Per-frame state machine:** `TRACKED` / `LOST` (brief gaps only, gap-fill
  method disclosed and visible) / `OCCLUDED_IN_HOLE` (blob vanished near a
  hole ROI — a real event, never interpolated) / `IN_ESCAPE_BOX`.
- **Nose vs. body centroid:** morphological opening to strip the thin tail
  before computing the body blob; fit an ellipse; nose = the leading extremum
  along the direction of travel.
- **Container parsing:** `mp4box.js` (`mp4box` on npm, pinned) reads the
  `mdhd` timescale and full `stts` table. `src/core/timebase.ts` builds exact
  per-frame times from the cumulative tick sum and reports nominal fps as a
  reduced rational pair. Ground-truth unit tests run against the real clips,
  which `npm run fetch:samples` downloads (CI runs it; the tests skip loudly
  when the files are absent rather than passing vacuously).
- **ROI editor:** three clicks (platform centre, platform edge, one hole)
  generate the whole ring; the clicked hole fixes both ring radius and
  rotation, so hole 0 lands where the user clicked. Holes are stored
  materialized, not recomputed, so hand nudges survive; `nudgedHoles` records
  which ones a human moved. Changing a ring parameter regenerates and clears
  nudges, and says so. Overlay is SVG sharing one viewBox with the frame, so
  click coordinates need no scaling maths and the whole thing scales together.
- **Persistence:** IndexedDB (video blobs, ROIs, tracking data, corrections,
  parameters) — a refresh must never lose annotation work.
- **Export:** SheetJS for CSV/XLSX.
- **Testing:** Vitest for pure logic (timebase math, ROI geometry, event
  detection, the search-strategy classifier), Playwright for an end-to-end
  smoke test of the full workflow.

## Repo layout

```
src/core/       pure TS logic — no DOM/React, fully unit-testable
                (timebase, geometry, tracking types, event detection,
                measures, search-strategy classifier)
src/workers/    OpenCV.js worker: background model, per-frame extraction,
                progress messaging
src/state/      IndexedDB persistence layer
src/ui/         React components: VideoLoader, ROIEditor, Scrubber /
                CorrectionPanel, EventDetectionPanel, MeasuresTable,
                Visualizations, ExportPanel
src/io/         CSV/XLSX export, versioned project-file JSON schema
demo-outputs/   committed real outputs for test50/test51/test53
docs/plan.md            phased build plan (mirrors the Salk Projects
                        claude.ai Project)
docs/brief-archive.md   verbatim copy of the take-home brief
```

## Commands

```
npm install
npm run dev        # local dev server
npm test            # vitest (unit)
npm run test:e2e    # playwright (e2e smoke)
npm run build       # production build
npm run lint
```
(Pin versions in package-lock.json — the brief requires a cold clone to run
from the README alone.)

## Domain facts worth keeping straight

- **Primary latency** — time to first reach the target hole. **Total
  latency** — time to actually enter the escape box.
- **Primary / total errors** — non-target hole investigations before vs.
  across the whole trial.
- **Search strategy**: *spatial* (direct to target), *serial* (works the ring
  hole-by-hole in order), *random* (crosses center, unsystematic). This is
  often the most sensitive readout in the assay and the one most often scored
  inconsistently by eye — show the reasoning behind the label, let the user
  override it.
- "What counts as investigating a hole" has no single right answer in the
  literature — the threshold must be visible and adjustable, not a buried
  constant.
- Key references: Barnes (1979) — original assay. Gawel et al. (2019, open
  access) — best single methodological overview. Illouz et al. (2020) — good
  on search-strategy scoring.

## Working agreements

- Never gitignore `.claude/`, `CLAUDE.md`, or `AI_NOTES.md` — the brief
  explicitly asks to see them.
- Real, incremental commit history — no squashing the project into one
  commit.
- **Log every time Elvis overrides a Claude proposal**, in the "Where the
  human overrode the model" section of `AI_NOTES.md`, at the moment it
  happens — not reconstructed later. Applies to any session, terminal or
  chat. Record what was proposed, what Elvis decided instead, the reasoning,
  and who turned out to be right. This is a deliberate record of where the
  project diverged from model judgment; the brief asks for real disagreement
  moments, and a human overruling the model is the most informative kind.
- When proposing a preemptive fix, state whether the failure it prevents has
  been **demonstrated** (observed in this repo) or **predicted** (pattern
  from training data). Elvis calibrates on that distinction — don't blur it,
  and don't present a framework/template default as a bespoke decision.
- Milestone order (cut from the bottom if time runs short): scaffold → ROI
  editor → CV tracking core → cleanup/correction UI → event detection &
  measures → visualization & export → compliance & ship. Full detail in
  `docs/plan.md`.
