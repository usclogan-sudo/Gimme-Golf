// The ResultCard — the growth artifact (UX Build Spec v2.0 §3).
//
// A pure, presentational, image-exportable summary of a completed round. It receives
// resolved display names and computed standings; it does NOT fetch, call the
// settlement engine, or read auth/context — because the export path renders it
// offscreen where hooks and context are unavailable.
//
// Layout is a fixed internal grid at a 1080-unit width. Every dimension is expressed
// as `calc(N * var(--card-scale))`, so the `screen` and `export` variants are
// pixel-identical in proportion. `screen` sets the scale from container-query units
// (responsive to any width); `export` pins it to 1px (a real 1080px node for capture).
//
// The card never grows. Row heights are fixed and content truncates — a card that
// reflows is a card that screenshots badly (§3d).

import { forwardRef } from 'react'
import { Seal } from '../brand'
import { selectSubline } from './sublines'

export interface ResultCardStanding {
  playerId: string
  displayName: string
  /** Signed, in points. */
  net: number
  /** 1-indexed; ties share a position. */
  position: number
}

export interface ResultCardSettlement {
  fromName: string
  toName: string
  /** Always positive, in points. */
  amount: number
}

export interface ResultCardProps {
  round: {
    courseName: string
    date: Date
    formats: string[] // ['Skins'] or ['Skins', 'Best Ball']
    holesPlayed: number
  }
  standings: ResultCardStanding[]
  settlements: ResultCardSettlement[]
  /** screen = responsive width; export = fixed 1080. */
  variant?: 'screen' | 'export'
  /** 9:16 or 4:5. */
  ratio?: 'story' | 'feed'
  /** Optional stable salt for the sub-line; falls back to course+date. */
  roundId?: string
  /** Winner's first win with this group — unlocks the firstWin sub-line bucket. */
  winnerFirstWin?: boolean
}

// ── Palette (literal hex, not tokens) ──────────────────────────────────────────
// The export path serializes computed styles offscreen; literal values keep the PNG
// deterministic. Mirrors the brand primitives in index.css. (Seal/Wordmark do the same.)
const NAVY = '#16263B'
const NAVY_DEEP = '#0F1B2B'
const CREAM = '#F2ECDD'
const CREAM_DIM = '#D9D2C2'
const BRASS = '#C2A24C'
const BRASS_HI = '#E0C579'
const HAIRLINE = 'rgba(242, 236, 221, 0.20)' // cream 20%, on navy

const SERIF = "'Playfair Display', Georgia, serif"
const SANS = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"

const RATIOS = {
  story: { w: 1080, h: 1920 },
  feed: { w: 1080, h: 1350 },
} as const

// Design metrics in 1080-grid units. Story gets a generous rhythm; feed is shorter
// (1350 vs 1920) so it tightens spacing and type to keep everything above the fold.
const METRICS = {
  story: {
    padTop: 116, padX: 120, padBottom: 92,
    seal: 88, gapSeal: 40,
    eyebrow: 22, eyebrowGap: 12, sectionGap: 38,
    headline: 96, figure: 64, headlineLH: 0.95, subline: 36,
    rowH: 72, standings: 36, rankW: 56,
    settleLabel: 22, settleRow: 50, settle: 28,
    footer: 22,
  },
  feed: {
    padTop: 80, padX: 112, padBottom: 72,
    seal: 72, gapSeal: 26, eyebrow: 20, eyebrowGap: 10, sectionGap: 24,
    headline: 74, figure: 50, headlineLH: 0.95, subline: 30,
    rowH: 58, standings: 32, rankW: 50,
    settleLabel: 20, settleRow: 42, settle: 26,
    footer: 20,
  },
} as const

// ── Formatting helpers ──────────────────────────────────────────────────────────

/** "+50" / "−25" / "E". Uses a true minus sign for the serif figures. */
export function fmtSigned(n: number): string {
  if (n === 0) return 'E'
  return (n > 0 ? '+' : '−') + Math.abs(n)
}

/** Truncate long names with a middle ellipsis; never wrap. (§3d) */
export function middleTruncate(name: string, max = 18): string {
  if (name.length <= max) return name
  const keep = max - 1 // room for the ellipsis
  const head = Math.ceil(keep / 2)
  const tail = Math.floor(keep / 2)
  return name.slice(0, head) + '…' + name.slice(name.length - tail)
}

/** Eyebrow format label: 'SKINS' / 'SKINS · BEST BALL' / 'SKINS +2 GAMES'. (§3d) */
export function formatFormats(formats: string[]): string {
  const clean = formats.filter(Boolean)
  if (clean.length === 0) return ''
  if (clean.length === 1) return clean[0].toUpperCase()
  if (clean.length === 2) return `${clean[0]} · ${clean[1]}`.toUpperCase()
  return `${clean[0].toUpperCase()} +${clean.length - 1} GAMES`
}

const NUMBER_WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight']
function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n)
}

interface Headline {
  line1: string
  line2: string
  figure: string | null
}

function buildHeadline(winners: ResultCardStanding[], isAllSquare: boolean): Headline {
  if (isAllSquare) return { line1: 'All square.', line2: '', figure: null }

  if (winners.length >= 3) {
    return { line1: `${numberWord(winners.length)}-way tie.`, line2: "Nobody's buying.", figure: null }
  }
  if (winners.length === 2) {
    const [a, b] = winners
    return {
      line1: `${middleTruncate(a.displayName, 14)} and ${middleTruncate(b.displayName, 14)}`,
      line2: 'split it.',
      figure: a.net > 0 ? fmtSigned(a.net) : null,
    }
  }
  const w = winners[0]
  return {
    // Tighter than the 18-char row cap: at 96px the headline is width-bound, so a
    // long name is truncated here (and CSS-ellipsis guards the rest) rather than
    // double-ellipsing. Standings rows still show the fuller 18-char form.
    line1: middleTruncate(w.displayName, 14),
    line2: 'takes it.',
    figure: w.net > 0 ? fmtSigned(w.net) : null,
  }
}

export const ResultCard = forwardRef<HTMLDivElement, ResultCardProps>(function ResultCard(
  { round, standings, settlements, variant = 'screen', ratio = 'story', roundId, winnerFirstWin = false },
  ref,
) {
  const { w: W, h: H } = RATIOS[ratio]
  const M = METRICS[ratio]

  // A design unit → a CSS length. `--card-scale` is 1px on export (→ literal px, 1080
  // wide) and container-relative on screen (→ scales to whatever width it's placed in).
  const u = (n: number) => `calc(${n} * var(--card-scale))`

  // ── Derive the story from the data (no engine, just presentation) ──────────────
  const sorted = [...standings].sort((a, b) => a.position - b.position || b.net - a.net)
  const winners = sorted.filter((s) => s.position === 1)
  const winner = winners[0] ?? null
  const runnerUp = sorted.find((s) => s.position !== 1) ?? null
  const lastPlace = sorted.length >= 3 ? sorted[sorted.length - 1] : null
  const hasPositiveWinner = !!winner && winner.net > 0
  const isAllSquare = settlements.length === 0 && !hasPositiveWinner

  const headline = buildHeadline(winners, isAllSquare)

  const pointsInPlay = sorted.reduce((sum, s) => (s.net > 0 ? sum + s.net : sum), 0)
  const margin = winner ? winner.net - (runnerUp?.net ?? 0) : 0
  const dateStr = round.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const subline = selectSubline({
    roundId: roundId ?? `${round.courseName}|${round.date.toISOString()}`,
    winner: winner ? winner.displayName : null,
    runnerUp: runnerUp ? runnerUp.displayName : null,
    lastPlace: lastPlace ? lastPlace.displayName : null,
    pointsInPlay,
    margin,
    isAllSquare,
    isFirstWin: winnerFirstWin && hasPositiveWinner,
  })

  // Overflow: >6 rows → top 5 + a "+N more" summary row. (§3d)
  const showStandings = sorted.slice(0, sorted.length > 6 ? 5 : 6)
  const moreStandings = sorted.length - showStandings.length
  const showSettle = isAllSquare ? [] : settlements
  const settleVisible = showSettle.slice(0, showSettle.length > 6 ? 5 : 6)
  const moreSettle = showSettle.length - settleVisible.length

  const eyebrowFormats = formatFormats(round.formats)
  const eyebrowLine1 = [round.courseName, eyebrowFormats].filter(Boolean).join(' · ').toUpperCase()
  const eyebrowLine2 = `${dateStr} · ${round.holesPlayed} ${round.holesPlayed === 1 ? 'HOLE' : 'HOLES'}`.toUpperCase()

  // ── Style fragments ─────────────────────────────────────────────────────────
  const hairline = (key?: string) => (
    <div key={key} style={{ height: u(1.5), background: HAIRLINE, margin: `${u(M.sectionGap)} 0` }} />
  )

  const scaleVar = variant === 'export' ? '1px' : `calc(100cqw / ${W})`

  const cardStyle: React.CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    boxSizing: 'border-box',
    width: variant === 'export' ? W : '100%',
    height: variant === 'export' ? H : undefined,
    aspectRatio: variant === 'export' ? undefined : `${W} / ${H}`,
    // The only gradient permitted in the app: a subtle navy depth wash from top-center.
    background: `radial-gradient(120% 90% at 50% 26%, ${NAVY} 0%, ${NAVY_DEEP} 100%)`,
    color: CREAM,
    fontFamily: SANS,
    // Custom property consumed by every u() call below.
    ['--card-scale' as string]: scaleVar,
  }

  const eyebrowStyle: React.CSSProperties = {
    fontFamily: SANS,
    fontWeight: 500,
    fontSize: u(M.eyebrow),
    letterSpacing: '0.18em',
    color: CREAM_DIM,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    lineHeight: 1.35,
  }

  const card = (
    <div ref={ref} style={cardStyle}>
      {/* Brass inner frame */}
      <div
        style={{
          position: 'absolute',
          inset: u(56),
          border: `${u(1.5)} solid ${BRASS}`,
          pointerEvents: 'none',
        }}
      />

      {/* Content column */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          padding: `${u(M.padTop)} ${u(M.padX)} ${u(M.padBottom)}`,
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
        }}
      >
        {/* Seal, centered */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: u(M.gapSeal) }}>
          <Seal size={Number(M.seal)} style={{ width: u(M.seal), height: u(M.seal * 1.22) }} />
        </div>

        {/* Eyebrow */}
        <div style={eyebrowStyle}>{eyebrowLine1}</div>
        <div style={{ ...eyebrowStyle, marginTop: u(M.eyebrowGap) }}>{eyebrowLine2}</div>

        {hairline('hr-eyebrow')}

        {/* Headline + brass figure */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: u(24) }}>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              fontFamily: SERIF,
              fontWeight: 700,
              fontSize: u(M.headline),
              lineHeight: M.headlineLH,
              color: CREAM,
              letterSpacing: '-0.01em',
            }}
          >
            <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {headline.line1}
            </div>
            {headline.line2 && <div>{headline.line2}</div>}
          </div>
          {headline.figure && (
            <div
              style={{
                fontFamily: SERIF,
                fontWeight: 700,
                fontSize: u(M.figure),
                color: BRASS,
                whiteSpace: 'nowrap',
                fontVariantNumeric: 'tabular-nums',
                paddingBottom: u(6),
              }}
            >
              {headline.figure}
            </div>
          )}
        </div>

        {/* Sub-line */}
        <div
          style={{
            fontFamily: SERIF,
            fontStyle: 'italic',
            fontWeight: 400,
            fontSize: u(M.subline),
            color: CREAM_DIM,
            marginTop: u(M.sectionGap * 0.7),
          }}
        >
          {subline}
        </div>

        {showStandings.length > 0 && hairline('hr-standings')}

        {/* Standings */}
        {showStandings.map((s) => {
          const isWinner = s.position === 1
          const nameColor = isWinner ? BRASS_HI : s.net < 0 ? CREAM_DIM : CREAM
          const figColor = isWinner ? BRASS : s.net < 0 ? CREAM_DIM : CREAM
          return (
            <div
              key={s.playerId}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                height: u(M.rowH),
                gap: u(20),
                fontFamily: SANS,
                fontSize: u(M.standings),
                fontWeight: isWinner ? 600 : 500,
              }}
            >
              <span
                style={{
                  width: u(M.rankW),
                  color: nameColor,
                  fontVariantNumeric: 'tabular-nums',
                  flexShrink: 0,
                }}
              >
                {s.position}
              </span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  color: nameColor,
                }}
              >
                {middleTruncate(s.displayName)}
              </span>
              <span
                style={{
                  color: figColor,
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {fmtSigned(s.net)}
              </span>
            </div>
          )
        })}
        {moreStandings > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              height: u(M.rowH),
              fontFamily: SANS,
              fontSize: u(M.standings),
              color: CREAM_DIM,
            }}
          >
            +{moreStandings} more
          </div>
        )}

        {/* Settle up */}
        {settleVisible.length > 0 && (
          <>
            {hairline('hr-settle')}
            <div
              style={{
                fontFamily: SANS,
                fontWeight: 600,
                fontSize: u(M.settleLabel),
                letterSpacing: '0.18em',
                color: CREAM_DIM,
                marginBottom: u(12),
              }}
            >
              SETTLE UP
            </div>
            {settleVisible.map((s, i) => (
              <div
                key={`${s.fromName}-${s.toName}-${i}`}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  height: u(M.settleRow),
                  gap: u(16),
                  fontFamily: SANS,
                  fontSize: u(M.settle),
                  color: CREAM_DIM,
                }}
              >
                <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {middleTruncate(s.fromName, 14)} <span style={{ color: BRASS }}>→</span>{' '}
                  <span style={{ color: CREAM }}>{middleTruncate(s.toName, 14)}</span>
                </span>
                <span style={{ color: CREAM, fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {s.amount}
                </span>
              </div>
            ))}
            {moreSettle > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  height: u(M.settleRow),
                  fontFamily: SANS,
                  fontSize: u(M.settle),
                  color: CREAM_DIM,
                }}
              >
                +{moreSettle} more settle-ups
              </div>
            )}
          </>
        )}

        {/* Spacer pushes the footer to the bottom of the fixed grid */}
        <div style={{ flex: 1, minHeight: u(24) }} />

        {hairline('hr-footer')}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span
            style={{
              fontFamily: SANS,
              fontWeight: 500,
              fontSize: u(M.footer),
              letterSpacing: '0.2em',
              color: BRASS,
            }}
          >
            THAT&apos;S GOOD.
          </span>
          <span
            style={{
              fontFamily: SANS,
              fontWeight: 500,
              fontSize: u(M.footer),
              letterSpacing: '0.12em',
              color: CREAM_DIM,
            }}
          >
            gimme.gg
          </span>
        </div>
      </div>
    </div>
  )

  // On screen, wrap in a container so `100cqw` resolves to the placed width. On
  // export, the card is already a fixed 1080px node — no container needed.
  if (variant === 'export') return card
  return <div style={{ containerType: 'inline-size', width: '100%' }}>{card}</div>
})
