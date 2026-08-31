# `src/state` — persistence

IndexedDB layer: video blobs, ROI definitions, tracking results, manual
corrections, and analysis parameters. A page reload must never lose
annotation work, so writes happen as the user works, not on an explicit
"save".
