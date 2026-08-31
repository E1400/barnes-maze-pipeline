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

3. <!-- next real one goes here -->

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
