import { useEffect, useState } from 'react'
import { supabase, rowToRound, rowToUserProfile, rowToPinnedFriend, rowToSettlementRecord } from '../../lib/supabase'
import { venmoProfileLink, cashAppProfileLink, zelleLink, paypalLink, fmtHandicap, fmtAmount } from '../../lib/gameLogic'
import { PaymentButtons } from '../PaymentButtons'
import { UserAvatar } from '../AvatarPicker'
import type { Round, Player, UserProfile, PinnedFriend, SettlementRecord } from '../../types'

interface Props {
  userId: string
  onBack?: () => void
  /** Rendered inline as the Group tab's content — hides its own header (§3). */
  embedded?: boolean
}

interface PlayerEntry {
  id: string
  name: string
  handicapIndex: number
  roundsPlayed: number
  sharedRounds: number  // rounds played WITH the current user
  lastPlayed: Date | null
  isRegistered: boolean
  avatarPreset?: string
  avatarUrl?: string
  venmoUsername?: string
  zelleIdentifier?: string
  cashAppUsername?: string
  paypalEmail?: string
  /** Outstanding unsettled balance vs the current user: >0 they owe you, <0 you owe (§7). */
  netCents: number
}

export function PlayerDirectory({ userId, onBack, embedded }: Props) {
  const [players, setPlayers] = useState<PlayerEntry[]>([])
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadData()
  }, [userId])

  const loadData = async () => {
    const [roundsRes, profilesRes, pinsRes, partRes] = await Promise.all([
      supabase.from('rounds').select('*').in('status', ['complete', 'active']),
      supabase.from('user_profiles').select('*').not('display_name', 'is', null),
      supabase.from('pinned_friends').select('*').eq('user_id', userId),
      supabase.from('round_participants').select('player_id').eq('user_id', userId).eq('status', 'accepted'),
    ])

    const rounds: Round[] = (roundsRes.data ?? []).map(rowToRound)

    // Outstanding balance vs each opponent — same math as the Ledger, folded into
    // the roster so Players IS the balance sheet (§7). Scoped to the user's rounds.
    const roundIds = rounds.map(r => r.id)
    let settlements: SettlementRecord[] = []
    if (roundIds.length > 0) {
      const { data } = await supabase.from('settlements').select('*').in('round_id', roundIds)
      settlements = (data ?? []).map(rowToSettlementRecord)
    }
    const userPlayerIds = new Set<string>([userId])
    for (const p of (partRes.data ?? [])) userPlayerIds.add(p.player_id)
    const roundIdSet = new Set(roundIds)
    const netByOpponent = new Map<string, number>()
    for (const s of settlements) {
      if (!roundIdSet.has(s.roundId)) continue
      const isFrom = userPlayerIds.has(s.fromPlayerId)
      const isTo = userPlayerIds.has(s.toPlayerId)
      if (isFrom === isTo) continue // not a settlement between the user and someone else
      const oppId = isFrom ? s.toPlayerId : s.fromPlayerId
      const amount = s.status === 'paid' ? 0 : (isTo ? 1 : -1) * s.amountCents
      netByOpponent.set(oppId, (netByOpponent.get(oppId) ?? 0) + amount)
    }
    const profiles: UserProfile[] = (profilesRes.data ?? []).map(rowToUserProfile)
    const pins: PinnedFriend[] = (pinsRes.data ?? []).map(rowToPinnedFriend)

    setPinnedIds(new Set(pins.map(p => p.friendUserId)))

    // Build profile lookup
    const profileMap = new Map<string, UserProfile>()
    for (const p of profiles) profileMap.set(p.userId, p)

    const playerMap = new Map<string, PlayerEntry>()

    for (const round of rounds) {
      const roundPlayers: Player[] = round.players ?? []
      const userInRound = roundPlayers.some(p => p.id === userId)

      for (const p of roundPlayers) {
        const existing = playerMap.get(p.id)
        const roundDate = new Date(round.date)
        const prof = profileMap.get(p.id)

        if (existing) {
          existing.roundsPlayed++
          if (userInRound && p.id !== userId) existing.sharedRounds++
          if (!existing.lastPlayed || roundDate > existing.lastPlayed) existing.lastPlayed = roundDate
          existing.handicapIndex = p.handicapIndex
          if (prof) {
            existing.isRegistered = true
            existing.avatarPreset = prof.avatarPreset
            existing.avatarUrl = prof.avatarUrl
            existing.venmoUsername = prof.venmoUsername
            existing.zelleIdentifier = prof.zelleIdentifier
            existing.cashAppUsername = prof.cashAppUsername
            existing.paypalEmail = prof.paypalEmail
          }
        } else {
          playerMap.set(p.id, {
            id: p.id,
            name: prof?.displayName ?? p.name,
            handicapIndex: p.handicapIndex,
            roundsPlayed: 1,
            sharedRounds: userInRound && p.id !== userId ? 1 : 0,
            lastPlayed: roundDate,
            isRegistered: !!prof,
            avatarPreset: prof?.avatarPreset,
            avatarUrl: prof?.avatarUrl,
            venmoUsername: prof?.venmoUsername,
            zelleIdentifier: prof?.zelleIdentifier,
            cashAppUsername: prof?.cashAppUsername,
            paypalEmail: prof?.paypalEmail,
            netCents: netByOpponent.get(p.id) ?? 0,
          })
        }
      }
    }

    // Also add registered profiles not in any round
    for (const prof of profiles) {
      if (!playerMap.has(prof.userId) && prof.userId !== userId) {
        playerMap.set(prof.userId, {
          id: prof.userId,
          name: prof.displayName ?? 'Unknown',
          handicapIndex: prof.handicapIndex ?? 0,
          roundsPlayed: 0,
          sharedRounds: 0,
          lastPlayed: null,
          isRegistered: true,
          avatarPreset: prof.avatarPreset,
          avatarUrl: prof.avatarUrl,
          venmoUsername: prof.venmoUsername,
          zelleIdentifier: prof.zelleIdentifier,
          cashAppUsername: prof.cashAppUsername,
          paypalEmail: prof.paypalEmail,
          netCents: netByOpponent.get(prof.userId) ?? 0,
        })
      }
    }

    // Remove current user
    playerMap.delete(userId)

    const arr = Array.from(playerMap.values())
    arr.sort((a, b) => {
      if (a.lastPlayed && b.lastPlayed) return b.lastPlayed.getTime() - a.lastPlayed.getTime()
      if (a.lastPlayed) return -1
      if (b.lastPlayed) return 1
      return a.name.localeCompare(b.name)
    })
    setPlayers(arr)
    setLoading(false)
  }

  const togglePin = async (playerId: string) => {
    const isPinned = pinnedIds.has(playerId)
    if (isPinned) {
      setPinnedIds(prev => { const next = new Set(prev); next.delete(playerId); return next })
      await supabase.from('pinned_friends').delete().eq('user_id', userId).eq('friend_user_id', playerId)
    } else {
      setPinnedIds(prev => new Set(prev).add(playerId))
      await supabase.from('pinned_friends').insert({ user_id: userId, friend_user_id: playerId })
    }
  }

  const filtered = search.trim()
    ? players.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    : players

  const pinned = filtered.filter(p => pinnedIds.has(p.id))
  const frequent = filtered
    .filter(p => !pinnedIds.has(p.id) && p.sharedRounds >= 2)
    .sort((a, b) => b.sharedRounds - a.sharedRounds)
    .slice(0, 5)
  const registered = filtered.filter(p => !pinnedIds.has(p.id) && !frequent.includes(p) && p.isRegistered)
  const guests = filtered.filter(p => !pinnedIds.has(p.id) && !frequent.includes(p) && !p.isRegistered)

  return (
    <div className={embedded ? '' : 'min-h-screen bg-gray-50 dark:bg-gray-900 pb-8'}>
      {!embedded && (
        <header className="app-header text-white px-4 py-4 sticky top-0 z-10 shadow-xl flex items-center gap-3">
          <button onClick={onBack} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-gray-800 text-xl" aria-label="Back">←</button>
          <h1 className="text-xl font-bold">Players</h1>
          <span className="text-sm text-gray-300 ml-auto">{players.length} total</span>
        </header>
      )}

      <div className={embedded ? 'space-y-4' : 'px-4 py-5 max-w-2xl mx-auto space-y-4'}>
        <input
          type="text"
          placeholder="Search players..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full h-12 px-4 rounded-xl border border-gray-300 text-base focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
        />

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">🏌️</p>
            <p className="text-gray-500 font-medium">{search ? 'No players found' : 'No players yet'}</p>
            <p className="text-gray-400 text-sm mt-1">{search ? 'Try a different search' : 'Players appear after your first round'}</p>
          </div>
        ) : (
          <>
            {pinned.length > 0 && (
              <Section title="Pinned Friends" icon="⭐">
                {pinned.map(p => <PlayerCard key={p.id} player={p} isPinned onTogglePin={() => togglePin(p.id)} />)}
              </Section>
            )}

            {frequent.length > 0 && (
              <Section title="Frequently Played">
                {frequent.map(p => <PlayerCard key={p.id} player={p} isPinned={false} onTogglePin={() => togglePin(p.id)} />)}
              </Section>
            )}

            {registered.length > 0 && (
              <Section title="Registered Players">
                {registered.map(p => <PlayerCard key={p.id} player={p} isPinned={false} onTogglePin={() => togglePin(p.id)} />)}
              </Section>
            )}

            {guests.length > 0 && (
              <Section title="All Players">
                {guests.map(p => <PlayerCard key={p.id} player={p} isPinned={false} onTogglePin={() => togglePin(p.id)} />)}
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
        {icon && <span>{icon}</span>}{title}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function PlayerCard({ player, isPinned, onTogglePin }: { player: PlayerEntry; isPinned: boolean; onTogglePin: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const hasPayment = player.venmoUsername || player.zelleIdentifier || player.cashAppUsername || player.paypalEmail
  const net = player.netCents
  const owe = net < 0     // you owe them
  const owed = net > 0    // they owe you
  const amtStr = fmtAmount(Math.abs(net), 'points')

  const shareMsg = async (msg: string) => {
    if (navigator.share) { try { await navigator.share({ text: msg }) } catch { /* cancelled */ } }
    else { try { await navigator.clipboard.writeText(msg) } catch { /* ignore */ } }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
      <div
        onClick={() => { if (net !== 0) setExpanded(v => !v) }}
        className={`p-4 flex items-center gap-3 ${net !== 0 ? 'cursor-pointer active:bg-gray-50 dark:active:bg-gray-700/40' : ''}`}
      >
        <UserAvatar url={player.avatarUrl} preset={player.avatarPreset} name={player.name} size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{player.name}</p>
            {!player.isRegistered && (
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300">Guest</span>
            )}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            HCP {fmtHandicap(player.handicapIndex)} · {player.roundsPlayed} round{player.roundsPlayed !== 1 ? 's' : ''}
            {owe && !hasPayment && <span className="text-amber-600 dark:text-amber-400"> · no handle</span>}
          </p>
          {hasPayment && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {player.venmoUsername && (
                <a href={venmoProfileLink(player.venmoUsername)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                  className="text-[11px] font-semibold px-2 py-0.5 rounded-full border border-navy/25 text-navy dark:text-cream dark:border-cream/25 active:bg-navy/5">Venmo</a>
              )}
              {player.zelleIdentifier && (
                <a href={zelleLink(player.zelleIdentifier)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                  className="text-[11px] font-semibold px-2 py-0.5 rounded-full border border-navy/25 text-navy dark:text-cream dark:border-cream/25 active:bg-navy/5">Zelle</a>
              )}
              {player.cashAppUsername && (
                <a href={cashAppProfileLink(player.cashAppUsername)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                  className="text-[11px] font-semibold px-2 py-0.5 rounded-full border border-navy/25 text-navy dark:text-cream dark:border-cream/25 active:bg-navy/5">Cash App</a>
              )}
              {player.paypalEmail && (
                <a href={paypalLink(player.paypalEmail, 0)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                  className="text-[11px] font-semibold px-2 py-0.5 rounded-full border border-navy/25 text-navy dark:text-cream dark:border-cream/25 active:bg-navy/5">PayPal</a>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {net !== 0 && (
            <div className="text-right">
              <p className={`font-bold font-display ${owed ? 'text-amber-600 dark:text-brass' : 'text-gray-700 dark:text-gray-200'}`}>
                {owed ? '+' : '−'}{amtStr}
              </p>
              <p className="text-[11px] text-gray-400">{owed ? 'they owe you' : 'you owe'}</p>
            </div>
          )}
          <button
            onClick={e => { e.stopPropagation(); onTogglePin() }}
            className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
              isPinned ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'
            }`}
            aria-label={isPinned ? 'Unpin' : 'Pin'}
          >
            {isPinned ? '★' : '☆'}
          </button>
        </div>
      </div>

      {/* Settle from the roster — pay if you owe & they have a handle, ask for the
          handle if they don't, or nudge if they owe you (§7). */}
      {expanded && net !== 0 && (
        <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3 space-y-2">
          {owe ? (
            hasPayment ? (
              <>
                <p className="text-xs text-gray-500 dark:text-gray-400">Pay {player.name} {amtStr}</p>
                <PaymentButtons
                  toPlayer={{ id: player.id, name: player.name, handicapIndex: player.handicapIndex, tee: 'White', ghinNumber: '', venmoUsername: player.venmoUsername, zelleIdentifier: player.zelleIdentifier, cashAppUsername: player.cashAppUsername, paypalEmail: player.paypalEmail } as Player}
                  amountCents={Math.abs(net) * 100}
                  note="Golf settle-up"
                />
              </>
            ) : (
              <button
                onClick={() => shareMsg(`Hey ${player.name}! What's your Venmo or Zelle so I can settle up ${amtStr} from our round? (via Gimme)`)}
                className="w-full h-11 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-semibold rounded-xl active:bg-gray-50 dark:active:bg-gray-700"
              >
                Ask {player.name} for their handle
              </button>
            )
          ) : (
            <button
              onClick={() => shareMsg(`Hey ${player.name}! You've got ${amtStr} outstanding from our round — settle up when you can. (via Gimme)`)}
              className="w-full h-11 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-semibold rounded-xl active:bg-gray-50 dark:active:bg-gray-700"
            >
              Remind {player.name}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
