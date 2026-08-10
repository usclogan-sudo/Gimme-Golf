import { useRef, useState, useCallback } from 'react'
import { shareCard, type ShareResult } from '../../lib/share'

export function useShareImage(filename: string) {
  const shareRef = useRef<HTMLDivElement>(null)
  const [sharing, setSharing] = useState(false)

  // Renders the ref to a PNG and hands it to the crash-proof share utility. Never
  // throws — resolves to the outcome ('shared' | 'downloaded' | 'copied' |
  // 'cancelled') so the caller can toast, or null if the image couldn't be produced.
  const shareImage = useCallback(async (): Promise<ShareResult | null> => {
    if (!shareRef.current || sharing) return null
    setSharing(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(shareRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
      })
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
      if (!blob) return null
      return await shareCard(blob, filename, window.location.origin)
    } catch {
      // Rendering itself failed — surface nothing catastrophic; the app stays mounted.
      return null
    } finally {
      setSharing(false)
    }
  }, [filename, sharing])

  return { shareRef, sharing, shareImage }
}
