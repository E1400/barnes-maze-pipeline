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

**Elvis corrected a flawed argument against OpenCV.js.** Presenting the CV
engine choice, Claude argued OpenCV.js's ~9MB WASM payload "slightly
undercuts" the no-install promise. Elvis pushed back: the brief's
no-install requirement is about the *end user's machine* — no Python, no
account — and a cached page asset isn't an installation. Conflating "large
download" with "installation" would have disqualified a legitimate option
for the wrong reason. Landed on: build the TypeScript detector first,
behind an interface an OpenCV.js backend could still implement later.

**A CSS rule shared between two SVG elements silently made the target hole
undraggable.** `.roi-hole--target, .roi-hole--target-ring` shared one rule
setting `fill: none` — correct for the ring outline, wrong for the hole
circle itself, since SVG only registers pointer events within a shape's
*painted* area. The tell was Elvis reporting the target hole specifically
couldn't be dragged. Diagnosed by elimination — reproduced first, then
checked `elementFromPoint` at the hole's own centre (it returned the
background image, not the circle), then compared computed styles against a
working hole (`fill: none` vs. `fill: rgba(0,0,0,0.15)`) — before touching
any code.

**A performance rewrite almost shipped a silent behavior change.**
Optimizing tracking speed, a first hypothesis (per-frame buffer allocation)
was checked with a real benchmark and turned out nearly worthless (1.03x) —
reported honestly rather than shipped as the fix. The real cost was a
morphology callback invoked ~6M times per frame. Rewriting it, an early
draft changed a boundary-fill constant based on plausible-sounding
reasoning about edge pixels — which was wrong: the original code used a
different value, caught only by going back and re-reading the exact
pre-existing call sites instead of re-deriving what they "should" do.

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
