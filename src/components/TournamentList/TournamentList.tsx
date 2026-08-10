import { useEffect, useState } from 'react'
import { supabase, rowToTournament } from '../../lib/supabase'
import type { Tournament } from '../../types'

interface Props {
  userId: string
  onBack: () => void
  onViewTournament: (id: string) => void
  onNewTournament: () => void
}

const FORMAT_LABELS: Record<string, string> = {
  match_play_single: 'Match Play (Single Elim)',
  match_play_double: 'Match Play (Double Elim)',
  stroke_play: 'Stroke Play',
}

export function TournamentList({ userId, onBack, onViewTournament, onNewTournament }: Props) {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('tournaments')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) { setFetchError('Failed to load tournaments'); setLoading(false); return }
        if (data) setTournaments(data.map(rowToTournament))
        setLoading(false)
      })
  }, [userId])

  const active = tournaments.filter(t => t.status !== 'complete')
  const completed = tournaments.filter(t => t.status === 'complete')

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      <header className="app-header text-white px-4 py-4 sticky top-0 z-10 shadow-xl">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-gray-600 text-xl" aria-label="Back">←</button>
            <div>
              <h1 className="text-xl font-bold">Tournaments</h1>
              <p className="text-gray-300 text-sm mt-0.5">{tournaments.length} tournament{tournaments.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button
            onClick={onNewTournament}
            className="px-4 py-2 bg-gold-400 text-gray-900 dark:text-gray-100 font-bold rounded-xl text-sm active:bg-gold-500"
          >
            + New
          </button>
        </div>
      </header>

      <div className="px-4 py-5 max-w-2xl mx-auto space-y-4">
        {loading && <p className="text-center text-gray-400 py-8">Loading…</p>}
        {fetchError && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl px-4 py-3 text-center">
            <p className="text-red-700 dark:text-red-400 text-sm font-medium">{fetchError}</p>
          </div>
        )}

        {!loading && tournaments.length === 0 && (
          <div className="text-center py-12 space-y-3">
            <p className="text-4xl">🏆</p>
            <p className="text-gray-600 dark:text-gray-400 font-semibold">No tournaments yet</p>
            <p className="text-gray-400 text-sm">Create a tournament to get started</p>
          </div>
        )}

        {active.length > 0 && (
          <section className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Active</p>
            {active.map(t => (
              <button
                key={t.id}
                onClick={() => onViewTournament(t.id)}
                className="w-full bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 text-left active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center justify-between">
                  <p className="font-bold text-gray-800 dark:text-gray-100">{t.name}</p>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-300">
                    {t.status === 'setup' ? 'Setup' : 'Active'}
                  </span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {FORMAT_LABELS[t.format] ?? t.format} · {t.playerIds.length} players
                </p>
              </button>
            ))}
          </section>
        )}

        {completed.length > 0 && (
          <section className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Completed</p>
            {completed.map(t => (
              <button
                key={t.id}
                onClick={() => onViewTournament(t.id)}
                className="w-full bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 text-left active:scale-[0.98] transition-transform opacity-80"
              >
                <p className="font-bold text-gray-800 dark:text-gray-100">{t.name}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {FORMAT_LABELS[t.format] ?? t.format} · {t.playerIds.length} players
                </p>
              </button>
            ))}
          </section>
        )}
      </div>

      <div className="fixed bottom-0 inset-x-0 p-4 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-t border-gray-200 dark:border-gray-700 safe-bottom">
        <div className="max-w-2xl mx-auto">
          <button onClick={onBack} className="w-full h-14 border-2 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 font-semibold rounded-2xl active:bg-gray-50 dark:active:bg-gray-700">← Back</button>
        </div>
      </div>
    </div>
  )
}
