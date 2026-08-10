// Brand QA harness for the ResultCard. Reachable at ?preview=result-card.
// Renders every overflow scenario from §3d at both ratios, and exercises the real
// offscreen export → share path (renderResultCardToBlob → shareCard).

import { useState } from 'react'
import { ResultCard, renderResultCardToBlob, type ResultCardProps } from './index'
import { shareCard } from '../../lib/share'

type Scn = {
  key: string
  label: string
  note: string
  props: Omit<ResultCardProps, 'variant' | 'ratio'>
}

const s = (playerId: string, displayName: string, net: number, position: number) => ({
  playerId, displayName, net, position,
})

const SCENARIOS: Scn[] = [
  {
    key: 'clear-winner',
    label: 'Clear winner (4p)',
    note: 'The canonical case — one winner, three settle-ups.',
    props: {
      round: { courseName: 'Camarillo Springs', date: new Date('2026-08-10T17:00:00'), formats: ['Skins'], holesPlayed: 18 },
      standings: [s('1', 'A-Aron', 50, 1), s('2', 'Admin', -25, 2), s('3', 'Test', -25, 3)],
      settlements: [
        { fromName: 'Admin', toName: 'A-Aron', amount: 25 },
        { fromName: 'Test', toName: 'A-Aron', amount: 25 },
      ],
    },
  },
  {
    key: 'blowout',
    label: 'Blowout',
    note: 'Winner margin > 50% of points in play → blowout sub-line bucket.',
    props: {
      round: { courseName: 'Las Posas', date: new Date('2026-07-04T09:00:00'), formats: ['Skins'], holesPlayed: 18 },
      standings: [s('1', 'Connor', 120, 1), s('2', 'Dave', -20, 2), s('3', 'Maya', -40, 3), s('4', 'Tom', -60, 4)],
      settlements: [
        { fromName: 'Tom', toName: 'Connor', amount: 60 },
        { fromName: 'Maya', toName: 'Connor', amount: 40 },
        { fromName: 'Dave', toName: 'Connor', amount: 20 },
      ],
    },
  },
  {
    key: 'two-way-tie',
    label: 'Two-way tie for first',
    note: 'Headline → "A and B / split it." + shared brass figure.',
    props: {
      round: { courseName: 'Ventura CC', date: new Date('2026-06-30T13:00:00'), formats: ['Best Ball'], holesPlayed: 18 },
      standings: [s('1', 'Jess', 30, 1), s('2', 'Stan', 30, 1), s('3', 'Maya', -30, 3), s('4', 'Tom', -30, 4)],
      settlements: [
        { fromName: 'Maya', toName: 'Jess', amount: 30 },
        { fromName: 'Tom', toName: 'Stan', amount: 30 },
      ],
    },
  },
  {
    key: 'four-way-tie',
    label: 'Four-way tie',
    note: 'Three or more tie → "Four-way tie. / Nobody\'s buying." no figure.',
    props: {
      round: { courseName: 'Soule Park', date: new Date('2026-06-22T11:00:00'), formats: ['Skins'], holesPlayed: 9 },
      standings: [s('1', 'A', 0, 1), s('2', 'B', 0, 1), s('3', 'C', 0, 1), s('4', 'D', 0, 1)],
      settlements: [{ fromName: 'A', toName: 'B', amount: 0 }],
    },
  },
  {
    key: 'all-square',
    label: 'All square (no settlements)',
    note: 'No settlements, no positive winner → settle block hidden, footer unchanged.',
    props: {
      round: { courseName: 'Buenaventura', date: new Date('2026-05-30T13:00:00'), formats: ['Best Ball'], holesPlayed: 18 },
      standings: [s('1', 'Jess', 0, 1), s('2', 'Tomoko', 0, 1), s('3', 'Stan', 0, 1)],
      settlements: [],
    },
  },
  {
    key: 'eight-players',
    label: '8 players (overflow)',
    note: 'More than 6 → top 5 rows + "+3 more"; settle-ups capped the same way.',
    props: {
      round: { courseName: 'Riviera CC', date: new Date('2026-06-08T07:30:00'), formats: ['Skins', 'Best Ball'], holesPlayed: 18 },
      standings: [
        s('1', 'Connor', 80, 1), s('2', 'Dave', 40, 2), s('3', 'Rick', 20, 3), s('4', 'Pat', 10, 4),
        s('5', 'Stan', -10, 5), s('6', 'Maya', -30, 6), s('7', 'Tomoko', -50, 7), s('8', 'Tom', -60, 8),
      ],
      settlements: [
        { fromName: 'Tom', toName: 'Connor', amount: 60 },
        { fromName: 'Tomoko', toName: 'Dave', amount: 40 },
        { fromName: 'Maya', toName: 'Rick', amount: 20 },
        { fromName: 'Stan', toName: 'Pat', amount: 10 },
        { fromName: 'Maya', toName: 'Connor', amount: 10 },
        { fromName: 'Tomoko', toName: 'Pat', amount: 10 },
        { fromName: 'Tom', toName: 'Rick', amount: 10 },
      ],
    },
  },
  {
    key: 'long-name',
    label: 'Long name + 3 formats',
    note: 'Middle-ellipsis truncation; eyebrow → "SKINS +2 GAMES".',
    props: {
      round: { courseName: 'Olympic Club Lakeside', date: new Date('2026-06-18T10:00:00'), formats: ['Skins', 'Best Ball', 'Wolf'], holesPlayed: 18 },
      standings: [
        s('1', 'Christopher Wetherington', 45, 1),
        s('2', 'Dave', 5, 2),
        s('3', 'Maya', -20, 3),
        s('4', 'Pat', -30, 4),
      ],
      settlements: [
        { fromName: 'Pat', toName: 'Christopher Wetherington', amount: 30 },
        { fromName: 'Maya', toName: 'Christopher Wetherington', amount: 15 },
        { fromName: 'Maya', toName: 'Dave', amount: 5 },
      ],
    },
  },
]

function ScenarioBlock({ scn, ratio }: { scn: Scn; ratio: 'story' | 'feed' }) {
  const [status, setStatus] = useState<string | null>(null)
  const onExport = async () => {
    setStatus('Rendering…')
    const blob = await renderResultCardToBlob({ ...scn.props, ratio })
    if (!blob) { setStatus('Export failed'); return }
    const result = await shareCard(blob, `gimme-${scn.key}-${ratio}`, window.location.origin)
    setStatus(result)
  }
  // Preview at a manageable on-page size; the card itself is resolution-independent.
  const width = ratio === 'story' ? 300 : 340
  return (
    <div style={{ marginBottom: 40 }}>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700 }}>{scn.label}</div>
        <div style={{ fontSize: 12, color: '#D9D2C2', maxWidth: 420, lineHeight: 1.4 }}>{scn.note}</div>
        <button
          onClick={onExport}
          style={{ marginTop: 8, padding: '6px 12px', background: '#C2A24C', color: '#16263B', fontWeight: 700, fontSize: 12, borderRadius: 8, border: 'none', cursor: 'pointer' }}
        >
          Export PNG ({ratio})
        </button>
        {status && <span style={{ marginLeft: 10, fontSize: 12, color: '#C2A24C' }}>{status}</span>}
      </div>
      <div style={{ width, boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}>
        <ResultCard {...scn.props} variant="screen" ratio={ratio} />
      </div>
    </div>
  )
}

export function ResultCardPreview() {
  const [ratio, setRatio] = useState<'story' | 'feed'>('story')
  return (
    <div style={{ minHeight: '100vh', background: '#16263B', color: '#F2ECDD', padding: 24 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, fontWeight: 700 }}>ResultCard — Preview Harness</h1>
        <p style={{ color: '#D9D2C2', fontSize: 14, marginBottom: 16 }}>
          UX Build Spec v2.0 §3. Each scenario renders the <code>screen</code> variant; "Export PNG" exercises the
          real offscreen 1080-grid export + share path. Toggle the ratio to check both crops.
        </p>
        <div style={{ marginBottom: 24, display: 'flex', gap: 8 }}>
          {(['story', 'feed'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRatio(r)}
              style={{
                padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13,
                background: ratio === r ? '#C2A24C' : '#2E4257', color: ratio === r ? '#16263B' : '#F2ECDD',
              }}
            >
              {r === 'story' ? 'Story 9:16' : 'Feed 4:5'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32 }}>
          {SCENARIOS.map((scn) => <ScenarioBlock key={scn.key} scn={scn} ratio={ratio} />)}
        </div>
      </div>
    </div>
  )
}
