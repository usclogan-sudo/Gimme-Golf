import { describe, it, expect } from 'vitest'
import { canConfirmSettlementReceived, settlementActions } from './settlementAuthority'

// A owes B: money flows A (payer) → B (payee).
const AtoB = { fromPlayerId: 'A', toPlayerId: 'B' }

describe('canConfirmSettlementReceived — Authority Model §5a/§2', () => {
  describe('device-bound payee (payee is present on their own device)', () => {
    it('lets the payee confirm receipt of their own debt', () => {
      expect(canConfirmSettlementReceived(AtoB, {
        myPlayerId: 'B', isTreasurer: false, isPayeeDeviceBound: true,
      })).toBe(true)
    })

    it('does NOT let the payer clear their own debt', () => {
      expect(canConfirmSettlementReceived(AtoB, {
        myPlayerId: 'A', isTreasurer: false, isPayeeDeviceBound: true,
      })).toBe(false)
    })

    it('does NOT let the payer clear it even when they are the treasurer', () => {
      // The core §2 fix: being treasurer must not let you discharge your own debt.
      expect(canConfirmSettlementReceived(AtoB, {
        myPlayerId: 'A', isTreasurer: true, isPayeeDeviceBound: true,
      })).toBe(false)
    })

    it('does NOT let the treasurer clear a debt between two other players', () => {
      // The original live bug: a third party clearing someone else's debt.
      expect(canConfirmSettlementReceived(AtoB, {
        myPlayerId: 'C', isTreasurer: true, isPayeeDeviceBound: true,
      })).toBe(false)
    })

    it('does NOT let an uninvolved non-treasurer confirm', () => {
      expect(canConfirmSettlementReceived(AtoB, {
        myPlayerId: 'C', isTreasurer: false, isPayeeDeviceBound: true,
      })).toBe(false)
    })
  })

  describe('non-device-bound payee (roster-added guest, no device to confirm on)', () => {
    it('lets the treasurer confirm on the guest\'s behalf ONLY after the payer marked it sent (Finding 10)', () => {
      expect(canConfirmSettlementReceived(AtoB, {
        myPlayerId: 'C', isTreasurer: true, isPayeeDeviceBound: false, playerReported: false,
      })).toBe(false)
      expect(canConfirmSettlementReceived(AtoB, {
        myPlayerId: 'C', isTreasurer: true, isPayeeDeviceBound: false,
      })).toBe(false)
      expect(canConfirmSettlementReceived(AtoB, {
        myPlayerId: 'C', isTreasurer: true, isPayeeDeviceBound: false, playerReported: true,
      })).toBe(true)
    })

    it('lets the treasurer proxy-confirm their own debt to a guest, once they have marked it sent', () => {
      // Single-device round: the creator owes a guest who isn't present. Someone must
      // be able to settle it, and the guest has no device — so the treasurer proxies,
      // in two steps.
      expect(canConfirmSettlementReceived(AtoB, {
        myPlayerId: 'A', isTreasurer: true, isPayeeDeviceBound: false, playerReported: true,
      })).toBe(true)
      expect(canConfirmSettlementReceived(AtoB, {
        myPlayerId: 'A', isTreasurer: true, isPayeeDeviceBound: false, playerReported: false,
      })).toBe(false)
    })

    it('does NOT let a non-treasurer payer proxy-confirm their own debt', () => {
      expect(canConfirmSettlementReceived(AtoB, {
        myPlayerId: 'A', isTreasurer: false, isPayeeDeviceBound: false, playerReported: true,
      })).toBe(false)
    })

    it('does NOT let an uninvolved non-treasurer confirm', () => {
      expect(canConfirmSettlementReceived(AtoB, {
        myPlayerId: 'C', isTreasurer: false, isPayeeDeviceBound: false, playerReported: true,
      })).toBe(false)
    })
  })
})

describe('settlementActions — what a settle row offers (Finding 10)', () => {
  const owed = { status: 'owed' as const, playerReported: false }
  const sent = { status: 'owed' as const, playerReported: true }

  it('payer on a device: Mark sent, then nothing until the payee confirms', () => {
    const a = settlementActions(AtoB, owed, { myPlayerId: 'A', isTreasurer: false, isPayeeDeviceBound: true, isPayerDeviceBound: true })
    expect(a).toMatchObject({ canMarkSent: true, markSentForPayer: false, canConfirm: false, waitingOn: 'payer' })
    const b = settlementActions(AtoB, sent, { myPlayerId: 'A', isTreasurer: false, isPayeeDeviceBound: true, isPayerDeviceBound: true })
    expect(b).toMatchObject({ canMarkSent: false, canConfirm: false, waitingOn: 'payee' })
  })

  it('payee on a device can confirm whether or not the payer marked sent', () => {
    expect(settlementActions(AtoB, owed, { myPlayerId: 'B', isTreasurer: false, isPayeeDeviceBound: true, isPayerDeviceBound: true }))
      .toMatchObject({ canConfirm: true, confirmForGuest: false, canMarkSent: false })
    expect(settlementActions(AtoB, sent, { myPlayerId: 'B', isTreasurer: false, isPayeeDeviceBound: true, isPayerDeviceBound: true }))
      .toMatchObject({ canConfirm: true, confirmForGuest: false })
  })

  it('guest payee: the organiser gets Confirm only after Mark sent, flagged as on the guest\'s behalf', () => {
    const org = { myPlayerId: 'C', isTreasurer: true, isPayeeDeviceBound: false, isPayerDeviceBound: true }
    expect(settlementActions(AtoB, owed, org)).toMatchObject({ canConfirm: false, canMarkSent: false, waitingOn: 'payer' })
    expect(settlementActions(AtoB, sent, org)).toMatchObject({ canConfirm: true, confirmForGuest: true, waitingOn: 'payee' })
  })

  it('guest payer: the organiser may mark sent on their behalf, and it is labelled as such', () => {
    const org = { myPlayerId: 'C', isTreasurer: true, isPayeeDeviceBound: true, isPayerDeviceBound: false }
    expect(settlementActions(AtoB, owed, org)).toMatchObject({ canMarkSent: true, markSentForPayer: true, canConfirm: false })
    // A non-organiser cannot.
    expect(settlementActions(AtoB, owed, { ...org, isTreasurer: false })).toMatchObject({ canMarkSent: false })
  })

  it('organiser owing a guest: Mark sent (own debt), then Confirm for the guest', () => {
    const org = { myPlayerId: 'A', isTreasurer: true, isPayeeDeviceBound: false, isPayerDeviceBound: true }
    expect(settlementActions(AtoB, owed, org)).toMatchObject({ canMarkSent: true, markSentForPayer: false, canConfirm: false })
    expect(settlementActions(AtoB, sent, org)).toMatchObject({ canMarkSent: false, canConfirm: true, confirmForGuest: true })
  })

  it('a paid row offers nothing', () => {
    expect(settlementActions(AtoB, { status: 'paid', playerReported: true }, { myPlayerId: 'B', isTreasurer: true, isPayeeDeviceBound: true, isPayerDeviceBound: true }))
      .toEqual({ canMarkSent: false, markSentForPayer: false, canConfirm: false, confirmForGuest: false, waitingOn: null })
  })
})
