/** Tailwind class for a score relative to par (score-eagle … score-worse). */
export function getScoreClass(score: number, par: number): string {
  const diff = score - par
  if (score === 1) return 'score-eagle'
  if (diff <= -2) return 'score-eagle'
  if (diff === -1) return 'score-birdie'
  if (diff === 0) return 'score-par'
  if (diff === 1) return 'score-bogey'
  if (diff === 2) return 'score-double'
  return 'score-worse'
}
