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
- Build plan / milestones: `claude/task1-plan.md` in the "Salk Projects"
  claude.ai Project (removed from this repo, 2026-09-07 — internal planning
  scaffolding, not something a submission reviewer needs; not a deferred
  deliverable, a deliberate cut)
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
  new `key` — terminated an in-progress run. A real, reported bug, not a
  hypothetical: fixed by moving the Worker's lifetime to a
  hook that lives as long as the app does. **Only one job runs at a time by
  design** — the user does not need concurrent tracking, and running several
  CV pipelines at once is a real memory concern for long clips —
  `startTracking` refuses to start a second job, and `TrackingPanel` shows a
  clear "another video is tracking" message with its own button disabled
  rather than queueing or silently no-op'ing.
- **The video table (`src/ui/VideoLoader.tsx`) is the multi-video status
  dashboard.** Wanted a way to navigate/track status across videos
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
  from zero (caught in verification). The row action
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
  its own tunable threshold UI — kept as its own future
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
  **Scope, deliberately narrow:** a correction repositions a
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
  doesn't teleport the scrubber. The viewer has an "Expand viewer" toggle
  (`max-width: 22rem` collapsed, native 640px expanded) and **defaults to
  expanded** — not a fullscreen/modal experience, which wasn't asked for and
  adds real complexity (portals, escape-key handling, focus trapping) this
  pass didn't need. The ROI editor (step 2) got the same toggle, also
  defaulted to expanded, for consistency.
- **`.roi-hole--target`'s fill is fully transparent, not `none`.** It shares
  a look with `.roi-hole--target-ring` (the hollow outline drawn *around*
  the target hole) but is a structurally different element — the main hole
  circle — and an original rule grouping them under one `fill: none` once
  silently made the target hole undraggable: SVG only hit-tests a shape's
  *painted* area, so with no fill only its ~2px stroke edge registered
  pointer events. Got this property wrong twice before landing right: a
  solid fill restored draggability but hid the mouse at the exact instant
  it entered the hole — the thing a reviewer is there to watch — and a
  translucent fill after that still dimmed it. The actual answer is
  `fill: transparent`, a real value distinct from `none`: SVG hit-testing
  only cares whether a shape *has* a fill, not its opacity, so the centre
  is completely see-through while staying exactly as draggable as solid
  was — confirmed directly with a Playwright centre-click test. All hole
  circles also got thinner strokes generally, same reasoning: legible at a
  glance, never thick enough to obscure the animal underneath. The
  correction viewer's trajectory plot keeps the same outer ring the ROI
  editor has, so the target reads clearly there too.
- **Pins are updated separately from ROI (`updatePins()` in
  `src/state/roiStore.ts`), never as a side effect of saving ROI geometry.**
  `CorrectionViewer` and `RoiEditor` both have their own pin toggle on the
  same per-video pin list, but only `RoiEditor` owns ROI editing — its `roi`
  reaches `CorrectionViewer` as a prop from `App`, and that prop is briefly
  stale (the previous video's value) for one render immediately after
  switching videos, before `RoiEditor`'s own reset propagates back up. A
  pins-save that also wrote `roi` from that prop was a real, demonstrated
  bug: switching videos could silently overwrite a video's correct, already-
  detected ROI with a *different* video's coordinates.
  `updatePins()` does a read-modify-write inside one IndexedDB transaction
  that only ever touches `pins`, using whatever ROI is actually persisted —
  structurally impossible for a stale prop to reach storage through it,
  rather than a guard that has to be remembered to keep working.
- **Nose direction is smoothed over `Tracker.NOSE_DIRECTION_WINDOW` (10
  frames, widened twice from an original 5) and `MIN_INFORMATIVE_SPEED`
  (1.5 px/frame, widened from 0.5)** (`src/core/tracking.ts`), not the
  single previous frame. A one-frame centroid delta is dominated by
  per-frame position noise and can flip sign even when the animal's real
  motion hasn't changed, which used to flip the nose to the tail for a
  frame and back while reviewing tracked footage. This stopped being purely
  cosmetic once hole-investigation detection shipped: `events.ts` reads
  `frame.nose` directly for proximity detection, so jitter fabricated
  short-lived spurious investigation rows wherever the tail end swung
  toward, most visibly on `test50` (the longest clip, most opportunity for
  jitter to accumulate). Verified two ways after the second widening: unit
  tests (a widened reversal-sequence test, plus a new adversarial jitter
  test that would have crossed the old threshold), and a real re-track of
  `test50` (investigation count 119 → 105, search-strategy
  order-consistency 92% → 95%, label unchanged: Serial). A real debugging
  episode worth remembering: a report that the fix "didn't work" (`test50`
  still classifying Random) traced not to the algorithm but to caching —
  investigations and search strategy recompute live from whatever track is
  already *stored* in IndexedDB, so a video tracked before the fix keeps
  showing pre-fix numbers until it's explicitly re-tracked, and reloading
  the page is not the same as re-tracking. A "not yet consequential" claim
  about a field is only true until a new feature starts reading that
  field — worth re-checking, not just trusting, once cited again.
- **Two full decode passes per video** (`src/core/cv/pipeline.ts`): one to
  build the background model from ~30 frames spread across the whole clip,
  one to run detection/tracking on every frame. The background model needs
  frames near the *end* of the clip before it can be computed, so a
  single-pass design would mean buffering the entire clip in memory while
  waiting for them — ~1.7 GB of raw grayscale for `test50`'s 5539 frames.
  Decoding twice keeps memory bounded to a couple of frames at a time, at a
  real but accepted time cost (roughly 2x a single decode pass).
- **Tracking speed: ~2.7x real end-to-end improvement (2026-09-04),
  `src/core/cv/detector.ts` + `morphology.ts`.** Real
  tracking runs were feeling close to 10 minutes for `test50`, too slow for a
  2-3 minute demo video that has to include loading and tracking on camera.
  Investigated with a real per-frame benchmark before guessing at a fix
  (a throwaway Vitest file, not committed): a **first hypothesis --
  per-frame buffer allocation/GC churn -- was checked and was wrong.**
  `TypeScriptDetector` used to allocate ~8 fresh full-frame buffers
  (~3MB) on every `detect()` call; giving it reusable scratch buffers
  (`image.ts`'s `absDiff`/`applyMask`, `threshold.ts`'s `binarize`,
  `morphology.ts`'s `erode`/`dilate`/`open`, and `components.ts`'s
  `connectedComponents` all gained an optional trailing `out` parameter,
  defaulting to a fresh allocation so every existing caller and test is
  unaffected) measured as only a **1.03x** speedup -- a real, honest null
  result, reported as such rather than kept quiet or presented as the fix.
  Stage-by-stage timing on a real 640x480 frame then found the actual
  answer: `open()` (erode + dilate, the tail-stripping morphology step)
  was **87.7% of the entire per-frame cost** (44ms of ~51ms) -- not the
  O(radius) algorithm itself, but `filterSeparable`'s per-neighbour
  `reduce: (a, b) => number` callback being invoked roughly 20 times per
  pixel (2 passes x 2xradius neighbours), ~6 million indirect calls per
  frame. Inlining the min/max comparison (two code paths instead of a
  callback parameter) and short-circuiting the moment a 0/1 mask value
  already forces the answer (an eroding window can stop at its first 0,
  a dilating one at its first 1) cut that stage from 44ms to 8.7ms/frame
  on the same benchmark -- **4.2x on the CV computation itself**, and a
  measured **120.1s** real end-to-end re-track of `test50` in a real
  browser (down from this session's own measured 328s baseline, and from
  the originally reported ~10 minutes) -- **~2.7x real-world**, the CV-only ratio
  diluted somewhat by decode/Worker overhead that this change doesn't
  touch. Verified as behaviour-preserving, not just faster: the full
  existing test suite (which already exercises masked/unmasked, varied
  content, and a shared reused detector instance across many `it()`
  blocks) passed unchanged, plus two new tests -- a reused-instance
  adversarial sequence (masked animal-present frame immediately followed
  by an empty unmasked one, checking no stale buffer value leaks through)
  and a byte-for-byte cross-check of the rewritten `filterSeparable`
  against an independently-written naive reference on pseudo-random
  content touching every edge and corner, not just the tidy geometric
  shapes the existing tests use. **Caught one real bug by hand-tracing
  before it shipped:** an early draft set the morphology "outside the
  image" fill value to `1` for erosion on the theory that boundary pixels
  shouldn't be forced to shrink -- but the *original* code used `0` for
  both erode and dilate (verified by re-reading the pre-existing call
  sites, not assumed), and changing it would have been a real behaviour
  change disguised as a speed fix. **Two further optimization ideas
  checked afterward and found not worth shipping, same honesty standard
  as the buffer-reuse result above:** an interior/border split (pixels far
  enough from the image edge to never need a bounds check take a branch-
  free fast path, only the border columns/rows pay for the check) measured
  1.06x on the same benchmark -- branch prediction was apparently already
  handling the redundant, always-true bounds check well; a fully-unrolled
  radius-2 fast path was considered but not built at all once the
  interior/border result came back marginal, since it would add a
  permanent two-tier code path (fast for the default radius, slower for
  any other) for a similarly small return. Concluding from this, not just
  assuming it: the earlier callback-removal fix already captured
  the large win available in this algorithm's current shape; a genuinely
  different approach (a true O(1)-per-pixel monotonic-deque/van Herk
  filter) is the only remaining lever that showed real headroom in the
  profiling, and wasn't attempted given the returns already measured
  from two cheaper attempts at squeezing the existing shape further.
- **Not yet built, and deliberately not attempted without checking in
  first:** "the second video is faster to process than the first, because
  the tool learned something from the first" (the brief's own "what good
  looks like" framing) is a different, bigger kind of speedup -- cross-video
  reuse of e.g. the background model or detection parameters -- it reads
  as more machine-learning-flavoured than this classical
  pipeline calls for; out of scope, not just deferred.
- **Lost vs in-hole policy:** conservative, implemented in
  `src/core/tracking.ts`'s `Tracker`. A vanished blob is only called
  `OCCLUDED_IN_HOLE` on strong evidence (within `holeProximityRadiusFactor`
  hole-radii of the nearest hole *and* the blob shrunk by at least
  `shrinkFractionRequired` over the preceding `shrinkWindowFrames`);
  ambiguous disappearances are `LOST`. Both parameters are named fields on
  `TrackerParams`, not buried constants. The classification is decided once
  per *vanish streak* and held for every subsequent frame in that streak —
  re-deciding it every frame instead produced flicker between states.
- **Per-frame state machine:** `TRACKED` / `LOST` / `OCCLUDED_IN_HOLE` (blob
  vanished near a hole ROI — a real event, never interpolated) /
  `IN_ESCAPE_BOX`. `IN_ESCAPE_BOX` has no separate escape-box ROI: it's a
  post-pass (`Tracker.finalize()`) that promotes a trailing
  `OCCLUDED_IN_HOLE` run at the marked target hole to `IN_ESCAPE_BOX` only
  when it runs to the end of the clip without the animal reappearing — a
  hole visit the animal returns from is never escape, regardless of which
  hole.
- **Gap-fill/bridging removed, not deferred (2026-09-04).** A
  `maxBridgedGapFrames` field lived on `TrackerParams` from early in the
  project, documented as "declared... but not yet wired into a display
  layer." It never got wired in, and by this point in the project nothing
  read it — a genuinely dead field, not a real feature. Rather than
  continue deferring it, deleted it outright: `LOST` frames display as
  `LOST`, full stop, with no bridged/held-position rendering. This is a
  scope decision, not a silent regression — it was never functional to
  begin with, and CLAUDE.md's own convention is to delete confirmed-unused
  code rather than carry it as aspirational scaffolding. Manual correction
  is still the only way to fix a `LOST` span, exactly as `TrackViewer.tsx`
  has always said.
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
- **Hole-investigation detection and measures (2026-09-02):** `src/core/events.ts`
  detects two kinds of investigation, both on the corrected track
  (`EffectiveFrame[]`), never the raw one: `occlusion` events are read
  straight off the tracker's own `OCCLUDED_IN_HOLE` runs (unconditional —
  the tracker already confirmed them); `proximity` events are nose-to-hole
  distance sustained for `minFrames` consecutive frames within
  `proximityRadiusFactor × holeRadius`, both adjustable in the UI per
  CLAUDE.md's "no buried constant" rule, not just documented as adjustable.
  Frames already claimed by an occlusion are excluded from proximity
  detection so the same span is never counted twice. `src/core/measures.ts`
  turns that event list into the per-trial numbers: primary/total latency
  and primary/total errors follow the exact definitions in "Domain facts"
  below; path length and speed convert through the platform calibration and
  are `null` (not zero) until it's set; quadrant time is oriented around the
  target hole's angle from the platform centre and attributes
  `OCCLUDED_IN_HOLE`/`IN_ESCAPE_BOX` frames to their known hole location
  (not a guess) while `LOST` frames contribute to no quadrant at all, same
  honest-gap policy as everywhere else. Verified against real tracked output
  from `test51.mp4` and `test53.mp4` (not just synthetic frames) before
  calling this done — see AI_NOTES.md.
- **Review workspace (2026-09-03): steps 4 and 5 merged into one screen,**
  the video viewer and the investigation list side by side rather than
  stacked sections a reviewer scrolled between. Data
  (tracks, corrections, frame index, the decoded frame) moved into a shared
  hook, `useTrackReview` (`src/ui/useTrackReview.ts`), called once by
  `ReviewWorkspace` and passed to `TrackViewer` (the rendering half of the
  old `CorrectionViewer`) and the investigation components as props — the
  pieces would otherwise each load their own copy of the track and have no
  way to share one frame index, which is exactly what a "jump to this
  investigation" button needs. Gating ("define the maze first" / "track the
  video first") is asserted once at the workspace level, not duplicated per
  half.
- **Review workspace layout: stats under the viewer, the full table beside
  it.** The investigation logic (threshold params + edits + the computed
  list) was pulled out of a single `InvestigationPanel` into its own hook,
  `useInvestigations` (`src/ui/useInvestigations.ts`), so it can be called
  once and shared by two separately *positioned* components: `TrialStats`
  (the computed numbers, stacked under the viewer — you look at the animal,
  then see what it produced) and `InvestigationTable` (the full row-by-row
  list, beside the viewer). Both this section and the ROI editor (step 2,
  same width complaint) break out of the app's normal 60rem reading width to
  `min(90rem, 100vw - 5rem)` via the `left: 50%; transform:
  translateX(-50%)` full-bleed centering technique — these are the two
  screens meant to be lived in while working a trial, not read top to
  bottom once.
- **The investigation table caps at roughly one viewport and scrolls
  internally, on a long clip's list (revised twice, 2026-09-03).** First
  built with no cap at all (the table just ran on as long as it needed,
  page scrolling past it). On `test50` (5539 frames, 119 investigations)
  that meant scrolling well past the video to see the rest of the rows, so
  a capped, internally-scrolling box was wanted again — with the
  caveat that the earlier version of that same idea (mistake-adjacent, not
  numbered since it never shipped to `main`) had been removed for being too
  restrictive, so this one needed to actually work. First attempt used
  `align-items: stretch` on `.review-grid` plus `flex: 1; min-height: 0;
  overflow-y: auto` on the table's wrapper, on the theory that the
  investigation panel would stretch to match the video+stats column's
  height and the inner wrapper would cap to that. It didn't: a CSS grid row
  with no explicit height auto-sizes to its *tallest* item, and `overflow`
  doesn't shrink an item's contribution to that auto-sizing (`min-height: 0`
  only stops a flex/grid item from refusing to shrink *below* an
  already-constrained parent — it doesn't manufacture a constraint that
  isn't there) — so a long table just dragged the whole row, and the video
  column with it, up to match its own full content height, and nothing
  ever actually scrolled. Caught by measuring `scrollHeight` vs.
  `clientHeight` directly in a real browser against `test50` rather than
  trusting the CSS reads correctly (`scrollHeight === clientHeight`, i.e.
  provably not scrolling, on the first attempt). Fixed with an explicit
  `max-height: calc(100vh - 6rem)` on `.investigation-panel` — a real,
  independent constraint a grid item's stretch has to respect — verified
  the same way afterward (`scrollHeight` 4123px against a capped
  `clientHeight` of 745px on `test50`, confirmed genuinely scrollable).
- **Stat cards grouped with one description per group, not per card
  (2026-09-03).** "Primary latency" and "Total latency" used to each stand
  alone with no explanation; now "Latency" is a group heading with one
  sentence ("Time from the start of the trial") and the two cards under it
  just say "To target" / "To escape" — short because the group already gave
  the context. Same pattern for Errors, Path, and Quadrant time. Quadrant
  time specifically kept (not dropped, despite some uncertainty about its
  value) because a target-quadrant search bias is a standard spatial-memory
  readout in this literature, same family as the Morris water-maze probe
  trial — now labelled and described as such rather than left as four
  unexplained numbers.
- **`TrackingPanel` (step 3) no longer duplicates step 4's numbers.** It used
  to show a 4-line checklist (Tracked/Lost/In a hole/Escaped frame counts) —
  the last two are exactly what step 4's investigation table and latency
  cards already cover, with real context (which hole, when), so showing bare
  frame counts here again read as redundant, unexplained clutter.
  Now a single status line, phrased `"{total} frames processed:
  {tracked} tracked{, N with the mouse not in view (%)}"` — leads with the
  total so a completed run never reads as partial. That phrasing was chosen
  deliberately, not the obvious `"{tracked} of {total} frames tracked"`:
  once the escape-detection refinement below started reclassifying a real
  trailing run of frames away from TRACKED, a completed 741-frame run could
  legitimately show "541 of 741" for its tracked count, which reads exactly
  like an unfinished run even though every frame was processed — caught by
  misreading my own output while verifying that refinement (see
  AI_NOTES.md). Tracking QA only; LOST ("mouse not in view" in the UI, see
  below) is the one thing this step is actually responsible for confirming
  honestly.
- **Manual investigation editing (2026-09-03), `src/core/investigationEdits.ts`:**
  add/delete/edit for the hole-investigation list, an overlay on the
  detector's output exactly like `corrections.ts` is for positions — the
  detected list itself is never mutated. An auto-detected investigation is
  identified by `auto-${startFrame}` (unique: the detector's runs never
  overlap) and "deleted" by adding that id to `removedAutoIds`, never by
  removing it from the detector's own array. A manually added investigation
  gets its own id (`crypto.randomUUID()`, assigned by the caller — the pure
  module stays deterministic and testable) and is fully editable in place
  (hole, start frame, end frame) since there's no "original" to compare
  against. This exists because the detector's honest-gap policy means a real
  event can go undetected — CLAUDE.md's non-negotiable "tracking failures
  must be visibly flagged, never silently interpolated" cuts both ways: an
  reviewer who *watched* the mouse enter the target hole needs to be able to
  say so, not have the tool insist it never happened. `measures.ts` was
  split (`computeTrialMeasuresFromInvestigations`, generic over the
  investigation shape) so the UI can feed it this edited list directly
  rather than only the detector's raw output; `computeTrialMeasures` is now
  a thin wrapper that calls `detectInvestigations` first, kept for the
  existing tests and any caller with no edits to apply.
- **Detection criteria shown in real units, not an opaque multiplier.** The
  underlying params (`proximityRadiusFactor`, `minFrames`) are unchanged —
  still the values `events.ts` actually uses — but the UI displays and edits
  the *derived* radius (cm once the platform is calibrated, px otherwise) and
  minimum duration (seconds, via the clip's own nominal fps), converting
  back to the stored factor/frame-count on input. "×1.5 hole radii" and "3
  frames" are correct but not something a reviewer can reason about without
  doing the arithmetic themselves; a radius in cm and a duration in seconds
  are the units the literature and the researcher actually think in.
- **Detection criteria are a global setting, not per-video (revised
  2026-09-03).** A facility scores every video in a study against the same
  investigation threshold — re-choosing it per clip would make trials
  incomparable, and re-typing it would just be the per-video click cost the
  brief asks to avoid, same reasoning as the platform-diameter default.
  `investigationParamsStore.ts` now reads/writes a single `STORE_SETTINGS`
  key (`globalInvestigationParams`) instead of a per-video record; the old
  per-video store (`STORE_INVESTIGATION_PARAMS`) is left in the schema,
  unused, rather than migrated — no destructive migration needed for a value
  the UI simply stops reading. Editable from two places that both write the
  *same* global value: a live, real-unit-converted control in step 4 (once a
  video is tracked, so the conversion has a real hole radius and calibration
  to work from) and a summary readout next to the loaded-videos table in
  step 1, so the current standard is visible before opening any one video.
  Step 2 (defining the maze) also states plainly that this is a global
  setting, so a reviewer isn't surprised later that adjusting it for one
  video changed every other video's numbers too.
- **Platform diameter has a global default (2026-09-03), entered prominently
  in step 1** (`VideoLoader.tsx`, `STORE_SETTINGS` key `defaultPlatformDiameterCm`)
  and used to seed every newly created ROI's own diameter field — a facility
  runs the same rig across a whole folder of videos, so re-typing the same
  number per video is exactly the kind of per-video click cost the brief
  asks to avoid (same reasoning as the ROI template). Still fully overridable
  per video in step 2, which is the field that actually drives that video's
  calibration; the default only seeds a *new* ROI, it never overwrites an
  already-saved one. Step 2's own diameter field moved to the top of the
  sidebar in a highlighted callout (dashed border while unset, solid once
  it's set — a shape difference, not just a colour one) rather than being
  the third subsection down, since real-world units are load-bearing for
  every measure downstream, not a footnote.
- **Platform-diameter self-heal: a three-layer bug chain, now centralized
  in `loadRoi()` (`state/roiStore.ts`).** Layer one: the length/speed stat
  cards were blank on some videos with no explanation. Root cause was a
  race in `RoiEditor.tsx` — the default diameter was read once into a ref
  by its own mount-time effect, and a separate auto-detection effect read
  that ref when building a new ROI, with no guarantee which of the two
  IndexedDB reads resolved first; whichever videos' detection effect won
  the race got a new ROI seeded with `platformDiameterCm: null`. Fixed by
  reading the default fresh at the point of use instead of a pre-loaded
  ref. Layer two: that only stopped *new* ROIs from being created null —
  re-tracking a video never touches its ROI, so a layout already saved
  without a diameter stayed broken regardless. Fixed with a self-heal that
  applies and persists the current default whenever a saved layout loads
  with a null diameter. Layer three: that self-heal still lived only in
  `RoiEditor`'s own mount effect, so a cohort-wide reader (`useCohortData`,
  behind Export/Visualizations/cohort statistics) kept seeing a stale null
  diameter for any video nobody had reopened — surfaced as cohort
  statistics reporting a video as "skipped" even though it showed a real
  path length elsewhere. Fixed by moving the heal into `loadRoi()` itself,
  so every caller gets it uniformly. Each layer was verified with a real
  e2e/browser test targeting that exact scenario (the least favourable
  race ordering, a legacy null-diameter layout simulated through the UI, a
  real seeded cohort comparison) rather than assumed fixed by the previous
  layer's fix.
- **Escape/deep-hole-visit detection refined to catch a residual-blob case
  the state machine structurally could not (2026-09-03),
  `Tracker.finalize()`.** Measured directly on `test51` and `test53`'s own
  tracked output before writing anything (not assumed): the classical
  detector's connected-components sometimes never drops the blob's area to
  zero as the animal enters a hole — a residual sliver stays visible, so
  `detection.found` never goes false and the frame never reaches
  `trackVanished()` at all, however small or however close to a hole it
  gets. On `test53` specifically, the trailing ~165 frames sit within a few
  px of one hole while area falls from ~456 (near the clip's own median of
  460) to 139 and never recovers before the clip ends, `state` staying
  `TRACKED` throughout — the same real event `OCCLUDED_IN_HOLE` already
  exists to represent, just without a full vanish to key off. A new
  finalize step, `promoteTrailingShrinkIntoHoleRun`, walks backward from the
  last frame while it stays `TRACKED` and within `holeProximityRadiusFactor
  x holeRadius` of one consistent hole, and — reusing the existing
  `shrinkFractionRequired` gate, scored across that run's own first vs. last
  frame rather than a fixed backward window, since there's no vanish frame
  to anchor one to — promotes the whole run to `IN_ESCAPE_BOX` at the target
  hole or `OCCLUDED_IN_HOLE` anywhere else, same conservative
  proximity-and-shrink policy as the vanish-based path. Verified this
  doesn't false-positive on `test50` (whose tail genuinely never approaches
  a hole — area flat, distance ~20px against a ~17px threshold) before
  calling it done. This is why `TrackingPanel`'s tracked-frame count can now
  legitimately be less than the clip's total even on a fully-processed run
  — see the wording note above.
- **Search-strategy classification (2026-09-03), `src/core/searchStrategy.ts`:**
  rule-based spatial / serial / random labelling, the third standard Barnes-
  maze readout alongside latency and errors (see "Domain facts"). Classifies
  up to a *cutoff frame*: the moment the target was first reached, or —
  when it never was — the last tracked frame of the clip, so a trial that
  never finds the target still gets scored on the search it actually
  performed (a deliberate call) rather than being left unclassified.
  Three signals feed the decision, all derived from data already computed
  elsewhere (no new tracking needed): path directness (straight-line
  distance from the start position to the target/endpoint, over actual path
  length), hole-visit angular order (do consecutive investigated holes' ring
  positions keep turning the same direction — the serial signature), and
  centre crossings (the literature's classic random-search signature).
  `directnessThreshold` / `maxErrorsForSpatial` / `serialOrderThreshold` are
  this project's own first-cut heuristic, stated as such — not values taken
  from a specific paper, and deliberately ordinary parameters rather than
  buried constants for exactly that reason: there is no single published
  cutoff to defer to here any more than there is for hole-investigation
  radius. The label always ships with its reasoning as a sentence citing the
  actual numbers behind it (e.g. "Investigated 5 holes in ring order (86% of
  transitions continuing one direction) before the target"), and lives as
  its own `stat-group` alongside the other trial measures rather than a
  separate panel with its own jump/scroll machinery — its
  classification already considers the whole movement path, so unlike a
  hole-investigation row it has no one frame to jump to.
- **Every trial-stat card is manually overridable through one shared "Edit"
  toggle, not a per-card control (2026-09-03),
  `src/core/measureOverrides.ts` + `useMeasureOverrides.ts`.** Same
  overlay-not-mutation shape as corrections and investigation edits: an
  override is stored per measure key (`primaryLatencySeconds`,
  `pathLengthCm`, `searchStrategy`, …) and displayed in place of the
  computed value, never altering the computation itself, so reverting a
  field just deletes its override and the original computed number is still
  there. One "Edit" button switches every card in `TrialStats` into an
  editable input at once (a `<select>` for the search-strategy label,
  numeric inputs for everything else) rather than each card carrying its
  own edit affordance — a deliberate call, and it also keeps the stat
  grid visually calm outside of edit mode. An overridden card gets the same
  dashed-border treatment as a manually corrected track point, plus a
  "(manual)" tag, so auto-vs-human-touched stays visually obvious here too.
- **Undo and a full reset for investigation edits (2026-09-03),
  `useInvestigations.ts`.** A deleted row used to be gone for good.
  `applyEdit` now pushes the pre-edit state onto an in-memory
  history (capped at 20) before every add/update/delete, so "Undo" always
  has something to step back to regardless of which kind of edit it was;
  history is session-scoped, not persisted, matching ordinary undo
  semantics elsewhere (it doesn't survive a reload, same as most editors'
  undo stacks). "Regenerate stats" is the harder reset: confirmed
  (`window.confirm`, this is destructive), it clears every manual
  investigation edit for the video back to the detector's raw output
  without re-running tracking — for when a reviewer wants to start a
  video's manual review over rather than undo one step at a time.
- **"LOST" renamed to "Mouse not in view" everywhere in the UI, not in the
  code (2026-09-03).** "Tracking lost" reads as a tool failure; on real
  footage most of it is simply the animal not yet placed on the platform at
  the start of a clip, which is normal, not an error. The
  `TrackState` value itself is still `'LOST'` throughout `core/` — renaming
  a type used across the tracker, measures, and event detection for a
  display-string complaint would be real, unjustified churn — only
  `STATE_LABEL` (`TrackViewer.tsx`) and the tracking-panel status wording
  changed. A genuine tracking failure mid-trial still looks identical to a
  not-yet-started clip here, and is still fixable the same way: scrub to it
  and correct it by hand once state-relabeling ships (still deferred, see
  the correction-viewer scope note above).
- **Wider margins, and a visible bar per step heading (2026-09-03).** The
  page felt cramped against the browser edge (`#root` padding 1.25rem →
  2.5rem, and the step-4/step-2 width breakouts widened to match), and the
  page read as one long scroll rather than a sequence of distinct steps —
  every `<h2>` step heading now gets a `.step-heading` bar (accent left
  border, `--surface` background) instead of just being a bigger font.
  Applied to all four real steps plus the "Remaining steps" placeholder, for
  one consistent rhythm down the page.
- **Investigation rows are grouped into "visits" (2026-09-03),
  `groupConsecutiveInvestigations` in `core/investigationEdits.ts`.**
  Consecutive rows at the same hole (in start-frame order, no other hole
  in between) share a visit number — the investigation table's new "Visit"
  column, and the same grouping `searchStrategy.ts` now uses instead of the
  raw per-row list. This mattered more than expected: every trial was
  classifying as "random" because five consecutive "nose came close" rows
  at one hole read as five noisy zero-length angular steps, drowning the
  real order signal. After grouping, `test50` (a long, methodical ring
  walk) correctly comes out **serial** (92% of hole-to-hole transitions
  continuing one direction across 25 visits), while `test51`/`test53` stay
  **random** but with genuinely different reasoning (11% vs. 54% path
  efficiency, 6 vs. 2 visits) — confirmed against all three real clips
  before calling it fixed, not assumed from the grouping logic alone.
- **Errors count distinct holes, not investigation events (2026-09-03),
  `measures.ts` and `searchStrategy.ts`.** Five consecutive rows at the same
  hole used to count as five errors; a reviewer would count it as one wrong
  hole. `primaryErrors`/`totalErrors` and the search classifier's
  `errorsBeforeCutoff` all now count `new Set(...map(holeIndex)).size`.
- **Quadrants renumbered 1-4, with a legend (2026-09-03).** Still oriented
  on the target (quadrant 1 = target's own quadrant, 2/3/4 step 90° clockwise
  from there) — the scientifically meaningful comparison is unchanged, only
  the labels simplified from "Target/Opposite/Adjacent CW/CCW" to
  "Quadrant 1-4". A dashed-line legend (`RoiEditor.tsx`, drawn once a target
  is marked) shows which physical area is 1-4 for that specific video's own
  target, since the numbering has no meaning without it.
- **Hole numbers labelled outside the ring in the review workspace
  (2026-09-03), `TrackViewer.tsx`.** Same numbering as step 2, but placed
  along the line from the platform centre through each hole, offset past
  the hole's own radius, so a label never sits on top of a hole or the
  animal passing through it.
- **CSV/XLSX export (2026-09-03), `src/io/`.** `exportRows.ts` is pure
  row-building (one `TrialRow` per tracked video, one `InvestigationRow` per
  investigation visit — reuses the same grouping as the table) and is
  unit-tested without touching SheetJS; `sheets.ts` is a thin, untested
  wrapper that turns those rows into an actual CSV or XLSX download via
  SheetJS (`xlsx` on npm), verified directly in the browser (captured a real
  download and read its content back) rather than unit-tested. Every row
  carries the tool version and the investigation threshold used, per the
  brief. Note: `xlsx` roughly doubled the production bundle size (~290KB to
  ~730KB gzipped ~120KB to ~220KB) — not code-split, since this is a small
  static tool and the brief doesn't ask for a lean bundle, but worth knowing
  if that changes.
- **`useCohortData` (2026-09-04), `src/ui/useCohortData.ts`, is the single
  shared aggregation of every tracked video's full computed state** (track +
  corrections + ROI + investigations + measures + search strategy), used by
  both `ExportPanel` and `VisualizationsPanel` so the same multi-video
  IndexedDB read-and-recompute isn't written twice. Deliberate
  simplification: each panel still calls the hook independently (so each
  does its own IndexedDB pass) rather than sharing one cached result between
  them — this data is cheap to recompute (no video decoding, just IndexedDB
  reads and in-memory math), so a shared cache wasn't worth the extra
  plumbing for two panels that happen to sit next to each other. Its
  `measures` field is typed `Omit<TrialMeasures, 'investigations'> &
  { investigations: readonly EffectiveInvestigation[] }`, not the plain
  `TrialMeasures` — `computeTrialMeasuresFromInvestigations` is itself
  generic over the investigations type for the same reason
  `applyMeasureOverrides` is (see that bullet above): a caller with an
  edited, id/source-tagged list must get it back unnarrowed, and
  `EffectiveInvestigation.kind` includes `'manual'`, which the concrete
  `HoleInvestigation`-typed `TrialMeasures.investigations` can't hold.
- **Export restructured into two visibly separate sections (2026-09-04):
  "All videos combined" and "Per video."** A facility
  either wants one cohort file or wants to hand a single collaborator just
  their own video's numbers, and the original single set of buttons made it
  unclear which a download actually contained. Per-video rows get their own
  "Trial (CSV)" / "Investigations (CSV)" / "XLSX" buttons.
- **The investigation/export table header is sticky within its own scroll
  container (2026-09-04: "make the column names hover as
  you scroll").** Plain `position: sticky; top: 0` on `<th>`, verified in a
  real browser that the header's screen position doesn't move as the table
  scrolls beneath it.
- **"Richer visualizations" (2026-09-04), `src/ui/VisualizationsPanel.tsx`,
  step 6.** Four views, all pure SVG/CSS (no charting library, matching
  `TrackViewer`'s shared-viewBox overlay pattern): an occupancy heatmap
  (`src/core/occupancyGrid.ts`, unit-tested — bins TRACKED centroids into an
  NxN grid over the platform bounding box) using a single-hue sequential
  scale (opacity, not hue, so it reads correctly under every form of
  colorblindness) with the exact frame count in each cell's `<title>`; a
  hole-visit timeline/raster, one row per hole, one bar per *visit* (reusing
  `groupConsecutiveInvestigations` from the investigation-table work, not
  one bar per raw row) distinguished occlusion-vs-proximity by stroke
  weight rather than color alone; a cohort learning curve (primary/total
  latency per tracked video, in load order) that marks a trial that never
  reached the target or never escaped with an explicit "⚠ never" marker at
  the top of the axis instead of silently omitting the point — the same
  honesty requirement CLAUDE.md applies to tracking failures, applied here
  to a chart; and a cohort comparison (errors before/across, and the
  search-strategy label as text, never color alone) as plain CSS bars, not
  SVG, since a real bar chart's labels are more robust as real DOM text than
  as `<text>` elements sized to fit. Verified in a real browser against
  synthetic-but-schema-real seeded IndexedDB data (two videos, one that
  reaches the target and escapes, one that never does) rather than a full
  CV re-track, given the token-conservation constraint on this session —
  confirmed correct investigation counts, correct CSV row counts, the
  never-reached marker firing exactly where expected, and the per-video
  selector actually re-rendering the heatmap/raster on switch.
- **Every visualization is downloadable as SVG and PNG (2026-09-04),
  `src/io/chartExport.ts`.** Each chart is a real,
  standalone `<svg>` (the cohort-comparison chart was rebuilt from CSS bars
  into SVG specifically so it has one too, for consistency with the other
  three), so `downloadSvgFile` just serializes and downloads it, and
  `downloadSvgAsPng` rasterizes it onto an offscreen canvas at 2x scale.
  The canvas is filled with the current `--bg` value before drawing —
  the chart's own background is transparent so it blends into
  `.viz-chart`'s surface on screen, but a transparent PNG would lose its
  axis lines and text against a dark viewer, so the download needs a real
  fill the on-screen chart doesn't. Verified with real captured downloads,
  not just that the functions run: the SVG file starts with `<svg` and
  declares its namespace, and the PNG file's first two bytes are the real
  PNG signature (`\x89PNG`), for both an SVG-only chart (occupancy heatmap)
  and the newly-SVG cohort comparison.
- **Learning curve got a real y-axis (2026-09-04: "add a
  y axis... at the bottom").** It had axis *lines* before but no scale —
  a viewer could see one trial took longer than another but not by how
  much. `niceTickStep` (`VisualizationsPanel.tsx`) picks a round
  1/2/5×10ⁿ step for the busiest trial's latency rather than an arbitrary
  quarter-fraction, so labels read "0s, 2s, 4s..." instead of "0s, 2.3s,
  4.6s...". Dashed gridlines at each tick, plus a rotated "Latency (s)"
  axis title, so the axis is legible on its own without cross-referencing
  the legend paragraph below it.
- **Step 3's heading bar was misaligned against steps 2 and 4 (2026-09-04:
  "slide over the step 3 title bar so its in line").**
  Root cause: `.roi` (step 2) and `.review-workspace` (step 4) both break
  out of `#root`'s narrower 60rem reading width to a wider, independently
  centred `min(90rem, 100vw - 5rem)` (documented above, 2026-09-03) because
  those two screens are edit-heavy and want real width; `.tracking`
  (step 3) never got the same treatment since its own content — a status
  line and a button — never needed the extra width. But sitting at the
  narrower left edge between two sections at the wider one reads as
  misaligned down the page regardless of whether step 3's *content* needs
  the space. Fixed by giving `.tracking` the identical breakout — its
  content doesn't fill the width, and doesn't need to; only the heading
  bar's left edge needed to match. Verified by measuring all three
  headings' `getBoundingClientRect().left` in a real browser: identical
  (40px) after the fix, previously different.
- **"Copy layout from X" (2026-09-04), `RoiEditor.tsx`, answers a real
  question: if every video's platform is physically the same
  92cm, shouldn't the hole-investigation criteria already be identical
  across videos?** They already are, in the sense that matters most: the
  investigation threshold (`proximityRadiusFactor`, `minFrames`) is a
  single *global* setting applied to every video (see the 2026-09-03
  bullet above), not something re-chosen per clip. What can legitimately
  differ per video is the *pixel* geometry that global factor is applied
  to — `holeRadius` and `platformRadius` in px, and therefore the px→cm
  scale — because each video's own camera framing/zoom/distance is its
  own independent measurement, even filming the same physical rig, and
  ROI detection or manual placement adds its own small variance on top.
  So the criterion is one number everywhere; the cm figure it works out to
  for a given video can still differ slightly, correctly, because it's a
  derived quantity. "Reuse this layout on other videos" already let a
  saved layout seed a video that had *no* ROI yet, but the actual
  videos in this project are already all defined, so that path never applied to them. Added
  a second, explicit "Copy layout from {name}" action, available whenever
  a template exists and the current video already has its own layout,
  confirmed via `window.confirm` since it discards this video's own
  centre/ring/holes/target/nudges — for the case where the rig genuinely
  didn't move between recordings and the goal is every video scored
  against literally identical pixel geometry, not just an identical
  factor. Verified in a real browser: seeded two videos with deliberately
  different hole radii (14px, 22px), saved the first as the template,
  confirmed the button only appears once a video already has its own
  layout and a differently-named template exists, and confirmed clicking
  it actually changed the second video's hole radius to match the first's
  exactly (22 → 14).
- **Persistence:** IndexedDB (video blobs, ROIs, tracking data, corrections,
  the global investigation threshold, manual investigation edits, manual
  measure overrides, the global default platform diameter) — a refresh must
  never lose
  annotation work.
- **No portable project file — final scope decision, 2026-09-04, not a
  deferred TODO.** The brief asks for "a documented, reloadable file" so a
  facility can "re-run analysis without re-tracking," and `src/io/README.md`
  used to describe a "versioned project-file JSON schema" as if it existed.
  It doesn't. What's actually built is reload-safe (IndexedDB, same
  browser/device — a refresh or closed tab never loses work) but not
  *portable* (no export-to-file / import-from-file that would let a
  facility archive a project or hand it to a colleague on a different
  machine). Explicitly deciding not to build this now rather than leaving
  it an open TODO: it would mean serializing every IndexedDB store (videos'
  blobs included, which are the large part) into one JSON-plus-blob
  container, a real file-format design exercise in its own right, and the
  time this pass has left is going to tracking performance instead — see
  the perf work below. Recorded as a known limitation in the README, not
  silently dropped.
- **Export:** SheetJS for CSV/XLSX.
- **Testing:** Vitest for pure logic (timebase math, ROI geometry, event
  detection, the search-strategy classifier), Playwright for an end-to-end
  smoke test of the full workflow.
- **Sample-video loading is idempotent by name, not by relying on a
  fetched `File`'s derived id, `VideoLoader.tsx`.** First fix: clicking
  "Load the 3 sample videos" twice added six rows, not three, traced to
  `File`'s `lastModified` defaulting to "now" on every fetch, so the same
  clip fetched twice got two different ids and `putVideo`'s keyed `put()`
  never saw them as the same record. Fixed with a constant `lastModified`
  (0) — but that was reported as still duplicating on a second click, and
  rather than keep chasing why the id might occasionally still differ, the
  mechanism was replaced entirely: the button now skips fetching any
  sample name already present in the table, which guarantees no duplicate
  regardless of how any id is computed, and only fetches whichever of the
  three (if any) are actually missing. Deliberately scoped to the three
  known sample names only: a user's own uploaded videos keep the existing,
  more permissive dedup-by-content behaviour in `addFiles`, since
  duplicate user uploads are expected to be allowed.
- **Steps 5 and 6 got the same width breakout as steps 2-4 (2026-09-05),
  same fix shape as step 3's alignment on 2026-09-04.**
  `.export-panel` and `.viz-panel` had never been given the `min(90rem,
  100vw - 5rem)` breakout the other mid-workflow steps use, so their
  heading bars sat at `#root`'s narrower left edge. Verified the same way:
  measuring `getBoundingClientRect().left` on all of steps 2, 5, and 6 in a
  real browser (all 40px after the fix).
- **A pass of wording and visual cleanup across the whole app
  (2026-09-05: reduce wordiness, and fix it with UI, not
  more text, where the ask was about the workflow itself).** Concrete
  changes, not just trims:
  - The title/lede shortened to a single line; the sample-videos callout
    lost its explanatory paragraph in favour of a plain labelled button
    (`.sample-callout-label` + button, no prose); the platform-diameter
    hint in step 1 now states its one purpose ("Converts tracked pixel
    positions to real-world centimeters") instead of explaining the whole
    default/override relationship, which step 2's own callout already
    covers when it matters.
  - The hole-investigation-threshold note in step 1 got a `--notes`
    modifier (`.calibration-callout--notes`): no accent border, muted
    label, because it's reference information about a step-4 setting, not
    a step-1 task, and looked like a fourth thing to fill in alongside the
    diameter field.
  - The misplaced "what counts as investigating a hole" paragraph that
    used to live under the escape-target field (a different concept --
    *which* hole vs. *how* investigation is detected) was removed outright
    rather than moved a third place; step 1's summary and step 4's live
    editable threshold already cover it.
  - **Escape-target selection made visually part of the sequence without
    added words:** the section gets the same dashed-while-unset /
    solid-once-set treatment the platform-diameter callout already uses,
    plus a `·`/`✓` prefix on its own heading matching the existing Status
    checklist's own convention -- a shape and symbol difference, not colour
    alone, so it still reads in greyscale.
  - The loaded-videos table gained a real bordered/rounded container
    (`.video-table-wrap`), a tinted bold header row, and zebra striping, so
    it reads as one distinct area rather than bare rows floating on the
    page background.
  - The frame scrubber's track got a visibly thicker, accent-bordered,
    tinted-background treatment (were: thin, `--surface`-on-`--surface`,
    easy to miss as an interactive control), plus a real play/pause button
    at the start of the bar.
  - Reworded (not just shortened) the step-4 keyboard-correction hint to
    state the mouse *and* keyboard method explicitly, and the quadrant-time
    description to lead with the readout itself rather than the assay
    theory behind it.
- **Frame-scrubber play/pause (2026-09-05), `FrameScrubber.tsx`.** Steps
  one frame at a time at the clip's own real frame rate via a self-
  rescheduling `setTimeout` keyed off the frameIndex the parent just
  confirmed (not a raw `setInterval`, which can drift out of sync with
  what's actually rendered once a frame takes longer than its nominal
  slot). "Playing" is derived (`isPlaying && frameIndex < lastFrame`), not
  a second piece of state kept in sync from inside the effect -- an
  earlier version called `setIsPlaying(false)` synchronously inside the
  effect on reaching the last frame and oxlint's `set-state-in-effect` rule
  caught it immediately, correctly: the value was already fully computable
  at render time. **Known limitation, not silently accepted:** in the ROI
  editor specifically, each frame step is a real seek-and-draw decode
  (`FrameSource.grabDataUrl`) -- fine for the "occasional single-frame
  grab" it was built for, but measured in a real browser at roughly half
  the clip's nominal rate under continuous playback (~8fps observed
  stepping through a 14.985fps clip). Play/pause is still correct and
  useful for reviewing a stretch of frames, just not real-time; a genuinely
  smooth preview would need a decode pipeline this feature doesn't have.
- **Video reordering (2026-09-05), `videoStore.ts`'s `swapVideoOrder` +
  up/down buttons in step 1's table.** The list is sorted by `addedAt`,
  a field never displayed anywhere as a real timestamp (confirmed by
  grepping every read site before reusing it) -- so letting a manual
  reorder swap two adjacent videos' `addedAt` values needed no new schema
  field or migration, and reuses the exact sort the list already had.
  Buttons over drag-and-drop specifically for keyboard operability, same
  reasoning as every other drag-plus-keyboard-alternative pair in this
  project.
- **Nothing past step 1 renders until a video is selected (2026-09-07),
  `App.tsx`.** Two complaints that turned out to share one
  fix: it wasn't obvious that clicking "Define maze" is how the pipeline
  actually starts, since steps 2-6 (including Export and Visualizations)
  used to render unconditionally; and Export/Visualizations specifically
  could show combined results from videos tracked in an *earlier* session
  the moment the page loaded, before the current session had done anything
  -- confusing even when accurate, since it reads as output appearing from
  nowhere. `RoiEditor`/`TrackingPanel`/`ReviewWorkspace` were already gated
  on `selected`; `ExportPanel` and `VisualizationsPanel` moved into the same
  `{selected && (...)}` block rather than getting their own separate
  condition, since the underlying problem (nothing has happened yet in this
  session) is the same one. This does not gate on the *selected* video
  being tracked -- Export/Viz are cohort-wide by design (CLAUDE.md's
  `useCohortData` note above) -- it only stops the absolute-first-load
  staleness; selecting any video, tracked or not, is what un-hides them.
- **Escape target has a real N/A state, distinct from "nobody has looked
  yet" (2026-09-07), `roi.ts` + `RoiEditor.tsx`.** `targetHole === null`
  used to mean two different things with no way to tell them apart: nobody
  has scrubbed to the escape yet, or a reviewer scrubbed the whole clip and
  the mouse genuinely never enters a hole. Added `noEscapeConfirmed:
  boolean` to `RoiDefinition` (`markNoEscape()` sets it and clears
  `targetHole`; `setTargetHole()` clears it the other way -- mutually
  exclusive, same overlay-not-ambiguity shape as everywhere else in this
  project) and a checkbox next to the target-hole field, disabling the
  number input and showing "N/A" as its placeholder while checked.
  `roiCompleteness`'s `hasTarget` now accepts either a real target or a
  confirmed no-escape, so a genuinely-no-escape trial can still be marked
  "done" at step 2 instead of permanently reading as incomplete.
- **`.viz-card` groups a chart's heading with its chart (2026-09-06),
  `index.css`.** Each visualization's `<h3>` used to sit outside
  `.viz-chart`'s own bordered box with a visible gap -- harmless for a full
  chart, but a short one (a single-video learning curve showing only its
  "track at least two videos" placeholder text) read as an unrelated title
  floating above an empty, disconnected box. One shared card (background +
  border + radius) wrapping heading and chart together fixes this for every
  visualization at once, not just the learning curve.
- **Cohort statistics (2026-09-07), `src/core/statistics.ts` +
  `src/ui/CohortStatsPanel.tsx`, step 6.** A two-group comparison computed
  entirely client-side, so a facility can ask "is group A different from
  group B" on any trial measure without exporting to R/SPSS/Prism first.
  Mann-Whitney U, not a t-test: Barnes maze cohorts are typically small and
  there's no reason to assume normality, and a rank-based test degrades
  more gracefully than a t-test when that assumption is wrong. Verified
  against hand-computed values before wiring into any UI (complete
  separation → U=0; identical groups with ties → U=n1×n2/2 exactly).
  Group assignment (A/B/neither, per video) is local component state, not
  persisted -- which videos count as "control" vs. "treatment" is a framing
  decision for a specific question, not a property of the video itself, and
  a different question may want the same cohort split differently. Below a
  conventional n=8-per-group threshold, the panel says so explicitly next
  to the p-value rather than presenting a precise-looking number the normal
  approximation can't actually back up at that sample size.
- **Formula-builder export column (2026-09-07), `src/core/formula.ts` +
  the "Custom column" section of `ExportPanel.tsx`, step 5.** A user can
  type e.g. `totalErrors / pathLengthCm` and get a derived per-video column
  without opening Excel. Deliberately not `eval`/`new Function`: the whole
  feature only ever needs +, -, *, /, parentheses, numbers, and named
  variables (validated against the same fields `TrialRow` actually
  exports), so a small hand-written recursive-descent parser covers it with
  no arbitrary-code-execution surface at all, regardless of how low the
  real risk already is in a single-user, fully client-side tool. Division
  by zero and a missing/unknown variable both resolve to `null` (shown as
  "—"), matching this project's standing "a missing value is null, not a
  guess" convention, rather than `NaN`/`Infinity` or a thrown error.
  Downloads via a new generic `downloadRowsCsv` (`io/sheets.ts`) rather
  than extending the fixed-shape `TrialRow` CSV path, since a user-named
  column has no fixed shape to type against.
  **TypeScript gotcha worth remembering:** the result type was first
  modeled as an untagged union (`{error} | {rows} | null`) narrowed with
  `'error' in x` / `'rows' in x`, and `tsc` reported "possibly undefined"
  at read sites that weren't even inside a closure. Re-modeled as an
  explicit discriminated union tagged with a literal `kind` field instead
  of chasing the exact inference rule -- a `===` check on a literal tag is
  the narrowing pattern TypeScript handles reliably, and the ambiguity
  disappeared. See AI_NOTES.md for the full account, including a second,
  unrelated gotcha caught the same day (`erasableSyntaxOnly` rejecting a
  constructor parameter property).
- **`useCohortData` gained an optional second cache-busting key
  (2026-09-07), `src/ui/useCohortData.ts`.** Its effect used to depend only
  on `trackingRefreshToken` (bumped when a tracking *run* completes), but
  `ExportPanel`/`VisualizationsPanel`/`CohortStatsPanel` don't remount when
  the selected video changes (unlike `RoiEditor`/`TrackingPanel`/
  `ReviewWorkspace`, which do via `key`), so a ROI healed by switching to
  that video's editor -- see the bullet above -- never triggered a refetch
  in an already-mounted cohort-wide panel. Threading the currently-selected
  video id through as `extraKey` means switching which video is open (the
  same action that triggers the heal) also busts this cache, without
  needing a broader pub-sub mechanism for ROI changes in general.
- **Step 6 scoped to the currently-selected video (2026-09-07),
  `VisualizationsPanel.tsx`.** Previously the per-video charts (occupancy,
  hole-visit timeline) defaulted to `cohort[0]` -- the first *tracked*
  video by load order -- regardless of which video was actually open in
  step 1, so switching to a different, untracked video could still show
  charts for an unrelated one. A deliberate call: if the currently-selected
  video isn't tracked, step 6 should show nothing (not another video's
  data); once it is tracked, the per-video charts default to it, with the
  dropdown still available to switch to a different tracked video's charts
  on request. The per-video dropdown's default is re-synced whenever the
  app-level selection changes (adjusted directly during render, React's
  recommended pattern for "reset state on a prop change" -- oxlint's
  `set-state-in-effect` rule caught an effect-based first draft, same rule
  that caught the FrameScrubber play/pause case earlier in this project)
  but otherwise left alone, so picking a different video from the dropdown
  itself isn't immediately overwritten. Cohort-wide charts (learning
  curve, cohort comparison, cohort statistics, the custom-metric plot) sit
  behind the same single gate rather than their own separate condition --
  simpler, and matches the same "nothing until this video's own work is
  done" logic as the step-1-selection gate above.
- **"Custom metric" scatter plot (2026-09-07), `VisualizationsPanel.tsx`'s
  `CustomMetricPlot`.** Lets a reviewer plot any two derived metrics
  against each other to explore a relationship, reusing the exact formula
  syntax and field list from the export step's "Custom column"
  (`core/formula.ts`, `FORMULA_VARIABLES` -- moved to `io/exportRows.ts`
  and exported so both features read the same list rather than two
  independently-maintained copies drifting apart). Deliberately a second,
  independent input rather than literally shared state with `ExportPanel`:
  the two panels already each do their own IndexedDB pass by design (see
  `useCohortData`'s own doc comment on that simplification), and a formula
  typed in step 5 produces the identical value if retyped here, which is
  what actually matters for "explore a relationship" -- the controls being
  wired together wasn't the part the request needed.
- **Export panel reordered and its "Custom column" input fixed
  (2026-09-07), `ExportPanel.tsx`.** "Custom column" moved below "Per
  video" so the two download-oriented cards ("All videos combined", "Per
  video") sit adjacent. Separately, the column-name
  field used to force its value back to `'custom'` inside `onChange`
  whenever the field was empty (`e.target.value || 'custom'`) -- fighting
  the user mid-edit, snapping back to "custom" the instant they cleared it
  to type a new name, and visibly perturbing the live preview table's
  header on every keystroke. Fixed by letting the field hold exactly what
  was typed, including a transient empty string, and applying the
  `'custom'` fallback only at the point of use (the preview header, the
  downloaded filename) via a separate `effectiveColumnName`.
- **Row highlighting in the step-1 video table was a real no-op
  (2026-09-07), `index.css`.** `.selected-row`'s background
  (`var(--surface)`) was byte-identical to `.video-table-wrap`'s own
  background -- the "highlight" changed nothing visible for an odd row and
  merely erased the zebra tint for an even one. Caught by comparing
  `getComputedStyle` backgrounds of a selected vs. unselected row in a real
  browser rather than trusting the class was doing something because it
  existed. Fixed with a real accent tint plus a left inset border (a shape
  difference, not colour alone), scoped under `.video-table` so its
  specificity beats the existing `:nth-child(even)` zebra rule.
- **TrialStats notes when the platform diameter is missing (2026-09-07),
  `TrialStats.tsx`.** Path length and average speed are legitimately
  `null` until a video's platform diameter is calibrated, but showing a
  bare "—" with no explanation reads as a bug, not an unmet prerequisite
  ("make sure most users dont skip that step"). Added a plain-
  language note directly on the Path stat group when
  `roi.platformDiameterCm === null`. Also fixed step 1's own diameter
  callout, which had never actually applied the existing dashed/solid
  `--unset` modifier RoiEditor's equivalent callout already used --
  confirmed by grep that VideoLoader's callout always rendered as
  `className="calibration-callout"` with no conditional, unlike
  RoiEditor's, so step 1's most important prerequisite field looked no
  different unset than filled in.
- **Correction points shrink while being dragged (2026-09-07),
  `TrackViewer.tsx`.** The centroid/nose dots become hard to
  place precisely once you start dragging them. The resting radius (8px
  centroid, 5px nose) is sized for easy grabbing; while `drag` matches that
  point's kind, it now renders much smaller (3px / 2px) so the cursor tip
  itself becomes the precision target instead of a comparatively large
  circle obscuring exactly where its centre is. Reverts to the resting
  radius the moment the drag ends.
- **Fixed releasing a correction-point drag also jumping the video to a
  different frame (2026-09-07), `TrackViewer.tsx`.** Placing the nose dot
  worked, but letting go immediately triggered "click the tracking path to
  jump to that frame" -- the same interaction, since a native `click` event
  fires on whatever's now under the pointer right after `pointerup`. The
  click handler already guarded on `if (drag) return`, which should have
  covered this if `drag` were reliably `null` by the time the click
  handler's closure ran -- evidently it wasn't always, a real risk for a
  React-state guard spanning two separately-dispatched browser events.
  Fixed with a ref (`suppressNextClick`) set the instant a correction
  point's own `onPointerDown` fires and cleared on the SVG's next click --
  a ref update can't have the same render-timing gap a state read can.
  Verified with a real simulated drag in a live browser: the frame-number
  field was unchanged after dragging and releasing the nose point, where
  before the fix this exact interaction jumped it.
- **Custom-metric scatter plot gained a legend (2026-09-07),
  `VisualizationsPanel.tsx`.** Every point was the same colour and shape,
  so which dot belonged to which video was illegible.
  Rather than a per-video colour palette (which would need a new colour
  every time a video is added, and this project avoids relying on colour
  alone for meaning anyway), each point gets a small numbered label
  directly on the chart plus a legend list below mapping number to video
  name -- works identically regardless of what's plotted, since it doesn't
  depend on the data at all, just the order points were plotted in.
- **200% zoom actually verified, and a real bug fixed (2026-09-07),
  `index.css`.** The README had carried "200% browser zoom has not been
  explicitly verified" as a known limitation for a while. Checked it
  directly with a real Chromium zoom (CDP `Page.setDeviceMetricsOverride`,
  not a CSS-transform approximation) during a full rubric review, and it
  failed: step 1's loaded-videos table produced a genuine page-level
  horizontal scrollbar at a narrow-enough effective width, even though the
  table already has its own `overflow-x: auto` container -- that container
  correctly held the *visible* overflow, but ancestor sections still
  reported inflated `scrollWidth`, and the page remained programmatically
  scrollable (`window.scrollTo()` could still move it) even after adding
  `overflow-x: hidden` to `body` alone. Fixed by setting it on both `html`
  and `body`; confirmed with a real `scrollTo` call landing back at
  `scrollX: 0`, and separately confirmed the fix doesn't hide
  functionality -- the table's own internal scroll still reaches its last
  column. This is the specific finding this app now has to justify calling
  the zoom requirement met, rather than "should hold up" reasoning about
  relative units.

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
docs/brief-archive.md   verbatim copy of the take-home brief
docs/timebase-findings.md   measured ground truth for the container timebase
```

## Commands

```
npm install
npm run dev        # local dev server
npm test            # vitest (unit)
npm run test:e2e    # playwright (e2e smoke)
npm run build       # production build (tsc -b && vite build)
npm run typecheck   # tsc -b -- use this, not `tsc --noEmit -p .`
npm run lint
```
(Pin versions in package-lock.json — the brief requires a cold clone to run
from the README alone.)

**Typecheck gotcha (found 2026-09-04):** `tsc --noEmit -p .` against the root
config silently passes on real type errors that `npm run typecheck` (`tsc -b`,
building the referenced project configs) catches — caught two live errors
this way in `useCohortData.ts`/`VisualizationsPanel.tsx` that `-p .` had
reported clean moments earlier. Always verify with `npm run typecheck` or
`npm run build`, not an ad hoc `tsc --noEmit -p .`.

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
- **Log real disagreement/correction moments in `AI_NOTES.md`** as they
  happen, not reconstructed later. Applies to any session, terminal or
  chat. Record what was proposed, what was decided instead, the reasoning,
  and who turned out to be right. This is a deliberate record of where the
  project diverged from model judgment; the brief asks for real disagreement
  moments, and a human overruling the model is the most informative kind.
- When proposing a preemptive fix, state whether the failure it prevents has
  been **demonstrated** (observed in this repo) or **predicted** (pattern
  from training data). Don't blur that distinction,
  and don't present a framework/template default as a bespoke decision.
- Milestone order (cut from the bottom if time runs short): scaffold → ROI
  editor → CV tracking core → cleanup/correction UI → event detection &
  measures → visualization & export → compliance & ship.
