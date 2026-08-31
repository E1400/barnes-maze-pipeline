# `src/workers` — OpenCV.js worker

The tracking pipeline runs off the main thread: background model
(median-of-frames), per-frame foreground extraction masked to the platform
polygon, contour/centroid/nose extraction, and progress messages back to the
UI.

Keep the message protocol between the worker and the UI in one typed module —
the worker boundary is the easiest place in this project to let untyped
`any`s in.
