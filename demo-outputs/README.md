# `demo-outputs`

Real generated outputs for the three sample videos (`test50`, `test51`,
`test53`) — per-trial summary, per-event detail, and quality report — as
required by the brief. Generated from an actual run of the tool against a
production build (`vite preview`), driven end to end (load → auto-detect the
maze → track → export), never hand-edited.

The sample videos themselves are not committed here; they live in
[salk-airc/rse-takehome-2026](https://github.com/salk-airc/rse-takehome-2026/tree/main/data/barnes-maze).

## Files

- **`trials.csv`** — one row per video: latency, errors, path length/speed,
  quadrant time, and search-strategy classification with its reasoning.
- **`investigations.csv`** — one row per hole-investigation visit across all
  three videos (consecutive same-hole detections merged into one visit, same
  grouping the app's own investigation table uses).
- **`quality-report.csv`** — one row per video: what fraction of frames
  tracked cleanly, and the single longest run of `LOST` frames (where
  tracking failure clusters, not just how much of it there is).
- **`barnes-maze-export.xlsx`** — all three of the above as sheets in one
  workbook.

## Target hole caveat, stated plainly

`test51` and `test53` had their target hole identified programmatically:
each was tracked once with no target set, then the hole nearest the
tracker's own trailing `OCCLUDED_IN_HOLE` run (a real, evidence-based
signal — see CLAUDE.md's escape-detection notes) was set as the target and
the video re-tracked. `test51`'s discovered hole (20) matches this
project's own independently-verified ground truth from earlier manual
inspection of the real per-frame track.

`test50` has **no target hole set**. An earlier attempt picked one
arbitrarily on the reasoning "it never reaches its target anyway" — but the
mouse's real, systematic ring walk passed directly through that hole
partway through the clip, producing a specific, wrong "primary latency:
87.7s" and a search-strategy classification cut off at that same wrong
point. There is no independently-verified true target hole for `test50` in
this project's own testing, so `trials.csv` correctly shows latency,
quadrant time, and search strategy as blank for that row rather than a
fabricated answer — the honest choice, not a gap. Errors (non-target hole
investigations) still compute correctly with no target set.
