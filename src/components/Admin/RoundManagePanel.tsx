import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { fmtHandicap } from '../../lib/gameLogic'

interface RosterEntry {
  player_id: string
  name: string
  handicap: number | null
  group: number | null
  claimed_by: string | null
  claim_status: string | null
  event_role: string | null
  email: string | null
}

interface Overview {
  round_id: string
  status: string
  course_name: string | null
  current_hole: number
  owner_id: string
  game_master_id: string | null
  event_id: string | null
  event_missing: boolean
  event_name: string | null
  players: RosterEntry[]
}

/**
 * Repairing a round in flight, without SQL.
 *
 * Every control here stands in for a statement written by hand against production on
 * 6 September while thirteen people waited on tees: granting scoring access,
 * changing a role, moving someone between foursomes, correcting a handicap, and
 * clearing an event link that pointed at nothing. None of it was exotic — it is what
 * goes wrong when a round is set up by one person and played by thirteen.
 *
 * The claim column is the important one. A roster name with no account behind it is a
 * player who cannot enter a score and has no way to find out why, and nothing in the
 * app showed that state.
 */
export function RoundManagePanel({ roundId, onBack }: { roundId: string; onBack: () => void }) {
  const [data, setData] = useState<Overview | null>(null)
  const [users, setUsers] = useState<{ user_id: string; display_name: string | null }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [{ data: ov, error: ovErr }, { data: us }] = await Promise.all([
      supabase.rpc('admin_round_overview', { p_round_id: roundId }),
      supabase.rpc('admin_get_all_users'),
    ])
    if (ovErr) { setError(ovErr.message); return }
    setData(ov as Overview)
    setUsers((us ?? []) as any)
  }, [roundId])

  useEffect(() => { void load() }, [load])

  // Every action reloads rather than patching local state: these calls touch several
  // tables at once, and a panel showing a half-applied repair is worse than a pause.
  const run = async (key: string, fn: () => PromiseLike<{ error: any }>) => {
    setBusy(key); setError(null)
    const { error: e } = await fn()
    setBusy(null)
    if (e) { setError(e.message); return }
    await load()
  }

  if (error && !data) {
    return (
      <div className="space-y-3">
        <button onClick={onBack} className="text-sm text-gray-500">← Back</button>
        <p className="text-red-500 text-sm">{error}</p>
      </div>
    )
  }
  if (!data) return <p className="text-gray-400 text-sm py-6 text-center">Loading round…</p>

  const groups = [...new Set(data.players.map(p => p.group).filter(g => g != null))].sort() as number[]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-gray-500">← Back to rounds</button>
        <span className="text-xs text-gray-500">{data.status} · hole {data.current_hole}</span>
      </div>

      <div>
        <h3 className="font-semibold text-gray-800 dark:text-gray-100">{data.course_name ?? 'Round'}</h3>
        <p className="text-xs text-gray-500">
          {data.players.length} players
          {data.event_id ? ` · event: ${data.event_name ?? 'unnamed'}` : ' · no event'}
        </p>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {/* A round pointing at a deleted event behaves as an event round with no event:
          every permission check looks for membership rows that no longer exist. */}
      {data.event_missing && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
          <p className="text-sm font-semibold text-red-800">This round points at an event that no longer exists.</p>
          <p className="text-xs text-red-700">
            Players will be read-only until this is cleared. Clearing it makes this an ordinary
            round — scoring and settlement work normally, scorekeeper roles do not apply.
          </p>
          <button
            onClick={() => run('repair', () => supabase.rpc('admin_round_repair', { p_round_id: roundId }))}
            disabled={busy === 'repair'}
            className="h-9 px-3 bg-red-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
          >
            {busy === 'repair' ? 'Clearing…' : 'Clear the broken event link'}
          </button>
        </div>
      )}

      <div className="space-y-2">
        {data.players.map(p => {
          const claimed = !!p.claimed_by && p.claim_status === 'accepted'
          return (
            <div key={p.player_id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm truncate">{p.name}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {claimed ? (p.email ?? 'claimed') : p.claim_status === 'pending' ? 'invited — not accepted' : 'no account linked'}
                  </p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                  claimed ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {claimed ? 'CAN SCORE' : 'READ-ONLY'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Linking an account to a name is what the join flow does. Offered
                    here because on the day nobody could do it for themselves. */}
                {!claimed && (
                  <select
                    defaultValue=""
                    onChange={e => e.target.value && run(`grant-${p.player_id}`, () =>
                      supabase.rpc('admin_round_grant_access', {
                        p_round_id: roundId, p_player_id: p.player_id, p_user_id: e.target.value,
                      }))}
                    className="text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-700 rounded-lg px-2 py-1"
                  >
                    <option value="">Give scoring access to…</option>
                    {users.map(u => (
                      <option key={u.user_id} value={u.user_id}>{u.display_name ?? u.user_id.slice(0, 8)}</option>
                    ))}
                  </select>
                )}

                <label className="text-xs text-gray-500 flex items-center gap-1">
                  Group
                  <select
                    value={p.group ?? ''}
                    onChange={e => run(`grp-${p.player_id}`, () =>
                      supabase.rpc('admin_round_set_group', {
                        p_round_id: roundId, p_player_id: p.player_id,
                        p_group: e.target.value ? Number(e.target.value) : null,
                      }))}
                    className="text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-700 rounded-lg px-2 py-1"
                  >
                    <option value="">—</option>
                    {[...new Set([...groups, 1, 2, 3, 4, 5, 6])].sort((a, b) => a - b).map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </label>

                {data.event_id && !data.event_missing && claimed && (
                  <label className="text-xs text-gray-500 flex items-center gap-1">
                    Role
                    <select
                      value={p.event_role ?? 'player'}
                      onChange={e => run(`role-${p.player_id}`, () =>
                        supabase.rpc('admin_round_set_role', {
                          p_round_id: roundId, p_player_id: p.player_id, p_role: e.target.value,
                        }))}
                      className="text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-700 rounded-lg px-2 py-1"
                    >
                      <option value="player">Player</option>
                      <option value="scorekeeper">Scorekeeper (own group)</option>
                      <option value="manager">Manager (all groups)</option>
                    </select>
                  </label>
                )}

                <label className="text-xs text-gray-500 flex items-center gap-1">
                  HCP
                  <input
                    type="number"
                    step="0.1"
                    defaultValue={p.handicap ?? ''}
                    onBlur={e => {
                      const v = e.target.value === '' ? null : Number(e.target.value)
                      if (v === null || v === p.handicap) return
                      void run(`hcp-${p.player_id}`, () =>
                        supabase.rpc('admin_round_set_handicap', {
                          p_round_id: roundId, p_player_id: p.player_id, p_handicap: v,
                        }))
                    }}
                    className="w-16 text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-700 rounded-lg px-2 py-1"
                  />
                  <span className="text-gray-400">{fmtHandicap(p.handicap)}</span>
                </label>
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-gray-400">
        Handicap edits change this round only — settlement reads the round's frozen snapshot,
        not the player's profile. Players need to reopen the app to pick up a change.
      </p>
    </div>
  )
}
