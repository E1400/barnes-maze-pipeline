# `src/core` — pure logic

No DOM, no React, no OpenCV handles. Everything here takes plain data and
returns plain data so it can be unit-tested directly with Vitest: timebase
math, ROI geometry, tracking state types, event detection, per-trial
measures, and the search-strategy classifier.

Rule of thumb: if a function needs a `document`, a `Worker`, or an
`IDBDatabase`, it belongs in `src/ui`, `src/workers`, or `src/state` instead.
