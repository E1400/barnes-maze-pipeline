# Barnes Maze Analysis Pipeline

**Live demo:** TODO — add GitHub Pages URL before submission
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

TODO once the app scaffold exists:

```bash
npm install
npm run dev
```

Or just open the live demo URL above — nothing to install for actual use.

## What it does

1. Load one or more maze videos (drag and drop).
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

## License

TODO — add a LICENSE file (MIT or Apache-2.0).
