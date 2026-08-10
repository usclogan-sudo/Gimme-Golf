// Render a ResultCard to a PNG blob from plain data — no live ref required.
//
// The card on screen is the `screen` variant (responsive width). Capturing that node
// would rasterize at whatever width it happens to occupy, not 1080. So instead we
// mount the `export` variant into an offscreen container at a true 1080px, capture
// it, and tear it down. The container is positioned offscreen (left: -10000px), NOT
// display:none — a hidden node has zero layout size and captures blank. (§3f)

import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { ResultCard, type ResultCardProps } from './ResultCard'
import { exportResultCard } from './exportCard'

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

/**
 * Mount the export-variant card offscreen, rasterize it, and clean up. Resolves to a
 * PNG blob, or null if rendering failed. Never throws — callers hand the blob to the
 * crash-proof share utility.
 */
export async function renderResultCardToBlob(
  props: Omit<ResultCardProps, 'variant'>,
): Promise<Blob | null> {
  if (typeof document === 'undefined') return null

  const ratio = props.ratio ?? 'story'
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1080px;pointer-events:none;z-index:-1;'
  document.body.appendChild(host)

  const root = createRoot(host)
  try {
    flushSync(() => {
      root.render(<ResultCard {...props} variant="export" ratio={ratio} />)
    })

    // Let layout settle, then ensure fonts are in before capture.
    await nextFrame()
    if (document.fonts?.ready) await document.fonts.ready
    await nextFrame()

    const node = host.firstElementChild as HTMLElement | null
    if (!node) return null
    return await exportResultCard(node, ratio)
  } catch {
    return null
  } finally {
    // Defer unmount out of the render/commit cycle.
    setTimeout(() => {
      root.unmount()
      host.remove()
    }, 0)
  }
}
