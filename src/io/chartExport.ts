/**
 * Turns one of VisualizationsPanel's `<svg>` charts into a downloadable
 * file -- SVG (vector, for editing/publication) or PNG (rasterized via an
 * offscreen canvas, for pasting straight into a document). No logic worth
 * unit-testing, same reasoning as `sheets.ts`: verified directly in the
 * browser (captured real downloads and opened them) instead.
 */

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function serialize(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  return new XMLSerializer().serializeToString(clone)
}

export function downloadSvgFile(svg: SVGSVGElement, filename: string): void {
  triggerDownload(new Blob([serialize(svg)], { type: 'image/svg+xml;charset=utf-8' }), filename)
}

/** `backgroundColor` fills the canvas first -- the chart's own SVG is transparent, and a chart pasted onto a dark background with no fill would lose its axis lines and text. */
export function downloadSvgAsPng(
  svg: SVGSVGElement,
  filename: string,
  backgroundColor: string,
  scale = 2,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const viewBox = svg.viewBox.baseVal
    const width = viewBox && viewBox.width > 0 ? viewBox.width : svg.width.baseVal.value
    const height = viewBox && viewBox.height > 0 ? viewBox.height : svg.height.baseVal.value

    const url = URL.createObjectURL(new Blob([serialize(svg)], { type: 'image/svg+xml;charset=utf-8' }))
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(width * scale))
      canvas.height = Math.max(1, Math.round(height * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error('Canvas 2D context unavailable'))
        return
      }
      ctx.fillStyle = backgroundColor
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('PNG encoding failed'))
          return
        }
        triggerDownload(blob, filename)
        resolve()
      }, 'image/png')
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not rasterize chart'))
    }
    image.src = url
  })
}
