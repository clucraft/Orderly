// Printing works by keeping printable content in #print-root (hidden on screen) and showing only
// that element when the browser prints. The content stays mounted, so images are already loaded
// and window.print() can run straight from the tap that asked for it.

export type PrintMode = 'label' | 'invoice'

const PAGE_STYLES: Record<PrintMode, string> = {
  label: '@page { size: 4in 6in; margin: 0; }',
  invoice: '@page { size: letter; margin: 0.5in; }',
}

export function getPrintRoot(): HTMLElement {
  let root = document.getElementById('print-root')
  if (!root) {
    root = document.createElement('div')
    root.id = 'print-root'
    document.body.appendChild(root)
  }
  return root
}

export function printNow(mode: PrintMode) {
  getPrintRoot().dataset.mode = mode

  let style = document.getElementById('print-page-style')
  if (!style) {
    style = document.createElement('style')
    style.id = 'print-page-style'
    document.head.appendChild(style)
  }
  style.textContent = PAGE_STYLES[mode]

  window.print()
}

// Label printers are typically 203 or 300 dpi; rendering at 300 keeps barcodes crisp on both
const LABEL_DPI = 300

// Renders the first page of a label PDF to an image URL (revoke it with URL.revokeObjectURL)
export async function renderLabelImage(pdfData: ArrayBuffer): Promise<string> {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfData) })
  try {
    const doc = await loadingTask.promise
    const page = await doc.getPage(1)
    const natural = page.getViewport({ scale: 1 })
    // Labels print portrait; turn a landscape page so it fills the 4x6 label
    const rotation = natural.width > natural.height ? (page.rotate + 90) % 360 : page.rotate
    const viewport = page.getViewport({ scale: LABEL_DPI / 72, rotation })

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    await page.render({ canvas, viewport }).promise

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('Could not render the label')
    return URL.createObjectURL(blob)
  } finally {
    loadingTask.destroy()
  }
}
