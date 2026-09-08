import { describe, it, expect } from 'vitest'
import { canConfirmSettlementReceived } from './settlementAuthority'

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
    it('lets the treasurer confirm by proxy', () => {
      expect(canConfirmSettlementReceived(AtoB, {
        myPlayerId: 'C', isTreasurer: true, isPayeeDeviceBound: false,
      })).toBe(true)
    })

    it('lets the treasurer proxy-confirm even when they are the payer', () => {
      // Single-device round: the creator owes a guest who isn't present. Someone must
      // be able to settle it, and the guest has no device — so the treasurer proxies.
      expect(canConfirmSettlementReceived(AtoB, {
        myPlayerId: 'A', isTreasurer: true, isPayeeDeviceBound: false,
      })).toBe(true)
    })

    it('does NOT let a non-treasurer payer proxy-confirm their own debt', () => {
      expect(canConfirmSettlementReceived(AtoB, {
        myPlayerId: 'A', isTreasurer: false, isPayeeDeviceBound: false,
      })).toBe(false)
    })

    it('does NOT let an uninvolved non-treasurer confirm', () => {
      expect(canConfirmSettlementReceived(AtoB, {
        myPlayerId: 'C', isTreasurer: false, isPayeeDeviceBound: false,
      })).toBe(false)
    })
  })
})
