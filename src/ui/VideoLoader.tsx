/**
 * Step 1 of the workflow: load a folder's worth of videos.
 *
 * Two deliberate choices here. First, the timebase read from each container is
 * shown on screen -- frame rate, frame count, and whether the file has
 * variable frame timing -- so the user can see it was read from the file
 * rather than assumed. Second, everything persists to IndexedDB as it happens;
 * there is no save step, and a reload brings the list back.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { formatFps, readTimebase } from '../core/timebase.ts'
import { deleteVideo, listVideos, putVideo, swapVideoOrder } from '../state/videoStore.ts'
import { deleteRoi, listDefinedVideoIds } from '../state/roiStore.ts'
import { deleteTracks, listTrackedVideoIds } from '../state/trackStore.ts'
import { deleteCorrections } from '../state/correctionStore.ts'
import { deleteInvestigationEdits } from '../state/investigationEditsStore.ts'
import { deleteMeasureOverrides } from '../state/measureOverridesStore.ts'
import { loadDefaultPlatformDiameterCm, saveDefaultPlatformDiameterCm } from '../state/roiStore.ts'
import { loadInvestigationParams } from '../state/investigationParamsStore.ts'
import { DB_VERSION, videoId } from '../state/schema.ts'
import type { StoredVideoSummary } from '../state/schema.ts'
import type { PipelineProgress } from '../core/cv/pipeline.ts'
import { DEFAULT_INVESTIGATION_PARAMS, type InvestigationParams } from '../core/events.ts'

function isVideoFile(file: File): boolean {
  // Browsers occasionally report an empty type for a known extension, so fall
  // back to the extension rather than rejecting a file the user can see is a video.
  return file.type.startsWith('video/') || /\.(mp4|m4v|mov|avi|webm|mkv)$/i.test(file.name)
}

// The three take-home sample clips, fetched client-side straight from the
// public repo they live in -- so a cold-open reviewer sees the tool doing
// something real within the brief's own 60-second bar, without needing to
// separately download and drag in three files first. Not committed to this
// repo (the brief asks submissions to link to the source rather than copy
// the clips in); this fetches the same bytes `scripts/fetch-sample-videos.sh`
// does, at demo time, from the browser rather than a build step. Confirmed
// raw.githubusercontent.com sends `Access-Control-Allow-Origin: *` on these
// files, so a plain client-side `fetch` works from any origin.
const SAMPLE_BASE_URL = 'https://raw.githubusercontent.com/salk-airc/rse-takehome-2026/main/data/barnes-maze'
const SAMPLE_NAMES = ['test50.mp4', 'test51.mp4', 'test53.mp4'] as const

async function fetchSampleFile(name: string): Promise<File> {
  const response = await fetch(`${SAMPLE_BASE_URL}/${name}`)
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`)
  const blob = await response.blob()
  // videoId() keys on name + size + lastModified, so a File with no explicit
  // lastModified (defaulting to "now", per the File constructor) gets a
  // different id every time this fetch runs -- clicking the button twice
  // duplicated all three videos instead of the second click being a no-op.
  // A fixed timestamp makes every fetch of the same clip produce the same
  // id, so putVideo's own keyed put() replaces the existing row instead.
  return new File([blob], name, { type: 'video/mp4', lastModified: 0 })
}

function formatDuration(seconds: number): string {
  const whole = Math.floor(seconds)
  const minutes = Math.floor(whole / 60)
  const remainder = whole % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`
}

interface Props {
  readonly selectedVideoId: string | null
  readonly onSelectVideo: (video: StoredVideoSummary) => void
  /** The video currently being tracked in the background, if any. */
  readonly activeVideoId: string | null
  readonly activeProgress: PipelineProgress | null
  /** Changes each time a tracking run finishes, prompting a status refresh. */
  readonly trackingRefreshToken: number
}

export default function VideoLoader({
  selectedVideoId,
  onSelectVideo,
  activeVideoId,
  activeProgress,
  trackingRefreshToken,
}: Props) {
  const [videos, setVideos] = useState<StoredVideoSummary[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [definedVideoIds, setDefinedVideoIds] = useState<Set<string>>(new Set())
  const [trackedVideoIds, setTrackedVideoIds] = useState<Set<string>>(new Set())
  const [defaultDiameterCm, setDefaultDiameterCm] = useState<number | null>(null)
  const [investigationParams, setInvestigationParams] = useState<InvestigationParams | null>(null)
  const [loadingSamples, setLoadingSamples] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void loadInvestigationParams().then(setInvestigationParams)
  }, [trackingRefreshToken])

  useEffect(() => {
    void loadDefaultPlatformDiameterCm().then(setDefaultDiameterCm)
  }, [])

  useEffect(() => {
    let cancelled = false
    listVideos()
      .then((stored) => {
        if (!cancelled) setVideos(stored)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setErrors([
            `Could not read previously loaded videos: ${(error as Error).message}`,
          ])
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Per-video status for the table. Refetched whenever the video list changes
  // or a tracking run completes, so "Tracked" appears without a page reload.
  useEffect(() => {
    let cancelled = false
    void Promise.all([listDefinedVideoIds(), listTrackedVideoIds()]).then(
      ([defined, tracked]) => {
        if (!cancelled) {
          setDefinedVideoIds(defined)
          setTrackedVideoIds(tracked)
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [videos, trackingRefreshToken])

  const addFiles = useCallback(async (fileList: FileList | readonly File[] | null) => {
    if (!fileList || fileList.length === 0) return
    const files = Array.from(fileList)
    const rejected: string[] = []
    const accepted: File[] = []
    for (const file of files) {
      if (isVideoFile(file)) accepted.push(file)
      else rejected.push(`“${file.name}” is not a video file, so it was skipped.`)
    }

    setErrors(rejected)
    if (accepted.length === 0) {
      setStatus('')
      return
    }

    setStatus(`Reading ${accepted.length} file${accepted.length === 1 ? '' : 's'}…`)
    for (const file of accepted) {
      try {
        setStatus(`Reading timing information from ${file.name}…`)
        const timebase = await readTimebase(file)
        await putVideo({
          id: videoId(file),
          name: file.name,
          size: file.size,
          mimeType: file.type || 'video/mp4',
          addedAt: Date.now(),
          schemaVersion: DB_VERSION,
          timebase,
          blob: file,
        })
      } catch (error) {
        // A file we cannot read the timebase from is unusable downstream, so
        // say so plainly instead of adding it with guessed timing.
        rejected.push(
          `Could not read “${file.name}”: ${(error as Error).message}`,
        )
        setErrors([...rejected])
      }
    }

    const stored = await listVideos()
    setVideos(stored)
    setStatus(
      `${stored.length} video${stored.length === 1 ? '' : 's'} loaded and saved in this browser.`,
    )
  }, [])

  const loadSampleVideos = useCallback(async () => {
    // Idempotent by name, not by relying on a fetched File's derived id
    // matching byte-for-byte across runs: a sample clip already present in
    // the table (by its known, fixed name) is left alone rather than
    // re-fetched, so a second click can never add a duplicate row for it,
    // regardless of anything about how the id happens to be computed. A
    // user's own uploaded videos keep the normal (permissive) dedup-by-
    // content behaviour in addFiles -- this special-cases only the three
    // known sample names.
    const alreadyLoaded = new Set(videos.map((v) => v.name))
    const missing = SAMPLE_NAMES.filter((name) => !alreadyLoaded.has(name))
    if (missing.length === 0) {
      setStatus('The sample videos are already loaded.')
      return
    }
    setLoadingSamples(true)
    setErrors([])
    setStatus(`Downloading ${missing.length} sample video${missing.length === 1 ? '' : 's'} from the take-home repo…`)
    try {
      const files = await Promise.all(missing.map(fetchSampleFile))
      await addFiles(files)
    } catch (error) {
      setErrors([
        `Could not download the sample videos (${(error as Error).message}). You can still download them yourself and drag them in above.`,
      ])
      setStatus('')
    } finally {
      setLoadingSamples(false)
    }
  }, [addFiles, videos])

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      setIsDraggingOver(false)
      void addFiles(event.dataTransfer.files)
    },
    [addFiles],
  )

  const onRemove = useCallback(async (video: StoredVideoSummary) => {
    await deleteVideo(video.id)
    await deleteRoi(video.id)
    await deleteTracks(video.id)
    await deleteCorrections(video.id)
    await deleteInvestigationEdits(video.id)
    await deleteMeasureOverrides(video.id)
    setVideos(await listVideos())
    setStatus(`Removed ${video.name}.`)
  }, [])

  const onMove = useCallback(async (videoId: string, neighborId: string) => {
    await swapVideoOrder(videoId, neighborId)
    setVideos(await listVideos())
  }, [])

  return (
    <section aria-labelledby="video-loader-heading" className="loader">
      <h2 id="video-loader-heading" className="step-heading">1. Load videos</h2>

      {/* The drop zone is a convenience layered over a real file input: the
          input is the accessible control, focusable and labeled, and works
          identically by keyboard. */}
      <div
        className={`dropzone${isDraggingOver ? ' dropzone--active' : ''}`}
        onDragOver={(event) => {
          event.preventDefault()
          setIsDraggingOver(true)
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={onDrop}
      >
        <p>Drag video files here, or use the button below.</p>
        <label className="file-label" htmlFor="video-input">
          Choose video files
        </label>
        <input
          ref={inputRef}
          id="video-input"
          className="file-input"
          type="file"
          accept="video/*,.mp4,.m4v,.mov,.avi,.webm,.mkv"
          multiple
          onChange={(event) => {
            void addFiles(event.target.files)
            // Allows re-selecting the same file after removing it.
            event.target.value = ''
          }}
        />
        <p className="hint">
          Videos stay on this machine. Nothing is uploaded, and they are saved
          in this browser so a reload does not lose them.
        </p>
      </div>

      <div className="sample-callout">
        <span className="sample-callout-label">Sample videos</span>
        <button type="button" onClick={() => void loadSampleVideos()} disabled={loadingSamples}>
          {loadingSamples ? 'Downloading…' : 'Load test50, test51, test53'}
        </button>
      </div>

      <div className={`calibration-callout${defaultDiameterCm === null ? ' calibration-callout--unset' : ''}`}>
        <label htmlFor="default-diameter">Platform diameter (cm)</label>
        <input
          id="default-diameter"
          type="number"
          min={1}
          step="any"
          placeholder="e.g. 92"
          value={defaultDiameterCm ?? ''}
          onChange={(event) => {
            const value = event.target.value === '' ? null : Number(event.target.value)
            setDefaultDiameterCm(value)
            if (value !== null && value > 0) void saveDefaultPlatformDiameterCm(value)
          }}
        />
        <p className="hint">Converts tracked pixel positions to real-world centimeters.</p>
      </div>

      <div className="calibration-callout calibration-callout--notes">
        <span className="calibration-callout-label">Detection threshold (all videos)</span>
        {(() => {
          const params = investigationParams ?? DEFAULT_INVESTIGATION_PARAMS
          return (
            <p className="hint">
              {params.proximityRadiusFactor.toFixed(2)}× hole radius, min{' '}
              {params.minFrames} frame{params.minFrames === 1 ? '' : 's'} — same for every
              video. Adjust in step 4.
            </p>
          )
        })()}
      </div>

      {/* Announced to screen readers without stealing focus. */}
      <p className="status" role="status" aria-live="polite">
        {status}
      </p>

      {errors.length > 0 && (
        <ul className="errors" aria-label="Problems loading files">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}

      {isLoading ? (
        <p>Checking for previously loaded videos…</p>
      ) : videos.length === 0 ? (
        <p className="hint">No videos loaded yet.</p>
      ) : (
        <div className="video-table-wrap">
        <table className="video-table">
          <caption>
            Loaded videos, with the frame timing read from each file’s container
          </caption>
          <thead>
            <tr>
              <th scope="col">File</th>
              <th scope="col">Frame rate</th>
              <th scope="col">Frames</th>
              <th scope="col">Duration</th>
              <th scope="col">Maze</th>
              <th scope="col">Tracking</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {videos.map((video, index) => {
              const isDefined = definedVideoIds.has(video.id)
              const isTracking = video.id === activeVideoId
              const isTracked = trackedVideoIds.has(video.id)
              // Two decode passes run per video (background sampling, then
              // tracking -- see pipeline.ts), each reporting its own 0-100%.
              // Showing a bare percentage without the phase would make the
              // tracking pass look like progress going backwards right after
              // the background pass finishes.
              const trackingLabel = isTracking
                ? activeProgress
                  ? `${activeProgress.phase === 'background' ? 'Background' : 'Tracking'} ${Math.round((activeProgress.framesProcessed / activeProgress.totalFrames) * 100)}%`
                  : 'Starting…'
                : isTracked
                  ? 'Tracked'
                  : 'Not tracked'

              return (
                <tr
                  key={video.id}
                  data-testid="video-row"
                  aria-current={video.id === selectedVideoId ? 'true' : undefined}
                  className={video.id === selectedVideoId ? 'selected-row' : undefined}
                >
                  <th scope="row">
                    {video.name}
                    <span className="muted"> ({formatSize(video.size)})</span>
                  </th>
                  <td>
                    <span data-testid="fps">{formatFps(video.timebase.nominalFps)} fps</span>
                    {video.timebase.jitter.isVariable && (
                      <span
                        className="muted"
                        title="Frame intervals vary in this file; times are read per-frame from the container, not assumed from the rate."
                      >
                        {' '}
                        (variable)
                      </span>
                    )}
                  </td>
                  <td>{video.timebase.frameCount}</td>
                  <td>{formatDuration(video.timebase.durationSeconds)}</td>
                  <td data-testid="maze-status">{isDefined ? 'Defined' : 'Not defined'}</td>
                  <td data-testid="tracking-status">{trackingLabel}</td>
                  <td className="row-actions">
                    <button
                      type="button"
                      className="reorder-button"
                      disabled={index === 0}
                      title="Move up"
                      onClick={() => void onMove(video.id, videos[index - 1]!.id)}
                    >
                      ↑<span className="visually-hidden"> Move {video.name} up</span>
                    </button>
                    <button
                      type="button"
                      className="reorder-button"
                      disabled={index === videos.length - 1}
                      title="Move down"
                      onClick={() => void onMove(video.id, videos[index + 1]!.id)}
                    >
                      ↓<span className="visually-hidden"> Move {video.name} down</span>
                    </button>
                    <button type="button" onClick={() => onSelectVideo(video)}>
                      {isDefined ? 'Review maze' : 'Define maze'}
                      <span className="visually-hidden"> for {video.name}</span>
                    </button>
                    <button type="button" onClick={() => void onRemove(video)}>
                      Remove<span className="visually-hidden"> {video.name}</span>
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      )}
    </section>
  )
}
