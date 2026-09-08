# AI Notes

## Tools and setup

- **Models:** Claude Opus 5 for initial scaffolding; Claude Sonnet 5 for the
  majority of feature development onward. Both via Claude Code (terminal and
  VS Code-integrated), no chat-only usage.
- **Configuration:**
  - `CLAUDE.md` (repo root) — the running architecture-decision record.
    Every non-obvious choice (pure TypeScript over OpenCV.js, a
    detection-first ROI editor, tracking in a Worker, why escape detection
    needed a second finalize pass) is written down as it's decided, with the
    reasoning and what was verified. Every session starts by reading it.
  - `.claude/agents/cv-reviewer.md` — a project-specific subagent invoked
    after any change to tracking/event-detection/measures code, checking
    this project's own named failure modes (silent interpolation,
    lost-vs-occluded confusion, hard-coding to one clip, buried thresholds).
  - `.claude/commands/sample-check.md` — a slash command that re-runs the
    pipeline against all three real committed sample videos and diffs
    against the last committed `demo-outputs/`.
- **MCP servers:** none. Not attempted given the time available.

## Disagreements and mistakes

**Used "nothing to install" as an argument against OpenCV.js — it wasn't
one.** Presenting the CV engine choice, the case against OpenCV.js leaned
partly on its ~9MB WASM payload "slightly undercutting" the no-install
promise. That conflated two different things: the brief's no-install
requirement is about the *end user's machine*, and a cached page asset
isn't an installation. Caught before it disqualified a legitimate option
for the wrong reason. Landed on building the TypeScript detector first,
behind an interface an OpenCV.js backend could still implement later.

**A specific, confident prediction turned out wrong, twice over.** Told
that setting `base: '/barnes-maze-pipeline/'` would break the existing
Playwright smoke test's `page.goto('/')` — with an explicit instruction to
verify the failure before fixing it. It didn't fail: Vite's preview server
redirects `/` to the base path, so the original test passed unchanged. The
underlying concern (a wrong base renders a blank page on GitHub Pages) was
real; the specific mechanism predicted wasn't. Fixed by asserting the
built asset URL carries the base path directly, then confirmed that
assertion actually catches the failure by removing `base` and watching it
fail.

**Asked for the provenance of early decisions before agreeing to start
building.** Config choices like the tsconfig split and its strictness
flags had been described as deliberate project decisions when they were
actually framework defaults, changed by two lines. Asking "where did this
actually come from — brief, template, observed bug, or a guess" caught the
mislabel before it became load-bearing.

**A CSS rule shared between two SVG elements silently made the target hole
undraggable.** One rule set `fill: none` for both a hole and its outline
ring — correct for the ring, wrong for the hole itself, since SVG only
registers pointer events within a shape's *painted* area. Reported as "the
target hole specifically can't be dragged." Diagnosed by elimination:
reproduced first, checked which element actually received the click at the
hole's own centre, then compared computed styles against a working hole —
before touching any code.

**A performance rewrite almost shipped a silent behavior change.**
Optimizing tracking speed, a first hypothesis (per-frame buffer allocation)
was checked with a real benchmark and turned out nearly worthless (1.03x
speedup) — reported honestly rather than shipped as the fix. The real cost
was a morphology callback invoked ~6M times per frame. Rewriting it, an
early draft changed a boundary-fill constant based on plausible-sounding
reasoning about edge pixels, which was wrong: the original code used a
different value, caught only by re-reading the exact pre-existing call
sites instead of re-deriving what they "should" do.

**A "fixed" bug came back because the fix only reached part of the
problem — twice.** A platform-diameter race condition was fixed once
(awaiting a stored default instead of racing a ref), reported as resolved,
then reported again as still happening: the fix stopped *new* layouts from
being created with a null diameter but did nothing for ones already saved
that way. A later report found the same shape of bug one layer deeper: the
self-heal for that stale data lived in only one component's mount effect,
so a cohort-wide view could still show stale numbers for a video nobody
had reopened. Both times, "fixed the mechanism that creates the bad state"
and "fixed the bug for every case" turned out to be different claims.

**A dedup fix worked, then didn't.** Loading the three sample videos twice
duplicated all three rows, traced to a fetched file's timestamp defaulting
to "now" on every download and fixed with a constant value. Reported again
as still duplicating. Rather than keep chasing why the id might
occasionally still differ, replaced the mechanism entirely: check the
loaded-videos table by name before fetching anything, which can't
duplicate regardless of how any id is computed.

**An honestly-labeled "not yet verified" limitation turned out to hide a
real bug.** 200% browser zoom had been carried in the README as an
untested assumption. Checked directly with a real browser zoom during a
final review rather than left open again, and it failed — the loaded-
videos table produced a genuine page-level horizontal scroll. Writing down
that something hasn't been checked is not the same as it being fine.

## What I checked before believing it worked

- Container timebase (fps, frame count) parsed independently from the raw
  MP4 bytes in a separate script, not taken from documentation or a first
  implementation's own assumptions.
- Auto-detected ROI holes checked against actual frame luminance at each
  proposed position, not just eyeballed against an overlay drawn on top of
  the thing it's supposed to detect.
- Every claimed UI interaction (drag, keyboard nudge, exact-frame entry,
  pin/unpin) has an end-to-end test driving real pointer/keyboard events
  and asserting the resulting state, not that a handler exists.
- The tracking-speed rewrite was verified behavior-preserving with a
  byte-for-byte cross-check against an independently-written naive
  reference, not just "the existing tests still pass."
- Local end-to-end flakes were confirmed against GitHub's hosted CI runner
  before being treated as environmental — never dismissed on assumption.
- Real-browser checks (accessibility, drag precision, cache staleness) read
  live DOM/`IndexedDB` state directly rather than trusting that the code
  reads correctly.
