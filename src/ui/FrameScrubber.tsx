/**
 * Frame scrubber.
 *
 * Built around a real <input type="range">, so arrow keys, Home/End and Page
 * Up/Down all work for free and screen readers announce the frame number. The
 * styling is a thin vertical bar rather than a round knob, because a knob
 * covers the tick it is pointing at and this control needs to be read
 * precisely.
 *
 * Alongside it: exact frame entry, because scrubbing to frame 4,317 of 5,539
 * by dragging is hopeless, and pins, because reviewing a trial means returning
 * to the same handful of moments repeatedly.
 */

import { useState } from 'react'
import { frameTimeSeconds, type Timebase } from '../core/timebase.ts'

interface Props {
  readonly timebase: Timebase
  readonly frameIndex: number
  readonly onFrameChange: (index: number) => void
  readonly pins: readonly number[]
  readonly onTogglePin: (index: number) => void
}

/** Roughly how many ticks to draw, adjusted to a round frame interval. */
function tickInterval(frameCount: number): number {
  const target = frameCount / 40
  const steps = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500]
  return steps.find((step) => step >= target) ?? 5000
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds - minutes * 60
  return `${minutes}:${rest.toFixed(2).padStart(5, '0')}`
}

export default function FrameScrubber({
  timebase,
  frameIndex,
  onFrameChange,
  pins,
  onTogglePin,
}: Props) {
  const lastFrame = timebase.frameCount - 1

  // The box holds a draft only while the user is typing in it; the rest of the
  // time it simply shows the current frame. Adjusting during render (rather
  // than in an effect) avoids a second render pass on every scrub.
  const [draft, setDraft] = useState<string | null>(null)
  const [shownFrame, setShownFrame] = useState(frameIndex)
  if (shownFrame !== frameIndex) {
    setShownFrame(frameIndex)
    setDraft(null)
  }
  const entry = draft ?? String(frameIndex + 1)
  const setEntry = setDraft

  const clamp = (index: number) => Math.max(0, Math.min(lastFrame, index))
  const sortedPins = [...pins].sort((a, b) => a - b)
  const previousPin = [...sortedPins].reverse().find((p) => p < frameIndex)
  const nextPin = sortedPins.find((p) => p > frameIndex)
  const isPinned = pins.includes(frameIndex)

  const step = tickInterval(timebase.frameCount)
  const ticks: number[] = []
  for (let f = 0; f <= lastFrame; f += step) ticks.push(f)

  const percent = (index: number) => (lastFrame === 0 ? 0 : (index / lastFrame) * 100)

  return (
    <div className="scrubber">
      <div className="scrubber-track">
        {/* Ticks and pins sit behind the input; the input itself stays the
            accessible, keyboard-operable control. */}
        <div className="scrubber-ticks" aria-hidden="true">
          {ticks.map((f) => (
            <span key={f} className="scrubber-tick" style={{ left: `${percent(f)}%` }} />
          ))}
        </div>
        <div className="scrubber-pins" aria-hidden="true">
          {sortedPins.map((f) => (
            <span key={f} className="scrubber-pin" style={{ left: `${percent(f)}%` }} />
          ))}
        </div>
        <input
          className="scrubber-range"
          type="range"
          min={0}
          max={lastFrame}
          step={1}
          value={frameIndex}
          aria-label={`Frame, 1 to ${timebase.frameCount}`}
          aria-valuetext={`Frame ${frameIndex + 1} of ${timebase.frameCount}, ${formatTime(frameTimeSeconds(timebase, frameIndex))}`}
          onChange={(event) => onFrameChange(Number(event.target.value))}
        />
      </div>

      <div className="scrubber-labels" aria-hidden="true">
        <span>1</span>
        <span>{timebase.frameCount}</span>
      </div>

      <div className="scrubber-controls">
        <button type="button" onClick={() => onFrameChange(clamp(frameIndex - 1))}>
          ◀ Frame
        </button>
        <button type="button" onClick={() => onFrameChange(clamp(frameIndex + 1))}>
          Frame ▶
        </button>

        <label className="scrubber-entry">
          Go to frame
          <input
            type="number"
            min={1}
            max={timebase.frameCount}
            value={entry}
            onChange={(event) => setEntry(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              const requested = Number(entry)
              if (Number.isFinite(requested)) onFrameChange(clamp(Math.round(requested) - 1))
            }}
            onBlur={() => {
              const requested = Number(entry)
              if (Number.isFinite(requested) && entry !== '') {
                onFrameChange(clamp(Math.round(requested) - 1))
              } else {
                setEntry(String(frameIndex + 1))
              }
            }}
          />
        </label>

        <span className="scrubber-time">
          {formatTime(frameTimeSeconds(timebase, frameIndex))}
        </span>
      </div>

      <div className="scrubber-controls">
        <button type="button" onClick={() => onTogglePin(frameIndex)}>
          {isPinned ? 'Remove pin' : 'Pin this frame'}
        </button>
        <button
          type="button"
          disabled={previousPin === undefined}
          onClick={() => previousPin !== undefined && onFrameChange(previousPin)}
        >
          ◀ Pin
        </button>
        <button
          type="button"
          disabled={nextPin === undefined}
          onClick={() => nextPin !== undefined && onFrameChange(nextPin)}
        >
          Pin ▶
        </button>
        {sortedPins.length > 0 && (
          <span className="scrubber-pin-list">
            Pinned:{' '}
            {sortedPins.map((f, i) => (
              <span key={f}>
                {i > 0 && ', '}
                <button type="button" className="linkish" onClick={() => onFrameChange(f)}>
                  {f + 1}
                </button>
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  )
}
