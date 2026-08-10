// A tappable navigation row for the tab views (Rounds / Group / You). Card surface,
// navy/cream text, optional sublabel + brass badge + chevron. (UX v2.1 §9)

export function NavCard({
  label,
  sublabel,
  badge,
  onClick,
}: {
  label: string
  sublabel?: string
  badge?: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm active:bg-gray-50 dark:active:bg-gray-700 transition-colors text-left"
    >
      <div className="min-w-0">
        <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{label}</p>
        {sublabel && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{sublabel}</p>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {badge && (
          <span className="text-[11px] font-bold text-brass border border-brass/40 rounded-full px-2 py-0.5">
            {badge}
          </span>
        )}
        <span className="text-gray-400 dark:text-gray-500">›</span>
      </div>
    </button>
  )
}
