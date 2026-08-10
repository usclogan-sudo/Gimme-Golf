import { useRef, useState } from 'react'
import { resizePhotoForUpload, extractScoresFromPhoto, type ExtractionResult } from '../../lib/photoImport'
import type { Player, CourseSnapshot } from '../../types'

interface UsePhotoImportArgs {
  roundId: string
  players: Player[]
  snapshot: CourseSnapshot
  /** Called once a photo has been processed; the parent renders the confirmation grid. */
  onExtracted: (result: ExtractionResult) => void
}

type Stage = 'idle' | 'preview' | 'processing' | 'error'

/**
 * Hook for the photo-import flow. Returns:
 *  - `open()` to trigger the camera/file picker (call from any button).
 *  - `overlays` — JSX you must render once somewhere in your tree (preview /
 *    loading / error modals). Stays mounted at all times; renders nothing
 *    when stage === 'idle'.
 */
export function usePhotoImport({ roundId, players, snapshot, onExtracted }: UsePhotoImportArgs) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<Stage>('idle')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setPendingFile(null)
    setError(null)
    setStage('idle')
    if (fileRef.current) fileRef.current.value = ''
  }

  const open = () => {
    fileRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    setPendingFile(file)
    setError(null)
    setStage('preview')
  }

  const submitPhoto = async () => {
    if (!pendingFile) return
    setStage('processing')
    setError(null)
    try {
      const { base64 } = await resizePhotoForUpload(pendingFile)
      const result = await extractScoresFromPhoto({ photoBase64: base64, roundId, players, snapshot })
      onExtracted(result)
      // Reset state but keep the previewUrl alive briefly in case the parent wants it.
      setStage('idle')
      setPendingFile(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (err: any) {
      setError(err?.message ?? 'Could not process photo')
      setStage('error')
    }
  }

  const overlays = (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />

      {stage === 'preview' && previewUrl && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-4 space-y-3">
            <p className="font-semibold text-gray-900 dark:text-gray-100 text-center">Use this photo?</p>
            <div className="rounded-xl overflow-hidden bg-black">
              <img src={previewUrl} alt="Scorecard preview" className="w-full max-h-[60vh] object-contain" />
            </div>
            <div className="flex gap-2">
              <button
                onClick={reset}
                className="flex-1 h-12 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-200 font-semibold active:bg-gray-50 dark:active:bg-gray-700"
              >
                Retake
              </button>
              <button
                onClick={submitPhoto}
                className="flex-1 h-12 bg-gray-800 text-white dark:bg-brass dark:text-navy rounded-xl font-semibold active:bg-gray-900"
              >
                Use photo
              </button>
            </div>
            <p className="text-xs text-gray-400 text-center">
              Photo is sent to an AI model to read the scores. Not retained.
            </p>
          </div>
        </div>
      )}

      {stage === 'processing' && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-white font-semibold">Reading the scorecard…</p>
          <p className="text-white/60 text-xs">Usually a few seconds</p>
        </div>
      )}

      {stage === 'error' && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-sm w-full p-5 space-y-3 text-center">
            <p className="text-2xl">⚠️</p>
            <p className="font-semibold text-gray-900 dark:text-gray-100">Couldn't read the photo</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 break-words">{error}</p>
            <div className="flex gap-2 pt-2">
              <button
                onClick={reset}
                className="flex-1 h-11 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-200 font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={open}
                className="flex-1 h-11 bg-gray-800 text-white dark:bg-brass dark:text-navy rounded-xl font-semibold"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )

  return { open, overlays, isProcessing: stage === 'processing' }
}
