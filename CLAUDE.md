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
- **Frame decoding (implemented 2026-09-03):** WebCodecs `VideoDecoder`, fed
  by mp4box demuxing (the same parser used for the timebase), in
  `src/core/cv/decode.ts`. Seek-and-draw per frame (what the ROI editor uses
  for occasional single-frame grabs) is far too slow for a full clip —
  `test50` is 5539 frames, measured at ~37s for decode alone with seek-and-
  draw's replacement, WebCodecs, vs. minutes if seeking per frame. All three
  clips have real B-frame reordering (decoder output order ≠ this app's
  decode/storage-order frame indices, which is what `stts`/timebase.ts are
  built on); measured max decode-vs-display displacement is 8 frames on all
  three clips, so decoder output is passed through
  `src/core/cv/reorderBuffer.ts` (window 32) before frames reach a caller, and
  callers only ever see ascending decode-order index. **No fallback exists yet**
  for browsers without WebCodecs (the original plan called for playback
  capture) — `decodeVideo` fails with a clear message instead of silently
  guessing; tracking simply isn't available there yet.
- **Tracking runs in a Web Worker** (`src/workers/tracking.worker.ts`), not
  the main thread. Decode + per-frame CV is synchronous CPU-bound JS with no
  natural yield point — measured up to ~4.7 minutes for `test50` (17s
  background pass + 268s tracking pass; two full decode passes, see below) —
  and on the main thread that freezes the tab for the whole run with no
  progress rendered, which reads as a crash. Verified the worker actually
  solves this (not just that it runs) by instrumenting a `setInterval` tick
  counter during a real run and confirming it kept firing throughout.
- **The Worker is owned by `App`, via `useTrackingJob`** (`src/ui/useTrackingJob.ts`),
  not by `TrackingPanel`. It was owned by `TrackingPanel` originally, which
  meant switching to a different video — remounting `TrackingPanel` under a
  new `key` — terminated an in-progress run. A real, reported bug (AI_NOTES
  mistake 11), not a hypothetical: fixed by moving the Worker's lifetime to a
  hook that lives as long as the app does. **Only one job runs at a time by
  design** — the user does not need concurrent tracking, and running several
  CV pipelines at once is a real memory concern for long clips —
  `startTracking` refuses to start a second job, and `TrackingPanel` shows a
  clear "another video is tracking" message with its own button disabled
  rather than queueing or silently no-op'ing.
- **The video table (`src/ui/VideoLoader.tsx`) is the multi-video status
  dashboard.** Elvis asked for a way to navigate/track status across videos
  without a full per-video workspace redesign; the table already listing
  every loaded video was the natural fit — extended with Maze
  (Not defined / Defined) and Tracking (Not tracked / Background N% /
  Tracking N% / Tracked) columns, sourced from `roiStore.listDefinedVideoIds`
  and `trackStore.listTrackedVideoIds` (bulk, additive queries — no schema
  change) plus the live `useTrackingJob` state for whichever video is
  currently running. The background and tracking passes each report their
  own 0–100%, so the status label names the phase explicitly ("Background
  92%" then "Tracking 15%") rather than a bare percentage that would
  otherwise look like it went backwards when the second pass starts over
  from zero (caught in verification, AI_NOTES mistake 11). The row action
  button reads "Define maze" or "Review maze" depending on that same status,
  replacing a button that used to say "Define maze" even after a maze had
  already been defined.
- **Hole investigation (nose-poke) detection is explicitly deferred, not
  forgotten.** `OCCLUDED_IN_HOLE`/`IN_ESCAPE_BOX` require the tracked blob to
  fully vanish, which is correct for genuine escape but structurally cannot
  fire on a nose-poke — the animal's head dips toward a hole while its body
  stays fully visible on the platform, so the blob never disappears at all.
  Confirmed this precisely on `test51`: the nose sits 9–16px from hole 19
  (hole radius ≈13px) for the last 15 tracked frames, state `TRACKED`
  throughout, clip ends mid-investigation. Detecting this needs a different
  signal (nose-to-hole proximity over time, independent of vanish/reappear)
  and, per the brief's own framing ("what counts as investigating a hole has
  no single right answer... the threshold must be visible and adjustable"),
  its own tunable threshold UI — Elvis chose to keep it as its own future
  milestone (event detection) rather than a quick addition here.
- **Manual correction (implemented 2026-09-03, `src/ui/CorrectionViewer.tsx`,
  step 4) is an overlay, not a mutation.** `src/core/corrections.ts` keeps a
  separate `Map<frameIndex, PositionCorrection>`; the tracker's own
  `FrameTrack` array is never edited in place. `applyCorrections()` merges
  the two for display, tagging each frame `isCorrected` so a corrected point
  is always visually distinct (dashed yellow outline) and always revertible
  (delete the map entry, the original detection is still there underneath).
  This is what satisfies both non-negotiables — "corrections survive a
  reload" and "visually obvious which values are automatic vs.
  human-touched" — without needing to touch the tracking pipeline itself.
  **Scope, deliberately narrow (Elvis's choice):** a correction repositions a
  point on a frame already `TRACKED` by the algorithm. It does not relabel a
  frame's *state* — a `LOST`/`OCCLUDED_IN_HOLE` frame shows its state but has
  no draggable point and says so plainly, rather than silently doing
  nothing. State relabeling and manual hole/escape-event marking are real,
  planned follow-up work, not forgotten scope.
  Frame navigation reuses `FrameScrubber` unchanged. Clicking near the
  plotted trajectory jumps to that frame — implemented as a single click
  handler doing a nearest-point scan over all `TRACKED` centroids (not one
  hit-target `<circle>` per frame, which would mean thousands of extra DOM
  nodes on `test50`'s 5539-frame track) — matching within `PATH_CLICK_TOLERANCE`
  (14 view units) before it jumps, so a stray click on the frame image
  doesn't teleport the scrubber. The viewer starts at a smaller size
  (`max-width: 22rem`) with an "Expand viewer" toggle up to its native
  640px — not a fullscreen/modal experience, which wasn't asked for and adds
  real complexity (portals, escape-key handling, focus trapping) this pass
  didn't need.
- **Two full decode passes per video** (`src/core/cv/pipeline.ts`): one to
  build the background model from ~30 frames spread across the whole clip,
  one to run detection/tracking on every frame. The background model needs
  frames near the *end* of the clip before it can be computed, so a
  single-pass design would mean buffering the entire clip in memory while
  waiting for them — ~1.7 GB of raw grayscale for `test50`'s 5539 frames.
  Decoding twice keeps memory bounded to a couple of frames at a time, at a
  real but accepted time cost (roughly 2x a single decode pass).
- **Lost vs in-hole policy:** conservative, implemented in
  `src/core/tracking.ts`'s `Tracker`. A vanished blob is only called
  `OCCLUDED_IN_HOLE` on strong evidence (within `holeProximityRadiusFactor`
  hole-radii of the nearest hole *and* the blob shrunk by at least
  `shrinkFractionRequired` over the preceding `shrinkWindowFrames`);
  ambiguous disappearances are `LOST`. Both parameters are named fields on
  `TrackerParams`, not buried constants. The classification is decided once
  per *vanish streak* and held for every subsequent frame in that streak —
  see AI_NOTES mistake entry 9 for why re-deciding it every frame was wrong.
- **Per-frame state machine:** `TRACKED` / `LOST` / `OCCLUDED_IN_HOLE` (blob
  vanished near a hole ROI — a real event, never interpolated) /
  `IN_ESCAPE_BOX`. `IN_ESCAPE_BOX` has no separate escape-box ROI: it's a
  post-pass (`Tracker.finalize()`) that promotes a trailing
  `OCCLUDED_IN_HOLE` run at the marked target hole to `IN_ESCAPE_BOX` only
  when it runs to the end of the clip without the animal reappearing — a
  hole visit the animal returns from is never escape, regardless of which
  hole. Gap-fill/bridging (`maxBridgedGapFrames`) is declared in
  `TrackerParams` but not yet wired into a display layer — deferred to the
  correction-UI milestone, since "visible, disclosed gap-fill" is a display
  concern, not a classification one.
- **Nose vs. body centroid:** morphological opening (already applied in
  `TypeScriptDetector`) strips the thin tail before the body blob is
  measured; `axisEndpoints` gives both ends of the principal axis. The
  *tracker*, not the per-frame detector, picks which end is the nose — it
  needs velocity (this frame's centroid vs. last frame's) to know the
  direction of travel, which a single frame can't provide. Falls back to
  continuity with the previous nose (whichever end moved least) when
  velocity is below a noise floor, so the nose doesn't flicker between ends
  while the animal is nearly stationary; resets on any vanish, since there's
  no continuity to preserve across a gap.
- **Container parsing:** `mp4box.js` (`mp4box` on npm, pinned) reads the
  `mdhd` timescale and full `stts` table. `src/core/timebase.ts` builds exact
  per-frame times from the cumulative tick sum and reports nominal fps as a
  reduced rational pair. Ground-truth unit tests run against the real clips,
  which `npm run fetch:samples` downloads (CI runs it; the tests skip loudly
  when the files are absent rather than passing vacuously).
- **ROI editor (revised 2026-09-03):** detection-first, not click-first.
  Opening the editor runs `detectMaze` (classical CV: bright-disc platform,
  dark roughly-circular holes, a least-squares circle fit through the
  detected holes locates the centre, and a ring-size search recovers the hole
  count and rotation) and proposes the whole layout with zero clicks. Manual
  3-click placement (platform centre, platform edge, one hole) is the
  fallback for a frame detection can't handle, reachable via "Place by hand".
  Every part of a layout is then drag-adjustable: the centre (drags the ring
  with it — `translateRoi`), a ring handle that stretches or rotates the ring
  in one gesture (`scaleRing` + `rotateRing`), the platform boundary, and
  individual holes. The ring handle sits *between* two holes, not on hole 0's
  angle — it used to coincide exactly with hole 0's generated position and
  was un-clickable, caught by an end-to-end drag test (AI_NOTES, "mistakes"
  entry 7). Holes are stored materialized, not recomputed, so hand nudges
  survive; `nudgedHoles` records which ones a human moved, and resizing the
  ring scales existing hole positions rather than discarding nudges (only
  changing the hole *count* regenerates and clears them, since a different
  count has no correspondence to keep). Calibration (`Platform diameter (cm)`)
  draws a 10 cm scale bar directly on the frame and lists every ROI dimension
  in both px and cm, so entering a diameter visibly does something instead of
  updating one line of sidebar text. Overlay is SVG sharing one viewBox with
  the frame, so click/drag coordinates need no scaling maths and the whole
  thing scales together; e2e tests account for the viewBox-vs-rendered-size
  ratio explicitly since the layout renders the SVG smaller than its viewBox.
- **Frame scrubber:** a real `<input type="range">` (not a custom
  div-based slider) styled as a thick track with tick marks and a thin bar
  thumb rather than a round knob, since a round knob covers the tick it's
  pointing at — this needed to support frame-precise review, not just rough
  scrubbing. Paired with an exact-frame-number entry field and a pin/unpin
  toggle with prev-pin/next-pin navigation, so a reviewer can mark a moment
  of interest and jump back to it without re-scrubbing.
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
src/workers/    tracking.worker.ts — runs decode/background/detection/
                classification off the main thread, posts progress
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
