// The ⋮ header menu, as a pure list of actions. It takes no game state at all:
// every item is a flag and a callback decided by the Scorecard. That is the
// point — the menu cannot read Wolf (or any) state, so it cannot loop or throw on
// it, and the boundary around it turns anything that does throw into a plain
// fallback instead of a hung renderer (Finding 3).

import { InlineErrorBoundary } from '../InlineErrorBoundary'

export interface ScorecardHeaderMenuProps {
  showQR: boolean
  onQR: () => void
  showSpectatorLink: boolean
  onSpectatorLink: () => void
  showPhotoImport: boolean
  onPhotoImport: () => void
  showRules: boolean
  onRules: () => void
  showCorrectCard: boolean
  onCorrectCard: () => void
  showSettleUp: boolean
  onSettleUp: () => void
  showEndRound: boolean
  onEndRound: () => void
}

export function ScorecardHeaderMenu(props: ScorecardHeaderMenuProps) {
  const item = (label: string, onClick: () => void, color: string) => (
    <button
      key={label}
      onClick={onClick}
      className={`w-full px-4 py-3 text-left text-sm font-medium ${color} hover:bg-gray-700 active:bg-gray-700`}
    >
      {label}
    </button>
  )
  return (
    <div
      role="menu"
      className="absolute right-0 top-full mt-1 bg-gray-800 rounded-xl shadow-2xl border border-gray-600 min-w-[180px] z-50 py-1 overflow-hidden"
    >
      <InlineErrorBoundary label="the menu">
        {props.showQR && item('📷 QR code', props.onQR, 'text-cyan-300')}
        {props.showSpectatorLink && item('📡 Live Spectator Link', props.onSpectatorLink, 'text-green-300')}
        {props.showPhotoImport && item('📸 Import scores from photo', props.onPhotoImport, 'text-amber-300')}
        {props.showRules && item('Rules', props.onRules, 'text-cyan-300')}
        {props.showCorrectCard && item('Correct this card', props.onCorrectCard, 'text-cyan-300')}
        {props.showSettleUp && item('Settle Up', props.onSettleUp, 'text-yellow-300')}
        {props.showEndRound && item('End Round', props.onEndRound, 'text-yellow-300')}
      </InlineErrorBoundary>
    </div>
  )
}
