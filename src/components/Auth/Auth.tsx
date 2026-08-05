import { useState } from 'react'
import { supabase } from '../../lib/supabase'

type AuthMode = 'splash' | 'sign-in' | 'sign-up' | 'forgot-password'

interface AuthProps {
  inviteCode?: string
  /** True when the user was signed in earlier this session and got logged out — show a "session expired" banner instead of a generic welcome. */
  sessionExpired?: boolean
}

export function Auth({ inviteCode, sessionExpired }: AuthProps = {}) {
  const [mode, setMode] = useState<AuthMode>('splash')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const resetState = (nextMode: AuthMode) => {
    setError(null)
    setMessage(null)
    setPassword('')
    setMode(nextMode)
  }

  const isValidEmail = (e: string) => /^\S+@\S+\.\S+$/.test(e)

  const friendlyError = (msg: string): string => {
    const lower = msg.toLowerCase()
    if (lower.includes('sending confirmation') || lower.includes('sending email') || lower.includes('rate limit') || lower.includes('email rate'))
      return 'Email service is temporarily rate-limited. Try again in a few minutes, or use "Try it first" to continue as a guest.'
    if (lower.includes('invalid login'))
      return 'Incorrect email or password'
    if (lower.includes('already registered') || lower.includes('already been registered'))
      return 'An account with this email already exists. Try signing in instead.'
    return msg
  }

  const handleSignIn = async () => {
    if (!email.trim()) { setError('Enter your email address'); return }
    if (!isValidEmail(email.trim())) { setError('Enter a valid email address'); return }
    if (!password) { setError('Enter your password'); return }
    setLoading(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (err) setError(friendlyError(err.message))
    setLoading(false)
  }

  const handleSignUp = async () => {
    if (!email.trim()) { setError('Enter your email address'); return }
    if (!isValidEmail(email.trim())) { setError('Enter a valid email address'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    setError(null)
    const { error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: window.location.origin + '/' },
    })
    if (err) {
      setError(friendlyError(err.message))
    }
    // With autoconfirm enabled, signUp auto-signs in — no message needed
    setLoading(false)
  }


  const handleGuestLogin = async () => {
    setLoading(true)
    setError(null)
    // Never downgrade a real session to anonymous. If a (non-anonymous) session is
    // somehow already present — e.g. a token that refreshed after this screen
    // rendered — keep it instead of creating a guest account.
    const { data: { session: existing } } = await supabase.auth.getSession()
    if (existing?.user && existing.user.is_anonymous !== true) {
      setLoading(false)
      return
    }
    const { error: err } = await supabase.auth.signInAnonymously()
    if (err) setError(friendlyError(err.message))
    setLoading(false)
  }

  const handleForgotPassword = async () => {
    if (!email.trim()) { setError('Enter your email address'); return }
    if (!isValidEmail(email.trim())) { setError('Enter a valid email address'); return }
    setLoading(true)
    setError(null)
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + '/',
    })
    if (err) {
      setError(friendlyError(err.message))
    } else {
      setMessage('Check your email for a password reset link.')
    }
    setLoading(false)
  }

  const handleSubmit = () => {
    if (mode === 'sign-in') handleSignIn()
    else if (mode === 'sign-up') handleSignUp()
    else if (mode === 'forgot-password') handleForgotPassword()
  }

  const title = {
    'splash': '',
    'sign-in': 'Sign In',
    'sign-up': 'Create Account',
    'forgot-password': 'Reset Password',
  }[mode]

  const buttonLabel = {
    'splash': '',
    'sign-in': 'Sign In',
    'sign-up': 'Create Account',
    'forgot-password': 'Send Reset Link',
  }[mode]

  const showPassword = mode === 'sign-in' || mode === 'sign-up'

  // Splash screen with inline sign-in
  if (mode === 'splash') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-gray-900 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <div className="text-7xl mb-4">&#9971;</div>
            <h1 className="font-display text-4xl font-800 tracking-tight text-gray-900 dark:text-gray-100">Gimme</h1>
            <p className="text-[#C2A24C] text-sm font-medium mt-2 tracking-widest uppercase">Side Games &middot; Scores &middot; Settled</p>
          </div>

          {inviteCode && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 text-center">
              <p className="text-blue-800 font-semibold text-sm">You've been invited to a round!</p>
              <p className="text-blue-600 text-xs mt-0.5">Sign in or create an account to join.</p>
            </div>
          )}

          {!inviteCode && sessionExpired && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-center">
              <p className="text-amber-800 font-semibold text-sm">Welcome back.</p>
              <p className="text-amber-600 text-xs mt-0.5">Everything's right where you left it. Sign in to pick up.</p>
            </div>
          )}

          {/* Inline sign-in form */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 space-y-3">
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (password ? handleSignIn() : undefined)}
              autoComplete="email"
              className="w-full h-12 px-4 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
              autoFocus
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSignIn()}
              autoComplete="current-password"
              className="w-full h-12 px-4 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              onClick={handleSignIn}
              disabled={loading}
              className="w-full h-14 bg-gray-800 text-white text-lg font-bold rounded-2xl shadow-lg disabled:opacity-60 active:bg-gray-900 transition-colors"
            >
              {loading ? 'Loading...' : 'Sign In'}
            </button>
            <p className="text-xs text-gray-400 text-center">
              <button onClick={() => resetState('forgot-password')} className="text-amber-600 underline">Forgot password?</button>
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => resetState('sign-up')}
              className="w-full h-14 bg-white text-amber-600 text-lg font-bold rounded-2xl shadow-sm border-2 border-gray-800 active:bg-gray-50 transition-colors"
            >
              Create Account
            </button>
          </div>

          {/* Hide the guest path for a returning user whose session expired \u2014 going
              anonymous here would strand them in a guest account ("You / HCP 0") and
              hide their real rounds/ledger. They should sign back in. */}
          {!sessionExpired && (
            <div className="text-center">
              <button
                onClick={handleGuestLogin}
                disabled={loading}
                className="text-gray-500 text-sm underline disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Try it first \u2014 no account needed'}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Form screens (sign-in, sign-up, forgot-password)
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-900 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="text-6xl mb-4">&#9971;</div>
          <h1 className="font-display text-3xl font-800 tracking-tight text-gray-900 dark:text-gray-100">Gimme</h1>
          <p className="text-[#C2A24C] text-sm font-medium mt-1 tracking-wide">SIDE GAMES &middot; SCORES &middot; SETTLED</p>
        </div>

        {message ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center space-y-2">
            <p className="text-3xl">&#128236;</p>
            <p className="font-semibold text-amber-900">{message}</p>
            <button
              onClick={() => resetState('sign-in')}
              className="text-amber-600 text-sm underline mt-2"
            >
              Back to Sign In
            </button>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => resetState('splash')}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-lg"
                aria-label="Back"
              >
                &larr;
              </button>
              <p className="font-semibold text-gray-700">{title}</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Email Address
              </label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                autoComplete="email"
                className="w-full h-12 px-4 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
                autoFocus
              />
            </div>

            {showPassword && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Password
                </label>
                <input
                  type="password"
                  placeholder={mode === 'sign-up' ? 'At least 8 characters' : 'Your password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
                  className="w-full h-12 px-4 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            )}

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full h-14 bg-gray-800 text-white text-lg font-bold rounded-2xl shadow-lg disabled:opacity-60 active:bg-gray-900 transition-colors"
            >
              {loading ? 'Loading...' : buttonLabel}
            </button>

            <div className="space-y-2 text-center text-sm">
              {mode === 'sign-in' && (
                <>
                  <p className="text-gray-400">
                    No account?{' '}
                    <button onClick={() => resetState('sign-up')} className="text-amber-600 underline">
                      Create one
                    </button>
                  </p>
                  <p className="text-xs text-gray-400">
                    <button onClick={() => resetState('forgot-password')} className="text-amber-600 underline">Forgot password?</button>
                  </p>
                </>
              )}
              {mode === 'sign-up' && (
                <p className="text-gray-400">
                  Already have an account?{' '}
                  <button onClick={() => resetState('sign-in')} className="text-amber-600 underline">
                    Sign in
                  </button>
                </p>
              )}
              {mode === 'forgot-password' && (
                <p className="text-gray-400">
                  Remember your password?{' '}
                  <button onClick={() => resetState('sign-in')} className="text-amber-600 underline">
                    Sign in
                  </button>
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
