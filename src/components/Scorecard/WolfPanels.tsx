// The two Wolf surfaces on the hole view, as pure components so they can be
// rendered in a test against any round state — including the one that froze
// the app live: a hole with scores and no pick (Findings 3 and 4).
//
// Nothing in here may throw on partial state. Every lookup that can miss
// (wolf not on the roster, partner removed, empty rotation, no opponents) falls
// through to a plain sentence instead.

import type { Player, HoleScore, WolfConfig } from '../../types'
import type { WolfResult } from '../../lib/gameLogic'
import { wolfForHole } from '../../lib/gameLogic'

export interface WolfPick {
  partnerId: string | null
  blind?: boolean
}

const firstName = (p?: Player | null) => p?.name ?? '?'

/**
 * The pick panel. Three states:
 *   • no scores yet            → pick a partner, go Lone Wolf, or (if enabled) Blind Wolf
 *   • scores, pick recorded    → locked summary (a pick cannot change once scoring starts)
 *   • scores, no pick          → "Who did {wolf} pick?" — the recovery state. Scores are
 *                                kept; the organiser or acting scorekeeper records the
 *                                pick late and the hole resolves normally. Blind Wolf is
 *                                not offered late (it has to be called before the tee).
 */
export function WolfHolePanel({
  players, config, holeScores, holeNumber, canRecordLatePick, onPick,
}: {
  players: Player[]
  config: WolfConfig
  holeScores: HoleScore[]
  holeNumber: number
  canRecordLatePick: boolean
  onPick: (holeNumber: number, pick: WolfPick) => void
}) {
  const rosterIds = new Set(players.map(p => p.id))
  const order = (config.wolfOrder ?? []).filter(id => rosterIds.has(id))
  const wolfId = wolfForHole(order, holeNumber)
  const wolf = players.find(p => p.id === wolfId) ?? null
  const others = players.filter(p => p.id !== wolfId)
  const decision = config.holeDecisions?.[holeNumber]
  const hasScores = holeScores.some(s => s.holeNumber === holeNumber)

  const shell = (children: React.ReactNode) => (
    <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
      {children}
    </div>
  )

  if (!wolf) {
    return shell(<p className="text-sm text-gray-600 dark:text-gray-300">Wolf: nobody in the rotation is still in the round for hole {holeNumber}.</p>)
  }
  if (others.length === 0) {
    return shell(<p className="text-sm text-gray-600 dark:text-gray-300">Wolf needs at least one other player.</p>)
  }

  const partner = decision?.partnerId ? players.find(p => p.id === decision.partnerId) : null
  const summary = !decision ? null
    : decision.partnerId === null
      ? (decision.blind ? `${firstName(wolf)} going BLIND WOLF (3×)` : `${firstName(wolf)} going LONE WOLF`)
      : `${firstName(wolf)} + ${partner ? partner.name : 'a player no longer in the round'}`

  const pickButtons = (allowBlind: boolean) => (
    <div className="flex flex-wrap gap-2">
      {others.map(p => (
        <button
          key={p.id}
          onClick={() => onPick(holeNumber, { partnerId: p.id })}
          className={`px-3 py-1.5 min-h-[44px] rounded-lg text-sm font-semibold transition-colors ${
            decision?.partnerId === p.id
              ? 'bg-navy text-cream dark:bg-brass dark:text-navy'
              : 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200'
          }`}
        >
          {p.name}
        </button>
      ))}
      <button
        onClick={() => onPick(holeNumber, { partnerId: null })}
        className={`px-3 py-1.5 min-h-[44px] rounded-lg text-sm font-semibold transition-colors ${
          decision && decision.partnerId === null && !decision.blind
            ? 'bg-brass text-navy'
            : 'bg-white dark:bg-gray-700 border border-brass/40 text-amber-700 dark:text-brass'
        }`}
      >
        Lone Wolf
      </button>
      {allowBlind && config.blindWolf && (
        <button
          onClick={() => onPick(holeNumber, { partnerId: null, blind: true })}
          className={`px-3 py-1.5 min-h-[44px] rounded-lg text-sm font-semibold transition-colors ${
            decision && decision.partnerId === null && decision.blind
              ? 'bg-brass text-navy'
              : 'bg-white dark:bg-gray-700 border border-brass/40 text-amber-700 dark:text-brass'
          }`}
        >
          Blind Wolf (3×)
        </button>
      )}
    </div>
  )

  if (hasScores && decision) {
    return shell(
      <>
        <p className="font-bold text-gray-800 dark:text-gray-100 text-sm">Wolf: {wolf.name}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">Locked — scoring has started.</p>
        {summary && <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">{summary}</p>}
      </>,
    )
  }

  if (hasScores && !decision) {
    return shell(
      <>
        <p className="font-bold text-gray-800 dark:text-gray-100 text-sm">Who did {wolf.name} pick?</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Scores are in but no pick was recorded. The scores are kept — record the pick and the hole settles as normal.
        </p>
        {canRecordLatePick
          ? pickButtons(false)
          : <p className="text-xs text-amber-700 dark:text-brass">Waiting on the organiser or scorekeeper to record {wolf.name}&apos;s pick.</p>}
      </>,
    )
  }

  return shell(
    <>
      <p className="font-bold text-gray-800 dark:text-gray-100 text-sm">Wolf: {wolf.name}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {config.blindWolf
          ? 'Blind Wolf before anyone tees off, or pick a partner after the tee shots, or go Lone Wolf:'
          : 'Pick a partner after tee shots, or go Lone Wolf:'}
      </p>
      {pickButtons(true)}
      {summary && <p className="text-xs text-gray-500 dark:text-gray-400">{summary}</p>}
    </>,
  )
}

/** The per-hole outcome line under the scores. */
export function WolfHoleOutcome({
  players, config, result, holeScores, holeNumber,
}: {
  players: Player[]
  config: WolfConfig
  result: WolfResult
  holeScores: HoleScore[]
  holeNumber: number
}) {
  const hr = result.holeResults.find(h => h.holeNumber === holeNumber)
  if (!hr) return null
  const wolfName = players.find(p => p.id === hr.wolfId)?.name ?? 'The wolf'
  const allScored = players.length > 0 && players.every(p => holeScores.some(s => s.playerId === p.id && s.holeNumber === holeNumber))
  const decided = config.holeDecisions?.[holeNumber] !== undefined

  // Scores but no pick: the hole is waiting, not forfeited (Finding 4).
  if (hr.unresolved || (allScored && !decided)) {
    return (
      <div key={`wolf-np-${holeNumber}`} className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl px-4 py-3 text-center shadow-sm">
        <p className="font-semibold text-amber-800 dark:text-amber-300">
          Hole {holeNumber} is waiting on {wolfName}&apos;s pick — the scores are kept.
        </p>
      </div>
    )
  }
  if (hr.tied) {
    return (
      <div key={`wolf-tie-${holeNumber}`} className="bg-navy dark:bg-gray-800 border border-brass/40 rounded-2xl px-4 py-3 text-center shadow-sm motion-safe:animate-[brass-flash_0.45s_ease-out]">
        <p className="font-bold text-cream dark:text-gray-200">
          {config.carryHalved
            ? `Hole halved — ${hr.carriedIn + 1} unit${hr.carriedIn + 1 === 1 ? '' : 's'} carr${hr.carriedIn + 1 === 1 ? 'ies' : 'y'} to the next hole`
            : 'Hole halved — no units change hands'}
        </p>
      </div>
    )
  }
  if (hr.wolfTeamWon === null) return null // still waiting on scores
  const partnerName = hr.partnerId ? (players.find(p => p.id === hr.partnerId)?.name ?? '?') : null
  const team = hr.blind ? `${wolfName} (blind wolf, 3×)`
    : hr.loneWolf ? `${wolfName} (lone wolf)`
    : `${wolfName} + ${partnerName}`
  const stake = hr.units > 1 ? ` · ${hr.units} units each` : ''
  return (
    <div key={`wolf-${holeNumber}`} className="bg-navy dark:bg-gray-800 border border-brass/40 rounded-2xl px-4 py-3 text-center shadow-sm motion-safe:animate-[brass-flash_0.45s_ease-out]">
      <p className="font-bold text-brass">{team} {hr.wolfTeamWon ? 'wins the hole' : 'loses the hole'}{stake}</p>
    </div>
  )
}
