import { useState, useRef, useEffect } from 'react'

const GOLF_TERMS: Record<string, string> = {
  SI: 'Stroke Index — difficulty ranking of each hole (1 = hardest)',
  Net: 'Total strokes minus handicap strokes received. Lower is better. Example: 90 gross − 12 strokes = 78 net.',
  Gross: 'Your actual score before any handicap adjustment',
  Skins: 'Each hole is worth a set amount — win the hole outright to win the skin',
  Nassau: 'Three separate bets: front 9, back 9, and overall 18',
  Press: 'A new bet within Nassau, started when you\'re down',
  'Best Ball': 'Teams of 2 — the lower score on each hole counts for the team',
  Wolf: 'Rotating "wolf" picks a partner each hole, or goes alone for double stakes',
  BBB: 'Bingo Bango Bongo — points for first on green, closest to pin, first to hole out',
  Hammer: 'Two-player game where you can "throw the hammer" to double the hole\'s value',
  HCP: 'Handicap — a number representing your average strokes over par',
  Vegas: 'Team game where scores are combined into 2-digit numbers — difference = points',
  Stableford: 'Point-based scoring: bogey=1, par=2, birdie=3 — highest points wins',
  Dots: 'Side bet game awarding dots for achievements (sandies, greenies, etc.)',
  Banker: 'Rotating banker takes on all other players each hole',
  Quota: 'Each player gets a target based on handicap — beat your quota to win',
  'Buy-in': 'The amount each player puts in before the round (their entry)',
  Pot: 'The total points in play — every player\'s entry combined',
  Carry: 'When a skin is tied, its value carries forward to the next hole',
  'Lone Wolf': 'When the wolf plays alone against all others — double stakes',
  'Course Handicap': 'Your handicap adjusted for the specific course difficulty (slope & rating)',
  'Stroke Index': 'Ranking of hole difficulty (1 = hardest) — determines where handicap strokes are given',
  Differential: 'The adjusted score used to calculate your handicap index',
  'Handicap Index': 'A portable number representing your playing ability — lower is better',
}

interface TooltipProps {
  term: string
  children: React.ReactNode
}

let activeTooltipSetter: ((open: boolean) => void) | null = null

export function Tooltip({ term, children }: TooltipProps) {
  const [open, setOpen] = useState(false)
  const [flipBelow, setFlipBelow] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const definition = GOLF_TERMS[term]

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [open])

  // Detect if tooltip overflows viewport top and flip below
  useEffect(() => {
    if (!open || !popoverRef.current) return
    const rect = popoverRef.current.getBoundingClientRect()
    if (rect.top < 0) {
      setFlipBelow(true)
    }
  }, [open])

  // Reset flip when closing
  useEffect(() => {
    if (!open) setFlipBelow(false)
  }, [open])

  if (!definition) return <>{children}</>

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!open) {
      // Close any other open tooltip
      if (activeTooltipSetter && activeTooltipSetter !== setOpen) {
        activeTooltipSetter(false)
      }
      activeTooltipSetter = setOpen
    }
    setOpen(!open)
  }

  return (
    <span className="relative inline-flex items-center gap-0.5" ref={ref}>
      {children}
      <button
        onClick={handleToggle}
        className="relative inline-flex items-center justify-center min-h-[44px] min-w-[44px] flex-shrink-0"
        style={{ padding: 0 }}
        aria-label={`What is ${term}?`}
      >
        <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-600 text-[10px] font-bold leading-none inline-flex items-center justify-center active:bg-amber-200">
          ?
        </span>
      </button>
      {open && (
        <div
          ref={popoverRef}
          className={`absolute z-50 left-1/2 -translate-x-1/2 w-56 bg-gray-800 text-white dark:bg-brass dark:text-navy text-xs rounded-xl px-3 py-2 shadow-lg ${
            flipBelow ? 'top-full mt-1.5' : 'bottom-full mb-1.5'
          }`}
        >
          <p className="font-bold mb-0.5">{term}</p>
          <p className="text-gray-300 leading-relaxed">{definition}</p>
          {flipBelow ? (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-b-[6px] border-transparent border-b-gray-800" />
          ) : (
            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-transparent border-t-gray-800" />
          )}
        </div>
      )}
    </span>
  )
}
