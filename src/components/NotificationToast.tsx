import { useEffect } from 'react'
import type { AppNotification } from '../types'

interface Props {
  notification: AppNotification
  onDismiss: () => void
  onAction?: (notification: AppNotification) => void
}

export function NotificationToast({ notification, onDismiss, onAction }: Props) {
  const hasAction = notification.type === 'round_invite' && onAction

  useEffect(() => {
    const timer = setTimeout(onDismiss, hasAction ? 8000 : 4000)
    return () => clearTimeout(timer)
  }, [notification.id, onDismiss, hasAction])

  const icon = {
    unsettled_round: '💰',
    round_invite: '🏌️',
    round_complete: '🏁',
    broadcast: '📣',
  }[notification.type] ?? '🔔'

  return (
    <div className="fixed top-4 inset-x-4 z-50 flex justify-center animate-[slide-down_0.3s_ease-out]">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center gap-3 max-w-md w-full">
        <button
          onClick={onDismiss}
          className="flex items-center gap-3 flex-1 min-w-0 active:scale-[0.98] transition-transform"
        >
          <span className="text-xl flex-shrink-0">{icon}</span>
          <div className="flex-1 min-w-0 text-left">
            <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm truncate">{notification.title}</p>
            {notification.body && (
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{notification.body}</p>
            )}
          </div>
        </button>
        {hasAction ? (
          <button
            onClick={() => onAction(notification)}
            className="flex-shrink-0 bg-green-600 text-white text-sm font-semibold px-4 py-1.5 rounded-full active:scale-95 transition-transform"
          >
            Join
          </button>
        ) : (
          <span className="text-gray-400 text-xs flex-shrink-0">now</span>
        )}
      </div>
    </div>
  )
}
