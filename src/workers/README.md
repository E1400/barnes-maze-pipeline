# `src/workers` — tracking worker

The tracking pipeline runs off the main thread: WebCodecs decode, background
model (median-of-frames), per-frame foreground extraction masked to the
platform ROI, connected-components/centroid/nose extraction (pure
TypeScript, behind the `Detector` interface in `src/core/cv` — not
OpenCV.js), and progress messages back to the UI.

Keep the message protocol between the worker and the UI in one typed module —
the worker boundary is the easiest place in this project to let untyped
`any`s in.
