# Task 1 — Barnes Maze Pipeline: Project Plan

Mirrors `claude/task1-plan.md` in the "Salk Projects" claude.ai Project. If
the two ever disagree, this file (living with the code) wins for anything
code-level; update the Project doc too if you change something here that a
non-coding planning conversation would want to know about.

Decision (2026-08-31): pursue **Task 1 only, deep**. Rationale: no
auth/backend required (fully static client-side page is the ideal shape per
the brief), strongest fit to Elvis's bioinformatics/CV/pipeline background,
and `talmolab/vibes` has directly relevant reference tools (`video-player`,
`labelroi`, `sam3-segmenter`, `pixel-scale-tool`, `event-annotator`, sleap
tooling) to borrow patterns from. Time budget: most of the week (Aug 31 → Sep
8, 9am PT), focused.

## Source of truth

- Take-home repo: https://github.com/salk-airc/rse-takehome-2026
  (`tasks/01-barnes-maze.md`, `data/barnes-maze/README.md`)
- Reference patterns: https://github.com/talmolab/vibes
- Submit: this repo's link → email talmo@salk.edu by 2026-09-08 9:00am PT, add
  `talmo` as collaborator if private.

## What "excellent" means here (from the rubric + task brief)

- **Usability is central.** A student who's never seen the tool goes from a
  folder of videos to a spreadsheet in one sitting, no terminal, no help.
  Cold-open test.
- **ROI definition step is the make-or-break UX moment.** 20 holes × 60
  videos = the tool must not ask for 1200 clicks.
- **Honesty over cleverness.** Tracking failures must be visibly flagged, not
  silently interpolated. No ground truth is provided on purpose.
- **Manual correction is non-negotiable.**
- **Distinguish "tracking lost" from "mouse entered a hole."**
- **All 3 sample videos must work in the demo**, not just one.
- **Generous, exportable visualizations.**
- **Reloadable intermediate representation.**
- Cross-cutting: accessibility, "it has to run" (cold clone, pinned deps,
  live deployment strongly encouraged — GitHub Pages fits a static app),
  `AI_NOTES.md` with real disagreement moments logged as we go, a data/cost
  section (fully client-side CV means zero data egress, zero API key, zero
  marginal cost — worth stating explicitly), real commit history, tests/CI
  appropriate to the project, permissive license.
- Task 1 is explicitly **exempt from auth** — do not build a login screen.

## Architecture (see CLAUDE.md for the maintained, authoritative version)

Fully static, client-side, TypeScript + React + Vite, deployed to GitHub
Pages. OpenCV.js (WASM) in a Web Worker for background-subtraction tracking,
masked to the platform ROI. A 4-state per-frame classifier (tracked / lost /
occluded-in-hole / in-escape-box). IndexedDB for session persistence. A
click-then-nudge ROI editor. SheetJS for CSV/XLSX export.

## Phased milestones (cut from the bottom if time runs short)

1. **Scaffold** — repo, Vite/React/TS, lint/test/CI skeleton, `CLAUDE.md`,
   `AI_NOTES.md`/README skeletons, license; video loader with drag-drop +
   IndexedDB persistence.
2. **ROI editor** — auto-ring generation, nudge, target selection, cm
   calibration, per-video persistence, cross-video template reuse.
3. **CV tracking core** — OpenCV.js worker, background model,
   contour/centroid/nose extraction, 4-state classification, progress bar;
   validated against all 3 clips.
4. **Cleanup + correction UI** — visible smoothing/gap-fill params, per-video
   quality report, frame scrubber with overlay, click-to-correct, auto-vs-
   manual provenance, reload survives.
5. **Event detection + measures** — adjustable hole/escape thresholds with
   live preview, latency/errors/path length/speed/quadrant time, rule-based
   search-strategy classifier with shown reasoning + override.
6. **Visualization + export** — trajectory/path/heatmap/raster/learning-curve/
   cohort views (colorblind- and grayscale-safe), CSV/XLSX export, run all 3
   real videos end-to-end and commit the generated outputs to the repo.
7. **Compliance + ship** — accessibility pass, Known Limitations doc, README
   (setup, decisions, data/cost paragraphs), `AI_NOTES.md` finalized, GitHub
   Pages deploy, cold-clone verification, 2–3 min demo video, optional MCP
   server stretch (summarize a cohort's exported CSVs via Claude/ChatGPT) if
   time remains.
