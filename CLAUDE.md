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
  doesn't teleport the scrubber. The viewer has an "Expand viewer" toggle
  (`max-width: 22rem` collapsed, native 640px expanded) and **defaults to
  expanded** — not a fullscreen/modal experience, which wasn't asked for and
  adds real complexity (portals, escape-key handling, focus trapping) this
  pass didn't need. The ROI editor (step 2) got the same toggle, also
  defaulted to expanded, for consistency.
- **`.roi-hole--target`'s fill must never be `none`, but it can be (and now
  is) translucent.** It shares a look with `.roi-hole--target-ring` (the
  hollow outline drawn *around* the target hole) but is a structurally
  different element — the main hole circle — and grouping them under one
  `fill: none` rule once silently made the target hole undraggable: SVG only
  hit-tests a shape's *painted* area, so with no fill, only its ~2px stroke
  edge registered pointer events, and a drag starting at the shape's centre
  (where every other hole works) missed it entirely (AI_NOTES mistake 14).
  That was originally fixed with a *solid* distinct fill, on the theory that
  solid also served visibility. It didn't, for the one moment visibility
  matters most: reviewing tracked footage, a solid target hole hides the
  mouse at the exact instant it enters the hole — the thing a reviewer is
  there to watch (Elvis's feedback, 2026-09-03). Fixed properly now: a
  translucent fill (`rgba(226, 69, 60, 0.35)`) plus a coloured stroke. Still
  a real, non-`none` fill — SVG hit-testing cares whether a shape *has* a
  fill, not its opacity — so it stays exactly as draggable as before; opacity
  was the missing degree of freedom the first fix didn't reach for. All hole
  circles (target and regular) also got thinner strokes generally, same
  reasoning: obvious enough to read at a glance, never thick enough to
  obscure the animal underneath. The correction viewer's trajectory plot
  keeps the same outer ring the ROI editor has, so the target reads clearly
  there too, not just during layout.
- **Pins are updated separately from ROI (`updatePins()` in
  `src/state/roiStore.ts`), never as a side effect of saving ROI geometry.**
  `CorrectionViewer` and `RoiEditor` both have their own pin toggle on the
  same per-video pin list, but only `RoiEditor` owns ROI editing — its `roi`
  reaches `CorrectionViewer` as a prop from `App`, and that prop is briefly
  stale (the previous video's value) for one render immediately after
  switching videos, before `RoiEditor`'s own reset propagates back up. A
  pins-save that also wrote `roi` from that prop was a real, demonstrated
  bug: switching videos could silently overwrite a video's correct, already-
  detected ROI with a *different* video's coordinates (AI_NOTES mistake 13).
  `updatePins()` does a read-modify-write inside one IndexedDB transaction
  that only ever touches `pins`, using whatever ROI is actually persisted —
  structurally impossible for a stale prop to reach storage through it,
  rather than a guard that has to be remembered to keep working.
- **Nose direction is smoothed over `Tracker.NOSE_DIRECTION_WINDOW` (5)
  frames, not the single previous frame** (`src/core/tracking.ts`). A
  one-frame centroid delta is dominated by per-frame position noise and can
  flip sign even when the animal's real motion hasn't changed, which used to
  flip the nose to the tail for a frame and back — reported by Elvis while
  reviewing tracked footage. Comparing against a point several frames back
  averages that out while still responding to a genuine direction reversal
  within a few frames. **Not yet consequential for classification** — no
  code path uses `nose` for anything but display and manual correction;
  `OCCLUDED_IN_HOLE`/`IN_ESCAPE_BOX` are driven entirely by centroid
  proximity and area shrinkage — but worth having fixed now, since the
  deferred investigation-detection feature (see above) will likely want a
  stable nose position, and jitter undermines trust when reviewing a track
  regardless.
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
  stacked sections a reviewer scrolled between (Elvis's feedback). Data
  (tracks, corrections, frame index, the decoded frame) moved into a shared
  hook, `useTrackReview` (`src/ui/useTrackReview.ts`), called once by
  `ReviewWorkspace` and passed to `TrackViewer` (the rendering half of the
  old `CorrectionViewer`) and the investigation components as props — the
  pieces would otherwise each load their own copy of the track and have no
  way to share one frame index, which is exactly what a "jump to this
  investigation" button needs. Gating ("define the maze first" / "track the
  video first") is asserted once at the workspace level, not duplicated per
  half.
- **Review workspace layout, revised (2026-09-03): stats under the viewer,
  the full table beside it, no inner scrollbar.** The investigation logic
  (threshold params + edits + the computed list) was pulled out of a single
  `InvestigationPanel` into its own hook, `useInvestigations`
  (`src/ui/useInvestigations.ts`), so it can be called once and shared by
  two separately *positioned* components: `TrialStats` (the computed numbers,
  stacked under the viewer — you look at the animal, then see what it
  produced) and `InvestigationTable` (the full row-by-row list, beside the
  viewer, not the viewer's own stats). The table is no longer capped at a
  scrolling sub-panel height — a reviewer comparing a row against the video
  shouldn't lose rows to an inner scrollbar (Elvis's feedback); the table
  takes whatever height it needs and the page scrolls, same as every other
  long list in the app. Both this section and the ROI editor (step 2, same
  complaint, same fix) now break out of the app's normal 60rem reading width
  to `min(90rem, 100vw - 2.5rem)` via the `left: 50%; transform:
  translateX(-50%)` full-bleed centering technique — these are the two
  screens meant to be lived in while working a trial, not read top to
  bottom once.
- **Stat cards grouped with one description per group, not per card
  (2026-09-03).** "Primary latency" and "Total latency" used to each stand
  alone with no explanation; now "Latency" is a group heading with one
  sentence ("Time from the start of the trial") and the two cards under it
  just say "To target" / "To escape" — short because the group already gave
  the context. Same pattern for Errors, Path, and Quadrant time. Quadrant
  time specifically kept (not dropped, despite Elvis's uncertainty about its
  value) because a target-quadrant search bias is a standard spatial-memory
  readout in this literature, same family as the Morris water-maze probe
  trial — now labelled and described as such rather than left as four
  unexplained numbers.
- **`TrackingPanel` (step 3) no longer duplicates step 4's numbers.** It used
  to show a 4-line checklist (Tracked/Lost/In a hole/Escaped frame counts) —
  the last two are exactly what step 4's investigation table and latency
  cards already cover, with real context (which hole, when), so showing bare
  frame counts here again read as redundant, unexplained clutter (Elvis's
  feedback). Now a single status line: `"{tracked} of {total} frames
  tracked{, N lost (%)}"` — tracking QA only, LOST being the one thing this
  step is actually responsible for confirming honestly.
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
- **`.roi-hole--target`'s fill is fully transparent, not solid or translucent
  (revised twice now, 2026-09-03).** A solid fill (the original fix for
  mistake 14, see below) hid the mouse at the exact moment it entered the
  target hole. A translucent fill was the first correction, but still dimmed
  it. The actual answer: `fill: transparent` — a real value, distinct from
  `fill: none` — so the centre is completely see-through while the shape
  stays exactly as draggable as before. SVG hit-testing cares whether a
  shape *has* a fill (transparent counts, none doesn't), not its opacity;
  confirmed directly with a Playwright centre-click test before shipping
  this specific change, given how expensive it's already been to get this
  one property wrong once (mistake 14). All hole circles got thinner
  strokes at the same time, same reasoning: legible at a glance, never
  thick enough to cover the animal underneath.
- **Persistence:** IndexedDB (video blobs, ROIs, tracking data, corrections,
  parameters, per-video investigation threshold, manual investigation edits,
  the global default platform diameter) — a refresh must never lose
  annotation work.
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
