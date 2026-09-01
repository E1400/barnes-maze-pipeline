/**
 * Connected-component labelling (8-connectivity, two-pass union-find) with the
 * moments each component needs downstream.
 *
 * Second moments come along for free during the accumulation pass, which is
 * what gives the body's principal axis -- and therefore, once a direction of
 * travel is known, which end of the animal is the nose.
 */

import type { BinaryMask } from './types.ts'

export interface ComponentStats {
  readonly label: number
  readonly area: number
  readonly centroidX: number
  readonly centroidY: number
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
  /** Principal axis angle in radians, from the +x axis (y grows downward). */
  readonly orientation: number
  /** Standard deviations along the major and minor axes, in pixels. */
  readonly majorSigma: number
  readonly minorSigma: number
}

export interface LabelledImage {
  readonly width: number
  readonly height: number
  /** 0 = background; component labels start at 1. */
  readonly labels: Int32Array
  readonly components: ComponentStats[]
}

class UnionFind {
  private readonly parent: number[] = [0]

  make(): number {
    this.parent.push(this.parent.length)
    return this.parent.length - 1
  }

  find(x: number): number {
    let root = x
    while (this.parent[root] !== root) root = this.parent[root]!
    // Path compression keeps the second pass linear in practice.
    let current = x
    while (this.parent[current] !== root) {
      const next = this.parent[current]!
      this.parent[current] = root
      current = next
    }
    return root
  }

  union(a: number, b: number): void {
    const rootA = this.find(a)
    const rootB = this.find(b)
    if (rootA !== rootB) this.parent[Math.max(rootA, rootB)] = Math.min(rootA, rootB)
  }
}

export function connectedComponents(
  mask: BinaryMask,
  width: number,
  height: number,
): LabelledImage {
  const labels = new Int32Array(mask.length)
  const uf = new UnionFind()

  // First pass: provisional labels, recording equivalences.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x
      if (!mask[index]) continue

      // Neighbours already visited in scan order: W, NW, N, NE.
      const neighbours: number[] = []
      if (x > 0 && labels[index - 1]) neighbours.push(labels[index - 1]!)
      if (y > 0) {
        const up = index - width
        if (x > 0 && labels[up - 1]) neighbours.push(labels[up - 1]!)
        if (labels[up]) neighbours.push(labels[up]!)
        if (x + 1 < width && labels[up + 1]) neighbours.push(labels[up + 1]!)
      }

      if (neighbours.length === 0) {
        labels[index] = uf.make()
      } else {
        let smallest = neighbours[0]!
        for (const n of neighbours) if (n < smallest) smallest = n
        labels[index] = smallest
        for (const n of neighbours) uf.union(smallest, n)
      }
    }
  }

  // Second pass: resolve to root labels, compacted to 1..n, accumulating moments.
  const remap = new Map<number, number>()
  const sums = new Map<
    number,
    {
      area: number
      sumX: number
      sumY: number
      sumXX: number
      sumYY: number
      sumXY: number
      minX: number
      minY: number
      maxX: number
      maxY: number
    }
  >()

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x
      const provisional = labels[index]
      if (!provisional) continue
      const root = uf.find(provisional)
      let label = remap.get(root)
      if (label === undefined) {
        label = remap.size + 1
        remap.set(root, label)
        sums.set(label, {
          area: 0,
          sumX: 0,
          sumY: 0,
          sumXX: 0,
          sumYY: 0,
          sumXY: 0,
          minX: x,
          minY: y,
          maxX: x,
          maxY: y,
        })
      }
      labels[index] = label
      const s = sums.get(label)!
      s.area++
      s.sumX += x
      s.sumY += y
      s.sumXX += x * x
      s.sumYY += y * y
      s.sumXY += x * y
      if (x < s.minX) s.minX = x
      if (x > s.maxX) s.maxX = x
      if (y < s.minY) s.minY = y
      if (y > s.maxY) s.maxY = y
    }
  }

  const components: ComponentStats[] = []
  for (const [label, s] of sums) {
    const centroidX = s.sumX / s.area
    const centroidY = s.sumY / s.area
    // Central second moments.
    const mu20 = s.sumXX / s.area - centroidX * centroidX
    const mu02 = s.sumYY / s.area - centroidY * centroidY
    const mu11 = s.sumXY / s.area - centroidX * centroidY
    const orientation = 0.5 * Math.atan2(2 * mu11, mu20 - mu02)
    // Eigenvalues of the 2x2 covariance matrix give the axis spreads.
    const common = Math.sqrt(Math.max(0, (mu20 - mu02) * (mu20 - mu02) + 4 * mu11 * mu11))
    const major = (mu20 + mu02 + common) / 2
    const minor = (mu20 + mu02 - common) / 2
    components.push({
      label,
      area: s.area,
      centroidX,
      centroidY,
      minX: s.minX,
      minY: s.minY,
      maxX: s.maxX,
      maxY: s.maxY,
      orientation,
      majorSigma: Math.sqrt(Math.max(0, major)),
      minorSigma: Math.sqrt(Math.max(0, minor)),
    })
  }
  components.sort((a, b) => b.area - a.area)
  return { width, height, labels, components }
}

/** Endpoints of a component along its principal axis, in pixel coordinates. */
export function axisEndpoints(
  labelled: LabelledImage,
  component: ComponentStats,
): [{ x: number; y: number }, { x: number; y: number }] {
  const ux = Math.cos(component.orientation)
  const uy = Math.sin(component.orientation)
  let minProjection = Infinity
  let maxProjection = -Infinity
  let minPoint = { x: component.centroidX, y: component.centroidY }
  let maxPoint = minPoint

  for (let y = component.minY; y <= component.maxY; y++) {
    for (let x = component.minX; x <= component.maxX; x++) {
      if (labelled.labels[y * labelled.width + x] !== component.label) continue
      const projection = (x - component.centroidX) * ux + (y - component.centroidY) * uy
      if (projection < minProjection) {
        minProjection = projection
        minPoint = { x, y }
      }
      if (projection > maxProjection) {
        maxProjection = projection
        maxPoint = { x, y }
      }
    }
  }
  return [minPoint, maxPoint]
}
