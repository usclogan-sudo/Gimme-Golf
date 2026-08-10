import { useEffect, useState } from 'react'

type CelebrationLevel = 'toast' | 'fullscreen'

interface CelebrationConfig {
  level: CelebrationLevel
  title: string
  subtitle?: string
  emoji: string
}

export function getCelebration(score: number, par: number): CelebrationConfig | null {
  if (score === 1) return { level: 'fullscreen', title: 'ACE!', subtitle: 'Hole in One!', emoji: '🏆' }
  const diff = score - par
  if (diff <= -3) return { level: 'fullscreen', title: 'ALBATROSS!', subtitle: `${Math.abs(diff)} under par!`, emoji: '🦅' }
  if (diff === -2) return { level: 'fullscreen', title: 'EAGLE!', subtitle: '2 under par', emoji: '🦅' }
  if (diff === -1) return { level: 'toast', title: 'Birdie!', emoji: '🐦' }
  return null
}

interface ToastProps {
  config: CelebrationConfig
  playerName: string
  onDone: () => void
}

export function CelebrationToast({ config, playerName, onDone }: ToastProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(onDone, 300)
    }, 2500)
    return () => clearTimeout(timer)
  }, [onDone])

  return (
    <div className={`fixed top-4 left-4 right-4 z-50 transition-all duration-300 ${visible ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'}`}>
      <div className="max-w-md mx-auto bg-gray-800 text-white dark:bg-brass dark:text-navy rounded-2xl shadow-xl px-5 py-3 flex items-center gap-3">
        <span className="text-2xl">{config.emoji}</span>
        <div>
          <p className="font-display font-bold">{playerName} — {config.title}</p>
          {config.subtitle && <p className="text-sm text-gray-300">{config.subtitle}</p>}
        </div>
      </div>
    </div>
  )
}

interface FullscreenProps {
  config: CelebrationConfig
  playerName: string
  onDismiss: () => void
}

export function CelebrationFullscreen({ config, playerName, onDismiss }: FullscreenProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-6 transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
      onClick={onDismiss}
      style={{ background: 'radial-gradient(circle, rgba(217,166,67,0.15) 0%, rgba(0,0,0,0.85) 100%)' }}
    >
      <div className={`transform transition-all duration-500 ${visible ? 'scale-100' : 'scale-50'}`}>
        <p className="text-8xl text-center mb-4">{config.emoji}</p>
        <h2 className="font-display text-5xl font-800 text-center gold-text tracking-tight">{config.title}</h2>
        {config.subtitle && <p className="text-xl text-amber-300 text-center mt-2">{config.subtitle}</p>}
        <p className="text-2xl text-white text-center mt-4 font-display font-bold">{playerName}</p>
      </div>
      <p className="text-gray-400 text-sm mt-10 animate-pulse">Tap anywhere to dismiss</p>
    </div>
  )
}
