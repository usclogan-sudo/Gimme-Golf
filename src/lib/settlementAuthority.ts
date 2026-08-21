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
//     treasurer confirms by proxy. This keeps the common single-device round working,
//     where one scorekeeper settles for everyone who isn't present on a phone.
//
// This module is the single source of truth for that rule so it can be unit-tested
// away from the SettleUp UI — it decides whether the Ledger can be trusted.

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
}

/**
 * Whether the viewer may confirm this settlement as *received* (clearing the debt).
 * See the module header for the rule. The payer is never granted this by being the
 * payer — only the payee, or the treasurer proxying for a non-device-bound payee.
 */
export function canConfirmSettlementReceived(
  parties: SettlementParties,
  viewer: SettlementViewer,
): boolean {
  if (viewer.isPayeeDeviceBound) {
    return parties.toPlayerId === viewer.myPlayerId
  }
  return viewer.isTreasurer
}
