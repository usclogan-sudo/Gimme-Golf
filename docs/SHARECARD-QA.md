# Result Card — QA Findings

End-to-end QA pass on the post-round result card (`src/components/ShareCard/ShareCard.tsx`), rebuilt for Brand v1.0 in commit `b8badcc`.

## How to QA visually

```
npm run dev
# open http://localhost:5173/?preview=share-card
```

Or, after the next deploy, the live URL:

```
https://gimme.gg/?preview=share-card
```

The preview harness renders 8 scenarios side-by-side at 50% scale. Each scenario has a "Render & share PNG" button that exercises the actual html2canvas → native share-sheet pipeline.

## Scenarios covered

| Scenario | What it tests |
|---|---|
| 4 players, typical $20 round | The most common case — sanity check |
| 2 players (no lastPlace sub-lines) | Sub-line filter correctly drops lastPlace templates |
| All square (no winner, no settlements) | Headline collapses to "All square.", no Settle Up section |
| Large stakes ($1,000+ buy-in) | Thousands-separator formatting + serif numeral width |
| 8 players (max roster) | Density check — does it fit inside 540×960 without clipping |
| Long player name | Truncation — does a 21-char name push the amount off the right edge |
| No game label | Context line drops missing segment gracefully |
| Standings without settlement graph | Settle Up section hides when no settlements |

## Bugs / risks found

### 1. Long names overflow without truncation (real issue) ⚠️

**Where:** ShareCard.tsx line 230 (standings rows) and 267 (settlement rows).

```jsx
<span>{s.name}</span>
<span>{fmt(s.netCents, true)}</span>
```

Both columns share a flexbox row with `justify-content: space-between`. There's no `text-overflow: ellipsis` or `max-width` on the name. A long name like `"Jonathan-Christopher"` (21 chars × ~12px = ~250px) plus a wide amount like `"+$1,234.56"` (~140px) exceeds the inner card width (~430px), causing the row to expand sideways into the `overflow: hidden` clip area.

**Recommendation:** Add `min-width: 0` + `overflow: hidden` + `text-overflow: ellipsis` to the name span, and `white-space: nowrap` to both spans, so long names truncate instead of overflowing.

**Severity:** Low (real-world player names are usually first names; this protects against edge cases). Worth fixing because the brand brief calls premium polish a hard requirement.

### 2. 8 players + many settlements can clip the bottom of the card

**Where:** Outer container at line 89 has `overflow: hidden`. Standings rows are ~30px each, settlement rows ~22px each. For 8 players + 7 settlements, content can approach the 960px height limit.

**Currently:** With 8 players + 5 settlements (the 8-player scenario), the card fits with comfortable margin. With 8 players + 7 settlements (theoretical max), the footer may be pushed against the bottom edge.

**Recommendation:** Acceptable for v1 — most rounds won't hit the worst case. If/when 16+ player events happen, the card needs pagination or font size adjustment. Track as a v2 concern.

**Severity:** Low.

### 3. Tabular numerals don't apply to Playfair Display (cosmetic)

**Where:** Standings amount column uses `fontFeatureSettings: '"tnum" 1'` on a serif font. Playfair Display's tabular numerals support varies by weight. Inter (used in the settlements section) supports tnum reliably.

**Visual impact:** When standings are stacked vertically, the dollar amounts may not perfectly align right-edge because the digits aren't equal-width. Small misalignment, hard to notice unless you're looking.

**Recommendation:** None if it looks acceptable in the preview. If alignment matters, switch the standings amount column to Inter (sans) while keeping the name column in Playfair. This trades a small visual seam between font families for clean numeral alignment.

**Severity:** Cosmetic.

### 4. Determinism — same group at same course always gets the same sub-line

**Where:** `pickSubline` hashes `courseName + dateStr + winner.name`. Same course, same date (date-only granularity), same winner → same sub-line.

**Behavior:** The same group at their weekly club round, if Connor always wins, always sees "Connor has the card." (or whatever the hash lands on).

**Reading:** This was intentional in the design ("same round, same line") but it means weekly groups see less variety than the 8-line library suggests.

**Recommendation:** None — this is by design. If you want more variety, add more lines to the SUBLINES array (cheap to add). Going non-deterministic per-render would mean the sub-line changes if the user re-opens the share screen, which is confusing.

**Severity:** None — design call.

### 5. Font loading race (theoretical, not observed)

**Where:** html2canvas captures the DOM. If Playfair Display hasn't loaded when html2canvas runs (rare in practice since the user has been in the app), the canvas renders with the fallback (Georgia).

**Mitigation already in place:** Index.html preloads Google Fonts on app boot. By the time the user gets to the SettleUp screen, fonts are cached.

**Recommendation:** No action needed unless field reports indicate it. Could add `document.fonts.ready` await before `html2canvas` if it ever becomes an issue.

**Severity:** Theoretical.

### 6. Seal placeholder still uses Playfair G

**Where:** ShareCard.tsx line 110-133. The seal is a styled "G" in Playfair Display 800.

**Status:** This is the documented placeholder per `docs/ICON-ASSETS-V1.md` until the real seal SVG ships. Visually credible at story-image scale but obviously not the final mark.

**Recommendation:** Track for replacement. When `public/seal.svg` arrives, swap the styled G for `<img src="/seal.svg" />`.

**Severity:** Known and tracked.

## What's solid

- **Logic** — `fmt`, `hashStr`, `pickSubline`, and the standings/settlements rendering all pass 20 new unit tests (in `src/components/ShareCard/__tests__/ShareCard.test.ts`).
- **Sub-line filter** — verified that 2-player rounds never produce "Lunch is on ." artifacts.
- **Sign formatting** — confirmed `+` for positive, `−` (U+2212 minus, not a hyphen) for negative, no sign for zero, none of those when `withSign` is false.
- **Color tokens** — all four brand values (navy, cream, brass, slate) are inline constants matching `docs/brand/Gimme-ClaudeCode-Brand-Update.md` §1.
- **Layout structure** — flex column with a `flex: 1` spacer between the optional sections and the footer means the footer always sits at the bottom regardless of how much content is above it.
- **Spectator share URL inclusion** — fixed in commit `b853686` (Scorecard.tsx now includes the URL inline in the share text, so SMS apps that only consume the text field don't drop the URL).

## Recommended fixes (priority order)

1. **Long-name truncation** (issue #1) — 4 lines of CSS, no behavior change. Worth doing before the next major brand review.
2. Nothing else is blocking. Issues #2–#5 are watchlist items, not action items.

## Notes for the brand team

When you review the preview screen:

- The seal is a stand-in. Final mark comes from the brand team's SVG drop (spec in `docs/ICON-ASSETS-V1.md`).
- The witty sub-lines are an 8-entry library; adding more is cheap (`SUBLINES` constant at the top of `ShareCard.tsx`).
- The "All square" scenario currently shows zero standings + sub-line "All square. Onto the next." — confirm the copy lands right or suggest alternatives.
- The headline "{winner} takes it." is in Playfair Display 700 at 54px. The amount in brass is 40px below. Both can be re-weighted without code restructure if the brand team prefers a different proportion.
