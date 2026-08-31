# Salk RSE Take-Home — Full Source Archive

Archived verbatim from https://github.com/salk-airc/rse-takehome-2026 (commit ce7b84c, cloned 2026-08-31) so future chats in this project have the authoritative brief without re-cloning. If in doubt about a discrepancy, the live repo is the source of truth — this is a snapshot.

Reference patterns repo mentioned in the brief: https://github.com/talmolab/vibes (small browser-based research tools; especially relevant to Task 1 — see `video-player`, `labelroi`, `sam3-segmenter`, `pixel-scale-tool`, `event-annotator`, sleap-related tools).

**Decision on record (see `claude/task1-plan.md` in this project): pursuing Task 1 only, deep.**

---

## README.md (top-level brief, rubric, cross-cutting requirements)

# Salk AIRC: Research Software Engineer take-home

Center for AI and Research Computing · Salk Institute for Biological Studies
Requisition **RESEA002823** · Research Software Engineer I

This take-home is your opportunity to show how you define,
build, and ship research software with AI coding agents.

---

## The short version

| | |
|---|---|
| **Complete** | at least one of the [three tasks](#the-tasks) |
| **Sent** | Monday, August 31, 2026 |
| **Due** | **Tuesday, September 8, 2026, 9:00 AM Pacific** |
| **Submit** | a GitHub repo link, emailed to **talmo@salk.edu** |
| **Private repo?** | Fine; add **`talmo`** as a collaborator. |
| **After** | approximately ten candidates will be invited to interview |

Use any stack, language, or architecture that gets you to a working product
your user can operate.

If something in here is ambiguous, resolve it however you think best and say so
in your README. Deciding what the request means is part of the job. We will
answer questions about genuine blockers, but product and technical decisions
are yours to make.

---

## The tasks

Each task comes from work requested by people at the Institute.

| | Task | Leans | The one-line version |
|---|---|---|---|
| **1** | [Barnes maze analysis pipeline](tasks/01-barnes-maze.md) | research software | Turn a folder of behavior videos into a spreadsheet a neuroscientist can use in a paper, with no terminal required. |
| **2** | [Animal colony manager](tasks/02-colony-manager.md) | software engineering | Build a phone-friendly system for tracking mice, cages, cleaning, and staff coverage in the vivarium. |
| **3** | [AlphaFold front end](tasks/03-alphafold-frontend.md) | ML infrastructure | Build an approachable interface for a GPU job with a real queue behind it. |

The tasks emphasize different parts of the role and use the same evaluation
criteria. Complete at least one. A strong, deeply developed solution can score
very well on its own. Go beyond the brief when you see a useful opportunity. If
you want to demonstrate versatility, you may complete more than one task. We
will consider the quality and range of everything you submit.

Sample data for Task 1 is in [`data/barnes-maze/`](data/barnes-maze/). Tasks 2
and 3 need no data from us; invent what you need, and make it plausible.

---

## Cross-cutting requirements

These requirements apply to **all three** tasks.

### 1. Usability

This is central to the role. We will evaluate your interface by opening it cold
and trying to complete the task as its intended user.

Design for a scientist who does not want to become a software operator. Assume:

- **They will not open a terminal**, including to start your app.
- **They are not confident with file systems.** "Put the CSV in `./data/raw/`"
  is, for a real fraction of our users, a genuine obstacle.
- **They will not install Python**, or conda, or Docker, or Node.
- **They may use it four times a year** and forget the workflow between uses.
- **They may be using a laptop the lab bought in 2019.** Assume no GPU and no
  admin rights.

A **static, client-side page** is a strong fit for many of these constraints. It
can open in a browser with no installation, server, or account. If the task
requires a backend, prefer a deployed service that the user visits by URL. Keep
the installation and maintenance burden away from the scientist.

### 2. Authentication

**Tasks 2 and 3 need it.** They are shared internal services holding data that
belongs to particular people, so they have to know who you are.

Use **OIDC**, and demonstrate it with **GitHub** as the identity provider.
"Sign in with GitHub" is fine and expected. At Salk this would be Entra ID or
Okta behind the same protocol. We care that you implemented a real OIDC flow and
considered its consequences, not which provider is on the other end.
Authentication must be paired with authorization because different people need
different permissions over the same records. Explain how to obtain the required
credentials in your README, and do not commit secrets.

**Task 1 is exempt.** It is a single-user analysis tool. A static client-side
page needs no account or server, so do not add authentication unless you build a
server-backed version with shared state or stored results.

### 3. It has to run

Your project must run from a cold clone on someone else's machine using only the
instructions in your README.

- Clear, complete, honest setup instructions.
- Pin your dependencies.
- **A live deployment is strongly encouraged.** GitHub Pages, Cloudflare
  Workers/Pages, Fly.io, Vercel, and Modal are all reasonable options. A URL we
  can open proves the project runs and makes it easier to evaluate.
- If some part cannot be deployed publicly, say so and show it working in the
  video below.

**A 2 to 3 minute demo video is required.** Show the intended user completing
the core task from start to finish. Link it from the top of your README. An
unlisted YouTube video, Loom recording, or file in the repo is fine.

The video lets us see the interface in use and provides a fallback if the live
deployment is unavailable. Do not edit out slow or awkward parts of the
workflow.

[Screen Studio](https://screen.studio) is excellent on macOS,
[ScreenToGif](https://www.screentogif.com) on Windows. QuickTime and OBS are
free and completely fine. Polish is not scored.

**Ship it with demo state.** Within about sixty seconds, we should be able to
see the product doing something real without creating an account, entering
data, or hunting for files. Seed it, include fixtures, or add a "load example"
button. An empty app with a working *Add* button does not provide enough to
evaluate.

### 4. Use AI coding agents deliberately

Fluency with agentic coding tools is a stated requirement of this job. Use the
tools you would use in the role. We are evaluating the result and how well you
directed, checked, and extended the agents' work.

The task requirements are a starting point. Strong submissions use the leverage
from these tools to add meaningful depth, polish, or capability.

In your repo, include a short **`AI_NOTES.md`** covering:

- Which tools and models you used, and how you set them up (`CLAUDE.md`,
  subagents, hooks, custom slash commands, MCP servers, or other configuration).
- **Two or three specific moments** where you and the model disagreed, or it
  produced something wrong, or you threw out its approach and did it yourself.
  What was the tell? How did you catch it?
- What you checked before believing it worked.

Keep it under a page. We are interested in your judgment and how you direct the
tools. Session transcripts or `.specstory`-style logs are optional.

**Honesty policy:** generated work is allowed. You must understand and be able
to defend everything you submit. Expect to walk through your code in the
interview and explain your decisions.

### 5. Where the data goes, and what it costs

Include two short paragraphs in your README covering the following topics.

**What leaves the user's machine.** Name anything sent to a third party and
explain the decision. Research data carries real handling constraints — animal
records sit under an IACUC protocol, and plenty of institutional data cannot
leave the building at all — so data handling is part of the design rather than
an afterthought. A hosted vision API may be a reasonable choice if you identify
and justify the tradeoff.

**Keys and cost.** If your submission needs an API key, tell us which one, how
to get it, and roughly what a representative run costs. It must **degrade
gracefully without one** through a demo path, cached results, a mock, or a
similar approach. If the design would cost the Institute money at scale,
estimate that cost.

### 6. Accessibility and devices

Meet these minimum accessibility requirements:

- Keyboard navigable. Nothing essential reachable only by hover or drag.
- Legible contrast. Do not encode meaning in color alone; some users cannot
  distinguish red from green.
- Usable at 200% browser zoom.
- Sensible labels on controls, so a screen reader is not reading `button`.

**Task 2 additionally has to work on a real phone**, in a browser, held in one
hand. Test it on an actual device rather than a resized desktop window. Test
**iOS Safari specifically**, since that is the browser most people in the
vivarium will use.

### 7. Optional agent interface

An **MCP server** or **Claude skill** that lets someone operate your product
through Claude or ChatGPT is one way to stand out. For example: "Pull the
strategy summary for cohort B and put it in a sheet."

---

## Reference

Our [`talmolab/vibes`](https://github.com/talmolab/vibes) repository contains
small, browser-based research tools that may provide useful patterns, especially
for Task 1. Borrow patterns freely, but do not submit a copy of an existing
tool.

---

## What your repo should contain

- **`README.md`:** what it does, who it is for, how to run it, and what you
  chose not to build and why. Put the **demo video link and live URL at the
  top.**
- **A "Known limitations" section**, in the README or its own file. Distinguish
  known defects from deliberately excluded scope. Be specific. For example,
  "hole detection fails when the platform is off-center, see `test51`" is more
  useful than "could be more robust."
- **`AI_NOTES.md`:** as described above.
- **Your `.claude/` directory, `CLAUDE.md`, skills, commands, MCP configs**, if
  you built any. This configuration helps us understand how you used the tools.
  Do not gitignore it.
- **Real commit history.** Do not squash the project into one `initial commit`.
  Preserve the history of how the work developed.
- **The code**, with whatever tests and CI you think the thing warrants.
- **A license.** A permissive license allows us to build on work we find useful.

Do not commit large binaries, secrets, or the sample videos to your own repo.
Link to this repository instead.

---

## How we will evaluate it

We will use the following criteria across every task.

| Dimension | What we are looking for |
|---|---|
| **User alignment and usability** | Can the intended user complete the full workflow without a terminal or your help? Does the product reflect how scientists actually work? |
| **Creativity and ambition** | Did you find useful opportunities beyond the feature list? Do the additions make the product more effective rather than merely larger? |
| **Execution and reliability** | Does it run from a cold clone using the README? Is there a working deployment or a clear demo of the complete workflow? |
| **Engineering quality** | Is the code readable, maintainable, and resilient? Are error handling, tests, git history, and CI appropriate for the project? |
| **AI-assisted development** | Did you use agents effectively and apply sound judgment to their output? Is that leverage visible in the finished product? |
| **Judgment and domain engagement** | Did you understand the scientific or operational problem, make deliberate tradeoffs, and document real limitations? |
| **Motivation and follow-through** | Does the submission show initiative, attention to detail, and a high standard of completion? Depth on one task, meaningful extensions, and strong work across multiple tasks can all demonstrate this. |

An MCP server or agent skill, a live deployment, and other useful work beyond
the brief can strengthen a submission.

A note on what we are *not* scoring: framework choice, test coverage percentage,
line count, commit count, or whether your CSS is fashionable.

---

## Ground rules

- **The work should be yours** in the sense that you directed it, understand it,
  and can defend it. Agents, libraries, Stack Overflow, and your friend who
  knows React are all fine. Handing the brief to another person is not.
- **Do not commit secrets.** If you leak an API key, rotate it and disclose the
  incident in your submission.
- **Accessibility and licensing:** respect the licenses of what you pull in.
- **If a serious issue affects your submission**, such as illness, a family
  emergency, or hardware failure, email us.

## Submitting

Email the repo link to **talmo@salk.edu** by **9:00 AM Pacific on Tuesday,
September 8**. Private repos are fine; add **`talmo`** as a collaborator.

**We will confirm receipt within 24 hours.** If you have not heard back, email
again in case the first message was filtered.

## Questions

Genuine blockers (broken data files, a link that 404s, an accessibility need):
**talmo@salk.edu**. Design questions: make a call and document it.

## Terms

The exercise materials in this repo are provided for the purpose of this hiring
process. You may keep and publish your own submission afterward. See
[`data/barnes-maze/README.md`](data/barnes-maze/README.md) for the origin of the
sample videos.

Good luck. We look forward to reviewing your work.

---

## tasks/01-barnes-maze.md (IN SCOPE)

# Task 1 — Barnes maze analysis pipeline

**Leans:** research software engineering
**Sample data:** [`data/barnes-maze/`](../data/barnes-maze/)

---

## The ask

> *From: a Salk core facility manager*
>
> Hi — we run the Barnes maze for four or five labs here. Every cohort is about
> 60 videos and right now a rotating student watches all of them with a
> stopwatch and a clicker, then types it into Excel. It takes days, two people
> never quite agree, and last year we found out one student had been counting
> nose-pokes differently from everyone else for a whole semester.
>
> Can you build us something that does it automatically? It needs to spit out a
> spreadsheet with latency and errors per animal. And please, it has to be
> something my students can actually use — the last pipeline someone built us
> was a Python notebook and nobody here can run it.

That is the real request, more or less verbatim in spirit. Build the thing.

---

## Background: what a Barnes maze is

A dry-land spatial memory assay, introduced by Carol Barnes in 1979 as a
"circular platform" task and now one of the standard rodent tests of
hippocampus-dependent spatial learning.

A mouse is placed in the center of a brightly lit, open circular platform ringed
with identical holes. Exactly one hole — the **target** — leads down into a dark
escape box; the rest open onto nothing. Mice dislike bright, open, exposed
spaces, so the animal is motivated to find the escape. Over repeated trials
across days, a mouse that is learning normally goes from wandering to heading
more or less straight to the right hole, using distal visual cues around the
room. Compared to the Morris water maze it is much less stressful for the
animal, which is a large part of why people use it.

The measures that go into papers are roughly:

- **Primary latency** — time until the animal first reaches the target hole.
- **Total latency** — time until it actually enters the escape box.
- **Primary / total errors** — investigations of non-target holes before the
  first target visit, and over the whole trial.
- **Path length and speed**, and time spent in the target quadrant.
- **Search strategy** — the qualitative shape of the search, usually binned into
  **spatial** (direct to target), **serial** (working around the ring hole by
  hole, in order), and **random** (crossing the middle, unsystematic). Strategy
  is often the most sensitive readout in the whole assay, and it is also the one
  most often scored by eye, inconsistently, by whoever is free that week.

Deciding what counts as "investigating a hole" is where scoring goes wrong.
Nose within some distance? Nose over the hole? Head dipped in? Two seconds of
sniffing versus a fly-past at speed? There is no single right answer in the
literature, and different labs use different ones — which is exactly why the
answer needs to be **explicit, visible, and adjustable in your tool** instead of
buried in a constant somewhere.

**References** (located via PubMed):

- Barnes CA (1979). Memory deficits associated with senescence: a
  neurophysiological and behavioral study in the rat. *J Comp Physiol Psychol*
  93(1):74–104. [DOI](https://doi.org/10.1037/h0077579) — the original.
- Gawel K, Gibula E, Marszalek-Grabska M, Filarowska J, Kotlinska JH (2019).
  Assessment of spatial learning and memory in the Barnes maze task in
  rodents — methodological consideration. *Naunyn Schmiedebergs Arch Pharmacol*
  392(1):1–18. [DOI](https://doi.org/10.1007/s00210-018-1589-y) —
  open access, and the single best thing to read if you read one. Covers
  protocol variants, the parameters people report, and the confounds.
- Illouz T, Madar R, Okun E (2020). A modified Barnes maze for an accurate
  assessment of spatial learning in mice. *J Neurosci Methods* 334:108579.
  [DOI](https://doi.org/10.1016/j.jneumeth.2020.108579) — good on
  search strategies and why serial search is a nuisance.

You do not need to become a behavioral neuroscientist by Tuesday. Skim enough to
know what the numbers mean, because a tool that computes the right quantity with
the wrong definition is worse than no tool.

---

## What it needs to do

Roughly in the order a user would hit them. All of it should be reachable
without a terminal.

**No authentication required for this task** — unlike the other two. This is a
single-user analysis tool, and a static client-side page with no account and no
server is the ideal shape for it. Do not build a login screen.

### Load videos
Drag and drop, or point at a folder. Multiple videos in a session. Remember
where the user was if they close the tab — losing forty minutes of annotation to
an accidental refresh is the kind of thing that makes people stop using a tool
forever.

### Define ROIs
The user marks the **platform boundary**, the **holes**, and **which hole is the
target**. Twenty holes per video, times sixty videos per cohort, is twelve
hundred of something — so if your answer is twelve hundred clicks, the facility
will go back to the stopwatch. Think hard about this step. It is the first thing
a user touches, it is the most tedious part of the whole job, and how much work
you can take off them here is one of the clearest reads we get on whether you
were designing for them or for yourself.

Real-world coordinates matter too — a platform diameter in centimeters turns
pixels into distances, and path length in pixels is not something anyone can put
in a paper.

### Track the animal
Get the mouse's position over time. This is a computer vision problem and you
have latitude in how you solve it — classical background subtraction, a
segmentation model like SAM, an off-the-shelf pose estimator, something running
in ONNX in the browser, something on a server you deployed. All are legitimate.

What we care about:

- **It works on all three sample videos**, which do not look identical.
- **No GPU is assumed**, and no local install is required of the user.
- **It is honest about uncertainty.** Frames where tracking failed should be
  marked as failed, not silently interpolated into a plausible lie.
- Ideally you distinguish more than a centroid — nose versus body matters when
  the measure is "did it poke its nose in the hole."

Speed matters in the sense that a user will not wait twenty minutes per video
without a progress bar and a reason to trust it.

### Clean up and validate
Gap filling, smoothing, outlier rejection — with the parameters visible and the
effect on the data shown, not applied invisibly. A quality report per video
(what fraction of frames tracked, where the failures cluster) so the user knows
whether to trust the output before they build a figure on it.

### Correct by hand
Non-negotiable. Automated tracking will be wrong somewhere in every cohort, and
a pipeline with no manual override is a pipeline the facility cannot use for
publication. The user needs to scrub to a frame, see the overlay, fix the point
or the event, and have everything downstream update. Frame-accurate seeking is
part of this and is genuinely fiddly in a browser — see the `video-player` vibe.

Corrections must survive a reload, and it should be obvious afterward which
values were automatic and which a human touched.

### Detect events
Hole investigations and escape-box entries, from the trajectory and the ROIs,
with thresholds the user can see and change and immediately see the consequence
of. Investigating a hole and going into it are different events with different
evidence behind them, and how you draw that line is yours to work out and to
defend.

The hard part is not detection, it is that **entering a hole makes the animal
disappear**. Your tracker losing the mouse and the mouse being inside the escape
box look identical to a naive pipeline and mean opposite things.

### Compute the measures
Primary and total latency, primary and total errors, path length, speed, time in
the target quadrant, and a **search strategy classification** per trial with the
reasoning shown. Do not just print a strategy label — show the user why, and let
them override it.

### Visualize, generously
The brief says visualizations galore and means it. Trajectory overlays, path
plots colored by time, occupancy heat maps, a hole-visit raster over the trial,
per-animal learning curves across days, cohort comparisons. This is the part
where a scientist decides whether they trust you, and it is also the part they
will screenshot into a figure — so think about export resolution and about
whether your colors survive being printed in grayscale.

### Export
CSV and XLSX that a person can open in Excel and understand without a legend:
one tidy row per trial for stats, plus the per-event detail. Include the
parameters and tool version used, because in six months someone will ask why two
cohorts disagree and the answer will be a threshold.

Whatever your intermediate representation is, make it a documented, reloadable
file. The facility will want to re-run analysis without re-tracking.

---

## What your demo has to show

Concretely, so there is no ambiguity about the bar:

**All three sample videos, analyzed end to end, in the demo video.** Not one
video and an assurance that the others work. Load them, define the ROIs, track,
correct something by hand, detect the events, and get to numbers — for
`test50`, `test51`, and `test53`.

**A results report and a downloadable CSV, produced live.** By the end of the
recording we want to have watched the spreadsheet come out. Commit the actual
generated outputs for the three clips into your repo as well, so we can read
them without re-running anything: the per-trial summary, the per-event detail,
and whatever report your tool produces.

We are not expecting the numbers to be *right* in any absolute sense — there is
no ground truth in this folder, on purpose, and reasonable pipelines will
disagree. We are looking at whether the whole path holds together on three
videos that were not chosen to be convenient, and whether your tool is honest
about the places it struggled.

---

## What "good" looks like

The bar is not feature count. It is:

- A student who has never seen it can go from a folder of videos to a
  spreadsheet in one sitting, without asking anyone for help.
- The numbers it produces are defensible — the definitions are visible, the
  thresholds adjustable, the failures flagged rather than hidden.
- The second video is faster to process than the first, because the tool learned
  something from the first.
- Someone who disagrees with a result can go find the frame it came from.

Common ways to lose: an impressive model behind an interface only you can
operate; silent interpolation that produces beautiful, wrong trajectories;
hard-coding to `test50.mp4`; and building the analysis but not the correction
step.

## If you have room

Not required, and not worth sacrificing the core for.

- Batch processing across a cohort with a queue and progress.
- Cross-video hole-map reuse and automatic maze registration.
- Inter-rater comparison: two humans score the same video, show the drift.
- Model-assisted labeling — let the user correct a few frames, retrain, improve.
- An MCP server so a scientist can ask Claude for a cohort summary.
- Interop with [SLEAP](https://sleap.ai) `.slp` files, or with DeepLabCut /
  ezTrack / AnyMaze exports, so this drops into existing pipelines.

---

## data/barnes-maze/README.md (sample data notes — read closely, has gotchas)

# Sample data — Barnes maze

Three recordings of mice running a Barnes maze, for use in
[Task 1](../../tasks/01-barnes-maze.md).

![A frame from test53.mp4](frames/test53.jpg)

## Files

| File | Frames | Frame rate | Duration | Size |
|---|---|---|---|---|
| `test50.mp4` | 5,539 | 30 fps | 3:05 | 3.0 MB |
| `test51.mp4` | 741 | **14.985 fps** (`15000/1001`) | 0:49 | 448 KB |
| `test53.mp4` | 905 | 30 fps | 0:30 | 540 KB |

All three are 640×480, H.264, `yuv420p`, no audio. The source is a grayscale
overhead camera, so the color channels carry no information.

**Note the frame rates.** `test51.mp4` is not 15 fps, it is 15000/1001 ≈ 14.985
fps, which is the sort of thing that quietly turns a latency of 30.0 s into
30.06 s. Anything you report in seconds has to come from the file's own
timebase, not from an assumption.

We re-encoded these from the originals to keep the repo small (70 MB → 4 MB) and
to put a keyframe every 15 frames, which makes frame-accurate seeking in a
browser far less painful. Frame counts are preserved exactly. Visual quality is
lower than the originals; if that turns out to matter for your approach, say so
in your README — that is a legitimate finding, not a complaint.

## What you are looking at

A standard 20-hole mouse Barnes maze, filmed from above:

- A circular white platform with **20 evenly spaced holes** around the rim.
- One hole is the **target**, leading to a dark escape box under the platform.
  The other 19 are false and open onto nothing.
- A **dark mouse** on a white surface — high contrast, which makes this an
  unusually friendly tracking problem.
- The platform does not fill the frame, and the rig around it is visible.

## Things that will bite you

Found by hand; not exhaustive, and finding the rest is part of the exercise.

- **The mouse goes into holes.** It disappears entirely for stretches, then
  reappears. That is not a tracking failure — it is the single most important
  event in the whole assay, and your pipeline has to be able to tell the
  difference between the two.
- **Occlusion at the rim.** Near the platform edge the mouse is partly cut off
  by the hole it is investigating.
- **The tail.** Long, thin, high-contrast, and it will wreck a naive
  centroid-of-dark-pixels approach. A body centroid and a nose are different
  points and the assay cares about the difference.
- **Lighting is uneven** across the platform, and there are specular highlights.
- **A cable and hardware are visible** at the edge of frame in some clips.
- **The three clips are not interchangeable.** Look at all three before you
  commit to an approach. Anything you tune against one video needs to survive
  the other two, and that generalizes well past this folder: the facility has
  hundreds of these recordings and no two sessions are set up identically.
- **No ground truth is included.** Deliberately. Part of the task is letting a
  human decide whether the output is trustworthy.

## Provenance

Recorded at the Salk Institute in 2024 as pilot data for a Barnes maze pipeline.
Use them freely for this exercise.

Please link back to this repository rather than committing copies into your own
— that keeps your submission small, and means you are always pointing at the
same files we are looking at.

If your submission needs to show output, showing it on these clips is exactly
what we want to see.

---

## tasks/02-colony-manager.md (NOT in scope — archived for completeness / in case of pivot)

# Task 2 — Animal colony manager

**Leans:** software engineering (full stack, mobile, auth)
**Sample data:** none provided — invent it, and make it plausible.

---

## The ask

> *From: a fifth-year graduate student, over coffee*
>
> Our colony is about 400 mice across six racks. We track it in a Google Sheet
> that four people edit and everyone is scared of. Cage cards are paper, they
> get wet, and the handwriting is a disaster.
>
> The real problem is that I'm in the vivarium in scrubs with my hands full and
> the sheet is on my laptop in the office. So I write things on my glove and
> type them in later, or I don't. Last month we lost a whole timed pregnancy
> because the person covering for me while I was at a conference didn't know
> which cages were mine.
>
> The commercial systems are twenty grand a year and somehow still can't do a
> breeding plan.

This one keeps coming back. Several grad students here have built a version of
it for their own lab; every one of those is now unmaintained and specific to
one lab's habits. AIRC exists partly so that this stops happening.

---

## Background: how a mouse colony actually works

Enough to design against. Do not take any of it as a spec to implement
literally — read it for the shape of the problem.

**The physical layout.** Mice live in ventilated cages on racks; the standard
here is Allentown, and a rack holds on the order of 70–140 cages in a grid. A
cage has a fixed address — rack, side, row, column — and cages get moved, so the
address is a property of the location, not of the cage. A cage holds up to five
adult mice of the same sex, or a breeding pair, or a dam with a litter.

**Cage cards.** Every cage has a card on the front: PI name, IACUC protocol
number, strain, sex, date of birth, animal IDs, and usually some scrawl about
genotype or an experiment. It is the primary interface for a person standing in
the room, it is paper, and it is the thing that is always out of date. Making it
digital, and making the digital version *the* source of truth rather than a copy
of the paper one, is most of the value here.

**Animals.** Identified by ear tag, ear punch, or toe number — schemes vary by
lab and none of them are globally unique, which is its own headache. An animal
has a sex, a date of birth, a strain background, a genotype (often unknown until
a tail sample comes back from the genotyping service weeks later), and a
provenance: born here to a specific pair, or ordered from Jackson.

**Husbandry events.** Cage changes on a schedule, health checks, weaning at
about 21 days, tail snips, weights, treatments, deaths, transfers between cages
and rooms. Regulators care that this is recorded. So does the person who has to
prove it.

**Breeding.** Pairs get set up, plugs observed, litters born, pups weaned and
separated by sex. Getting an experimental cohort of the right genotype, sex, and
age at the same time is a real planning problem that people currently do on
paper and get wrong. Mice take about three weeks to gestate and are usable for
many experiments at 8–12 weeks, so a mistake costs a month or two.

**Coverage.** People go to conferences, get sick, graduate. Somebody has to know
whose animals are whose and who is responsible this week. The failure mode is
not abstract — animals die.

**Census.** Per-diem billing is per cage per day, so the facility wants counts,
and the PI wants to know why the bill went up.

---

## What it needs to do

### Core

- **Know where every animal is.** Animals in cages, cages at rack positions,
  racks in rooms. Moving an animal or a cage is a first-class, logged action.
- **Digital cage cards.** A cage's card should be viewable and printable on the
  label stock a vivarium actually has, and a person standing at the rack should
  be able to get from the physical cage to its record in about a second.
- **Record husbandry events** against a cage or an animal, with who and when,
  and make yesterday's events easy to find and correct.
- **Coverage and on-call.** Who owns this cage, who is covering them right now,
  and how does someone going on vacation hand off without a group email.
- **Auth.** OIDC, demonstrated with GitHub — see the cross-cutting requirements
  in the [main README](../README.md). Then think about what comes after
  authentication: a lab manager, a PI, a rotating undergrad, and the facility
  vet do not need the same powers, and a shared login is how the Google Sheet
  got scary in the first place.

### The data model is the assignment

More than anything else in this task, we want to see that you can design a
schema. A colony manager is not a hard *application*; it is a genuinely hard
*data modeling* problem, and every homegrown version of this that we have seen
fail, failed here rather than in the UI.

Things the model has to survive:

- **Cages hold several animals, and their composition changes.** "Which mice
  were in cage B-04-12 on June 3rd" is a question people really ask, months
  later, usually because something went wrong.
- **Location is not identity.** Cages move between rack positions; animals move
  between cages; racks move between rooms. A design that stores a rack position
  as a column on the animal will hurt within a week.
- **Time is a first-class dimension.** This is closer to an event log with
  derived current state than to a spreadsheet of current state. Weaning splits
  one cage into several; a litter of unidentified pups becomes eight tagged
  animals; a cage is retired and its address reused.
- **Identifiers are messy.** Ear tags, ear punches, and toe numbers are not
  globally unique, are reused across labs, and are sometimes wrong. Do not let
  a lab's local ID scheme become your primary key.
- **Facts arrive late and out of order.** A genotype comes back three weeks
  after the tail snip. Someone logs Monday's cage change on Thursday. The event
  date and the record date are different things and you will need both.

We will read your schema. Show your work: a migration history, constraints and
foreign keys that actually enforce the invariants you claim, indices where the
queries need them, and a short note in your README on what you chose and what
you deliberately did not normalize. SQLite is a completely respectable answer.

### Versioning, undo, and backups

The Google Sheet this replaces has one killer feature — **version history** —
and if you take that away, nobody will trust your app with the colony.

- **Every change is attributable and reversible.** Who changed what, when, from
  what to what. An audit trail that a facility manager can read, not just a log
  file.
- **Undo that a scared user can find.** The realistic failure is a tired grad
  student at 11pm doing a bulk operation on the wrong rack. They need to be able
  to put it back without emailing you.
- **Soft deletes.** An animal that died and an animal recorded by mistake are
  different things, and neither should vanish from history.
- **Backups you can actually restore from**, with the restore path documented
  and, ideally, demonstrated. A backup nobody has ever restored is a rumor.
- Point-in-time reconstruction is the ambitious version of all of the above, and
  it falls out almost free if you got the temporal model right.

### Getting a real lab's spreadsheet in

Every lab you would onboard already has data, and it is in a spreadsheet, and
that spreadsheet is a mess. **Ingestion is a core requirement, not an
afterthought** — it is the entire difference between a tool that gets adopted
and one that gets admired and then abandoned.

Assume the worst, because the worst is what is out there: columns that mean
different things in different rows, dates in four formats, merged header cells,
a `Notes` column carrying the actual genotype, sexes written as `M`/`male`/`♂`,
IDs with stray whitespace, two sheets that disagree, a `DOB` that is sometimes a
date and sometimes an age in weeks, and blank rows used as visual separators.

What we want to see:

- An **import flow with a preview**: map their columns to your fields, show what
  will be created and what will be skipped, and let them fix it before anything
  is written.
- **Validate loudly, fail partially.** Import the 380 good rows, report the 20
  bad ones with the row number and what was wrong, and let the user correct and
  re-run without creating duplicates.
- **Idempotency.** Someone will upload the same file twice.
- **Dry run first, always,** and an undo for the import as a whole — which you
  get free if the previous section went well.
- Round-trip: CSV/XLSX export that matches what the facility already wants for
  census and per-diem billing.

Include a couple of deliberately ugly example spreadsheets in your repo and show
your importer eating them. Constructing a realistic mess is itself a sign you
understand the problem.

### Mobile is the requirement, not a bonus

This gets used standing in a vivarium, in gloves and a gown, holding a cage,
possibly with a phone in a plastic bag. Not at a desk. Design for that first and
let the desktop view follow.

Concretely, that means: it works one-handed; tap targets are large; the common
action is one or two taps from launch; scanning a cage's QR code brings it up
instantly; it does not fall over when the WiFi drops behind a rack of ventilated
cages; and it does not log you out every time the screen sleeps.

Offline behavior deserves a real decision rather than a default. Four people,
patchy WiFi, one cage — what happens, and can you defend it?

## If you have room

Not required. The data layer above matters more than any of these.

- **OCR the paper cage cards.** Point a phone camera at an existing handwritten
  card and get a populated draft record. This is the feature that could get a
  lab with 400 mice on paper to migrate at all, and vision models are good at it
  now. If you do it: show the user what you read, make them confirm it, and
  never silently write a guess into the record.
- **Genotype tracking** — expected versus confirmed, results arriving weeks
  later, and cages where genotype is still pending.
- **A cross planner** — given a target genotype, sex, and age window, what pairs
  should be set up and when, and what is the expected yield. This is the feature
  the expensive commercial suites are worst at and the one that would make a
  grad student cry with relief.
- Pedigree view, litter tracking, weaning reminders.
- Protocol-limit tracking — IACUC approvals cap animal numbers, and going over
  is a serious problem.
- Alerts: cage overdue for a change, litter due for weaning, a cage whose owner
  is away this week.
- An MCP server, so someone can ask Claude "which cages need changing today, and
  who's covering B rack?"

---

## What "good" looks like

- The five-second test: can someone standing at a rack, one-handed, log a cage
  change without thinking about it?
- The schema survives contact with reality — animals moving, cages splitting at
  weaning, an animal that dies, a record entered wrong three weeks ago and
  noticed today.
- A new lab could be onboarded onto it, from their own spreadsheet, without you
  present.
- Someone who breaks something can put it back themselves.
- The permission model is coherent when you push on it.

Common ways to lose: a beautiful desktop CRUD app that is unusable on a phone; a
data model with no concept of time, so history is unanswerable; an importer that
only accepts a file you generated yourself; destructive edits with no trail; auth
as a login page with no authorization behind it; and a demo that only works with
the three records you seeded.

Seed it with enough realistic fake data that we can actually use it — a few
hundred animals across a couple of racks, with breeding pairs and litters in
flight. An empty app with a working "add" button is very hard to evaluate.

---

## tasks/03-alphafold-frontend.md (NOT in scope — archived for completeness / in case of pivot)

# Task 3 — AlphaFold front end

**Leans:** ML infrastructure and platform engineering
**Sample data:** none provided — FASTA sequences are easy to come by.

---

## The ask

> *From: a structural biology postdoc*
>
> I have about 200 protein sequences I need folded, and some of them are
> complexes. I know AlphaFold exists and is free and I still can't use it.
> ColabFold times out on anything big, the cluster wants me to write a SLURM
> script, and the last time I got a job to run it wrote a folder of files
> somewhere and I couldn't tell which output went with which sequence.
>
> I don't want to learn Slurm. I want to paste in some sequences, come back
> tomorrow, and get structures I can look at, with some indication of which ones
> I should believe.

The problem is not the model. The model is solved and open. The problem is that
running it is an infrastructure task, and infrastructure is exactly what stands
between most biologists and the methods they should be using. AIRC's job is to
delete that gap.

---

## Background

**AlphaFold** predicts a protein's 3D structure from its amino acid sequence.
AlphaFold 2 was the step change — Jumper J et al. (2021), Highly accurate
protein structure prediction with AlphaFold, *Nature* 596(7873):583–589,
[DOI](https://doi.org/10.1038/s41586-021-03819-2) (located via PubMed) — and
AlphaFold 3 plus open reimplementations like Boltz, Chai, and OpenFold extend it
to complexes, ligands, and nucleic acids. Practically, you need to know:

- **Input** is one or more sequences in FASTA. A *monomer* job is one chain; a
  *multimer* job is several chains folded together, which is what people
  actually want when they are studying an interaction.
- **The MSA step** — searching big sequence databases to build a multiple
  sequence alignment — is often the slow, CPU-and-disk-heavy part, separate from
  the GPU inference. This matters for scheduling: they want different machines.
- **Output** is structures in PDB or mmCIF, usually five ranked models per job,
  plus confidence metrics.
- **The confidence metrics are the point.** **pLDDT** is per-residue confidence,
  0–100, conventionally colored blue-to-orange on the structure; low-pLDDT
  regions are often genuinely disordered rather than wrong. **PAE** — predicted
  aligned error — is a 2D matrix that tells you whether two domains are
  confidently placed *relative to each other*, and it is what you actually read
  to judge a multimer. A beautiful structure with a bad PAE map is a beautiful
  guess. If a user of your tool cannot tell those apart, you have not helped
  them.
- **Runs take** minutes to many hours depending on sequence length and hardware,
  and they fail: out of memory on long sequences, missing databases, preempted
  spot instances, and jobs that quietly produce nothing.

## It has to actually fold something

**No mocking the science.** By the end of your demo we want to have watched a
real sequence go in and a real predicted structure come out. Not a sleep timer
and a canned PDB.

That sounds expensive and it is not, because you do not need your own GPU and
neither do we:

- **[Google Colab](https://colab.research.google.com)** gives you a free GPU
  session. **[ColabFold](https://github.com/sokrypton/ColabFold)** (Mirdita et
  al.) is the standard way people actually run AlphaFold2 in practice — it swaps
  the slow database search for the MMseqs2 MSA server and folds a small protein
  on a free T4 in minutes.
- **[molab](https://molab.marimo.io)**, marimo's hosted notebooks, likewise
  offers free GPU sessions and is a nicer substrate if you want the compute side
  to be a real interactive artifact rather than a notebook nobody reads.
- **ESMFold** is single-sequence, needs no MSA at all, and is the fastest route
  to something folding end to end if you are short on time.
- Small proteins. A 100-residue monomer is a completely legitimate demo; nobody
  is asking you to fold a ribosome by Tuesday.

### The handoff is the actual engineering problem

Here is the interesting part, and we are deliberately not telling you how to
solve it. Your front end is a web application. The GPU is in an ephemeral,
free-tier notebook session somewhere else, which may not exist yet when the job
is submitted, cannot be reached from the outside, and will be torn down without
warning in a few hours.

So: how does a job get from your queue onto that GPU, and how do the results and
the logs get back?

**Be creative.** There is more than one good answer here and they trade off
against each other in ways that depend on choices you have already made
elsewhere in your design. Work out the options, pick one, make it work, and
write a paragraph on why it beat the ones you rejected. **This is the part of
the task we will read most closely**, because it is a small version of exactly
what this job is: the compute lives somewhere awkward and your users must never
have to know that.

Whatever you choose has to survive the session dying mid-job. That is not an
edge case here, it is Tuesday.

### The other backends may be designs

You still need the abstraction. **At least one backend must really execute** —
the free-GPU one. The others (on-prem SLURM, EC2, Modal, local) can be stubs,
partial implementations, or a written design, as long as the seam is real and
we can see that swapping one in is a small, obvious change.

We are most interested in your reasoning about **SLURM**, because that is what
Salk actually has: how does a web app talk to a scheduler, how does a job get
authenticated as a real user, what happens to a running job when the web app
restarts, and how do files move. You do not need a cluster to think that
through, and a clear design note scores well.

### What still has to be fully real

Everything that is not the model itself:

- The queue and its state machine, including retries and cancellation.
- Provenance and lineage — which inputs, which parameters, which code version,
  which backend produced which output.
- File handling, storage, and download.
- The interface, the visualization, and the analysis.
- Auth.
- Demo state: a set of already-completed jobs, seeded, so that a reviewer
  arriving cold sees a populated queue and a batch worth looking at rather than
  an empty table. Fold a handful of real sequences ahead of time and commit the
  results.

---

## What it needs to do

### Submit work without knowing anything

Paste sequences, upload a FASTA, or upload a hundred of them. Validate the input
before it costs anyone a GPU-hour: are these valid residues, is anything absurdly
long, are there duplicates already folded last week. Tell the user roughly how
long it will take and what it will cost, in dollars if you can, before they
commit.

Give the user a small number of comprehensible choices — monomer or complex,
fast or thorough — rather than exposing the model's actual parameter surface.

### Queue and execute

A real job queue with a real state machine: queued, running, succeeded, failed,
cancelled, and whatever else you need. Priorities, retries with backoff,
cancellation that actually stops work, per-user concurrency limits so one person
with 200 sequences does not starve everyone else. Logs the user can see, and
errors phrased for a biologist rather than a stack trace.

### Pluggable compute backends

The point of the exercise, and covered in detail above: one backend that really
runs on a free GPU session, plus a real abstraction with at least one other
backend behind it — SLURM, EC2, Modal, or local — as a stub or a design.

What we want to see is the seam: what is genuinely common across backends, what
leaks through, and how you keep the leak from reaching the user. Two done
thoughtfully beats four done shallowly.

### Handle the data

Structured, per-job storage with a scheme that makes sense in six months. Batch
upload in, batch download out — a hundred results should be one zip, not a
hundred clicks. Retention and cleanup, because structure prediction output gets
large. Enough provenance that the postdoc can reconstruct, a year later, exactly
what produced figure 3.

### Visualize and analyze

3D structure viewing in the browser — Mol\*, NGL, and 3Dmol.js all exist and are
good; use one rather than writing your own. Color by pLDDT. Show the PAE matrix.
Let people compare the ranked models, compare across jobs, and sort a batch of
200 by confidence so they know which ten to look at first. Export publication-
quality images and the underlying numbers.

For a batch, the most valuable screen in the whole application is the one that
says *these are the good ones*.

### Auth and multi-tenancy

OIDC, demonstrated with GitHub — see the [main README](../README.md). Then think
about the rest: users see their own jobs, share with a lab, and a shared cluster
means shared quotas. If jobs run on a real HPC system as a real user, say
something about how you would handle that identity mapping — you do not have to
implement it, but we would like to know you have thought about it.

## If you have room

- Cost estimation and a running budget per user or lab.
- Comparison against existing experimental structures — a PDB lookup, an RMSD.
- An MCP server: "Claude, fold these sequences and tell me which ones look
  like they dimerize."
- Webhook or email on completion, so nobody sits refreshing.
- More than one model behind the same interface — if you fold with ESMFold to
  get running quickly, adding ColabFold or Boltz alongside it proves the
  abstraction is real, since the whole point is that the model is replaceable.
- Surviving a session eviction gracefully enough that the user never notices:
  requeue, resume, and pick up on a fresh GPU session.

---

## What "good" looks like

- A biologist gets from a FASTA file to a ranked, interpretable set of real
  structures without ever learning what a scheduler, a notebook, or a GPU is.
- The awkwardness of borrowed, ephemeral compute is entirely absorbed by your
  system rather than passed along to the user.
- The queue survives a restart, a backend outage, and a user who cancels
  everything at once.
- The backend abstraction is clean enough that we believe adding a fifth one
  would be an afternoon.
- Nothing is lost or orphaned. Every output traces back to its input.

Common ways to lose: a beautiful submission form with `setTimeout` behind it
instead of a queue; a handoff that works exactly once, on your laptop, while the
notebook tab is open; a "SLURM backend" that shells out to `sbatch` with no
thought about failure, restart, or file transfer; and a viewer that renders a
structure but never shows confidence, which quietly teaches the user to trust
everything equally.
