import { useState } from 'react'

const DISMISS_KEY = 'install-banner-dismissed'
const DISMISS_DAYS = 7

function isDismissed(): boolean {
  const ts = localStorage.getItem(DISMISS_KEY)
  if (!ts) return false
  return Date.now() - Number(ts) < DISMISS_DAYS * 86400000
}

function isIOSSafari(): boolean {
  const ua = navigator.userAgent
  return /iP(hone|ad|od)/.test(ua) && /WebKit/.test(ua) && !/(CriOS|FxiOS|OPiOS|EdgiOS)/.test(ua)
}

function isAndroidChrome(): boolean {
  const ua = navigator.userAgent
  return /Android/.test(ua) && /Chrome/.test(ua) && !/OPR|Edge|Samsung/.test(ua)
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true
}

function getPlatform(): 'ios' | 'android' | null {
  if (isStandalone() || isDismissed()) return null
  if (isIOSSafari()) return 'ios'
  if (isAndroidChrome()) return 'android'
  return null
}

export function InstallBanner() {
  const [platform] = useState(getPlatform)
  const [visible, setVisible] = useState(() => platform !== null)

  if (!visible) return null

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setVisible(false)
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 px-4 py-3 flex items-start gap-3">
      <span className="text-2xl flex-shrink-0 mt-0.5">📲</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Add Gimme to Home Screen</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {platform === 'ios' ? (
            <>Tap <span className="inline-flex items-center"><svg className="w-4 h-4 inline text-blue-500" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.5 3.5-1.4 1.4L13 5.8V16h-2V5.8L9.9 6.9 8.5 5.5 12 2zm-7 9v11h14V11h-4v2h2v7H7v-7h2v-2H5z"/></svg></span> Share then <strong>"Add to Home Screen"</strong></>
          ) : (
            <>Tap the <strong>&#8942;</strong> menu then <strong>"Add to Home screen"</strong> or <strong>"Install app"</strong></>
          )}
        </p>
      </div>
      <button
        onClick={dismiss}
        className="text-gray-400 hover:text-gray-600 text-xl leading-none flex-shrink-0 p-1"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  )
}
