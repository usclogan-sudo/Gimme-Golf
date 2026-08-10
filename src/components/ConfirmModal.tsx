import { useEffect, useState } from 'react'

interface ConfirmModalProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  /** When set, the confirm button stays disabled until the user types this word
      (case-insensitive) — required for actions that delete more than one round. §17 */
  requireTyped?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  requireTyped,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [typed, setTyped] = useState('')
  // Reset the typed value whenever the modal opens/closes so it never carries over.
  useEffect(() => { if (!open) setTyped('') }, [open])

  if (!open) return null

  const typedOk = !requireTyped || typed.trim().toUpperCase() === requireTyped.toUpperCase()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4 animate-[scale-in_0.15s_ease-out]">
        <h3 className="font-display text-lg font-bold text-gray-900 dark:text-gray-100">{title}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300">{message}</p>
        {requireTyped && (
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoFocus
            placeholder={`Type "${requireTyped}" to confirm`}
            className="w-full h-11 px-3 rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-brass"
          />
        )}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 h-12 border-2 border-gray-200 text-gray-600 font-semibold rounded-xl active:bg-gray-50 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={!typedOk}
            className={`flex-1 h-12 font-semibold rounded-xl transition-colors disabled:opacity-40 ${
              destructive
                ? 'bg-red-600 text-white active:bg-red-700'
                : 'bg-gray-800 text-white dark:bg-brass dark:text-navy active:bg-gray-900'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
