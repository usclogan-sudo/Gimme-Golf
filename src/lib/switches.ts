// Kill switches. One row per capability in feature_switches, readable by
// everyone, written only through the admin_set_switch RPC. The database
// enforces the switches that guard writes (rounds insert, the participant
// tables, hole_scores); the client reads the same rows to say why a button is
// off instead of letting the write fail. A missing table, a failed read or an
// unknown row all resolve to "enabled", so a broken read can never lock players
// out. The one exception is `notice`, where enabled means the banner shows.

import { useSyncExternalStore } from 'react'
import { supabase } from './supabase'

export type SwitchKey = 'new_rounds' | 'joining' | 'scoring' | 'settle_up' | 'notice'

export interface FeatureSwitch {
  key: SwitchKey
  enabled: boolean
  message: string | null
  updatedAt: string | null
}

export type Switches = Record<SwitchKey, FeatureSwitch>

export const SWITCH_KEYS: SwitchKey[] = ['new_rounds', 'joining', 'scoring', 'settle_up', 'notice']

export const SWITCH_INFO: Record<SwitchKey, { label: string; detail: string; offMessage: string }> = {
  new_rounds: {
    label: 'New rounds',
    detail: 'Starting a round or creating an event. Enforced on the rounds table.',
    offMessage: 'Starting new rounds is paused right now. Rounds already in play are not affected.',
  },
  joining: {
    label: 'Joining',
    detail: 'Joining a round or event by code, link or invite. Enforced on the participant tables.',
    offMessage: 'Joining rounds is paused right now. Try again in a little while.',
  },
  scoring: {
    label: 'Scoring',
    detail: 'Entering or changing hole scores. Enforced on hole_scores. Reading a scorecard still works.',
    offMessage: 'Scoring is paused right now. Your scorecard is safe and will accept scores again shortly.',
  },
  settle_up: {
    label: 'Settle Up payments',
    detail: 'Payment handles and pay links on Settle Up. Client side only; the app never holds funds.',
    offMessage: 'Payment links are paused right now. Settle in person or come back later.',
  },
  notice: {
    label: 'Notice banner',
    detail: 'When on, the message shows on the home screen for every player.',
    offMessage: '',
  },
}

export function defaultSwitches(): Switches {
  const out = {} as Switches
  for (const key of SWITCH_KEYS) {
    out[key] = { key, enabled: key !== 'notice', message: null, updatedAt: null }
  }
  return out
}

function isSwitchKey(value: unknown): value is SwitchKey {
  return typeof value === 'string' && (SWITCH_KEYS as string[]).includes(value)
}

/** Rows from feature_switches merged onto the defaults. Unknown keys are ignored. */
export function parseSwitchRows(rows: unknown): Switches {
  const out = defaultSwitches()
  if (!Array.isArray(rows)) return out
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    if (!isSwitchKey(r.key)) continue
    out[r.key] = {
      key: r.key,
      enabled: typeof r.enabled === 'boolean' ? r.enabled : out[r.key].enabled,
      message: typeof r.message === 'string' && r.message.trim() ? r.message.trim() : null,
      updatedAt: typeof r.updated_at === 'string' ? r.updated_at : null,
    }
  }
  return out
}

/** Null when the capability is on; otherwise the line to show the player. */
export function blockedMessage(switches: Switches, key: Exclude<SwitchKey, 'notice'>): string | null {
  const s = switches[key]
  if (!s || s.enabled) return null
  return s.message ?? SWITCH_INFO[key].offMessage
}

/** The home screen banner, or null when the notice is off or empty. */
export function noticeText(switches: Switches): string | null {
  const s = switches.notice
  if (!s?.enabled || !s.message) return null
  return s.message
}

/**
 * The database raises with hint "feature_switch:<key>" when a write hits a
 * closed switch. Lets a save error say the real reason instead of "try again".
 */
export function switchFromError(error: { hint?: string | null } | null | undefined): SwitchKey | null {
  const hint = error?.hint
  if (typeof hint !== 'string' || !hint.startsWith('feature_switch:')) return null
  const key = hint.slice('feature_switch:'.length)
  return isSwitchKey(key) ? key : null
}

// ─── Live store ──────────────────────────────────────────────────────────────

let current: Switches = defaultSwitches()
const listeners = new Set<() => void>()

function publish(next: Switches) {
  current = next
  listeners.forEach(l => l())
}

export function getSwitches(): Switches {
  return current
}

export async function loadSwitches(): Promise<Switches> {
  try {
    const { data, error } = await supabase
      .from('feature_switches')
      .select('key, enabled, message, updated_at')
    if (error) return current
    publish(parseSwitchRows(data))
  } catch {
    // Offline or table missing: keep whatever we had, which starts as all on.
  }
  return current
}

let syncStarted = false

/**
 * Load once, follow changes over Realtime, and reload when the tab comes back.
 * Idempotent; the first caller owns the subscription for the life of the page.
 */
export function startSwitchSync(): void {
  if (syncStarted) return
  syncStarted = true
  void loadSwitches()
  try {
    supabase
      .channel('feature_switches')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'feature_switches' }, () => { void loadSwitches() })
      .subscribe()
  } catch {
    // Realtime is a nicety; the visibility reload below still catches up.
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void loadSwitches()
    })
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function useSwitches(): Switches {
  return useSyncExternalStore(subscribe, getSwitches, getSwitches)
}

/** Test seam: replace the store contents without a network round trip. */
export function __setSwitchesForTests(next: Switches): void {
  publish(next)
}
