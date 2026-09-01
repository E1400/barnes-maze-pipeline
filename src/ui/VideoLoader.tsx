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
import { deleteVideo, listVideos, putVideo } from '../state/videoStore.ts'
import { DB_VERSION, videoId } from '../state/schema.ts'
import type { StoredVideoSummary } from '../state/schema.ts'

function isVideoFile(file: File): boolean {
  // Browsers occasionally report an empty type for a known extension, so fall
  // back to the extension rather than rejecting a file the user can see is a video.
  return file.type.startsWith('video/') || /\.(mp4|m4v|mov|avi|webm|mkv)$/i.test(file.name)
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

export default function VideoLoader() {
  const [videos, setVideos] = useState<StoredVideoSummary[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

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

  const addFiles = useCallback(async (fileList: FileList | null) => {
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
    setVideos(await listVideos())
    setStatus(`Removed ${video.name}.`)
  }, [])

  return (
    <section aria-labelledby="video-loader-heading" className="loader">
      <h2 id="video-loader-heading">1. Load videos</h2>

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
              <th scope="col">Frame timing</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {videos.map((video) => (
              <tr key={video.id} data-testid="video-row">
                <th scope="row">
                  {video.name}
                  <span className="muted"> ({formatSize(video.size)})</span>
                </th>
                <td data-testid="fps">{formatFps(video.timebase.nominalFps)} fps</td>
                <td>{video.timebase.frameCount}</td>
                <td>{formatDuration(video.timebase.durationSeconds)}</td>
                <td>
                  {video.timebase.jitter.isVariable ? (
                    // Not a warning about the file being broken -- it is normal
                    // for these clips -- but it is the reason frame times come
                    // from the stts table rather than from index / fps.
                    <span title="Frame intervals are not constant in this file; frame times are read individually from the container.">
                      variable ({(video.timebase.jitter.offModalFraction * 100).toFixed(1)}
                      % off-nominal)
                    </span>
                  ) : (
                    'constant'
                  )}
                </td>
                <td>
                  <button type="button" onClick={() => void onRemove(video)}>
                    Remove<span className="visually-hidden"> {video.name}</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
