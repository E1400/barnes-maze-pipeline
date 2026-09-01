# Timebase findings — measured from the actual sample files

Measured 2026-09-01 by parsing the MP4 `moov` atoms of the three sample clips
directly (Python, no dependencies). These are **ground truth for the timebase
unit tests**, not estimates. Reproduce with the script at the bottom.

## The headline: all three clips have variable frame timing

Every clip's `stts` (time-to-sample) table has many entries, not one. Roughly
9–11% of frames in each file sit at a delta other than the modal one — an
artifact of the upstream re-encode, which preserved total duration and frame
count exactly while jittering individual frame deltas.

| File | Timescale | Frames | Modal delta | Off-modal | `stts` duration |
|---|---|---|---|---|---|
| `test50.mp4` | 15360 | 5539 | 512 | 10.8% | 185.066667 s |
| `test51.mp4` | 15000 | 741 | 1001 | 8.6% | 49.382667 s |
| `test53.mp4` | 15360 | 905 | 512 | 10.4% | 30.233333 s |

The jitter is structured, not random — e.g. `test50` has 201 frames at delta
`1` and 195 at delta `1024`, which pair up to the same `512 + 512` the modal
frames use. Total duration is preserved; per-frame times wobble.

## The trap: `frameCount / duration` gives a plausible wrong answer

| File | Nominal (timescale / modal delta) | Naive `frames / duration` |
|---|---|---|
| `test50.mp4` | **30/1** = 30.000000 | 29.929755 |
| `test51.mp4` | **15000/1001** = 14.985015 | 15.005265 |
| `test53.mp4` | **30/1** = 30.000000 | 29.933848 |

Look at `test51`. The naive average is **15.005**, which any reasonable person
rounds to "15 fps" — landing on exactly the wrong answer the brief warns
about, but arriving there by a route that looks like measurement rather than
assumption. It would survive code review. It would not survive a reviewer who
knows the file.

**So: never derive fps by dividing frame count by duration.**

## What to implement instead

1. **Parse the `stts` table** and build exact per-frame presentation times by
   cumulative sum: `time(i) = (Σ deltas before i) / timescale`. This is the
   authoritative frame→time mapping and stays correct despite the jitter.
   Every latency number should come from this, not from `i / fps`.
2. **Report nominal fps as `timescale / modalDelta`, as an exact rational**
   (numerator + denominator, never a float). That recovers 15000/1001 and 30/1
   exactly, matching the upstream README.
3. **Surface the jitter** rather than hiding it. This project's whole premise
   is that silent approximation is the failure mode; a file whose frames are
   not evenly spaced is worth a line in the quality report.
4. `HTMLVideoElement` exposes none of this — it gives `duration` and nothing
   else. The container must be parsed. `mp4box.js` reads `stts`, `mdhd`
   timescale, and sample counts, and is the recommended route.

## Test values to assert

```
test50.mp4  timescale 15360  frames 5539  nominal 30/1        duration 185.066667s
test51.mp4  timescale 15000  frames  741  nominal 15000/1001  duration  49.382667s
test53.mp4  timescale 15360  frames  905  nominal 30/1        duration  30.233333s
```

Assert the rational as a pair. A test asserting `≈ 14.985` passes for a float
that is merely close; the point is exactness.

## Other notes from the same pass

- All three are 640×480, H.264, yuv420p, no audio, grayscale source (per the
  upstream README) — the color channels carry no information, so convert to
  single-channel early.
- **The holes are dark, and so is the mouse.** A naive dark-pixel blob
  detector finds 21 blobs, not 1. The median-of-frames background model is
  what disambiguates them (holes are static, the mouse is not) — that is the
  load-bearing reason for the background-subtraction approach, worth stating
  in the README.
- Keyframe every 15 frames (upstream re-encode choice), which is what makes
  frame-accurate seeking tractable in a browser.

## Reproducing

The clips are not committed (see `.gitignore`). Fetch them, then re-run the
parse:

```bash
git clone --depth 1 https://github.com/salk-airc/rse-takehome-2026 /tmp/th
mkdir -p data/barnes-maze && cp /tmp/th/data/barnes-maze/*.mp4 data/barnes-maze/
```
