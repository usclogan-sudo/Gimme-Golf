interface ConfirmModalProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
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
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4 animate-[scale-in_0.15s_ease-out]">
        <h3 className="font-display text-lg font-bold text-gray-900 dark:text-gray-100">{title}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 h-12 border-2 border-gray-200 text-gray-600 font-semibold rounded-xl active:bg-gray-50 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 h-12 font-semibold rounded-xl transition-colors ${
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
