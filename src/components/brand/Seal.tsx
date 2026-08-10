// The Gimme signet — an oval "G" seal. Inline SVG (never an <img>) so it exports
// cleanly with the ResultCard and never races an image load. Cream outer ring,
// brass inner ring, serif G. (Brand Update v1.0 §5.)

const CREAM = '#F2ECDD'
const BRASS = '#C2A24C'

export function Seal({
  size = 88,
  outer = CREAM,
  inner = BRASS,
  letter = CREAM,
  className,
  style,
}: {
  size?: number
  outer?: string
  inner?: string
  letter?: string
  className?: string
  /** Overrides width/height — the ResultCard passes calc() units so the seal
      scales with --card-scale instead of a fixed pixel size. */
  style?: React.CSSProperties
}) {
  // Oval signet: viewBox is taller than wide (a ring, not a coin).
  const w = size
  const h = Math.round(size * 1.22)
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 100 122"
      fill="none"
      role="img"
      aria-label="Gimme"
      className={className}
      style={style}
    >
      <ellipse cx="50" cy="61" rx="47" ry="58" stroke={outer} strokeWidth="2.5" />
      <ellipse cx="50" cy="61" rx="40.5" ry="51.5" stroke={inner} strokeWidth="1.5" />
      <text
        x="50"
        y="61"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="'Playfair Display', Georgia, serif"
        fontSize="66"
        fontWeight={600}
        fill={letter}
      >
        G
      </text>
    </svg>
  )
}
