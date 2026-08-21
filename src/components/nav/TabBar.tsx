// Persistent bottom navigation (UX v2.1 §9a). Four tabs replace the home scroll's
// "More" emoji grid. Navy bar, cream icons, brass active indicator, safe-area inset.
// Line icons at 1.5px stroke (no emoji, per §6).

export type HomeTab = 'play' | 'rounds' | 'group' | 'you'

const NAVY = '#16263B'
const CREAM = '#F2ECDD'
const BRASS = '#C2A24C'

function Icon({ tab, active }: { tab: HomeTab; active: boolean }) {
  const stroke = active ? BRASS : CREAM
  const common = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke, strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (tab) {
    case 'play': // flag on a green
      return (<svg {...common}><path d="M5 3v18" /><path d="M5 4h11l-2 3 2 3H5" /></svg>)
    case 'rounds': // stacked cards / list
      return (<svg {...common}><rect x="3" y="4" width="18" height="5" rx="1.5" /><rect x="3" y="12" width="18" height="5" rx="1.5" /></svg>)
    case 'group': // users
      return (<svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 6a3 3 0 0 1 0 6" /><path d="M18 20a6 6 0 0 0-3-5.2" /></svg>)
    case 'you': // single user
      return (<svg {...common}><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>)
  }
}

const TABS: { key: HomeTab; label: string }[] = [
  { key: 'play', label: 'Play' },
  { key: 'rounds', label: 'Rounds' },
  { key: 'group', label: 'Players' },
  { key: 'you', label: 'You' },
]

export function TabBar({ tab, onTab }: { tab: HomeTab; onTab: (t: HomeTab) => void }) {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-30 safe-bottom"
      style={{ background: NAVY, borderTop: `1px solid rgba(242,236,221,0.14)` }}
    >
      <div className="max-w-2xl mx-auto flex">
        {TABS.map(({ key, label }) => {
          const active = tab === key
          return (
            <button
              key={key}
              onClick={() => onTab(key)}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className="flex-1 flex flex-col items-center gap-1 pt-2.5 pb-2 active:opacity-80"
            >
              {/* brass active pill */}
              <span
                className="h-0.5 w-6 rounded-full mb-0.5"
                style={{ background: active ? BRASS : 'transparent' }}
              />
              <Icon tab={key} active={active} />
              <span
                className="text-[11px] font-semibold tracking-wide"
                style={{ color: active ? BRASS : 'rgba(242,236,221,0.85)' }}
              >
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
