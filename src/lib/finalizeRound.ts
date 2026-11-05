// The one place a round is marked complete.
//
// Both "End Round" entry points — the in-round ⋮ menu and the home-card link — go
// through here and then hand off to SettleUp. That hand-off is not optional:
// SettleUp's mount is what computes and persists the `settlements` rows
// (persistSettlements), and Round History, the Ledger and the result card all key
// off those rows. A path that marks a round complete without landing on SettleUp
// leaves the round in history with no result and no settle path.
import { supabase } from './supabase'

export function finalizeRound(roundId: string) {
  return supabase.from('rounds').update({ status: 'complete' }).eq('id', roundId)
}
