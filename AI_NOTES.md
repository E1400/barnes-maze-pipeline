# AI Notes

Skeleton — fill in as you go, not at the end. The brief specifically wants
real moments, not a reconstructed narrative.

## Tools and setup

- Model(s) used: Claude Opus 5, via Claude Code in the terminal.
- Configuration: `CLAUDE.md` (repo root), `.claude/agents/`, `.claude/commands/`
  — describe what each does and why it exists once they're doing real work,
  not just scaffolding.
- MCP servers, if any:

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

8. <!-- next real one goes here -->

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
