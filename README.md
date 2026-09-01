# Barnes Maze Analysis Pipeline

**Live demo:** https://e1400.github.io/barnes-maze-pipeline/
**Demo video (2–3 min):** TODO — all three sample videos, start to finish

A browser-based tool that turns a folder of Barnes maze behavior videos into
per-trial latency, error, and search-strategy measures, and a downloadable
spreadsheet — no terminal, no install, no account required.

Built for [Task 1](https://github.com/salk-airc/rse-takehome-2026/blob/main/tasks/01-barnes-maze.md)
of the Salk AIRC Research Software Engineer take-home.

## Who this is for

A core facility manager or student who currently times Barnes maze trials by
hand with a stopwatch and a clicker, and needs consistent, defensible
latency/error/search-strategy numbers for a paper — without learning Python,
a notebook, or a command line.

## How to run it

**To just use it:** open the live demo URL above. There is nothing to install
— no Node, no Python, no account.

The site is published by
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) on every push to
`main`, from the same `dist/` that `npm run build` produces locally. It serves
from `/barnes-maze-pipeline/`, which is why `base` is set in
[`vite.config.ts`](vite.config.ts); the end-to-end test asserts the built asset
URLs carry that prefix, because a wrong base is invisible locally and renders a
blank page in production.

**To run it from source** you need Node `^20.19` or `>=22.12` (what the Vite 8
toolchain requires). This repo is developed and verified against Node 24,
pinned in [`.nvmrc`](.nvmrc):

```bash
git clone https://github.com/E1400/barnes-maze-pipeline.git
cd barnes-maze-pipeline
nvm use          # optional — picks up the pinned Node version from .nvmrc
npm install      # exact versions come from package-lock.json
npm run dev      # dev server on http://localhost:5173
```

Other scripts:

```bash
npm run build      # production build into dist/
npm run preview    # serve the production build locally
npm run lint       # oxlint (warnings fail)
npm run typecheck  # tsc --build, no emit
npm test           # vitest, unit tests for src/core
npm run test:e2e   # playwright smoke test against the production build
```

The end-to-end test drives a real browser, so the first run needs
`npx playwright install chromium` (about 100 MB, once per machine). Everything
except that step runs on a cold clone with nothing but `npm ci`.

Lint, typecheck, unit tests, build, and the end-to-end test all run in CI on
every push — see [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

The sample videos are not committed here (they're large, and they belong to
the take-home repo). To use the app, download `test50`, `test51`, and `test53`
from [salk-airc/rse-takehome-2026](https://github.com/salk-airc/rse-takehome-2026/tree/main/data/barnes-maze)
and drag them in.

To run the full test suite you need them on disk, because the timebase tests
assert measured ground truth against the real files:

```bash
npm run fetch:samples   # downloads the three clips into data/barnes-maze/
```

Without them, those tests skip rather than silently pass; CI always fetches
them, so the ground-truth assertions are always enforced there.

## What it does

1. Load one or more maze videos (drag and drop). Each file's frame rate,
   frame count, and duration are read from the MP4 container and shown, so you
   can see the timing was measured rather than assumed.
2. Define the platform boundary, the 20 holes, and the target hole — a
   handful of clicks, not twenty.
3. Automatic tracking of the animal's position, entirely in your browser.
4. Review tracking quality; correct anything wrong by hand.
5. Detect hole investigations and the escape-box entry.
6. Get computed measures (latency, errors, path length, search strategy)
   with the reasoning shown, not just a label.
7. Export a CSV/XLSX report.

## What I chose not to build, and why

TODO — fill in as real scope decisions get made during the build. Keep this
concrete ("X because Y"), not aspirational.

## How the frame timing is read

`HTMLVideoElement` exposes a duration and nothing else — no frame rate, no
frame count. Dividing frame count by duration looks like measurement but gives
15.005 fps for `test51.mp4`, which rounds to "15" and is precisely the wrong
answer; the file is really 15000/1001 ≈ 14.985. All three sample clips also
have *variable* frame timing, so no single constant interval describes them.

So the app parses each MP4's `stts` table with mp4box.js, builds exact
per-frame presentation times by cumulative sum of integer ticks, and reports
the nominal rate as an exact rational (`30/1`, `15000/1001`) rather than a
float. Every latency measure is computed from those per-frame times, not from
`index / fps`, and the loader shows the per-file jitter instead of hiding it.
Measured ground truth and the reasoning: [`docs/timebase-findings.md`](docs/timebase-findings.md).

## Known limitations

TODO — be specific as you find real ones (e.g. "hole detection fails when
the platform is off-center, see `test51`"), not vague ("could be more
robust").

## Where the data goes, and what it costs

**What leaves your machine:** nothing. Video files are never uploaded —
tracking runs entirely client-side using OpenCV.js (a WebAssembly build of
OpenCV) executing in your browser tab. No frame, coordinate, or measurement
is ever sent to a server.

**Keys and cost:** none required. There's no API key, no account, and no
per-run cost — the whole pipeline runs on the CPU in the browser, for free,
for as many videos as you want to process.

## AI-assisted development

See [AI_NOTES.md](AI_NOTES.md).

## Repo layout

```
src/core/     pure logic, no DOM — unit-tested with Vitest
src/workers/  OpenCV.js tracking worker
src/state/    IndexedDB persistence
src/ui/       React components
src/io/       CSV/XLSX export and the project-file schema
scripts/      helper scripts (fetching the sample clips)
tests/e2e/    Playwright end-to-end tests
demo-outputs/ committed real outputs for test50 / test51 / test53
docs/         build plan and an archived copy of the take-home brief
```

Each `src/` subdirectory has a README describing what belongs there.

## License

[MIT](LICENSE).
