import { useState } from 'react'
import { supabase } from '../../lib/supabase'

interface Props {
  userId: string
  onComplete: () => void
}

export function Onboarding({ userId, onComplete }: Props) {
  const [step, setStep] = useState<'profile' | 'payment'>('profile')
  const [displayName, setDisplayName] = useState('')
  const [handicapIndex, setHandicapIndex] = useState('')
  const [venmo, setVenmo] = useState('')
  const [zelle, setZelle] = useState('')
  const [cashapp, setCashapp] = useState('')
  const [paypal, setPaypal] = useState('')
  const [preferred, setPreferred] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleNextStep = () => {
    setError('')
    if (!displayName.trim()) { setError('Name is required'); return }
    if (handicapIndex.trim()) {
      const hcp = parseFloat(handicapIndex)
      if (isNaN(hcp) || hcp < -10 || hcp > 54) { setError('Handicap must be between -10 and 54'); return }
    }
    setStep('payment')
  }

  const handleFinish = async () => {
    setSaving(true)
    setError('')
    try {
      const hcp = handicapIndex.trim() ? parseFloat(handicapIndex) : null
      const { error: err } = await supabase
        .from('user_profiles')
        .update({
          onboarding_complete: true,
          display_name: displayName.trim(),
          handicap_index: hcp,
          venmo_username: venmo.trim() || null,
          zelle_identifier: zelle.trim() || null,
          cashapp_username: cashapp.trim() || null,
          paypal_email: paypal.trim() || null,
          preferred_payment: preferred || null,
        })
        .eq('user_id', userId)
      if (err) {
        setError('Failed to save profile. Please try again.')
        setSaving(false)
        return
      }
      onComplete()
    } catch {
      setError('Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  const METHODS = [
    { key: 'venmo', label: 'Venmo' },
    { key: 'zelle', label: 'Zelle' },
    { key: 'cashapp', label: 'Cash App' },
    { key: 'paypal', label: 'PayPal' },
  ]

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-900 flex flex-col">
      <header className="app-header text-white px-4 pt-6 pb-5 shadow-xl">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="font-display text-3xl font-800 tracking-tight">Gimme</h1>
          <p className="text-[#C2A24C] text-sm font-medium mt-0.5 tracking-wide">SIDE GAMES · SCORES · SETTLED</p>
        </div>
      </header>

      {/* Step dots */}
      <div className="flex justify-center gap-2 py-3">
        <div className={`w-2 h-2 rounded-full ${step === 'profile' ? 'bg-amber-500' : 'bg-gray-300'}`} />
        <div className={`w-2 h-2 rounded-full ${step === 'payment' ? 'bg-amber-500' : 'bg-gray-300'}`} />
      </div>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-10 max-w-lg mx-auto w-full">
        {step === 'profile' ? (
          <div className="text-center space-y-6 w-full">
            <div className="text-7xl">&#9971;</div>
            <h2 className="font-display text-3xl font-bold text-gray-900 dark:text-gray-100">Welcome to Gimme</h2>
            <p className="text-gray-500 dark:text-gray-400 text-lg">Track your side games, keep score, and settle up clean — all in one place.</p>

            <div className="space-y-3 text-left">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Your Name</label>
                <input
                  type="text"
                  placeholder="e.g. John Smith"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  className="w-full h-12 px-4 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Handicap Index <span className="font-normal text-gray-400">(optional)</span></label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  placeholder="e.g. 12.4"
                  value={handicapIndex}
                  onChange={e => setHandicapIndex(e.target.value)}
                  className="w-full h-12 px-4 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5 leading-snug">
                  Your USGA index, if you know it. Skip if you're not sure — we'll track one for you as you play.
                </p>
              </div>
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <button
              onClick={handleNextStep}
              className="w-full h-14 bg-gray-800 text-white dark:bg-brass dark:text-navy text-lg font-bold rounded-2xl shadow-lg active:bg-gray-900 transition-colors"
            >
              Next
            </button>
          </div>
        ) : (
          <div className="text-center space-y-6 w-full">
            <div className="text-5xl">💰</div>
            <h2 className="font-display text-2xl font-bold text-gray-900 dark:text-gray-100">Payment Info</h2>
            <p className="text-gray-500 dark:text-gray-400">So your group can settle up after the round. Optional — add it anytime.</p>

            <div className="space-y-3 text-left">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Venmo Username</label>
                <input type="text" placeholder="@username" value={venmo} onChange={e => setVenmo(e.target.value)}
                  className="w-full h-12 px-4 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Zelle Email or Phone</label>
                <input type="text" placeholder="email or phone" value={zelle} onChange={e => setZelle(e.target.value)}
                  className="w-full h-12 px-4 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Cash App</label>
                <input type="text" placeholder="$cashtag" value={cashapp} onChange={e => setCashapp(e.target.value)}
                  className="w-full h-12 px-4 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">PayPal Email</label>
                <input type="email" placeholder="email@example.com" value={paypal} onChange={e => setPaypal(e.target.value)}
                  className="w-full h-12 px-4 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>

              {(venmo || zelle || cashapp || paypal) && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Preferred Method</label>
                  <div className="flex flex-wrap gap-2">
                    {METHODS.filter(m => {
                      if (m.key === 'venmo') return !!venmo
                      if (m.key === 'zelle') return !!zelle
                      if (m.key === 'cashapp') return !!cashapp
                      if (m.key === 'paypal') return !!paypal
                      return false
                    }).map(m => (
                      <button key={m.key} onClick={() => setPreferred(m.key)}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                          preferred === m.key ? 'bg-amber-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep('profile')}
                className="flex-1 h-14 border-2 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 font-semibold rounded-2xl active:bg-gray-50 dark:active:bg-gray-700">
                Back
              </button>
              <button
                onClick={handleFinish}
                disabled={saving}
                className="flex-1 h-14 bg-gray-800 text-white dark:bg-brass dark:text-navy text-lg font-bold rounded-2xl shadow-lg disabled:opacity-60 active:bg-gray-900 transition-colors"
              >
                {saving ? 'Starting...' : 'Get Started'}
              </button>
            </div>

            <button onClick={handleFinish} disabled={saving} className="text-gray-400 text-sm underline">
              Skip for now
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
