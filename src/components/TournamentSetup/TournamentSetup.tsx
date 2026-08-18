import { useEffect, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { supabase, rowToCourse, tournamentToRow, tournamentMatchupToRow } from '../../lib/supabase'
import { safeWrite } from '../../lib/safeWrite'
import { generateBracket } from '../../lib/tournamentLogic'
import { parseDollarsToCents } from '../../lib/money'
import { fmtHandicap } from '../../lib/gameLogic'
import type { Course, Tournament, TournamentFormat, Player } from '../../types'

interface Props {
  userId: string
  onCreated: (tournamentId: string) => void
  onCancel: () => void
}

type Step = 'basics' | 'players' | 'config' | 'confirm'

const FORMAT_OPTIONS: { value: TournamentFormat; label: string; desc: string }[] = [
  { value: 'match_play_single', label: 'Match Play (Single Elim)', desc: 'Lose once, you\'re out' },
  { value: 'match_play_double', label: 'Match Play (Double Elim)', desc: 'Two losses to eliminate' },
  { value: 'stroke_play', label: 'Stroke Play', desc: 'Total strokes across rounds' },
]

export function TournamentSetup({ userId, onCreated, onCancel }: Props) {
  const [step, setStep] = useState<Step>('basics')
  const [name, setName] = useState('')
  const [format, setFormat] = useState<TournamentFormat>('match_play_single')
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([])
  const [handicapMode, setHandicapMode] = useState<'gross' | 'net'>('net')
  const [roundsCount, setRoundsCount] = useState(4)
  const [buyInAmount, setBuyInAmount] = useState('20')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('courses').select('*'),
      supabase.from('players').select('*'),
    ]).then(([courseRes, playerRes]) => {
      if (courseRes.data) setCourses(courseRes.data.map(rowToCourse))
      if (playerRes.data) {
        setPlayers(playerRes.data.map((r: any) => ({
          id: r.id,
          name: r.name,
          ghinNumber: r.ghin_number ?? '',
          handicapIndex: r.handicap_index ?? 0,
          tee: r.tee ?? 'White',
        })))
      }
    })
  }, [])

  const togglePlayer = (id: string) => {
    setSelectedPlayerIds(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])
  }

  const create = async () => {
    if (creating) return
    setCreating(true)

    const selectedCourse = courses.find(c => c.id === selectedCourseId)
    const courseSnapshot = selectedCourse ? {
      courseId: selectedCourse.id,
      courseName: selectedCourse.name,
      tees: selectedCourse.tees,
      holes: selectedCourse.holes,
    } : undefined

    const tournament: Tournament = {
      id: uuidv4(),
      name: name.trim(),
      format,
      status: 'active',
      courseId: selectedCourseId ?? undefined,
      courseSnapshot,
      playerIds: selectedPlayerIds,
      config: {
        handicapMode,
        roundsCount: format === 'stroke_play' ? roundsCount : undefined,
        buyInCents: parseDollarsToCents(buyInAmount) || 2000,
      },
      createdAt: new Date(),
    }

    await safeWrite(supabase.from('tournaments').insert(tournamentToRow(tournament, userId)), 'insert tournament')

    // For match play, generate bracket
    if (format !== 'stroke_play') {
      const matchups = generateBracket(selectedPlayerIds, tournament.id, format)
      if (matchups.length > 0) {
        await safeWrite(supabase.from('tournament_matchups').insert(
          matchups.map(m => tournamentMatchupToRow(m, userId))
        ), 'insert tournament matchups')
      }
    }

    setCreating(false)
    onCreated(tournament.id)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      <header className="app-header text-white px-4 py-5 sticky top-0 z-10 shadow-xl">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold">New Tournament 🏆</h1>
          <p className="text-gray-300 text-sm mt-0.5">
            {step === 'basics' && 'Name & Format'}
            {step === 'players' && 'Select Players'}
            {step === 'config' && 'Configuration'}
            {step === 'confirm' && 'Review & Create'}
          </p>
        </div>
      </header>

      <div className="px-4 py-5 max-w-2xl mx-auto space-y-4">
        {step === 'basics' && (
          <>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Tournament Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Spring Championship 2026"
                  className="w-full mt-1 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-xl px-4 py-3 text-sm"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Format</label>
                <div className="mt-2 space-y-2">
                  {FORMAT_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setFormat(opt.value)}
                      className={`w-full p-3 rounded-xl text-left transition-colors ${
                        format === opt.value
                          ? 'bg-forest-600 text-white'
                          : 'bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      <p className="font-semibold text-sm">{opt.label}</p>
                      <p className={`text-xs mt-0.5 ${format === opt.value ? 'text-green-200' : 'text-gray-500 dark:text-gray-400'}`}>{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Course (optional)</label>
                <select
                  value={selectedCourseId ?? ''}
                  onChange={e => setSelectedCourseId(e.target.value || null)}
                  className="w-full mt-1 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-xl px-4 py-3 text-sm"
                >
                  <option value="">No fixed course</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
          </>
        )}

        {step === 'players' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Select Players ({selectedPlayerIds.length} selected)
            </p>
            {players.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">No players found. Add players from the home screen first.</p>
            ) : (
              <div className="space-y-2">
                {players.map(p => {
                  const selected = selectedPlayerIds.includes(p.id)
                  return (
                    <button
                      key={p.id}
                      onClick={() => togglePlayer(p.id)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl transition-colors ${
                        selected
                          ? 'bg-forest-100 dark:bg-forest-900 border-2 border-forest-500'
                          : 'bg-gray-50 dark:bg-gray-700 border-2 border-transparent'
                      }`}
                    >
                      <div className="text-left">
                        <p className={`font-semibold text-sm ${selected ? 'text-forest-800 dark:text-forest-300' : 'text-gray-800 dark:text-gray-200'}`}>{p.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">HCP {fmtHandicap(p.handicapIndex)}</p>
                      </div>
                      <span className={`text-lg ${selected ? 'text-forest-600' : 'text-gray-300 dark:text-gray-600'}`}>
                        {selected ? '✓' : '○'}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {step === 'config' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Handicap Mode</label>
              <div className="mt-2 flex gap-2">
                {(['gross', 'net'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setHandicapMode(mode)}
                    className={`flex-1 py-3 rounded-xl font-semibold text-sm ${
                      handicapMode === mode ? 'bg-forest-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {mode === 'gross' ? 'Gross' : 'Net'}
                  </button>
                ))}
              </div>
            </div>

            {format === 'stroke_play' && (
              <div>
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Number of Rounds</label>
                <div className="mt-2 flex gap-2">
                  {[2, 3, 4].map(n => (
                    <button
                      key={n}
                      onClick={() => setRoundsCount(n)}
                      className={`flex-1 py-3 rounded-xl font-semibold text-sm ${
                        roundsCount === n ? 'bg-forest-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {n} rounds
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Buy-In (optional)</label>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-gray-500 dark:text-gray-400">pts</span>
                <input
                  type="number"
                  value={buyInAmount}
                  onChange={e => setBuyInAmount(e.target.value)}
                  min="0"
                  step="5"
                  className="w-24 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-xl px-4 py-3 text-sm"
                />
              </div>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Review</p>
            <div className="space-y-2">
              <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                <span className="text-sm text-gray-500 dark:text-gray-400">Name</span>
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{name}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                <span className="text-sm text-gray-500 dark:text-gray-400">Format</span>
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                  {FORMAT_OPTIONS.find(o => o.value === format)?.label}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                <span className="text-sm text-gray-500 dark:text-gray-400">Players</span>
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{selectedPlayerIds.length}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                <span className="text-sm text-gray-500 dark:text-gray-400">Handicap</span>
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 capitalize">{handicapMode}</span>
              </div>
              {format === 'stroke_play' && (
                <div className="flex justify-between py-2 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Rounds</span>
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{roundsCount}</span>
                </div>
              )}
              <div className="flex justify-between py-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">Buy-in</span>
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">${buyInAmount}</span>
              </div>
            </div>
            <div className="pt-2">
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1">Players:</p>
              <div className="flex flex-wrap gap-1.5">
                {selectedPlayerIds.map(id => {
                  const p = players.find(pl => pl.id === id)
                  return (
                    <span key={id} className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-forest-100 dark:bg-forest-900 text-forest-700 dark:text-forest-300">
                      {p?.name ?? '?'}
                    </span>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 inset-x-0 p-4 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-t border-gray-200 dark:border-gray-700 safe-bottom">
        <div className="max-w-2xl mx-auto flex gap-3">
          <button
            onClick={() => {
              if (step === 'basics') onCancel()
              else if (step === 'players') setStep('basics')
              else if (step === 'config') setStep('players')
              else if (step === 'confirm') setStep('config')
            }}
            className="flex-1 h-14 border-2 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 font-semibold rounded-2xl active:bg-gray-50 dark:active:bg-gray-700"
          >
            {step === 'basics' ? 'Cancel' : '← Back'}
          </button>
          {step === 'confirm' ? (
            <button
              onClick={create}
              disabled={creating}
              className="flex-1 h-14 bg-forest-600 text-white text-lg font-bold rounded-2xl active:bg-forest-700 disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create Tournament'}
            </button>
          ) : (
            <button
              onClick={() => {
                if (step === 'basics') setStep('players')
                else if (step === 'players') setStep('config')
                else if (step === 'config') setStep('confirm')
              }}
              disabled={
                (step === 'basics' && !name.trim()) ||
                (step === 'players' && selectedPlayerIds.length < 2)
              }
              className="flex-1 h-14 bg-gray-800 dark:bg-gray-600 text-white text-lg font-bold rounded-2xl active:bg-gray-900 disabled:opacity-40"
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
