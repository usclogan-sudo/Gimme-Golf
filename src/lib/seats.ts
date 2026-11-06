// Seat ownership helpers for the roster surfaces (Scorecard, Leaderboard, Settle Up).
//
// A seat is a players[] entry. A registered user who joins through the invite link
// gets a round_participants row binding their auth uid to a seat. When that seat is
// a guest the organiser typed (its id is a uuid, not the user's uid), the row is a
// claim: the seat keeps the organiser's name, and the roster shows who holds it.

export interface SeatParticipant {
  playerId: string
  userId: string
  status?: 'pending' | 'accepted' | 'declined' | string
}

export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] || name
}

function isAccepted(p: SeatParticipant): boolean {
  return p.status == null || p.status === 'accepted'
}

/**
 * Seat id → claimant's first name, for guest seats claimed by a registered user.
 * A registered player's own seat (player id === auth uid) is not a claim, and the
 * organiser never holds a participant row. Seats whose claimant has no profile
 * display name are left out rather than labelled with a uid.
 */
export function claimedSeatNames(
  participants: SeatParticipant[],
  displayNameByUserId: (userId: string) => string | undefined | null,
  organizerUserId?: string | null,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of participants) {
    if (!isAccepted(p)) continue
    if (p.playerId === p.userId) continue
    if (organizerUserId && p.userId === organizerUserId) continue
    const name = displayNameByUserId(p.userId)?.trim()
    if (!name) continue
    out[p.playerId] = firstNameOf(name)
  }
  return out
}

/** Seats with an accepted participant row held by someone other than the organiser. */
export function joinedSeatCount(participants: SeatParticipant[], organizerUserId?: string | null): number {
  const seats = new Set<string>()
  for (const p of participants) {
    if (!isAccepted(p)) continue
    if (organizerUserId && p.userId === organizerUserId) continue
    seats.add(p.playerId)
  }
  return seats.size
}
