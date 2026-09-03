/**
 * Occupancy heatmap: bins tracked centroid positions into a grid over the
 * platform. Pure so the binning math is testable without an SVG or a video.
 */

import type { EffectiveFrame } from './corrections.ts'
import type { RoiDefinition } from './roi.ts'

export interface OccupancyGrid {
  readonly resolution: number
  readonly cellSize: number
  /** [row][col], row 0 at the top (min y) of the platform's bounding box. */
  readonly counts: readonly (readonly number[])[]
  readonly maxCount: number
}

export function computeOccupancyGrid(
  frames: readonly EffectiveFrame[],
  roi: RoiDefinition,
  resolution = 14,
): OccupancyGrid {
  const size = roi.platformRadius * 2
  const cellSize = size / resolution
  const originX = roi.center.x - roi.platformRadius
  const originY = roi.center.y - roi.platformRadius
  const counts: number[][] = Array.from({ length: resolution }, () => new Array<number>(resolution).fill(0))
  let maxCount = 0

  for (const frame of frames) {
    if (frame.state !== 'TRACKED' || !frame.centroid) continue
    const col = Math.floor((frame.centroid.x - originX) / cellSize)
    const row = Math.floor((frame.centroid.y - originY) / cellSize)
    if (col < 0 || col >= resolution || row < 0 || row >= resolution) continue
    const next = counts[row]![col]! + 1
    counts[row]![col] = next
    if (next > maxCount) maxCount = next
  }

  return { resolution, cellSize, counts, maxCount }
}
