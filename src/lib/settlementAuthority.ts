// Settlement authority — Gimme Authority Model §5a / §2.
//
// A settlement moves money from a payer to a payee. Two distinct authorities:
//
//   • "Mark sent"     — the payer reports they sent the money. Acts against their
//                       own interest, so it needs no one's approval. Clears nothing.
//   • "Confirm received" — clears the debt and updates the Ledger. Belongs to the
//                       payee, because it is the action that discharges someone's
//                       obligation. A third party must not do it (§2).
//
// The hinge is whether the payee is on their own device:
//   • Device-bound payee → ONLY they may confirm. Not the treasurer, not the payer.
//   • Non-device-bound payee (roster-added guest, no device to confirm on) → the
//     treasurer confirms on the guest's behalf — but only as the second step, after
//     the payer has marked it sent (Finding 10). One tap can no longer clear a debt
//     owed to someone who is not in the room to say so.
//
// Mirror of the two-step: a guest PAYER has no device either, so the treasurer may
// mark sent on their behalf; that is the first step, it clears nothing.
//
// This module is the single source of truth for those rules so they can be
// unit-tested away from the SettleUp UI — they decide whether the Ledger can be
// trusted. The server enforces the same rules in confirm_settlement_received and
// player_report_settlement.

export interface SettlementParties {
  fromPlayerId: string
  toPlayerId: string
}

export interface SettlementViewer {
  /** The viewer's player id in this round (null if unidentified). */
  myPlayerId: string | null
  /** Whether the viewer is the round's treasurer/organizer. */
  isTreasurer: boolean
  /** True when the payee has their own device/session in this round (an accepted participant). */
  isPayeeDeviceBound: boolean
  /** True once the payer (or the treasurer for a guest payer) has marked it sent. */
  playerReported?: boolean
}

/**
 * Whether the viewer may confirm this settlement as *received* (clearing the debt).
 * See the module header for the rule. The payer is never granted this by being the
 * payer — only the payee, or the treasurer proxying for a non-device-bound payee
 * once the payment has been marked sent.
 */
export function canConfirmSettlementReceived(
  parties: SettlementParties,
  viewer: SettlementViewer,
): boolean {
  if (viewer.isPayeeDeviceBound) {
    return parties.toPlayerId === viewer.myPlayerId
  }
  return viewer.isTreasurer && viewer.playerReported === true
}

export interface SettlementRowState {
  status: 'owed' | 'paid'
  playerReported: boolean
}

export interface SettlementActor extends SettlementViewer {
  /** True when the payer has their own device/session in this round. */
  isPayerDeviceBound: boolean
}

export interface SettlementActions {
  /** Show "Mark sent". */
  canMarkSent: boolean
  /** The viewer is marking sent on behalf of a guest payer (not their own debt). */
  markSentForPayer: boolean
  /** Show "Confirm received". */
  canConfirm: boolean
  /** The viewer is confirming on behalf of a guest payee. */
  confirmForGuest: boolean
  /** Who the row is waiting on, for the status line. */
  waitingOn: 'payer' | 'payee' | null
}

/** Which controls a settle row offers this viewer, and why. */
export function settlementActions(
  parties: SettlementParties,
  row: SettlementRowState,
  actor: SettlementActor,
): SettlementActions {
  const none: SettlementActions = { canMarkSent: false, markSentForPayer: false, canConfirm: false, confirmForGuest: false, waitingOn: null }
  if (row.status === 'paid') return none

  const iAmPayer = parties.fromPlayerId === actor.myPlayerId
  const proxyPayer = actor.isTreasurer && !actor.isPayerDeviceBound && !iAmPayer
  const canMarkSent = !row.playerReported && (iAmPayer || proxyPayer)

  const canConfirm = canConfirmSettlementReceived(parties, { ...actor, playerReported: row.playerReported })
  const confirmForGuest = canConfirm && !actor.isPayeeDeviceBound

  return {
    canMarkSent,
    markSentForPayer: canMarkSent && !iAmPayer,
    canConfirm,
    confirmForGuest,
    waitingOn: row.playerReported ? 'payee' : 'payer',
  }
}
