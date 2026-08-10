# UX Findings — multiplayer journeys (invite / join / mid-round roster)

**Method:** drove the real app (localhost dev, signed in as "Test") through the
group journeys a betting app lives or dies on — inviting a player, the invitee's
join surface, and changing the roster mid-round. Severity is from a "does the
whole foursome get in and settle cleanly" lens. Companion to `UX-FINDINGS.md`.

Date: 2026-08-08.

---

## Ranked findings

| # | Journey | Severity | What's rough | Suggested fix |
|---|---------|----------|--------------|---------------|
| M1 | Mid-round add | **High (trust/$$)** | Inviting a player mid-round **retroactively changes the stakes for holes already played**. Adding a 3rd player to a 2-player Skins round bumped the pot from **50 → 75 pts *per hole*** — including holes already decided. A skin won at 50 now pays 75. No rule/《as-of-hole》boundary. | Product decision needed: a mid-round joiner should start accruing **from the current hole forward**; earlier holes keep their original player count/pot. Store a per-player "joined at hole N" and have the settlement engine scope each hole's pot to who was in it. |
| M2 | Mid-round add | **High (trust)** | An invited-but-**not-yet-accepted** player appears as a **full, scoreable player** (John, HCP 0) — indistinguishable from accepted players, already counted in the pot. The host can enter scores for someone who may never join, and the phantom inflates every pot. | Render pending invitees as a **muted "pending — hasn't joined" row** (no score pad, or clearly greyed), and **exclude them from pot math** until `round_participants.status = accepted`. |
| M3 | Mid-round add | **High** | The host's **live scorecard doesn't update** when a player is added — the new player only appears after a manual reload. Mid-round, the host sees the "Invited ✓" toast and then… nothing changes on the card. Reads as "did that work?" | Re-fetch the round's players (or subscribe via realtime, like scores/notifications already do) after an invite resolves, so the roster updates in place. |
| M4 | Invite (host) | **High** | The top menu item **"Invite Players" fires the OS share sheet / clipboard** with only a 3-second toast. On desktop it copied a link silently and looked like **nothing happened** (I clicked it twice thinking it was broken). The *clearer* path — "Invite by name" (a clean search+Invite modal) — is buried second and worse-named. | Reorder + rename: make the by-name modal the primary **"Add players"**; demote the share path to **"Share join link"** with persistent confirmation (show the code + a Copied state, not just a 3s toast). |
| M5 | Invite (host) | Med | **Three overlapping invite entries** in the round menu — "Invite Players" (share link), "Invite by name" (modal), "QR Code" — plus "Live Spectator Link". A host can't tell which does what. | Consolidate into one **"Add players"** sheet with tabs: *By name · Share link · QR*. Keep Spectator separate (it's a different intent). |
| M6 | Mid-round remove | Med | There is **no way to remove or substitute a player** mid-round anywhere (menu or player card). Someone who leaves at the turn, or a mis-add like the phantom above, is stuck in the round and its settlement. | The deferred remove/substitute flow — gated on the same per-hole scoping as M1 (removed player keeps the holes they played, drops out forward). |
| M7 | Mid-round add | Low | The mid-round joiner defaulted to **HCP 0** rather than their profile handicap, which skews net scoring / Quota targets. | Pull the invited player's profile handicap when adding the slot. |

## What works well (leave alone)

- **Invitee side is solid.** `PendingInvites` renders near the top of Home with clear Accept/Decline, and a `?join=CODE` link auto-fills. The invitee experience isn't the weak link — the **host-side roster management** is.
- **"Invite by name" modal** itself is good: instant search, per-row Invite, "Invited ✓" state, "Invited John" confirmation line. The problem is only its naming/ordering vs the share option.

## Not covered this pass
- Invalid-code feedback on the Home "Join a Round" box (didn't test bad input).
- Full cross-account accept → does the accepted player land mid-round on the right hole? (needs a second account; M1/M2 scoping should be settled first.)

## Top recommendation
The single highest-value build is a proper **mid-round roster flow** — because M1–M3 + M6 all cluster there and it's the exact "group changes at the turn" scenario. The prerequisite is the **per-hole scoping rule** (M1): once each hole's pot knows who was in it, "add from hole N" and "remove forward" both fall out, and the phantom-player pot inflation (M2) is fixed for free. Pair it with the cheap invite-menu naming/feedback fix (M4/M5), which is a quick, standalone win.
