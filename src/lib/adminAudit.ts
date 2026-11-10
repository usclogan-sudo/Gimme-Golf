import { supabase } from './supabase'
import { Sentry } from './sentry'

// Only the direct table writes (shared courses, presets) still log from the
// client. Every admin_* RPC writes its own audit row inside its transaction.
export type AdminAction =
  | 'delete_shared_course'
  | 'delete_game_preset'
  | 'delete_player'
  | 'edit_shared_course'
  | 'edit_game_preset'

export interface AdminAuditEntry {
  action: AdminAction
  target_type?: 'user' | 'round' | 'shared_course' | 'game_preset' | 'player'
  target_id?: string
  target_label?: string
  metadata?: Record<string, unknown>
}

/**
 * Append an entry to admin_audit_log. Fire-and-forget — never throws back into the UI.
 * If the RPC fails (RLS, network, RPC missing), we breadcrumb to Sentry so it's
 * still recoverable but the admin's UI action isn't blocked.
 */
export async function logAdminAction(entry: AdminAuditEntry): Promise<void> {
  try {
    const { error } = await supabase.rpc('log_admin_action', {
      p_action: entry.action,
      p_target_type: entry.target_type ?? null,
      p_target_id: entry.target_id ?? null,
      p_target_label: entry.target_label ?? null,
      p_metadata: entry.metadata ?? {},
    })
    if (error) {
      Sentry.captureMessage('admin audit log RPC failed', {
        level: 'warning',
        tags: { area: 'admin-audit' },
        extra: { entry, error: error.message },
      })
    }
  } catch (err) {
    Sentry.captureException(err, {
      tags: { area: 'admin-audit' },
      extra: { entry },
    })
  }
}
