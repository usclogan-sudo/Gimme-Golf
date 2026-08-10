import { useEffect, useMemo, useState } from 'react'
import { supabase, rowToUserProfile } from '../lib/supabase'
import { reportSupabaseError } from '../lib/sentry'
import type { UserProfile } from '../types'

interface Props {
  /** Round invite — pass roundId. Event invite — pass eventId instead. */
  roundId?: string
  eventId?: string
  currentUserId: string
  /** player_ids already in the roster (to hide from the picker) */
  existingPlayerIds: string[]
  onClose: () => void
  onInvited?: (name: string) => void
}

/**
 * Organizer modal: search registered users and invite one into a round or event.
 * Calls invite_to_round or invite_to_event, which create a pending membership.
 * Registered users' player_id equals their auth uuid, so we pass userId for both
 * p_user_id and p_player_id.
 */
export function InvitePlayerModal({ roundId, eventId, currentUserId, existingPlayerIds, onClose, onInvited }: Props) {
  const [users, setUsers] = useState<UserProfile[]>([])
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [invited, setInvited] = useState<Set<string>>(new Set())

  useEffect(() => {
    supabase.from('user_profiles').select('*').not('display_name', 'is', null).limit(200)
      .then(({ data }) => { if (data) setUsers(data.map(rowToUserProfile)) })
  }, [])

  const existing = useMemo(() => new Set(existingPlayerIds), [existingPlayerIds])
  const filtered = users.filter(u =>
    u.userId !== currentUserId &&
    !existing.has(u.userId) &&
    (u.displayName ?? '').toLowerCase().includes(search.trim().toLowerCase())
  )

  const invite = async (u: UserProfile) => {
    setBusy(u.userId)
    setMsg(null)
    const { error } = eventId
      ? await supabase.rpc('invite_to_event', { p_event_id: eventId, p_user_id: u.userId, p_player_id: u.userId })
      : await supabase.rpc('invite_to_round', { p_round_id: roundId, p_user_id: u.userId, p_player_id: u.userId })
    setBusy(null)
    if (error) {
      reportSupabaseError(error, eventId ? 'invite_to_event' : 'invite_to_round', { roundId, eventId, invitee: u.userId })
      setMsg(error.message || 'Could not send invite.')
      return
    }
    setInvited(prev => new Set(prev).add(u.userId))
    setMsg(`Invited ${u.displayName}`)
    onInvited?.(u.displayName ?? 'player')
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="font-display font-bold text-lg text-gray-900 dark:text-gray-100">Add a player</h3>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search players by name"
          className="w-full h-11 px-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
        />
        {msg && <p className="text-sm text-amber-600 dark:text-amber-400">{msg}</p>}
        <div className="max-h-72 overflow-y-auto space-y-1">
          {filtered.length === 0 && <p className="text-sm text-gray-500 py-4 text-center">No players found</p>}
          {filtered.map(u => (
            <div key={u.userId} className="flex items-center justify-between py-2 px-1">
              <span className="text-sm text-gray-800 dark:text-gray-100">{u.displayName}</span>
              {invited.has(u.userId) ? (
                <span className="text-xs text-green-600 font-semibold">Invited ✓</span>
              ) : (
                <button
                  onClick={() => invite(u)}
                  disabled={busy === u.userId}
                  className="bg-green-600 text-white text-sm font-semibold px-4 py-1.5 rounded-full active:scale-95 disabled:opacity-50"
                >Invite</button>
              )}
            </div>
          ))}
        </div>
        <button onClick={onClose} className="w-full h-12 bg-gray-800 dark:bg-gray-700 text-white font-bold rounded-xl active:bg-gray-900">Done</button>
      </div>
    </div>
  )
}
