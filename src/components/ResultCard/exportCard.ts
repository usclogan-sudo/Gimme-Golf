// Rasterize a ResultCard DOM node to a PNG blob (UX Build Spec v2.0 §3f).
//
// Uses `html-to-image` (not html2canvas): it handles webfonts and CSS variables
// correctly and is a third of the bundle size. The two things that silently wreck
// this export are (1) capturing before the display serif is embedded — it falls back
// to Times and the card looks cheap — and (2) a transparent background producing a
// see-through PNG. Both are guarded below.
//
// Font embedding: html-to-image inlines webfonts by reading the page's stylesheets,
// but the Google Fonts <link> is cross-origin, so `sheet.cssRules` throws a
// SecurityError and no @font-face is found — Playfair silently becomes Times. We
// sidestep that by fetching the font CSS ourselves (fonts.gstatic.com serves the
// woff2 with `access-control-allow-origin: *`, so html-to-image can inline them from
// the @font-face rules we pass in via `fontEmbedCSS`).

import { toBlob } from 'html-to-image'

const NAVY = '#16263B'

// Exactly the faces the card renders: Playfair 600 (seal G) / 700 (headline, figure)
// / italic 400 (sub-line); Inter 400/500/600 (eyebrow, rows, footer).
const FONT_CSS_URL =
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,400&family=Inter:wght@400;500;600&display=swap'

let cachedFontCSS: string | null = null

/** Fetch the Google Fonts @font-face CSS once. Returns '' if offline/blocked. */
async function getFontEmbedCSS(): Promise<string> {
  if (cachedFontCSS != null) return cachedFontCSS
  try {
    const res = await fetch(FONT_CSS_URL)
    cachedFontCSS = res.ok ? await res.text() : ''
  } catch {
    cachedFontCSS = ''
  }
  return cachedFontCSS
}

export async function exportResultCard(
  node: HTMLElement,
  ratio: 'story' | 'feed' = 'story',
): Promise<Blob | null> {
  // Critical: the display serif must be loaded before we rasterize.
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready
  }
  const fontEmbedCSS = await getFontEmbedCSS()
  return toBlob(node, {
    pixelRatio: 2,
    width: 1080,
    height: ratio === 'story' ? 1920 : 1350,
    cacheBust: true,
    backgroundColor: NAVY, // guards against a transparent PNG
    // When the fetch succeeds, pass the ready-made @font-face rules so html-to-image
    // never touches the unreadable cross-origin sheet. When it doesn't, omit the key
    // and let the library try its default path.
    ...(fontEmbedCSS ? { fontEmbedCSS } : {}),
  })
}
