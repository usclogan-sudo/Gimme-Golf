import { useEffect, useState } from 'react'
import { supabase, rowToTournament, rowToTournamentMatchup } from '../../lib/supabase'
import { advanceBracket, calculateStrokePlayStandings } from '../../lib/tournamentLogic'
import { TournamentBracket } from '../TournamentBracket/TournamentBracket'
import { ConfirmModal } from '../ConfirmModal'
import type { Tournament, TournamentMatchup, Player } from '../../types'

interface Props {
  userId: string
  tournamentId: string
  onBack: () => void
  onStartRound: (tournamentId: string, matchupId?: string) => void
}

const FORMAT_LABELS: Record<string, string> = {
  match_play_single: 'Match Play (Single Elim)',
  match_play_double: 'Match Play (Double Elim)',
  stroke_play: 'Stroke Play',
}

export function TournamentDetail({ tournamentId, onBack, onStartRound }: Props) {
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [matchups, setMatchups] = useState<TournamentMatchup[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [roundScores, setRoundScores] = useState<{ roundNumber: number; playerId: string; totalGross: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('tournaments').select('*').eq('id', tournamentId).single(),
      supabase.from('tournament_matchups').select('*').eq('tournament_id', tournamentId),
      supabase.from('players').select('*'),
    ]).then(([tRes, mRes, pRes]) => {
      if (tRes.data) setTournament(rowToTournament(tRes.data))
      if (mRes.data) setMatchups(mRes.data.map(rowToTournamentMatchup))
      if (pRes.data) {
        setPlayers(pRes.data.map((r: any) => ({
          id: r.id,
          name: r.name,
          ghinNumber: r.ghin_number ?? '',
          handicapIndex: r.handicap_index ?? 0,
          tee: r.tee ?? 'White',
        })))
      }
      setLoading(false)
    })
  }, [tournamentId])

  // For stroke play, fetch round scores from tournament_rounds
  useEffect(() => {
    if (!tournament || tournament.format !== 'stroke_play') return
    supabase.from('tournament_rounds').select('*').eq('tournament_id', tournamentId)
      .then(({ data: trData }) => {
        if (!trData || trData.length === 0) return
        const roundIds = trData.filter((tr: any) => tr.round_id).map((tr: any) => tr.round_id)
        if (roundIds.length === 0) return
        supabase.from('hole_scores').select('*').in('round_id', roundIds)
          .then(({ data: hsData }) => {
            if (!hsData) return
            const scores: { roundNumber: number; playerId: string; totalGross: number }[] = []
            for (const tr of trData) {
              if (!tr.round_id) continue
              const roundHs = hsData.filter((hs: any) => hs.round_id === tr.round_id)
              const byPlayer = new Map<string, number>()
              for (const hs of roundHs) {
                byPlayer.set(hs.player_id, (byPlayer.get(hs.player_id) ?? 0) + hs.gross_score)
              }
              for (const [playerId, total] of byPlayer) {
                scores.push({ roundNumber: tr.round_number, playerId, totalGross: total })
              }
            }
            setRoundScores(scores)
          })
      })
  }, [tournament, tournamentId])

  const playerName = (id?: string) => id ? (players.find(p => p.id === id)?.name ?? 'Unknown') : 'TBD'

  const handleResolveMatch = async (matchupId: string, winnerId: string) => {
    const match = matchups.find(m => m.id === matchupId)
    if (!match) return

    const updated = advanceBracket(matchups, matchupId, winnerId)
    setMatchups(updated)

    // Persist: update resolved match
    await supabase.from('tournament_matchups').update({
      winner_id: winnerId,
      status: 'complete',
    }).eq('id', matchupId)

    // Persist: update next round match if player was advanced
    for (const m of updated) {
      const orig = matchups.find(o => o.id === m.id)
      if (orig && (orig.playerAId !== m.playerAId || orig.playerBId !== m.playerBId)) {
        await supabase.from('tournament_matchups').update({
          player_a_id: m.playerAId ?? null,
          player_b_id: m.playerBId ?? null,
        }).eq('id', m.id)
      }
    }

    // Check if tournament is complete (finals resolved)
    const winnersMatches = updated.filter(m => !m.loserBracket)
    const allComplete = winnersMatches.every(m => m.status === 'complete')
    if (allComplete && tournament) {
      await supabase.from('tournaments').update({ status: 'complete' }).eq('id', tournamentId)
      setTournament({ ...tournament, status: 'complete' })
    }
  }

  if (loading || !tournament) {
    return <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center"><p className="text-gray-400">Loading…</p></div>
  }

  const isMatchPlay = tournament.format !== 'stroke_play'
  const isComplete = tournament.status === 'complete'

  // Find tournament winner for match play
  const winnersMatches = matchups.filter(m => !m.loserBracket)
  const finalMatch = winnersMatches.reduce<TournamentMatchup | null>((best, m) => !best || m.bracketRound > best.bracketRound ? m : best, null)
  const tournamentWinner = finalMatch?.winnerId

  // Stroke play standings
  const standings = tournament.format === 'stroke_play'
    ? calculateStrokePlayStandings(tournament.playerIds, roundScores)
    : null

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      <header className="app-header text-white px-4 py-5 sticky top-0 z-10 shadow-xl">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold">{tournament.name}</h1>
          <p className="text-gray-300 text-sm mt-0.5">
            {FORMAT_LABELS[tournament.format]} · {tournament.playerIds.length} players
            {isComplete && ' · Complete'}
          </p>
        </div>
      </header>

      <div className="px-4 py-5 max-w-2xl mx-auto space-y-4">
        {/* Winner banner */}
        {isComplete && tournamentWinner && (
          <div className="bg-gradient-to-r from-amber-400 to-yellow-300 rounded-2xl p-4 text-center">
            <p className="text-3xl mb-1">🏆</p>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{playerName(tournamentWinner)}</p>
            <p className="text-sm text-amber-900">Tournament Champion!</p>
          </div>
        )}

        {/* Match Play Bracket */}
        {isMatchPlay && matchups.length > 0 && (
          <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Bracket</p>
            <TournamentBracket
              matchups={matchups}
              players={players}
              onStartMatch={!isComplete ? (m) => onStartRound(tournamentId, m.id) : undefined}
            />
          </section>
        )}

        {/* Pending matches that need results */}
        {isMatchPlay && !isComplete && (() => {
          const pendingComplete = matchups.filter(m => !m.loserBracket && m.status === 'pending' && m.playerAId && m.playerBId)
          if (pendingComplete.length === 0) return null
          return (
            <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 space-y-3">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Record Results</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Tap a player to declare them the winner</p>
              {pendingComplete.map(m => (
                <div key={m.id} className="bg-gray-50 dark:bg-gray-700 rounded-xl p-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Round {m.bracketRound} · Match {m.matchNumber}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmModal({
                        title: 'Confirm Winner',
                        message: `Declare ${playerName(m.playerAId)} as the winner?`,
                        onConfirm: () => { handleResolveMatch(m.id, m.playerAId!); setConfirmModal(null) },
                      })}
                      className="flex-1 py-3 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 font-semibold text-sm active:bg-blue-100"
                    >
                      {playerName(m.playerAId)}
                    </button>
                    <span className="self-center text-xs text-gray-400">vs</span>
                    <button
                      onClick={() => setConfirmModal({
                        title: 'Confirm Winner',
                        message: `Declare ${playerName(m.playerBId)} as the winner?`,
                        onConfirm: () => { handleResolveMatch(m.id, m.playerBId!); setConfirmModal(null) },
                      })}
                      className="flex-1 py-3 rounded-xl bg-orange-50 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 font-semibold text-sm active:bg-orange-100"
                    >
                      {playerName(m.playerBId)}
                    </button>
                  </div>
                </div>
              ))}
            </section>
          )
        })()}

        {/* Stroke Play Standings */}
        {standings && (
          <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Standings</p>
            {standings.length === 0 || roundScores.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">No rounds completed yet</p>
            ) : (
              <div className="space-y-2">
                {standings.map((s, i) => (
                  <div key={s.playerId} className={`flex items-center justify-between p-3 rounded-xl ${i === 0 ? 'bg-green-50 dark:bg-green-900/30' : 'bg-gray-50 dark:bg-gray-700'}`}>
                    <div className="flex items-center gap-2">
                      <span className="w-6 text-center text-xs font-bold text-gray-400">{i + 1}</span>
                      <span className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{playerName(s.playerId)}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-gray-800 dark:text-gray-100">{s.totalGross}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">({s.roundsPlayed}R)</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!isComplete && (
              <button
                onClick={() => onStartRound(tournamentId)}
                className="w-full py-3 rounded-xl bg-forest-600 text-white font-semibold text-sm active:bg-forest-700"
              >
                Start Next Round
              </button>
            )}
          </section>
        )}

        {/* Players */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Players ({tournament.playerIds.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {tournament.playerIds.map(id => (
              <span key={id} className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                {playerName(id)}
              </span>
            ))}
          </div>
        </section>

        {/* Config */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Config</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-2 text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400">Handicap</p>
              <p className="font-semibold text-gray-800 dark:text-gray-100 capitalize">{tournament.config?.handicapMode ?? 'net'}</p>
            </div>
            {tournament.config?.buyInCents && (
              <div className="bg-gray-50 dark:bg-gray-700 rounded-xl p-2 text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400">Buy-in</p>
                <p className="font-semibold text-gray-800 dark:text-gray-100">${(tournament.config.buyInCents / 100).toFixed(0)}</p>
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="fixed bottom-0 inset-x-0 p-4 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-t border-gray-200 dark:border-gray-700 safe-bottom">
        <div className="max-w-2xl mx-auto">
          <button onClick={onBack} className="w-full h-14 border-2 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 font-semibold rounded-2xl active:bg-gray-50 dark:active:bg-gray-700">← Back</button>
        </div>
      </div>

      {confirmModal && (
        <ConfirmModal
          open={true}
          title={confirmModal.title}
          message={confirmModal.message}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}
    </div>
  )
}
