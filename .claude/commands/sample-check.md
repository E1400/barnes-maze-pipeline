---
description: Run the pipeline against all three committed sample videos and summarize whether anything regressed.
---

Run the full pipeline (or as much of it as currently exists — update this
command as the real scripts/tests come online) against all three sample
videos referenced in `docs/brief-archive.md`
(`data/barnes-maze/{test50,test51,test53}.mp4` from
https://github.com/salk-airc/rse-takehome-2026, not committed to this repo).

For each video, report:
- % of frames tracked / lost / occluded-in-hole / in-escape-box
- computed primary/total latency and errors
- anything that changed vs. the last committed outputs in `demo-outputs/`

Flag explicitly if a change only improved one video at the expense of another
— per `CLAUDE.md`, the three clips are not interchangeable and a fix tuned
against one has to survive the other two.
