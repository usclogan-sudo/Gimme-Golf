import { useState } from 'react'
import type { Player, PropBet, PropOutcome, AutoResolveConfig, PropCategory, PropWagerModel } from '../../types'

interface Props {
  players: Player[]
  roundId: string
  onCreateProp: (prop: Omit<PropBet, 'id' | 'userId' | 'createdAt'>) => void
  onClose: () => void
  creatorId: string
}

const AMOUNT_OPTIONS = [200, 500, 1000, 2000, 5000]

export function CreateSkillPropForm({ players, roundId, onCreateProp, onClose, creatorId }: Props) {
  const [propType, setPropType] = useState<'over_under' | 'h2h'>('over_under')
  const [playerA, setPlayerA] = useState<string>('')
  const [playerB, setPlayerB] = useState<string>('')
  const [metric, setMetric] = useState<'gross' | 'net'>('gross')
  const [threshold, setThreshold] = useState('')
  const [holeRange, setHoleRange] = useState<'all' | 'front' | 'back'>('all')
  const [stakeCents, setStakeCents] = useState(500)
  const [autoResolve, setAutoResolve] = useState(true)

  const handleCreate = () => {
    if (propType === 'over_under') {
      if (!playerA || !threshold) return
      const thresholdNum = parseFloat(threshold)
      if (isNaN(thresholdNum)) return
      const player = players.find(p => p.id === playerA)
      const outcomes: PropOutcome[] = [
        { id: 'over', label: `Over ${threshold}` },
        { id: 'under', label: `Under ${threshold}` },
      ]
      const autoConfig: AutoResolveConfig = {
        type: 'over_under',
        playerId: playerA,
        threshold: thresholdNum,
        metric,
        holeRange,
      }
      onCreateProp({
        roundId,
        creatorId,
        title: `${player?.name ?? 'Player'} ${metric} score O/U ${threshold} (${holeRange === 'all' ? 'full round' : holeRange + ' 9'})`,
        category: 'skill' as PropCategory,
        wagerModel: 'pool' as PropWagerModel,
        stakeCents,
        outcomes,
        resolveType: autoResolve ? 'auto' : 'manual',
        autoResolveConfig: autoResolve ? autoConfig : undefined,
        targetPlayerId: playerA,
        status: 'open',
        holeNumber: undefined,
      })
    } else {
      if (!playerA || !playerB || playerA === playerB) return
      const pA = players.find(p => p.id === playerA)
      const pB = players.find(p => p.id === playerB)
      const outcomes: PropOutcome[] = [
        { id: playerA, label: pA?.name ?? 'Player A' },
        { id: playerB, label: pB?.name ?? 'Player B' },
      ]
      const autoConfig: AutoResolveConfig = {
        type: 'h2h',
        playerId: playerA,
        playerIdB: playerB,
        metric,
        holeRange,
      }
      onCreateProp({
        roundId,
        creatorId,
        title: `${pA?.name ?? 'A'} vs ${pB?.name ?? 'B'} — ${metric} score (${holeRange === 'all' ? 'full round' : holeRange + ' 9'})`,
        category: 'h2h' as PropCategory,
        wagerModel: 'pool' as PropWagerModel,
        stakeCents,
        outcomes,
        resolveType: autoResolve ? 'auto' : 'manual',
        autoResolveConfig: autoResolve ? autoConfig : undefined,
        status: 'open',
        holeNumber: undefined,
      })
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-800 dark:text-gray-100 text-lg">New Skill Prop</h3>
        <button onClick={onClose} className="text-sm text-gray-500 font-semibold">Cancel</button>
      </div>

      {/* Type selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setPropType('over_under')}
          className={`flex-1 py-2 text-sm font-bold rounded-xl ${propType === 'over_under' ? 'bg-purple-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}
        >
          Over/Under
        </button>
        <button
          onClick={() => setPropType('h2h')}
          className={`flex-1 py-2 text-sm font-bold rounded-xl ${propType === 'h2h' ? 'bg-purple-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}
        >
          Head to Head
        </button>
      </div>

      {/* Player A */}
      <div>
        <p className="text-xs text-gray-500 mb-1 font-semibold">{propType === 'h2h' ? 'Player A' : 'Player'}</p>
        <div className="flex flex-wrap gap-1.5">
          {players.map(p => (
            <button
              key={p.id}
              onClick={() => setPlayerA(p.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
                playerA === p.id ? 'bg-purple-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Player B (H2H only) */}
      {propType === 'h2h' && (
        <div>
          <p className="text-xs text-gray-500 mb-1 font-semibold">Player B</p>
          <div className="flex flex-wrap gap-1.5">
            {players.filter(p => p.id !== playerA).map(p => (
              <button
                key={p.id}
                onClick={() => setPlayerB(p.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
                  playerB === p.id ? 'bg-indigo-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Threshold (O/U only) */}
      {propType === 'over_under' && (
        <div>
          <p className="text-xs text-gray-500 mb-1 font-semibold">Threshold</p>
          <input
            type="number"
            step="0.5"
            value={threshold}
            onChange={e => setThreshold(e.target.value)}
            placeholder="e.g. 82.5"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100"
          />
        </div>
      )}

      {/* Metric */}
      <div className="flex gap-2">
        <button
          onClick={() => setMetric('gross')}
          className={`flex-1 py-1.5 text-xs font-bold rounded-lg ${metric === 'gross' ? 'bg-purple-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}
        >
          Gross
        </button>
        <button
          onClick={() => setMetric('net')}
          className={`flex-1 py-1.5 text-xs font-bold rounded-lg ${metric === 'net' ? 'bg-purple-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}
        >
          Net
        </button>
      </div>

      {/* Hole range */}
      <div className="flex gap-2">
        {(['all', 'front', 'back'] as const).map(range => (
          <button
            key={range}
            onClick={() => setHoleRange(range)}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg ${
              holeRange === range ? 'bg-purple-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
            }`}
          >
            {range === 'all' ? 'Full Round' : range === 'front' ? 'Front 9' : 'Back 9'}
          </button>
        ))}
      </div>

      {/* Stake */}
      <div>
        <p className="text-xs text-gray-500 mb-1 font-semibold">Amount</p>
        <div className="flex gap-1.5">
          {AMOUNT_OPTIONS.map(amt => (
            <button
              key={amt}
              onClick={() => setStakeCents(amt)}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg ${
                stakeCents === amt ? 'bg-purple-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
              }`}
            >
              ${amt / 100}
            </button>
          ))}
        </div>
      </div>

      {/* Auto-resolve toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={autoResolve}
          onChange={e => setAutoResolve(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 text-purple-500 focus:ring-purple-500"
        />
        <span className="text-sm text-gray-700 dark:text-gray-300">Auto-resolve from scores</span>
      </label>

      {/* Create */}
      <button
        onClick={handleCreate}
        disabled={propType === 'over_under' ? (!playerA || !threshold) : (!playerA || !playerB)}
        className="w-full py-3 bg-purple-600 text-white font-bold rounded-xl active:bg-purple-700 disabled:opacity-40"
      >
        Create Prop — ${stakeCents / 100}
      </button>
    </div>
  )
}
