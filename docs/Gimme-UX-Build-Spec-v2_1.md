# Gimme — UX Build Spec v2.1

**Design remediation and result-card build for the live PWA (gimme.gg)**

Prepared by: UX Design · Date: August 10, 2026 · Extends Brand Update v1.0 (May 31, 2026)

> v2.1 adds sections 13 through 23 following a second production audit covering the batch grid, the in-round overflow menu, the rules modals, Ledger, My Stats, Leaderboard, Players, Tournaments, Create Event, Settings, and dark mode. Three of the additions are P0 and one is blocking.

> Paste into Claude Code in the repo root. Work top-down. P0 items ship first and ship together as one release. Everything here is derived from two live audits of production on August 10, 2026.
>
> Unlike Brand Update v1.0, this spec **does** touch component structure and adds new components. It still does not touch settlement math, the data model, auth, or scoring logic. Flag anything that would.

---

## 0. Why this exists

The competitive brief concluded that the shareable result card is the moat and the payment posture is table stakes. The live app does not have a result card. The settle moment, which is the product's entire reason to exist, currently renders as a red error box, and the share action can crash the application to a raw unhandled-promise screen.

Four things are true at once and they set the priority order:

1. The growth artifact is missing.
2. The screen it should live on is styled as a failure state.
3. The button that would distribute it is the least reliable code path in the app.
4. The numbers it would publish do not agree with each other across screens (§12).

Fix in reverse order: reconcile the numbers, make share safe, build the card, then fix the screen around it. Item 4 is the one that was missed in the first pass and it is the one that can quietly kill the product, because a settlement app's only real asset is that the group believes the figure.

A separate finding, §11, is the densest concentration of prohibited language in the product and it sits behind a menu item every new player taps in their first round. It survived the v1.0 sweep because it lives in content files rather than component JSX.

---

## 1. The token layer (do this first, everything else depends on it)

The audit found at least six accent colors in one flow (iOS blue, system green, orange, teal, amber gradient, red) with no semantic rule. The palette exists in the brand doc but there is no semantic layer, so components reach for raw framework defaults.

Create `src/styles/tokens.css` (or extend the existing theme file) with two layers. Components may only reference layer two.

### Layer 1 — brand primitives

```css
:root {
  /* Brand primitives — never referenced directly by components */
  --brand-navy:        #16263B;
  --brand-navy-deep:   #0F1B2B;  /* derived, for card depth + scrims */
  --brand-slate:       #2E4257;
  --brand-slate-soft:  #4A5F77;  /* derived, hairlines on navy */
  --brand-cream:       #F2ECDD;
  --brand-cream-dim:   #D9D2C2;  /* derived, muted text on navy */
  --brand-brass:       #C2A24C;
  --brand-brass-lo:    #9A7F36;  /* derived, brass text on cream (AA) */
  --brand-brass-hi:    #E0C579;  /* derived, brass on navy highlight */
  --brand-paper:       #FBF9F4;  /* derived, app background */

  /* Functional only. Not brand. Used nowhere except true system states. */
  --sys-danger:        #A3382F;  /* destructive confirm only */
  --sys-danger-bg:     #F7EAE8;
}
```

`--volt: #C6F24E` is not defined in the app stylesheet at all. Apparel only. If it appears in a grep of `src/`, delete it.

### Layer 2 — semantic tokens

```css
:root {
  /* Surfaces */
  --surface-app:        var(--brand-paper);
  --surface-raised:     #FFFFFF;
  --surface-inverse:    var(--brand-navy);
  --surface-sunken:     #F1EDE4;

  /* Text */
  --text-primary:       var(--brand-navy);
  --text-secondary:     var(--brand-slate);
  --text-muted:         #6B7A8C;
  --text-on-inverse:    var(--brand-cream);
  --text-on-inverse-dim: var(--brand-cream-dim);

  /* Lines */
  --line-hairline:      rgba(46, 66, 87, 0.14);
  --line-hairline-inv:  rgba(242, 236, 221, 0.20);
  --line-brass:         var(--brand-brass);

  /* Interactive */
  --action-primary-bg:   var(--brand-navy);
  --action-primary-fg:   var(--brand-cream);
  --action-secondary-bg: transparent;
  --action-secondary-fg: var(--brand-navy);
  --action-secondary-br: var(--line-hairline);
  --action-disabled-bg:  #E3DED3;
  --action-disabled-fg:  #9AA4B0;

  /* Outcome language — the only place value judgment is encoded */
  --outcome-win:        var(--brand-brass);       /* on cream */
  --outcome-win-inv:    var(--brand-brass-hi);    /* on navy */
  --outcome-neutral:    var(--text-secondary);
  --outcome-behind:     var(--text-muted);        /* NOT red */

  /* Live/in-progress */
  --state-live:         var(--brand-brass);
  --state-live-bg:      rgba(194, 162, 76, 0.12);
}
```

### The rules the team enforces in review

- **Red is reserved for one thing:** a destructive action the user is about to confirm (Discard round, Delete round, Remove course). Nothing else in the app is red. Being behind, owing points, or being over par is not an error.
- **Brass means winning or live.** It is never a button fill for a neutral action.
- **Navy is the only primary action fill.** Delete green, blue, orange, teal, and amber-gradient buttons entirely.
- **No gradients** except the card's optional navy depth wash. The amber gradient on "Round in Progress" and the gold gradient on "Settle Up" both go.
- Add a lint rule or a CI grep that fails on hardcoded hex in `src/components/**`. This is the only way the system survives contact with the next feature.

### Sweep list

Grep and replace: `#1f2937`, `#051a0e`, `bg-green-`, `bg-blue-`, `bg-orange-`, `bg-teal-`, `bg-amber-`, `text-red-` (audit each; keep only destructive-confirm cases), `from-amber`, `to-yellow`.

---

## 2. P0-1 — Stop the share path from taking down the app

**Observed:** tapping "Share Results" produced a full white page reading `Promise Error / NotAllowedError: Permission denied`. The React tree was gone. This reproduces anywhere `navigator.share` is unavailable or denied: desktop Chrome, Firefox, most in-app webviews, and any user who declines the OS prompt.

Two independent fixes. Both are required.

### 2a. Global error boundary

Wrap the app tree. On error, show a branded recovery screen, never a stack trace.

```tsx
// src/components/AppErrorBoundary.tsx
class AppErrorBoundary extends React.Component<Props, State> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logToTelemetry('app_crash', { message: error.message, stack: info.componentStack });
  }
  render() {
    if (!this.state.hasError) return this.props.children;
    return <RecoveryScreen onRetry={() => this.setState({ hasError: false })} />;
  }
}
```

`RecoveryScreen` copy, in brand voice, no apology, states what happened and what to do:

> **Something didn't load.**
> Your round is saved. Reload and pick up where you left off.
> [ Reload ] [ Back to rounds ]

Also add a `window.addEventListener('unhandledrejection', ...)` handler that logs and suppresses, because an error boundary alone does not catch rejected promises from event handlers. This is what actually broke.

### 2b. Share must never throw

Centralize all sharing in one utility. Every call site uses it. No component calls `navigator.share` directly.

```ts
// src/lib/share.ts
type ShareResult = 'shared' | 'downloaded' | 'copied' | 'cancelled';

export async function shareCard(
  blob: Blob,
  filename: string,
  fallbackUrl: string,
  text: string
): Promise<ShareResult> {
  const file = new File([blob], filename, { type: 'image/png' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return 'shared';
    } catch (err) {
      if ((err as Error).name === 'AbortError') return 'cancelled';
      // fall through to download on NotAllowedError / anything else
    }
  }

  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    return 'downloaded';
  } catch {
    await navigator.clipboard.writeText(fallbackUrl);
    return 'copied';
  }
}
```

The UI reacts to the return value with a toast in brand voice: `shared` gets nothing, `downloaded` gets "Saved to your photos.", `copied` gets "Link copied.", `cancelled` gets nothing.

**Acceptance:** with `navigator.share` deleted in devtools, tapping share downloads a PNG and the app stays mounted. With share denied at the OS level, same. No console-visible unhandled rejection in either case.

Size: S. This is a half-day and it is blocking everything else.

---

## 3. P0-2 — Build the ResultCard

This is the deliverable. Everything else in this document is supporting work.

### 3a. What it is

A single React component that renders a fixed-aspect, image-exportable artifact summarizing a completed round. It appears in three places: the settle screen (primary), the round history detail (archive), and the share export (PNG). Same component, one `variant` prop controlling scale.

It is not a table with a border. It is a designed object with a fixed internal grid that looks composed at 1080×1920 with no text visible below the fold.

### 3b. Component API

```tsx
// src/components/ResultCard/ResultCard.tsx
interface ResultCardProps {
  round: {
    courseName: string;
    date: Date;
    formats: string[];         // ['Skins'] or ['Skins', 'Best Ball']
    holesPlayed: number;
  };
  standings: Array<{
    playerId: string;
    displayName: string;
    net: number;               // signed, in points
    position: number;          // 1-indexed, ties share a position
  }>;
  settlements: Array<{
    fromName: string;
    toName: string;
    amount: number;            // always positive, in points
  }>;
  variant: 'screen' | 'export'; // screen = responsive width, export = fixed 1080
  ratio: 'story' | 'feed';      // 9:16 or 4:5
}
```

The component is **pure and presentational**. It receives resolved display names and computed standings. It does not fetch, does not call the settlement engine, does not know about auth. This matters because the export path renders it offscreen where hooks and context may not be available.

### 3c. Layout

Fixed internal grid at a 1080-unit width. All values scale proportionally via a single `--card-scale` factor so `screen` and `export` variants are pixel-identical in proportion.

```
┌────────────────────────────────────────────┐  1080 × 1920 (story)
│                                            │
│   [ 96px navy bleed ]                      │
│   ┌──────────────────────────────────────┐ │  ← 1px brass inner frame,
│   │                                      │ │    inset 48px from bleed
│   │              ( SEAL )                │ │    88px oval signet, centered
│   │                                      │ │
│   │   CAMARILLO SPRINGS · SKINS          │ │  ← eyebrow: Inter 500,
│   │   AUGUST 10, 2026 · 18 HOLES         │ │    22px, 0.18em tracking,
│   │                                      │ │    uppercase, cream-dim
│   │   ────────────────────────────────   │ │  ← hairline, cream 20%
│   │                                      │ │
│   │   A-Aron                             │ │  ← headline: Playfair Display
│   │   takes it.                          │ │    96px/0.95, cream,
│   │                              +50     │ │    name on line 1, "takes it."
│   │                                      │ │    line 2, figure in brass
│   │   Lunch's on Test.                   │ │    at 64px baseline-aligned
│   │                                      │ │  ← sub-line: Playfair italic
│   │   ────────────────────────────────   │ │    36px, cream-dim
│   │                                      │ │
│   │   1  A-Aron                   +50    │ │  ← standings: Inter,
│   │   2  Admin                    −25    │ │    36px, 72px row height,
│   │   3  Test                     −25    │ │    winner row in brass,
│   │                                      │ │    others cream / cream-dim
│   │   ────────────────────────────────   │ │    figures tabular-nums,
│   │                                      │ │    right-aligned
│   │   SETTLE UP                          │ │
│   │   Admin      →   A-Aron       25     │ │  ← settle: Inter 28px,
│   │   Test       →   A-Aron       25     │ │    arrow in brass,
│   │                                      │ │    cream-dim labels
│   │                                      │ │
│   │   ────────────────────────────────   │ │
│   │   THAT'S GOOD.              gimme.gg │ │  ← footer: Inter 500, 22px,
│   │                                      │ │    0.2em tracking, brass left,
│   └──────────────────────────────────────┘ │    cream-dim right
│                                            │
└────────────────────────────────────────────┘
```

Background: `--brand-navy` with a subtle radial wash to `--brand-navy-deep` from 30% top-center. That wash is the only gradient permitted in the app.

### 3d. Overflow rules (this is where cards break)

- **More than 6 players:** show top 5 ranked rows, then a single row reading `+3 more` in cream-dim. Settlement lines follow the same rule with `+2 more settle-ups`.
- **Long names:** truncate at 18 characters with a middle ellipsis, never wrap. Test with "Christopher Wetherington".
- **Multiple formats:** eyebrow reads `SKINS · BEST BALL`. Beyond two, `SKINS +2 GAMES`.
- **Ties for first:** headline becomes `A-Aron and Test / split it.` and the brass figure shows the shared total. If three or more tie, `Four-way tie. / Nobody's buying.`
- **All square, no settlements:** headline `All square.`, sub-line `Somehow, nobody owes anybody.`, settle block hidden, footer unchanged.
- Every row height is fixed. The card never grows. If content exceeds the grid, it truncates. A card that reflows is a card that screenshots badly.

### 3e. Sub-line library

One line, auto-selected, deterministic per round ID so it does not change on re-render. Affectionate, never cruel, no gambling vocabulary, no gendered address. Store in `src/components/ResultCard/sublines.ts` as a keyed set with selection conditions:

```ts
export const SUBLINES = {
  blowout: [        // winner's margin > 50% of total points in play
    "Not particularly close.",
    "{winner} made it look routine.",
    "Everyone else was playing for second.",
  ],
  squeaker: [       // margin between 1st and 2nd ≤ 10% of entry
    "By a whisker.",
    "{runnerUp} will want that one back.",
    "Decided on the last hole, as it should be.",
  ],
  standard: [
    "Lunch's on {lastPlace}.",
    "{winner} takes the day.",
    "That'll do.",
    "Signed, sealed, settled.",
    "{lastPlace} is getting the next tee time.",
  ],
  allSquare: [
    "Somehow, nobody owes anybody.",
    "Perfectly balanced. Deeply unsatisfying.",
  ],
  firstWin: [       // winner's first recorded win with this group
    "{winner}'s first one. It counts.",
  ],
} as const;
```

Selection: `firstWin` > `allSquare` > `blowout` > `squeaker` > `standard`. Within a bucket, index by `hash(roundId) % bucket.length`.

Write 20 more `standard` lines before launch. This is the single highest-leverage copy asset in the product and three lines will get stale inside one season.

### 3f. Export

Use `html-to-image` (`toBlob`), not `html2canvas`. It handles webfonts and CSS variables correctly and is a third of the bundle size.

```ts
// src/components/ResultCard/exportCard.ts
import { toBlob } from 'html-to-image';

export async function exportResultCard(node: HTMLElement, ratio: 'story' | 'feed') {
  await document.fonts.ready;              // critical: Playfair must be loaded
  return toBlob(node, {
    pixelRatio: 2,
    width: 1080,
    height: ratio === 'story' ? 1920 : 1350,
    cacheBust: true,
    backgroundColor: '#16263B',            // guards against transparent PNG
  });
}
```

Render the export variant into an offscreen container (`position: fixed; left: -10000px; top: 0;`), not `display: none`, which produces a zero-size capture. Await `document.fonts.ready` or the serif silently falls back to Times and the card looks cheap.

The seal must be inline SVG, not an `<img>` referencing an external file, or the export races the image load.

**Acceptance:** export produces a 2160×3840 PNG with correct fonts, on iOS Safari, Android Chrome, and desktop Chrome. Open the PNG at 100% and confirm no clipped descenders on the Playfair headline.

### 3g. Card placement

- **Settle screen:** the card is the first thing on the screen, above everything. It is not behind a button. The user sees it before they are asked to do anything.
- **History detail:** the card renders at `screen` variant as the header of the expanded row, replacing the current bare table.
- **Share sheet:** the export PNG.

Size: L. This is the flagship. Budget it accordingly and do not let it get compressed into the settle-screen ticket.

---

## 4. P0-3 — Rebuild the settle screen around the card

**Observed:** the screen opens with `You owe 50 pts` in red on a pink alert. For a foursome, three of four players see the emotional center of the product rendered as a validation error. Nobody screenshots a failure.

### New composition, top to bottom

1. **Header.** Keep the existing voice: `That's good.` / `Here's where everyone landed.` It is the best copy in the app. Set the headline in Playfair, cream on navy, and let it breathe.
2. **The ResultCard.** Full width, `screen` variant. This is the hero.
3. **Share row.** Primary navy button `Share the card`, secondary text action `Save image`. Directly under the card, before any settlement mechanics. The loop must be tappable before the chores begin.
4. **Your line.** A single quiet row, no alert box, no red, no pink:
   - If you owe: `You owe A-Aron 25 pts` in `--text-primary`, with the settle action inline.
   - If you're owed: `A-Aron owes you 25 pts` with `25` in brass.
   - If square: `You're square.`
   Use one row style for all three states. Only the brass on the positive figure differs.
5. **Settle up block.** Collapsed by default to a summary line (`2 of 3 settled`) with a progress hairline, expandable. The people who need the detail will tap. The people who just paid do not need to scroll past it.
6. **Scoreboard.** Below the fold, collapsed by default. The card already tells the story.

### Detail changes inside the settle block

- Kill the red `+1 / +2` vs-par coloring. Over par is `--text-muted`, under par is `--outcome-win`, level is `--text-secondary`.
- `Mark all 2 paid` is a green pill today. Make it a secondary text action, not a filled button. It is an administrative shortcut, not the primary path.
- **Delete `Recalculate` from the UI.** A visible recalculate button on a settlement screen tells the user the math might be wrong. If it exists for support purposes, move it behind the overflow menu. If it exists because the math is sometimes wrong, that is a separate ticket and it is more urgent than this document.
- Settlement rows currently degrade to `Copy Payment Text`. See P0-4.
- The bottom bar has a clipped ghost element behind `Back to Scores` at roughly x=515. Find it and remove it.

**Acceptance:** a losing player's settle screen contains zero red pixels and the card is fully visible without scrolling on a 390×844 viewport.

Size: M.

---

## 5. P0-4 — Payment deep-links on settlement rows

`fix-payment-handle-merge.patch` is written, validated, and exported. Apply it.

The root cause is that the participant map in `SettleUp` only hydrates profiles for accepted join-flow participants, so roster-added players carry no payment handle and every row falls back to `Copy Payment Text`.

Design requirements once handles resolve:

- Each settlement row shows the rails the payee actually has, as small navy outline chips: `Venmo` `Cash App` `PayPal` `Zelle`. Chips use wordmarks, not brand-colored buttons. The rails are a utility, not a sponsor.
- If the payee has no handle on file, the row shows `Ask A-Aron for their handle` as a text action that opens a prefilled message, rather than the current dead-end copy button. Never show an empty capability.
- `Copy Payment Text` becomes the last option in an overflow, not the only option.
- Never tax the loop: no interstitial, no upsell, no account requirement between the card and the settle tap.

**Acceptance:** a round with three roster-added players and zero join-flow participants renders working deep-links or an explicit handle-request action for every settlement row.

Size: S (patch application) + S (chip UI).

---

## 6. P1 — Kill the emoji, ship an icon set

Emoji are currently doing all iconography: ⛳ 🏆 💰 🔥 🐺 📈 📋 🎯 🔁 📍. This is the single largest gap between the brand deck and the running product. Nothing else you build reads as premium while a money-bag emoji sits on the Settle Up button.

- Adopt one line-icon family at 1.5px stroke. Lucide is already compatible with the stack and is permissively licensed. Set a single `<Icon>` wrapper so stroke width, size, and `currentColor` are enforced in one place.
- Sizes: 16 (inline), 20 (list rows), 24 (actions), 32 (empty states).
- Game formats get **typographic markers, not icons**. A tracked two-letter monogram in brass (`SK`, `BB`, `NA`, `WF`, `BB`) inside a hairline circle. It is cheaper, it never looks clip-art, and it extends to any new format without commissioning artwork.
- The `⛳` used as a logo and in empty states is replaced by the `Seal` component from Brand Update v1.0 §5. If `Seal` does not exist yet, it is now a P1 blocker, because the card needs it.

Grep for emoji in `src/`: `grep -rP "[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]" src/`

Size: M.

---

## 7. P1 — Scoring screen

This screen holds more user-minutes than every other screen combined and it is the weakest layout in the app.

### 7a. Collapse the duplicate header

`Hole 3 Par 3 · SI 5` appears in the app bar, and `‹ Hole 3 · Par 3 ›` appears again 70px below. One hole header. Keep the app bar version with the stepper chevrons merged into it:

```
←   ‹   HOLE 3   ›     PAR 3 · SI 5          ⋮
    Camarillo Springs · Live
```

This recovers roughly 56px of vertical space, which is the whole problem below.

### 7b. Compact the player rows

Currently ~130px per player. Five players is 650px, so entering one hole requires scrolling and `Next Hole` sits below the fold. Standing at a tee box one-handed, that friction decides whether the app is still open on hole 14.

Target 88px per player:

```
┌──────────────────────────────────────────────┐
│ A-Aron            ·12  +1        E    [2]    │  ← 32px meta line
│  [2] [3] [4] [5] [6] [7] [·]                 │  ← 44px chip row
└──────────────────────────────────────────────┘
```

- Name, handicap, stroke indicator, running position, and current score on one line.
- Drop `Thru 1: 2 (-1)`. It is cryptic and the leaderboard tab already answers it. If it must stay, it belongs behind a tap on the player name.
- The `Birdie` / `— Par` badges currently use three different badge systems in one view. Delete the badges. Encode the outcome in the selected chip's treatment only.

### 7c. Par-anchor the score chips

Fixed 1 through 6 is wrong on every par 5 and wasteful on every par 3. Render `par−2` through `par+3` with par visually anchored:

```ts
const chips = Array.from({ length: 6 }, (_, i) => par - 2 + i).filter(n => n >= 1);
// par 3 → [1,2,3,4,5,6]   par 4 → [2,3,4,5,6,7]   par 5 → [3,4,5,6,7,8]
```

Mark the par chip with a brass hairline underline at rest so the eye lands on it first. Keep `···` for outliers.

### 7d. One selected state, not two

Today a birdie selects blue and a par selects green, which reads as a rendering bug. One selected state: navy fill, cream numeral. Score quality is expressed by a brass dot above the chip for under par and nothing for at or over par. Restraint reads as confidence; a rainbow reads as a prototype.

### 7e. Sticky bottom bar

The hole outcome (`A-Aron wins 1 skin`) is currently a small yellow toast at the bottom of a scroll. That is the per-hole reward moment and it is buried. Move it into a persistent bottom bar:

```
┌──────────────────────────────────────────────┐
│  A-Aron wins 1 skin              Next hole → │
└──────────────────────────────────────────────┘
```

Navy bar, brass text for the outcome, cream for the action, pinned above the safe-area inset. Animate the outcome text with a 200ms brass flash when it changes, respecting `prefers-reduced-motion`. This is the small hit of dopamine that keeps the app open through 18 holes, and it currently costs a scroll to see.

### 7f. Carry and Press

`🔥 Carry ×2 · 250 pts on the line` with an orange `Press` button appears with no explanation. Restyle to the brass live-state tokens, drop the flame, and put the `?` explainer inline on first exposure rather than as a permanent superscript. `Press` is real golf vocabulary and stays, but its first appearance should teach it once.

### 7g. Elevate Batch Entry

Per the team's own testing, the batch grid is the fastest scoring path, and it is currently a pale, link-weight full-width strip that reads as secondary. Promote it to a persistent segmented control alongside `Scores` and `Leaderboard`. Three tabs: `Hole` · `Grid` · `Leaderboard`.

**Acceptance:** on a 390×844 viewport with five players, all five score rows and the sticky action bar are visible without scrolling.

Size: L.

---

## 8. P2 — Setup wizard

### 8a. The stepper lies

The stepper shows four steps (Course, Players, Game, Stakes). Step 4 is never reached, because the step-3 CTA reads `Next: Start Round` and points-per-player already lives on step 3. Also the stepper is absent entirely on step 1.

Resolution: make it three steps. `Course · Players · Game`. Show the stepper on all three including the first. Points-per-player stays on the Game step where it already is.

### 8b. Rename the fourth step out of existence

Even as a label, `Stakes` violates the terminology guardrails. It goes away with the step. Confirm no other surface uses it.

### 8c. Move round scope off the Players step

`Front 9 / Full 18 / Back 9` and `Start at Hole` are course-and-round decisions sitting on the Players step. Move them to the Course step, directly under the selected course, where the tee and par context already lives.

### 8d. De-duplicate the course list

The Course step shows `Recent` (2 courses) and then repeats those same 2 courses at the top of the full catalog list below. Filter recents out of the catalog list, or drop the Recent block and pin recents to the top of the single list with a `Recent` section label. One list.

### 8e. Narrow the format menu

The Game step offers 5 formats plus `More Games (5 more)`. The launch scope is Skins and Best Ball. Show Skins and Best Ball as full-width primary choices, then a single `More formats` disclosure containing the rest. Format tiles get the typographic monograms from §6, not emoji.

The `?` info buttons currently overlap and clip the tile corners. Move them inline, after the format name.

### 8f. Fix the toggle masquerading as a button

`Carryovers: ON ✓ (recommended)` is a full-width bordered element that looks exactly like a primary CTA and behaves as a toggle. Convert to a labeled switch row:

```
Carryovers                                    [ ●— ]
Ties carry forward until someone wins the hole clean.
```

Note the copy fix: the current string reads "Ties carry the **pot** forward," which violates the terminology guardrails. Grep for `pot` across `src/`; the audit also found `30 pts pot` in Round History against `50 pts in play` elsewhere. Standardize on `in play`.

### 8g. CTA labels

`Select at Least 2 Players` as a button label states a constraint where an action belongs. Label the button `Continue`, keep it disabled, and put `Select at least 2 players` as helper text above it.

Size: M.

---

## 9. P2 — Home and navigation

### 9a. Add a tab bar

Home is currently a single scroll containing nine unrelated sections with no persistent navigation. Six of those sections are a `More` grid of emoji tiles that is functionally a navigation menu rendered as content.

Introduce a four-tab bottom bar:

| Tab | Contains |
|---|---|
| **Play** | Start round, Create event, Rounds in progress, Join by code, Play again |
| **Rounds** | History, Ledger, Leaderboard, Tournaments |
| **Group** | Players, Regulars |
| **You** | Profile, My Stats, Your Courses, Settings, Feedback |

Navy bar, cream icons, brass active indicator, safe-area inset respected. This deletes the `More` grid and roughly 60% of the home scroll.

### 9b. Compact the in-progress cards

Two `Round in Progress` cards in a saturated amber gradient consume the entire first screen. Reduce each to a single 72px row on `--surface-raised` with a brass `Live` dot, course, format, hole count, and a chevron. The gradient goes.

### 9c. Fix the destructive inversion

`End Round` is styled red and `Discard` is styled neutral. Discard destroys the round; End Round completes it. Invert: `End round` becomes a secondary text action, `Discard` becomes the only red-capable action and requires a confirm sheet naming what is lost (`Discard this round? 3 holes of scores will be deleted.`).

### 9d. Fix the tap target

The `Start New Round` card body is not tappable; only the small play button is. The entire card looks like a target and should be one.

### 9e. Beta banner

The dismissible beta banner sits above the primary action on every session until dismissed. Move it below the in-progress rows.

Size: M.

---

## 10. P2 — Round History

Every row currently leads with the course name, which is identical for seven of eight entries. The row tells you nothing you came to find out.

Restructure each row to lead with the outcome:

```
┌────────────────────────────────────────────────┐
│  [card thumb]   You won 2 skins        +50     │
│                 Camarillo Springs · Skins      │
│                 Aug 4 · 3 players · 1 to settle│
└────────────────────────────────────────────────┘
```

- Left: a small rendered ResultCard thumbnail at 3:4, roughly 56×74. This is a second distribution surface for the card at effectively zero build cost once §3 exists, and it turns history into a trophy case.
- Outcome line in `--text-primary`, figure in brass when positive, `--text-muted` when negative. No red.
- `1 owed` amber badge becomes `1 to settle` in the meta line, in brass.
- Expanded state opens the full ResultCard plus the settle block, replacing today's bare table.
- Format emoji become the §6 monograms.

Size: M.

---

## 11. P0-5 — The rules modals are the worst brand violation in the product

**This was invisible to the v1.0 grep sweep** because these strings live in a rules content file, not in component JSX. Open any round, overflow menu, `Rules`. The Skins modal currently contains:

| Live string | Problem |
|---|---|
| `Total pot = buy-in x number of players` | `pot` and `buy-in`, both explicitly prohibited |
| `Each skin is worth an equal share of the pot` | `pot` |
| `Press bets multiply the value from the press hole onward` | `bets` |
| `Press when you are down to create a new side bet` | `side bet` |
| `Optional presses let players double down mid-round` | `double down` is casino vocabulary |
| `Each hole has one skin up for grabs` | `up for grabs` |
| `a tied hole 17 means hole 18 could be worth a fortune` | money framing in a points-mode product |

The modal header also carries a bank-or-casino building glyph. There are roughly ten of these modals, one per format, and every one of them needs the same treatment. This is the highest-density concentration of prohibited language anywhere in the app, and it sits behind a menu item any new player will tap in their first round, which is exactly when the brand impression forms.

### Required rewrite pattern

```
SKINS

Each hole is worth one skin. Lowest score on the hole takes it.
Tie the hole and the skin carries to the next one.

HOW IT WORKS
1  Every hole has one skin.
2  Lowest score on the hole wins it.
3  If two or more players tie, the skin carries forward (when carryovers are on).
4  Carried skins stack, so later holes are worth more.
5  A press lets a player raise the value from that hole onward.

SCORING
Total points = entry x number of players.
Each skin is worth an equal share of the total.
Stacked carryovers can make a single hole worth several skins.
A press multiplies the value from the press hole forward.
Gross uses raw scores. Net applies handicap strokes.

WORTH KNOWING
Carryovers are what make the back nine interesting. A tied 17th
means the 18th is worth several skins.
A press is how you get back in it when you are down.
Net skins keeps a mixed-handicap group even.
```

Also fix the container: the modal renders edge to edge at desktop width with no max-width, so body text spans 1500px. Constrain to 560px, center it, and give it the card treatment rather than a full-bleed takeover.

**Do this across all ten format modals in one pass**, and move the rules content into a single typed content module so the next terminology sweep is one file rather than ten components.

Size: M. Priority: P0. It is cheap and it is the most concentrated brand damage in the product.

---

## 12. P0-6 — The record contradicts itself

Three screens claim to be the record of the same account and they disagree. Observed on the `Test` account, same session, minutes apart:

| Metric | My Stats | Leaderboard | Ledger |
|---|---|---|---|
| Win rate | 33% | 25% | — |
| Net result | +1950 pts | +1950 pts | you owe 75 pts |
| Birdies | 0 | 2 | — |
| Pars | 0 | 5 | — |
| Bogeys | 2 | 6 | — |
| Doubles | 3 | 3 | — |
| vs A-Aron | +1950 pts | — | −75 pts, you owe |

Two different scoring distributions and two different win rates for one player, plus a head-to-head figure that is positive on one screen and negative on another.

This is not a design problem and it is not in my scope to fix, but it outranks every visual item in this document. A settlement product's only real asset is that people believe the number. If two screens disagree, the group goes back to the notes app and the north-star metric never moves.

**What the team needs to determine before any of the P1 work starts:**

1. Are Stats and Leaderboard computing from different sources (one from local round cache, one from a Supabase aggregate)? The differing distributions suggest one is counting a subset of rounds.
2. Is the Ledger measuring something genuinely different (unsettled balance) from what Stats measures (lifetime net)? If so, that is defensible, but the labels do not say so and a user cannot reconcile them.
3. If both are legitimate but different, they need explicit labels: `Lifetime net` versus `Outstanding balance`. If they are not, one is wrong.

Design requirement once resolved: every figure that appears on more than one screen carries the same label and the same value, and any figure whose basis differs from the obvious reading gets an inline definition on tap. Do not ship the card until this is settled, because the card publishes these numbers to a group chat where four people can check them against each other.

Size: unknown, engineering-led. Priority: blocking.

---

## 13. P0-7 — The money leak is live

My Stats, Game Breakdown, Nassau row, renders `$0`.

That is a surviving `fmtMoney()` call in production on a points-mode product. It is the exact failure the points refactor was meant to eliminate and it is on a screen users reach in two taps. Complete the remaining call sweep across Ledger, RoundHistory, Stats, EventLeaderboard, and EventSetup, then add a CI grep that fails the build on `fmtMoney(` and on a literal `$` in any user-facing string file.

Size: S. Priority: P0.

---

## 14. P1 — Dark mode is unmanaged and breaks the primary action

There is a Dark Mode toggle in Settings. Nothing in the brand system accounts for it. Turned on:

- The background is a generic near-black (roughly `#0F1117`), not navy. The brand's own dark surface is `--brand-navy` and this is not it, so the app's dark theme has no relationship to the brand at all.
- **`Save Profile` and `Update Password` lose their fill entirely and render as bare text on a dark card.** The primary action on the settings screen becomes invisible as a button. This is a contrast and affordance failure on a form users must complete for settlement deep-links to work, which makes it a revenue-path bug, not a cosmetic one.
- The amber `Round in Progress` cards go from loud to blinding against near-black.
- The `Start New Round` card loses nearly all contrast against the background.

Two acceptable resolutions. Pick one and do it deliberately:

**Option A, ship dark properly.** Extend the §1 semantic layer with a `[data-theme="dark"]` block where `--surface-app` becomes `--brand-navy-deep`, `--surface-raised` becomes `--brand-navy`, `--text-primary` becomes `--brand-cream`, and `--action-primary-bg` becomes `--brand-brass` with navy text, because navy-on-navy cannot work. Dark mode then looks like the brand rather than like a framework default. This is the better answer for an app used outdoors at dusk.

**Option B, cut the toggle** until there is time to do A. A broken theme is worse than no theme.

Either way the semantic token layer in §1 must gain a dark variant before any component work lands, or every component built between now and then will need revisiting.

Size: M for option A, XS for option B.

---

## 15. P1 — The growth toolkit is hidden in a kebab menu

The in-round overflow menu contains, in this order: `Add players`, `Share join link`, `QR code`, `Live Spectator Link`, `Import scores from photo`, `Rules`, `End Round`.

Four of those seven are acquisition or differentiation features and all four are invisible:

- **Live Spectator Link.** No competitor in the brief has this. It is a genuine differentiator and it is the fourth item in a hamburger menu, with no explanation of what a spectator sees.
- **QR code and Share join link.** The entire multiplayer acquisition path. Getting the other three players into the round is the precondition for a settled round, and it is two taps deep behind an unlabeled icon.
- **Import scores from photo.** Card OCR, which PRESS markets as a headline feature. Buried.

**Also: `Live Spectator Link` produces no feedback whatsoever.** Tapping it does nothing visible. No toast, no sheet, no confirmation. Whatever it does, the user cannot tell that it happened. Every action in the menu needs a visible result.

### Redesign

Pull the invite cluster out of the menu and onto the round screen as a persistent element while the round has fewer players than expected or unaccepted invites outstanding:

```
┌──────────────────────────────────────────────┐
│  2 of 4 in                    Invite  ·  QR  │
└──────────────────────────────────────────────┘
```

Tapping `Invite` opens a sheet with the join link, the QR code, and the spectator link presented as three distinct things with one line each explaining what the recipient gets. Once everyone has joined, the strip collapses to a small `Share` affordance.

Move `Import scores from photo` to the scoring tab as a third entry mode alongside `Hole` and `Grid`, per §7g. It is an input method, not a settings item.

The menu keeps `Rules` and `End round` and the menu items lose their emoji and their three-way color inconsistency. `End round` is currently brass, which collides with brass meaning winning; make it a plain menu item and put the confirmation in the sheet.

Size: M.

---

## 16. P1 — Batch Entry

Per the team's own testing this is the fastest scoring path. It currently has four problems, one of which risks data.

1. **Two full-width saturated blue buttons**, `← Standard Entry` at the top and `Save All Scores` at the bottom. The blue is the loudest off-palette color in the app. More importantly, a mode toggle is rendered at the same visual weight as the save action.
2. **Save model inconsistency.** Standard entry appears to persist on tap; the grid has an explicit `Save All Scores`. A user who fills the grid and hits back loses the work with no warning. Either autosave the grid on cell blur, or add an unsaved-changes guard on navigation. Do not ship two different save contracts in one screen pair.
3. **The grid only shows Front 9** with the header `FRONT 9 — HOLES 1–9`, on a Full 18 round, with no visible way to reach holes 10 through 18.
4. **Cell inputs are roughly 30×22px**, far under the 44px minimum, on the screen designed for fast entry.

### Redesign

Replace the mode button with the three-way segmented control from §7g: `Hole` · `Grid` · `Leaderboard`. Add a `Front 9 / Back 9` segmented control inside the grid, or make it a single scrollable 18-row grid with a sticky header, which is better. Cells go to 44px minimum with tabular figures. Add a right-hand column showing the hole result (`SK` in brass on holes where a skin was won) so the grid is also a record of the game, not just the scores. Add a totals row.

Size: M.

---

## 17. P1 — Destructive actions are scattered and unprotected

`Reset Stats` appears in two places: inline in the Leaderboard header as a red outline button next to `Lifetime Standings`, and again in Settings under `MANAGE DATA` as `Reset Stats & History`. Settings also carries `Delete All Courses`.

The Leaderboard placement is the problem. A red button one tap from wiping a season, sitting in a header where users are browsing standings, with nothing between the tap and the consequence.

- Remove `Reset Stats` from the Leaderboard entirely. Destructive account-level actions live in Settings and nowhere else.
- Every destructive action gets a confirmation sheet that names what is lost in specific terms: `Reset all stats and history? 8 rounds and all lifetime standings will be deleted. This cannot be undone.` Require a typed confirmation for anything that deletes more than one round.
- Consolidate under a single `Manage data` block in Settings.

Size: S.

---

## 18. P1 — Ledger

The Ledger is `Cross-round balances`, which makes it the running-tab surface. Three issues, one strategic.

1. **`YOU OWE 75 pts` in a red panel**, matching the settle screen problem. Same fix: neutral surfaces, brass for positive figures, muted for negative, red never.
2. **No settle action.** The screen tells you that you owe A-Aron 75 points and offers no way to do anything about it. This is the most settle-intent-heavy screen in the app and it is a dead end. Add the same rail chips from §5 to every non-zero balance row, plus `Send reminder` on rows where you are owed. This is a direct north-star lever and it is currently missing.
3. **A full-width navy `← Back` bar occupies the bottom of the screen as if it were the primary action.** The header already has a back arrow. This pattern also appears on Tournaments and elsewhere. Remove it everywhere; that space belongs to the primary action of the screen, which here is settling.
4. The `Show settled (zero-balance) opponents` control is a raw unstyled HTML checkbox.

**Strategic flag, not a design note.** A persistent cross-round debt ledger is the most gambling-adjacent surface in the product. It is the one screen that reads as a book rather than a scorecard, and it is the one a reviewer, an app store, or a regulator would fix on first. The points framing helps. Worth a deliberate decision on whether the Ledger is a headline feature or a quiet utility, and worth raising with counsel alongside the questions already on file. Flagging because it sits outside what was asked and I would rather surface it early.

Size: M.

---

## 19. P1 — Players screen

1. **Payment rails render as four third-party brand-colored chips** (Venmo blue, Zelle purple, Cash App green, PayPal amber) stacked in a row. It is the loudest element on the screen and it sublets the brand to four payment companies. Convert to navy outline chips with wordmarks only, matching §5.
2. This screen proves the handles exist in the data layer for players who have set them, which confirms the SettleUp problem in §5 is a hydration and merge bug rather than missing data. Useful for whoever picks up that ticket.
3. **A `REGISTERED` badge appears on every single row.** A badge present on 100% of items carries no information. Either delete it, or invert it and badge the guests, who are the exception and the ones whose handles will be missing at settle time. Inverting is better because it makes the settle blocker visible before the round rather than after.
4. **No invite action anywhere on the screen.** This is the group-growth surface and it has no way to add a person.
5. Avatar background colors are hash-generated across purple, blue, red, and magenta. Constrain to navy, slate, and brass tints.
6. Star favorites are tiny, gray, unlabeled, and duplicate the automatic `Frequently played` section directly above them. Cut the stars.

Size: S.

---

## 20. P2 — Three overlapping multi-round concepts

The app offers `Create Event`, `Tournaments`, and a global `Leaderboard`, plus `Play Again`. Nothing anywhere explains how an Event differs from a Tournament, or which one produces the Leaderboard. The Tournaments empty state reads `No tournaments yet / Create a tournament to get started`, which explains nothing to someone who does not already know what it is.

Resolve the model before building anything else here. The most defensible shape given the roadmap:

- **Round.** One group, one day. The core object.
- **Event.** Multiple groups, one day. Already what `Create Event` describes.
- **Season.** Recurring rounds among the same people over time, which is what `Regulars` and the Gimme Pro organizer pass are actually selling.

If `Tournament` is not one of those three, it should be folded into `Event`. Three names for two ideas will confuse users and will confuse the Pro pricing conversation.

Every empty state gets rewritten as an invitation with a concrete first action, not a restatement of the empty condition. `No tournaments yet` becomes something like `Run a season. Keep standings across every round your group plays.` plus the create action.

Also: `Create Event` step 1 has no stepper, matching the missing stepper on `Select Course` in §8a. Same fix, same pattern, all wizards.

Size: M, plus a product decision that is not mine to make.

---

## 21. P2 — Settings and account

- Reached by tapping `Edit` on the profile row, but the screen is titled `Settings`. Label the entry point `Settings` or title the screen `Your profile`.
- The account email is displayed as static text with no actions. There is no change-email, no sign-out, and no delete-account. Sign-out currently lives only in the home header. Account actions belong here.
- Two save models on one screen: `Save Profile` is an explicit button, payment fields appear to save separately. Make the whole screen one contract.
- `Preferred Method` renders as a single lone chip with no indication that it is a selectable set.
- Payment handle entry is the precondition for settlement deep-links working. It deserves a prompt somewhere in the round flow, not just passive presence in settings. Add a one-time inline prompt on the settle screen when the current user has no handle on file: `Add a Venmo or Cash App handle so your group can pay you.` This is the cheapest available lift to the north-star metric.

Size: S.

---

## 22. Copy and terminology sweep

Run these greps across `src/`, `public/`, and any rules or content data files. The v1.0 sweep missed the content files, which is where the worst offenders were hiding.

| Grep | Replace with |
|---|---|
| `pot` | `total points`, `in play` |
| `buy-in`, `buyin` | `entry` |
| `bet`, `bets`, `side bet`, `wager`, `odds`, `winnings` | `press`, `result`, `net result` |
| `double down` | `raise the value` |
| `up for grabs` | `on the hole` |
| `a fortune` | `several skins` |
| `Stakes` | (removed with wizard step 4) |
| `buddies`, `guys`, `boys` | `your group`, `everyone` |
| `fmtMoney(` | remaining calls; then CI-block it |
| `$` in user-facing strings | points formatter |

Additional copy fixes found across both audit passes:

- `Select at Least 2 Players` → `Continue`, with the constraint as helper text
- `Recalculate` → removed from primary settle UI
- `Mark all 2 paid` → `Mark all as settled`
- `Copy Payment Text` → `Copy settle message`
- `Share Leaderboard` → `Share the standings`, sharing a rendered image rather than a table
- `Thru 1: 2 (-1)` → removed from scoring rows
- `30 pts pot` in Round History → `30 pts in play`, matching every other surface
- `No tournaments yet / Create a tournament to get started` → an invitation with a stated benefit
- `REGISTERED` badge → removed or inverted to badge guests
- `← Back` full-width bottom bars → removed on every screen that has one

Voice rule, restated: warmth and clarity everywhere functional, wit only at the win and the card. Errors state what happened and what to do, and they do not apologize. Empty states are invitations.

---

## 23. Quality floor (applies to every ticket)

- Responsive to 320px. Test at 390×844 and 430×932.
- All interactive targets at least 44×44px. Batch Entry cells currently fail this.
- Visible keyboard focus ring, brass, 2px, on every interactive element.
- `prefers-reduced-motion` respected on the brass flash and card transitions.
- Contrast: cream on navy passes AA at all sizes. Brass on navy passes AA at 18px and above only, so brass is never body copy on navy, only figures and labels at 20px+. Re-test every primary button in dark mode; two currently fail outright.
- Safe-area insets on sticky bars, top and bottom.
- Modals constrained to a max-width and centered. The rules modal currently spans the full desktop viewport.
- Card export tested on iOS Safari specifically.
- Every action produces a visible result. `Live Spectator Link` currently produces none.

---

## 24. Sequencing

Ship P0 as one release. Do not ship the card without the error boundary. Do not ship the card at all until §12 is resolved, because the card publishes contested numbers into a group chat where four people will check them against each other.

| # | Item | Size | Notes |
|---|---|---|---|
| 0 | Resolve the Stats / Leaderboard / Ledger contradiction (§12) | ? | Blocking, engineering-led |
| 1 | Token layer, including a dark variant or cutting dark (§1, §14) | S–M | Blocks everything |
| 2 | Error boundary and share utility (§2) | S | Blocks card share |
| 3 | `fmtMoney` sweep and CI guard (§13) | S | |
| 4 | Rules content rewrite, all ten modals (§11) | M | Cheap, high brand return |
| 5 | Seal and Wordmark components (§6, v1.0 §5) | S | Blocks card |
| 6 | ResultCard and export (§3) | L | The flagship |
| 7 | Settle screen rebuild (§4) | M | Needs 6 |
| 8 | Payment handle patch, rail chips, handle prompt (§5, §21) | S+S | Direct north-star lever |
| 9 | Destructive action consolidation (§17) | S | |
| 10 | Icon set and emoji removal (§6) | M | |
| 11 | Invite strip out of the kebab menu (§15) | M | Direct north-star lever |
| 12 | Scoring screen (§7) | L | |
| 13 | Batch Entry (§16) | M | Item 2 in it is a data-loss risk, consider pulling forward |
| 14 | Ledger settle actions (§18) | M | Direct north-star lever |
| 15 | Setup wizard (§8) | M | |
| 16 | Home and tab bar (§9) | M | |
| 17 | History rows (§10) | M | Needs 6 |
| 18 | Players screen (§19) | S | |
| 19 | Settings and account (§21) | S | |
| 20 | Event / Tournament / Season model (§20) | M | Needs a product decision first |
| 21 | Copy sweep (§22) | S | |

Items 0 through 8 are the release that makes the north-star metric both measurable and believable. Everything after that is quality and growth.

---

## 25. Out of scope

Settlement math, the data model, auth and sync, the join flow, format logic, Stableford / Quota / Banker in-game panels.

Two items in this document sit deliberately at the edge of that line and are flagged rather than specified: the record contradiction in §12, which is an engineering question that blocks design work, and the Ledger's strategic posture in §18, which is a business and legal question rather than a design one.

If anything else here appears to require a behavior change, stop and flag it rather than changing it silently.

**THAT'S GOOD.**
