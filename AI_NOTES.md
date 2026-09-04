# AI Notes

## Tools and setup

- **Model(s) used:** Claude Opus 5 for the initial environment setup and
  scaffolding sessions; Claude Sonnet 5 for the majority of feature
  development from the CV-engine revision onward (see the 2026-09-01
  architecture change in `CLAUDE.md`) through to this submission. Both via
  Claude Code, in the terminal and in a VS Code-integrated session — no
  chat-only usage.
- **Configuration:**
  - `CLAUDE.md` (repo root) is the running architecture-decision record —
    every non-obvious choice (why pure TypeScript over OpenCV.js, why the
    ROI editor is detection-first, why tracking runs in a Worker, why
    escape detection needed a second finalize pass, and so on) is written
    down there as it's decided, with the reasoning and what was verified,
    not reconstructed after the fact. It's the single most load-bearing
    piece of AI-tooling configuration in this project — every session
    starts by reading it and is expected to keep it current.
  - `.claude/agents/cv-reviewer.md` — a project-specific subagent, not
    generic scaffolding. Invoked after any change to the tracking pipeline,
    event detection, or measures computation specifically to check for this
    project's own named failure modes (silent interpolation, lost-vs-
    occluded confusion, hard-coding to one clip, buried thresholds) rather
    than doing a generic code review.
  - `.claude/commands/sample-check.md` — a slash command that runs the
    pipeline against all three real committed sample videos and reports
    what changed versus the last committed `demo-outputs/`, so a
    regression against real footage (not just synthetic test fixtures) is
    one command away rather than something that has to be remembered.
- **MCP servers:** none. This project's own agent-interface angle (the
  brief's optional "if you have room" item) was not attempted — the time
  available went to the core pipeline and, at the end, tracking
  performance instead; see the README's "What I chose not to build."

## Disagreements / mistakes / thrown-out approaches

Log 2–3 of these as they actually happen. For each: what the model did, what
was wrong about it, what the tell was, how you caught it.

1. **`brew install node` was the wrong call, and I made it before checking.**
   Asked to set up an environment, the model recommended Homebrew. It failed:
   this is an Intel Mac on macOS 15.7, which Homebrew now treats as a Tier 3
   configuration with no Node bottle available — the only path forward would
   have been an hour-plus source build. The tell was `Error: node: no bottle
   available!`. Pivoted to `nvm`, which pulls the official prebuilt
   `darwin-x64` binaries and takes about a minute. The lesson isn't "brew bad"
   — it's that the model recommended a package manager without checking
   whether this machine/arch was still a supported target for it.

2. **The Vite scaffolder silently wrote into the repo root.**
   `npm create vite@latest <absolute-path>` treats its argument as *relative*,
   so a scaffold meant for a temp directory landed at
   `barnes-maze-pipeline/private/tmp/claude-501/.../scaffold` — a 7-level junk
   tree inside the project. The tell was in the tool's own output: it echoed
   `Scaffolding project in /Users/elvissmith/Documents/barnes-maze-pipeline/private/tmp/...`,
   with the project root prefixed onto the absolute path. Caught by `ls`-ing
   the root afterward rather than trusting the "Done." line. Worth generalizing:
   read back what a generator says it did, don't just check that it exited 0.

3. **A green lint run that wasn't proof of anything.**
   During the test/CI scaffold, `npm run lint` printed nothing and exited 0,
   and the obvious read was "clean." It isn't a safe read: oxlint is silent
   when clean *and* exits 0 on warnings, so a passing lint job in CI would
   have been passing for both reasons indistinguishably. Checked it by feeding
   oxlint a throwaway file with an unused variable and a `debugger` statement
   — it reported both and still exited 0. Fixed by making the script
   `oxlint --deny-warnings`. Generalizes to the rest of this project: an exit
   code is not evidence a check ran, and this repo's whole premise is that
   silent success is the failure mode to distrust.

4. **"Parse the container for the fps" was right, but the shape I assumed was wrong.**
   Recommending mp4box.js for the timebase, I described `test51` as a
   timescale of 15000 with a sample delta of 1001 — implicitly one `stts`
   entry, one constant frame rate. Parsing the actual file: 98 `stts` entries,
   with 8.6% of frames at a delta other than 1001. All three clips are like
   this (test50: 951 entries, test53: 152) — the upstream re-encode preserved
   duration and frame count exactly while jittering individual frame deltas.
   The tell was checking rather than asserting: the numbers came out of the
   file, not out of the recommendation. It matters because the obvious
   fallback — frame count over duration — yields 15.005 fps for `test51`,
   which rounds to "15" and lands on precisely the error the brief warns
   about, by a route that looks like measurement. Written up in
   `docs/timebase-findings.md`. Generalizes: "read it from the file" is only
   half an instruction if you have also guessed what the file contains.

5. **`binarizeBelow` used `<` and found zero holes, on real and synthetic frames alike.**
   Building automatic maze detection, the dark-hole finder returned nothing on
   every test frame. `otsuThreshold` returns the *lower edge* of the optimal
   split — on an image of holes at 55 and platform at 190 it returns exactly
   55 — but `binarizeBelow` compared with strict `<`, which excludes every
   hole pixel. `binarize` (the bright-feature counterpart, used for animal
   detection) uses `>` and happened to be on the correct side of that same
   boundary by luck of which feature is brighter. Caught by instrumenting the
   detector step by step rather than staring at the final "0 holes found" and
   guessing why. Fixed to `<=`, documented the convention inline, and added a
   test that pins it: two pixels at the threshold value itself must come out
   foreground, not background.

6. **The hole count estimator was fooled by its own noise, and only real frames caught it.**
   The first version derived hole count from the *smallest* angular gap
   between detected holes. It passed every synthetic-frame test, then found
   21 holes on real `test50`/`test53` frames that actually have 20 — one hole
   had been detected as two adjacent blobs, and the resulting sliver of a gap
   set the count. Synthetic tests never produced that artifact because I only
   ever generated one blob per hole. Rewrote it to fit every plausible ring
   size and take the smallest one *all* detections sit on cleanly (with an
   occupancy floor so a couple of stray points can't masquerade as a tiny
   ring), verified again on real frames from all three clips: 20/20 detected
   holes landing on real holes each time. Generalizes: synthetic fixtures test
   the algorithm's *design*, not what a real capture pipeline actually hands
   it — both are needed, and the real ones can fail after the synthetic ones
   are all green.

7. **A drag handle sat exactly on top of hole 0 and was un-clickable.**
   Requested drag-to-resize for the ring of holes; the resize/rotate handle
   was placed at `center + ringRadius·(cos,sin)(rotation)` — which is the
   *same formula* used to generate hole 0, so the handle and hole 0 occupied
   identical coordinates, and hole 0 (painted later, so on top) ate every
   pointer event aimed at the handle. An end-to-end test dragging the handle
   caught it: the ring radius input never changed. Manual visual inspection
   would likely have missed this too, since the handle circle is invisible
   underneath the hole it's covered by. Fixed by placing the handle halfway
   between two holes instead, which is clear of every hole regardless of
   count or rotation. Generalizes: a coordinate collision between two
   interactive elements is invisible in a screenshot and only shows up when
   something actually tries to click the covered one.

8. **Fixed the described bug's mechanism, and there was a second, cooperating bug behind it.**
   Asked to fix "the video only updates once you let go of the scrubber."
   Found and fixed the frame-decode queue serializing a real seek per frame
   crossed during a drag (fine to fix in isolation — it explains a laggy
   catch-up). But testing the fix live still showed a single jump at release,
   not a live update. The second cause: the effect that displays a fetched
   frame discarded every resolved frame except the very last one (a `cancelled`
   flag keyed to `frameIndex`, meant to avoid setting stale state, but with
   the side effect of throwing away every legitimately-decoded intermediate
   frame during a drag). Fixing only the queue would have left the reported
   symptom unchanged. Caught by actually driving a mouse-drag in a live
   browser and reading the displayed frame mid-drag rather than trusting that
   the queue fix was sufficient because it was clearly a real bug. Generalizes:
   a bug report names a symptom, not a root cause, and a plausible-looking fix
   that doesn't reproduce-then-fix can land next to the real cause instead of
   on it.

9. **The tracker classified a multi-frame hole visit correctly only on its first frame.**
   Building the LOST/OCCLUDED_IN_HOLE state machine, the design was "decide
   which one it is from the last tracked position and recent shrink history,"
   which I implemented as a fresh evaluation on every vanished frame. Wrong:
   deciding "this is a hole entry" cleared `lastTrackedCentroid` (on the
   reasoning that the animal is now inside the hole, not sitting at its last
   visible spot), which meant the *second* consecutive vanished frame had
   nothing to re-attribute to a hole with and fell back to LOST — a real
   3+ frame hole visit would report OCCLUDED_IN_HOLE, LOST, LOST, LOST... A
   unit test asserting `records.at(-2)` for a multi-frame visit caught it
   immediately. Fixed by deciding the classification once per vanish streak
   and holding it for every subsequent frame in that streak, rather than
   re-deriving it each frame from state that the first frame's decision had
   already invalidated.

10. **A live-scrubbing fix from the previous session had a hidden failure mode: two callers wanting the same frame.**
    Building maze auto-detection, the ROI editor started showing a solid
    black frame on open for `test53` specifically, while detection on that
    same frame succeeded with correct geometry. Traced it to
    `frameSource.ts`'s seek-coalescing (added last session to make the
    scrubber track the cursor live during a drag): it judged whether a
    queued request was "superseded" by comparing an opaque per-call token,
    not the frame index being requested. On mount, the editor's display
    effect and its auto-detect effect both request frame 0 within
    milliseconds of each other as two independent calls — the second call's
    token became `latestToken` before the first call's queued turn came up,
    so the first call's real seek was skipped and its caller read an
    untouched canvas (solid black), while the second call did get real
    pixels. A data URL existing was not enough to catch this — the test I
    wrote decodes the JPEG back to pixels and checks mean luminance, not just
    that `<image href>` is non-empty. Fixed by comparing frame *index*
    instead of call identity: a request is only skipped once a *different*
    frame has been requested more recently, so two concurrent callers asking
    for the same frame both still get a real seek. Generalizes: a
    "keep only the latest" optimization is only correct when every caller is
    part of the same logical stream of requests: the ROI editor added a
    second, independent consumer (detection) without revisiting whether the
    coalescing assumption still held for it.

11. **The Worker's lifetime was tied to the wrong component.**
    Elvis reported that switching to a different video while one was
    tracking stopped the tracking. That was designed in, not a fluke:
    `TrackingPanel` created its Worker in a `useEffect` and terminated it on
    unmount, and `TrackingPanel` was keyed by video id and unmounted whenever
    the selected video changed -- so navigating away was architecturally
    identical to cancelling the job. The fix is a real lifecycle move, not a
    tweak: the Worker now lives in a hook (`useTrackingJob`) owned by `App`,
    which outlives any single video's view. Verified the fix rather than
    trusting the refactor: drove a real browser through start-tracking,
    switch-video, wait, and read the *other* video's row in the table
    climbing (2% -> 10% -> 19% -> 28%) while its own workspace was off
    screen, then confirmed it reached "Tracked." A second, smaller bug came
    out of the same verification pass before it ever reached Elvis: the
    video table's compact "Tracking N%" read the raw frame counter without
    the phase, and since tracking runs two full decode passes per video
    (background sampling, then detection -- see pipeline.ts), the percentage
    would climb to 100% during background sampling and then visibly *drop*
    back down when the tracking pass began its own count from zero. Caught
    because I compared two progress readings 3 seconds apart during my own
    test and got a smaller second number; fixed by labelling the phase
    ("Background N%" / "Tracking N%") rather than showing a bare number that
    implied one continuous count.

12. **Used a ref where the working pattern next to it used state, and the viewer never appeared.**
    Building CorrectionViewer's frame source, I stored the opened `FrameSource`
    in a `useRef` and had a second effect check `if (!source.current) return`
    before grabbing a frame. Opening a frame source is async; by the time that
    second effect's synchronous body ran (in the same commit as the first
    effect), the promise hadn't resolved, so the ref was still null -- and
    since mutating a ref doesn't trigger a re-render, no later effect ever
    re-checked it. The frame image, and the whole viewer gated on it, silently
    never rendered. RoiEditor solves the identical problem with `useState` for
    exactly this reason (state changes re-run effects that depend on it; refs
    don't), and I had that code open in the same session -- I just didn't
    reuse the pattern. Caught immediately by driving the real flow in a
    browser rather than trusting the typecheck, which had nothing to say
    about it. Fixed by switching to state, matching RoiEditor exactly.

13. **A sibling component silently overwrote one video's saved maze layout with another's.**
    Elvis reported that switching between videos sometimes shifted the maze
    overlay completely off the platform, self-correcting on a manual
    re-detect and then shifting again on the next navigation. Traced with
    live console tracing (not guessed): `CorrectionViewer`'s pin-toggle
    effect saved `{ videoId: video.id, roi, pins }` using `roi` as a *prop*
    from `App`, and `App` only resets that prop to `null` once `RoiEditor`'s
    own fresh-mount effect runs and propagates it back up. Both components
    remount in the same commit when the selected video changes, so on the
    very first render of the *new* video, `CorrectionViewer` receives the
    *previous* video's `roi` for one render before the reset arrives -- and
    its pins effect, which runs on every mount regardless, dutifully wrote
    that stale ROI to IndexedDB under the new video's id. Confirmed at the
    storage layer before touching any code: dumped the `rois` object store
    directly and found `test53`'s stored record held `test51`'s coordinates,
    written 1.2s after test51's own save, on `test53`'s very first-ever
    selection -- proof the write, not just the display, was wrong. The fix
    is structural, not a guard: `CorrectionViewer` never needed `roi` to
    persist a pin toggle in the first place, so `updatePins()` does a
    read-modify-write inside IndexedDB that only ever touches `pins`, using
    whatever ROI is *actually* stored rather than a value handed down
    through props. Verified by bouncing between two videos three times after
    the fix, reading both the DOM and IndexedDB directly at each step; both
    videos held their own distinct, correct coordinates throughout.
    Generalizes: a prop passed down from a shared ancestor is a *view* of
    that ancestor's state, with real propagation delay across a remount --
    treating it as an unconditionally-fresh value to write back to storage
    is the specific mistake, not React or the component structure in
    general.

14. **A CSS rule shared between two elements silently made one of them unclickable.**
    Elvis reported the target hole couldn't be dragged -- had to un-target it,
    move it, then re-mark it as target. `.roi-hole--target, .roi-hole--target-ring`
    shared one rule setting `fill: none`, correct for the ring (a hollow
    outline drawn around the hole) but wrong for `.roi-hole--target` itself,
    the *main* hole circle -- SVG only registers pointer events within a
    shape's painted area, so with no fill only the ~2px stroke at the very
    edge was clickable, and a drag starting at the shape's own centre (where
    every other hole works fine) silently missed it and hit the background
    frame image instead. Diagnosed methodically, not guessed: reproduced with
    a script first (confirmed the hole genuinely doesn't move), then traced
    pointer events (zero fired, not even pointerdown -- ruling out a JS logic
    bug), then compared `elementFromPoint` at the hole's own computed centre
    against a normal hole (returned the background `<image>`, not the
    circle), then dumped computed styles, which showed `fill: none` where a
    normal hole shows `fill: rgba(0,0,0,0.15)`. Each step ruled out one layer
    (JS event handlers, geometry, hit-testing) before landing on the actual
    CSS rule. Fixed by splitting the rule so the main circle keeps a solid
    fill (now a distinct colour, which also directly answered Elvis's
    separate request to make the target more visually obvious -- the same
    bug was suppressing both correctness and visibility at once).

15. **Escape detection structurally could never fire, on real footage where
    the animal visibly enters a hole.** Elvis reported that `test51` and
    `test53` both clearly show the mouse entering the target hole, but
    "total latency" (time to escape) stayed unmeasured ("--") for both. Root
    cause, confirmed by pulling the real per-frame track out of IndexedDB
    rather than guessing: the classical background-subtraction detector's
    connected-components sometimes never drops the blob's area all the way
    to zero as the animal enters a hole -- a residual sliver stays visible,
    so `detection.found` never goes `false`, and a frame that never goes
    "not found" can never reach `trackVanished()`, the *only* place the
    tracker's state machine ever considers `OCCLUDED_IN_HOLE`/escape at all.
    On `test53` the trailing ~165 frames sit within a few px of one hole
    while area falls from ~456 to 139 (the clip's median tracked area is
    460) and never recovers before the clip ends -- `state` stays `TRACKED`
    the entire time, a real, visually-obvious escape the state machine was
    structurally blind to. Fixed with a second `finalize()` pass,
    `promoteTrailingShrinkIntoHoleRun`, that reuses the existing
    proximity-and-shrink gate but scores it across the trailing near-hole
    run itself rather than a fixed window before a vanish, since here
    there's no vanish frame to anchor one to. Verified on all three real
    clips before and after (not just the two Elvis named): `test51` and
    `test53` now report real escape times, `test50` -- which Elvis confirmed
    genuinely never reaches its target -- correctly still doesn't, its tail
    sitting outside the proximity radius with a flat, non-shrinking area.

16. **A clean `tsc --noEmit -p .` that wasn't proof of anything, same shape
    as mistake 3.** While verifying `useCohortData.ts` and
    `VisualizationsPanel.tsx`, `tsc --noEmit -p .` reported zero errors. A few
    steps later, `npm run build` (`tsc -b && vite build`) failed on three real
    type errors in those exact two files: `CohortVideo.measures` typed as the
    plain `TrialMeasures` when the value actually flowing through it carries
    `EffectiveInvestigation`'s wider `kind` (includes `'manual'`), and two SVG
    `<text title="...">` props that don't exist in React's SVG typings. `-p .`
    against the root, references-only tsconfig doesn't actually build the
    referenced project configs the way `-b` does, so it was validating
    almost nothing. Fixed the real errors (widened `CohortVideo.measures` to
    the same `Omit<TrialMeasures,'investigations'> & {...}` shape
    `applyMeasureOverrides` already uses for exactly this reason; moved the
    two `title` props into `<title>` child elements, the pattern already used
    elsewhere in the same file). Fixed the process gap by using
    `npm run typecheck` (`tsc -b`) from here on, documented in CLAUDE.md's
    Commands section so it isn't relearned next session.

## Where the human overrode the model

Elvis's calls that went against what Claude proposed or assumed, logged at the
moment they happened. Separate from the section above on purpose: those are
the model being *wrong*; these are the model being *overruled*, which is a
different and more interesting record. For each: what Claude proposed, what
Elvis decided instead, the reasoning, and — once it's known — who was right.

1. **Asked for provenance before agreeing to build.** Claude finished the
   milestone-1 audit and moved straight to "approve this and start step 1."
   Elvis stopped it and asked where each decision actually came from — brief,
   Vite template, convention, observed bug, or model guess. That surfaced a
   real mislabel: Claude had explained the three-tsconfig split and the
   strictness flags as deliberate choices for this project when they were
   `npm create vite` defaults, changed by two lines total. The standing
   instruction out of it: when a preemptive fix is proposed, say whether the
   failure it prevents has been *demonstrated* or only *predicted*.

2. **"Setting `base` will break the Playwright e2e — fix it." It didn't.**
   The instruction came with a specific predicted failure: once
   `base: '/barnes-maze-pipeline/'` is set, `vite preview` serves under that
   path, so `page.goto('/')` 404s. It also came with "verify it actually fails
   before you fix it." Verified, and the prediction was wrong twice over.
   Vite 8's preview server 302-redirects `/` to the base path, so the original
   test passed untouched; and when I stripped `base` back out to check the
   test could detect its absence, the test *still* passed, because preview's
   SPA fallback serves `index.html` for any unknown path and the root-relative
   assets resolve fine locally.

   The underlying concern was real and the `base` setting was necessary — a
   wrong base renders a blank page on Pages. But the symptom is invisible to a
   browser pointed at a local preview server: the *only* local difference is
   the asset URL in the served HTML. So the fix isn't the one specified.
   `baseURL` now points at the base path (production doesn't have preview's
   redirect), and the smoke test asserts the module script src starts with
   `/barnes-maze-pipeline/assets/`. Confirmed load-bearing by removing `base`
   and watching it fail: `Expected substring: "/barnes-maze-pipeline/assets/"`,
   `Received string: "/assets/index-BGlXgxYQ.js"`.

   Right about the risk, wrong about the mechanism — and the "verify it fails
   first" instruction is what surfaced the difference. A confident,
   specific-sounding failure prediction is still a hypothesis; the version of
   this I'd have written without that instruction would have "fixed" a
   non-existent 404 and shipped a test that passes whether or not `base` is
   set.

3. **I used "nothing to install" as an argument against OpenCV.js. It isn't one.**
   Presenting the CV engine choice, Claude argued that OpenCV.js's ~9 MB WASM
   payload "slightly undercuts" the README's no-install promise, and leaned
   plain TypeScript partly on that basis. Elvis pushed back: the brief's
   no-install requirement is about the *end user* not putting anything on their
   machine — no Python, no API key, no account — and a WASM blob served from
   the same static site is just a page asset the browser caches. Correct, and
   the distinction matters: conflating "large download" with "installation"
   would have quietly disqualified a legitimate option for the wrong reason.
   The real trade-offs are narrower (first-load time, and CV logic behind a
   WASM boundary being awkward to unit-test), and neither is disqualifying.
   Decision landed on: build the TypeScript detector first, behind an interface
   that an OpenCV.js backend can implement, so the two can be compared on
   identical frames rather than argued about.

4. <!-- next real one goes here -->

## What I checked before believing it worked

<!-- e.g. ran the pipeline against all three sample videos and manually
inspected N frames of overlay, wrote unit tests for the timebase math because
it's easy to get 15000/1001 wrong silently, etc. -->

**Environment setup (this commit).** Did not take "it installed" as proof it
works: ran `npm run build`, `npm run lint`, and `npm run dev` (curl'd the dev
server for a 200) before claiming the toolchain was good. Also checked the
actual `engines` field of every installed tool rather than writing a plausible
Node version into the README from memory — the real floor is
`^20.19.0 || >=22.12.0`, not the "Node 20+" first drafted, which would have
been wrong for Node 20.0–20.18.

**Timebase ground truth (2026-09-01).** Did not take the upstream README's
frame-rate table at face value, and did not take my own recommendation at face
value either: parsed the `moov`/`stts` atoms of all three clips directly in
Python with no dependencies, so the numbers the unit tests will assert come
from the files themselves rather than from documentation or from a model. That
is what surfaced the variable frame timing, which neither source mentions.

**ROI editor (this commit).** Two things I did not take on faith. First, the
generated ring: instead of eyeballing an overlay that literally covers the
holes it is meant to land on, I sampled frame luminance at all 20 generated
positions and compared to the platform mean — every one landed 25–80 levels
darker than the surrounding surface, i.e. on an actual hole, from three
eyeballed clicks and no nudging. Second, an end-to-end test caught a real
autosave bug rather than a test-harness problem: the ROI save was a plain
debounce, so *every* edit cleared the pending timer and a user editing
continuously could go arbitrarily long with nothing written, losing it by
closing the tab. Fixed with a maximum delay — coalesce rapid edits, but never
postpone a write more than 750 ms past the first unsaved change.

**Test/CI scaffold (this commit).** Ran every script end to end rather than
assuming the config was right: `npm run typecheck`, `npm test` (2 passing),
`npm run build`, `npm run lint` (probed as described above), and
`npm run test:e2e` against a real Chromium on the production build, not the
dev server. The one unit test in the scaffold is deliberately about the
build-time version injection — if that `define` wiring silently breaks, every
exported spreadsheet ships an unattributable version number, which is exactly
the class of quiet wrongness the brief cares about.

**Automatic maze detection + editable overlay (this branch).** Extracted real
grayscale frames from all three sample clips (via the browser's own decode
path, not a separate tool) and ran detection against them, not just synthetic
fixtures — which is what caught the hole-count bug in entry 6 above after the
synthetic suite was already green. Final check on all three real clips: 20/20
proposed holes landing on genuinely darker pixels than the platform mean, on
every clip, with zero manual clicks. Every claimed interaction (drag the
centre, drag the ring handle, drag a hole, type an exact frame number, pin/
un-pin, calibrate in cm) has an end-to-end test that drives it with real
pointer or keyboard events and asserts the resulting state — not just that a
click handler exists. Two of those tests failed on the first pass and both
were real product bugs (entries 6 and 7), not test mistakes; both are fixed
and now pinned by regression tests. Manually screenshotted the finished
editor as a last check before calling it done, rather than trusting "e2e is
green" as the final word — the brief's whole premise is that a plausible-
looking result is not the same as a checked one.

**CV tracking core (this branch).** Verified against real MP4 bytes at every
layer rather than assuming an API worked as documented: probed mp4box's
sample-extraction and avcC-description APIs against a real clip in Node
before writing decode.ts against them, then measured the actual decode-vs-
display frame reordering on all three clips (a consistent max displacement of
8, not guessed) before choosing a reorder-buffer window size. Ran the full
decode path against all three real clips and asserted exact frame counts,
strict ascending order, and non-degenerate pixel content — not just "it
didn't throw." Ran the full background+detect+track pipeline against all
three real clips end-to-end (98–100% tracked on the two well-lit clips, 83%
on `test53` where the trial evidently opens on a dim/transitional frame the
tracker correctly refuses to fabricate a position for) and checked every
TRACKED centroid falls inside the platform boundary. Verified the Worker
actually solves the responsiveness problem it was built for, not just that it
runs: instrumented a `setInterval` tick counter during a real tracking run and
confirmed it kept firing throughout — the main thread doesn't freeze. Ran the
tracking flow through the real built UI (not just direct function calls) on
two of the three clips, including a reload to confirm persistence, and
screenshotted the resulting trajectory plot to eyeball it: it starts at the
platform centre and ends at the marked target hole, which is the expected
shape of a working trial, not just a shape that happens to render.

Two real bugs came out of this verification rather than being assumed away —
see mistakes entries 9 and 10. Both are now pinned by regression tests (a
unit test for the tracker attribution bug, an e2e test that decodes the
displayed JPEG back to pixels and checks mean luminance for the black-frame
bug — a test that only checked for a non-empty data URL would have passed
right through it).

Known gap, stated rather than silently left: there is no fallback for
browsers without WebCodecs. `decodeVideo` fails with a clear message instead
of a cryptic one, but CLAUDE.md's original plan called for a real fallback
(playback capture); that isn't built. Tracking simply isn't available yet on
a browser without WebCodecs support.

**Tracking survives navigation + video-table dashboard (this branch).** Real
user feedback surfaced a genuine bug (mistake 11) and a real design gap: the
tracker successfully tracked a full trial without ever flagging a hole
visit or an escape, and Elvis asked whether that was implemented. Checked
rather than assumed: read the nose-to-hole distance for the last 15 tracked
frames of `test51` directly. The nose sits 9-16px from hole 19 (hole radius
~13px) for the entire tail of the clip, state `TRACKED` throughout -- the
animal is investigating a hole with its body fully visible, and the clip
ends before any full-body vanish. That confirmed the actual gap precisely:
`OCCLUDED_IN_HOLE`/`IN_ESCAPE_BOX` require a full vanish (correct for real
escape) and structurally cannot fire on a nose-poke where the body stays
visible -- investigation detection needs a different signal (nose-to-hole
proximity over time) and was deliberately kept out of this chunk, per
Elvis's choice, as its own future milestone with its own adjustable
threshold. Recorded in CLAUDE.md so the reasoning survives past this
conversation.

**Correction viewer (this branch).** Verified against a real tracked clip,
not just component logic in isolation: tracked `test51` for real, then drove
every claimed interaction through a live browser -- expand toggle actually
changes rendered width (352px -> 640px, measured), clicking near the plotted
path jumps the scrubber to a different frame, dragging the point registers a
correction with distinct manual styling, revert clears it back to the
automatic value, and the correction is still there (with its styling) after
an actual page reload with a fresh point lookup rather than reusing stale
drag coordinates from before the reload. Used `test53`'s known LOST opening
stretch (frames 1-150, measured earlier this session) to exercise the one
state a 100%-tracked fixture like `test51` can't: confirmed a non-TRACKED
frame shows no draggable point and the "not built yet" note, not a silent
no-op. Running the full e2e suite together (23 tests, several running real
CV pipelines in parallel across 4 workers) surfaced real CPU contention that
a 90s wait didn't budget for on a slower run; brought it in line with the
120s margin the tracking tests already used successfully under the same
load, rather than just re-running until it happened to pass.

**Post-milestone bug fixes from real usage (this branch, continued).**
Four items from Elvis actually using the correction viewer. Two were
diagnosed by adding real console tracing to the running app and reading it
back from a live browser rather than reasoning from code alone -- the
cross-video ROI leak (mistake 13) looked, from reading the code, like it
should have been impossible; it wasn't, and the trace proved exactly which
effect and which render did it. The nose-jitter fix was verified with a test
that computes the *old* algorithm's answer by hand (dotA=17 vs dotB=-3, which
would have flipped the nose) and asserts the new one gives the opposite,
correct result -- not just "the new tests pass," which would pass just as
well for a fix that changed nothing. The cursor and expand-viewer changes
are small enough that manual verification (measuring rendered width before
and after the toggle, 352px -> 520px) was sufficient.

**Hole investigations and per-trial measures (this branch).** Pure logic
(`events.ts`, `measures.ts`) went in with 34 unit tests covering the
adjacent-frame-gap and occlusion-vs-proximity double-counting cases before
it ever touched a real video, but synthetic frames can't catch a units bug
or a bad assumption about what real tracked data looks like, so I ran the
built UI against all three real sample clips, not just `test51` again:
`test51` (100% tracked, zero occlusion frames) confirmed total latency
correctly reports "--" rather than fabricating an escape time when the
tracker itself never confirmed one -- the honest-gap policy holding up one
layer downstream of where it was built. `test53` and `test50` both have real
`LOST` stretches (150 frames each, from a dim/transitional opening and a
mid-clip gap respectively); path length and quadrant time on both came back
as plausible non-crashing numbers with the `LOST` frames' time genuinely
absent from every bucket, not zero-filled -- checked by summing the four
quadrant times against total clip duration and confirming they don't add up
to it. Retargeted the investigation threshold live in the running app (widen
the proximity factor from 1.5x to 5x, then 10x) and watched the investigation
count only ever grow, never behave inconsistently -- a real recompute, not a
stale cached table. `test50` (5539 frames, the long clip) ran the full
two-pass pipeline plus measures end-to-end with no console errors and
produced 119 investigation events and a 87.73s primary latency that lines up
with the frame range where hole 1 (the chosen target) actually gets
investigated in the printed table -- not just a plausible-looking number,
one that traces back to a specific, inspectable frame range. Full existing
e2e suite (20 tests across roi/correction/smoke) re-run afterward and stayed
green, confirming the new IndexedDB store (`investigationParams`, DB v4->v5)
and the new step-5 section didn't disturb anything upstream.

**Investigation editing and the review-workspace merge (this branch).**
Elvis's feedback covered a lot of ground at once (visual, layout, units,
editability) -- see CLAUDE.md's new bullets for what changed and why. Two
things worth recording about how this was verified.

First, a real scare that turned out not to be a real bug. Manually testing
add/edit/delete-then-reload for investigation edits, one specific sequence
(add a manual entry, edit it, delete it, delete an auto entry, reload)
appeared to lose the auto-deletion -- the count came back wrong after
reload. Rather than assume the debounced-save logic was broken and start
rewriting it, I dumped IndexedDB directly after each step (`indexedDB.open`
+ `getAll` in a `page.evaluate`), which showed every single write landing
correctly, including the final one. That ruled out the save path. I then
added temporary `console.log` tracing to `InvestigationPanel.tsx` (the same
diagnose-with-real-tracing method as mistake 13) and re-ran the *exact*
failing sequence in isolation -- and it passed cleanly, and kept passing on
every subsequent clean run. The actual cause: I had been running these
verification scripts against the Vite dev server while *simultaneously*
editing the source files it was serving, so a Vite HMR reload landed
mid-test and corrupted that one run's in-page state -- a test-environment
artifact, not a product defect. Recorded here rather than as a numbered
mistake because it wasn't one: per the standing rule about not blurring
demonstrated vs. predicted failures, this is worth being equally careful
about in the other direction -- a scary-looking result that traces back to
the test harness, not the code, isn't a defect just because it was alarming.
Lesson kept for future sessions: don't run live-browser Playwright
verification against a dev server while concurrently editing the files it's
serving; use the production build (or at least pause edits) for anything
where a false HMR-induced failure would be expensive to chase.

Second, a real process mistake, not a product one: an earlier `git rm` for
two old spec files partially failed (one of the two had uncommitted local
edits, which makes `git rm` abort the whole command atomically) and I didn't
notice -- `correction.spec.ts` stayed on disk, unedited, still asserting the
pre-merge DOM (`section.correction`), and duly failed four tests against the
new merged workspace on the next full run. Caught by running the *entire*
e2e suite, not just the new spec file, before calling this done -- exactly
why that's the standing practice rather than trusting one target file's
green run.

All three real sample clips re-verified against the finished workspace
(translucent-but-still-draggable target hole, the global default diameter
seeding a freshly detected ROI, live unit-converted detection criteria,
jump-to-frame, add/edit/delete, and all of it surviving a reload) via
throwaway Playwright scripts before writing the permanent e2e coverage, same
methodology as every prior chunk.

**Workspace polish from direct UI feedback (this branch).** Elvis flagged
the target hole's fill again -- a translucent centre (this session's earlier
fix) still dimmed the mouse at the exact moment it mattered. Given that this
exact property had already caused one real bug (mistake 14, a solid fill
breaking drag), I did not just change `fill` to `transparent` and move on:
wrote a two-circle minimal HTML page (`fill: none` vs `fill: transparent`)
and drove a Playwright center-click at each, confirming empirically that
`none` fails to register the click and `transparent` succeeds, before
touching the real component. That is the actual reason `fill: transparent`
is provably safe here and not just plausible.

A second scare, and a useful contrast with the test-environment false alarm
earlier this session: verifying the new `.roi`/`.review-workspace` width
breakout (`left: 50%; transform: translateX(-50%)`), an ad hoc drag script
produced a wildly wrong result -- a hole dragged 15px down landed over 300px
away. Rather than assume the CSS breakout broke `getScreenCTM()`-based
coordinate mapping (a real enough possibility given a CSS transform was
newly in the ancestor chain), I re-ran the identical drag with the one thing
my throwaway script had skipped that the real test suite never does --
`scrollIntoViewIfNeeded()` first -- and it landed exactly on target. The
element had been partly below the viewport; dragging into that state does
something Playwright/Chromium don't handle cleanly, unrelated to the CSS
change. Confirmed by checking `getScreenCTM()` directly (a clean
translation/scale matrix, nothing exotic) and by the full roi.spec.ts drag
test passing against the real breakout CSS in the suite run right after.
Two "the code is broken" alarms in one session, two different actual causes
(a Vite HMR race, an unscrolled drag target), zero real product bugs behind
either -- worth noticing as a pattern: a scary result is a reason to isolate
and check, not a reason to assume the newest change is guilty.

Real redundancy Elvis caught that I'd missed by only checking each panel in
isolation: after merging steps 4-5, the tracking panel (step 3) still showed
its own hole-visit/escape frame counts, which is exactly what the new
investigation table one step down already covers with actual context (which
hole, when). Simplified to a single tracking-QA line. Also caught after that
first fix: the status line and my new one-line summary sat back to back
saying almost the same thing ("741 frames tracked." / "741 of 741 frames
tracked.") -- merged into the one status line rather than two. Screenshotted
the finished step 3/4 layout at 1600px width before calling this done,
since a redundant second line is exactly the kind of thing a component-only
diff or unit test would never catch.

**Escape-detection refinement, search-strategy classification, editable
measures, and a round of workspace polish, all from one message (this
branch).** The highest-stakes item was the tracking fix: Elvis reported that
`test51` and `test53` visibly show the mouse entering a hole on video, but
total latency stayed "--" in both, and pointed specifically at `test53`
"shrinking into the hole" before the clip ends. Rather than guess at a fix,
pulled the real per-frame `FrameTrack` array straight out of IndexedDB after
tracking each clip (`indexedDB.open` + `getAll` in a `page.evaluate`, same
method as the mistake-13 trace) and looked at the raw numbers: on `test53`,
centroid-to-nearest-hole distance falls from 19.5px to 5.7px while area
falls from 456 (near the clip's own 460 median) to 139, over the trailing
~165 frames, `state` staying `TRACKED` throughout -- confirmed the
hypothesis (the classical detector's connected-components never actually
drops the blob's area to zero, so the vanish-based state machine never
engages) with real numbers before writing a line of the fix. Checked
`test51` the same way (same pattern, a ~50% area drop) and `test50` (the
one Elvis said correctly stays unescaped) specifically for a false
positive -- its tail sits at ~20px from the nearest hole against a ~17px
threshold, area flat, no shrink -- confirming the new logic wouldn't
over-fire before it ever ran against real data. Landed the fix
(`Tracker.finalize`'s new `promoteTrailingShrinkIntoHoleRun`), added 7 new
unit tests alongside the existing 20, then re-verified against the real
built app: `test51` and `test53` now show real "To escape" times, `test50`
still correctly shows "--".

That verification pass produced its own false alarm, worth recording
because it's a different *kind* of false alarm than the two earlier ones
this session. A screenshot showed "541 of 741 frames tracked" partway
through, which reads exactly like an interrupted run. Traced the actual
status text second-by-second through a full run (`section.tracking
.status` polled once a second) and watched it correctly reach "Tracking:
frame 737 of 741" and then land on "541 of 741 frames tracked." -- so the
run *did* complete; "541" is the count of frames still in `TRACKED` state,
correctly reduced by the ~200 frames the new escape logic had just
reclassified to `IN_ESCAPE_BOX`. Confirmed by pulling the saved array
directly: length 741 (not truncated), state counts `{TRACKED: 541,
OCCLUDED_IN_HOLE: 200}` on a run with no target hole set (so the trailing
run correctly fell back to OCCLUDED_IN_HOLE rather than escape). Not a
product bug -- but a real ambiguity in wording that I, with full knowledge
of the code, still misread on first glance, so reworded the status line to
lead with the total frames *processed* rather than the tracked count, so a
completed run can never look partial again. Distinct from the HMR race and
the unscrolled-drag alarm earlier this session: those were both artifacts
of my own verification method; this one was a real (if minor) product
clarity issue that the verification process surfaced correctly.

Search-strategy classification, the editable-measure-override system, and
the undo/regenerate/global-criteria/terminology/layout changes were built
and then verified together against the real, running app (not just unit
tests) before considering any of it done: confirmed the classifier produces
a real, inspectable label and reasoning against `test51`'s actual track
("Random -- 11% path efficiency, 14 holes investigated with no consistent
order..."), confirmed an override round-trips (set a value, see the
"(manual)" tag, revert, see the computed value return), and confirmed
undo/regenerate change the investigation count exactly as expected at each
step. Full e2e suite re-run against the rebuilt production bundle after
every structural change (the review-workspace layout change added a second
`<h3>` to the section, which broke three tests' `section.locator('h3')`
selectors -- caught by running the whole suite, not just the new
assertions, same standing practice as the correction.spec.ts leftover
earlier this session).

The investigation table's scroll cap (re-requested after last session's
"no scroll" version proved too restrictive on a long clip) is the one item
here worth its own note: the first CSS attempt (`align-items: stretch` +
`flex: 1; min-height: 0; overflow-y: auto`) *looked* right and matched the
usual advice for this exact problem, but didn't actually work -- a grid row
with no explicit height auto-sizes to its tallest item regardless of an
inner `overflow`, so a long table just dragged the whole row, and the video
column with it, up to its own full content height. Did not just eyeball it
and move on: measured `scrollHeight` vs. `clientHeight` directly against
`test50` (119 rows) in a real browser, found them exactly equal --
provably not scrolling despite the CSS reading as if it should. Fixed with
an explicit `max-height: calc(100vh - 6rem)`, a real constraint a stretched
grid item actually has to respect, and re-measured the same way to confirm
(`scrollHeight` 4123px against a capped `clientHeight` of 745px). A CSS fix
that "looks right" and matches conventional advice still isn't verified
until it's measured -- same standing rule this file already applies to
application logic, worth restating for CSS specifically since it's easy to
treat as lower-stakes.

**Investigation grouping, unique-hole errors, quadrant relabeling, hole
labels, and CSV/XLSX export (this branch).** Elvis pointed at a real
symptom -- `test53` (short, few investigations) got the same "random"
search-strategy label as `test50` (long, scattered) -- without knowing the
mechanism. Root cause, found before touching the classifier: raw
consecutive "nose came close" rows at the same hole were feeding the
order-score calculation as separate zero-length angular steps, drowning any
real signal. Fixed by grouping consecutive same-hole rows into one "visit"
(the same grouping now also drives the investigation table's new column and
the unique-hole error count). Verified against all three real clips, not
assumed from the logic alone: `test50` now correctly classifies **serial**
(92% order consistency across 25 visits -- it really is a methodical ring
walk), `test51`/`test53` stay **random** but with clearly different
reasoning now visible (11% vs. 54% path efficiency, 6 vs. 2 visits) -- the
label collision is gone where it was wrong, and the two "random" trials are
now distinguishable by their own stated reasoning where the label
genuinely is the same (neither found the target directly nor searched in
order, which is what "random" means in this framework).

Per this session's own new standing instruction (verification was consuming
too much of the budget): batched what would have been ~5 separate
browser-verification passes into 3, and skipped a from-scratch multi-video
export test in favor of trusting the loop logic once the single-video case
was confirmed end-to-end (real download captured, CSV content read back and
checked against the on-screen numbers) -- a judgment call to make the
verification proportionate to the risk, not skip it.

**Nose-tracking smoothing, "test50 still random," export restructuring,
sticky header, and visualizations (this branch).** Elvis reported four
things at once; treated each on its own evidence rather than assuming they
shared a cause.

Re-tracked `test50` fresh, both before and after widening
`NOSE_DIRECTION_WINDOW` (5→10) and raising `MIN_INFORMATIVE_SPEED`
(0.5→1.5px/frame), and got **Serial** both times (92% then 95% order
consistency), never Random -- could not reproduce what Elvis is seeing.
Reasoned about it rather than guessing further: `holeOrderScore` and
`directness` are mathematically independent of *which* hole is the target
when the target is never reached (`test50`'s case), so a different chosen
target hole shouldn't explain a label flip either. Landed on stale cached
track data as the likely explanation -- tracking results live in IndexedDB
and only investigations/strategy recompute live from those *cached* tracks
on reload, so the smoothing fix only changes what a *fresh* re-track writes,
not what an already-tracked video has stored -- and reported that
transparently rather than declaring it fixed. **Genuinely unresolved**: no
confirmation yet that a re-track resolves it on Elvis's end.

Verified the smoothing change itself two ways, not just one: unit tests
(widened the existing reversal-sequence test so it's still long enough to
flush the wider window post-widening rather than failing for an unrelated
reason; added a new test asserting small back-and-forth jitter that would
have crossed the *old* 0.5px/frame threshold no longer flips the nose), and
real re-tracked `test50` data pulled from IndexedDB (investigation count
119 → 105, consistent with less spurious jitter generating fewer noise
events, not just a different number for its own sake).

Verified the export restructuring and the new visualizations panel together
in one real-browser pass rather than two, per the token-conservation
instruction -- but not against a full CV re-track, which would cost minutes
per clip for a UI-layer change that doesn't touch the CV pipeline at all.
Instead seeded IndexedDB directly with two synthetic-but-schema-real videos
(same `StoredVideo`/`StoredRoi`/`StoredTrack` shapes a real tracked video
would produce -- one that reaches its target and escapes, one that never
does) and drove the real app against them: confirmed the combined export
section's investigation count matched the seeded data exactly (5, matching
2 + 3 real hand-placed proximity visits), a per-video CSV download's row
count matched, the occupancy heatmap rendered non-zero cells, the hole-visit
raster's bar count matched each video's own visit count and updated on
switching the video picker, and the learning curve's "never reached" marker
fired exactly twice -- both from the video that never found its target --
and not at all for the one that did. Zero console errors across the whole
pass. This is real rendering and real IndexedDB reads through the actual
`useCohortData`/`computeOccupancyGrid`/`groupConsecutiveInvestigations`
code paths, not a mock -- the only thing synthetic is which pixels a
(nonexistent, tiny placeholder) video blob contains, which none of the code
under test reads.

Verified the sticky header by measuring the `<th>` element's actual screen Y
position before and after scrolling the table 300px, rather than trusting
that `position: sticky` compiled -- identical position both times confirmed
it's genuinely sticky, not just present in the CSS.

**e2e timeouts investigated, not assumed to be a code regression.** The full
suite (4 parallel workers) failed 4 `review.spec.ts` tests, all on the same
120s `waitFor` for a real tracking run to finish. Did not take "my branch
touched `tracking.ts`" as circumstantial guilt: re-ran `review.spec.ts`
alone, serially (`--workers=1`, removing worker-vs-worker CPU contention as
a variable), and got 3 *different* failures with zero overlap with the first
run's 4 -- if this were a deterministic regression in the tracking pipeline
itself, the same tests (the same video, the same frame count) should fail
both times. They didn't. Then read this branch's actual diff against `main`
rather than reasoning from memory: the only change inside `tracking.ts` is
two named constants (`NOSE_DIRECTION_WINDOW` 5→10, `MIN_INFORMATIVE_SPEED`
0.5→1.5) inside `assignNose`, both still O(1) per frame -- no loop, no data
structure, no new pass added -- incapable of producing a 2-3x slowdown on
its own, and nothing else on this branch touches the decode/detection/
worker path at all (`git diff main --stat`: only `tracking.ts`,
`tracking.test.ts`, plus UI/CSS/docs). Conclusion: this is the existing
120s-per-tracking-run budget being tight against this machine's real,
variable load at the moment (this session already had an orphaned dev
server left running on another port, among other things) -- a pre-existing
margin problem in the test suite's timeout, not something this branch
introduced. Confirmed directly, not just inferred: pushed the branch and
checked the real CI run rather than trusting the local diagnosis alone --
all 30 e2e tests (the same suite, same three real sample clips) passed in
2.8 minutes on GitHub's runner, vs. repeated local timeouts on the same
tests. Not silently waved off either way: written down here, and worth
revisiting if it ever recurs *in CI* rather than only locally.

**Chart downloads, learning-curve axis, step-3 alignment, and "copy layout"
(this branch, continued).** Verified all four small tweaks together in one
real-browser pass, seeding two schema-accurate synthetic videos with
deliberately different hole radii (14px, 22px) so the layout-copy fix had
something real to distinguish. Measured `getBoundingClientRect().left` on
all three of steps 2/3/4's `<h2>` headings directly rather than eyeballing
a screenshot -- 40px, 40px, 40px, confirming genuine pixel alignment, not
just "looks close." Captured a real SVG download and a real PNG download
and checked their actual bytes (`<svg` + namespace for the former, the
`\x89PNG` file signature for the latter) rather than trusting that
`canvas.toBlob` didn't throw. Clicked "Copy layout from synthA.mp4" on
synthB (deliberately seeded with a different hole radius) and confirmed its
hole-radius input changed from 22 to 14 -- the actual mechanism Elvis asked
for ("a way to make them all the exact same"), not just a button that
exists. Re-ran `roi.spec.ts` (12 tests, all real ROI-editor interactions,
none touch tracking so this was cheap -- 14s total) after the `RoiEditor.tsx`
changes and it stayed green.

On Elvis's "still seeing all three videos classified Random": did not
propose a third hypothesis without new evidence. The two already on record
(stale cached track data; testing a build that doesn't have this branch's
fixes) both still fully explain the report, and this branch being
deliberately unmerged per Elvis's own instruction is a concrete, checkable
reason the second one could be true right now — reported both directly
rather than inventing something new to sound more certain.
