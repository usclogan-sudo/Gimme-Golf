// The GIMME wordmark — high-contrast serif, tracked wide, with an optional brass
// "THAT'S GOOD." sub-line. Cream on navy by default; pass tone="dark" for navy on
// cream. (Brand Update v1.0 §5.)

const CREAM = '#F2ECDD'
const NAVY = '#16263B'
const BRASS = '#C2A24C'

export function Wordmark({
  size = 40,
  tone = 'light',
  tagline = false,
  className,
}: {
  /** Cap height of the wordmark in px. */
  size?: number
  /** 'light' = cream on navy, 'dark' = navy on cream. */
  tone?: 'light' | 'dark'
  /** Show the "THAT'S GOOD." sub-line in brass. */
  tagline?: boolean
  className?: string
}) {
  const color = tone === 'light' ? CREAM : NAVY
  return (
    <span className={className} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
      <span
        style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontWeight: 700,
          fontSize: size,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color,
          // The wordmark tracks right; nudge left so it looks optically centered.
          paddingLeft: '0.15em',
        }}
      >
        Gimme
      </span>
      {tagline && (
        <span
          style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontWeight: 600,
            fontSize: Math.max(9, Math.round(size * 0.28)),
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: BRASS,
            marginTop: Math.round(size * 0.18),
            paddingLeft: '0.22em',
          }}
        >
          That's Good.
        </span>
      )}
    </span>
  )
}
