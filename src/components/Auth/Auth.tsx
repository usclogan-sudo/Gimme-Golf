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
  // Only complain about the address once they have moved on from the field —
  // flagging "invalid" while someone is halfway through typing it is just noise.
  const [emailTouched, setEmailTouched] = useState(false)

  const resetState = (nextMode: AuthMode) => {
    setError(null)
    setMessage(null)
    setPassword('')
    setEmailTouched(false)
    setMode(nextMode)
  }

  const isValidEmail = (e: string) => /^\S+@\S+\.\S+$/.test(e)
  const emailLooksWrong = emailTouched && email.trim().length > 0 && !isValidEmail(email.trim())

  const friendlyError = (msg: string): string => {
    const lower = msg.toLowerCase()
    if (lower.includes('sending confirmation') || lower.includes('sending email') || lower.includes('rate limit') || lower.includes('email rate'))
      return 'Too many sign-up emails at once — wait a minute and try again. If you are with a group, stagger it rather than everyone tapping at the same moment.'
    // Supabase returns one message for both a wrong password and an email with no
    // account — on purpose, so sign-in cannot be used to discover who has one. That
    // is worth keeping, so rather than trying to tell the two apart, name both so
    // whichever it is has an obvious next step. Someone who fumbled sign-up a minute
    // ago is otherwise stuck retyping a password that was never registered.
    if (lower.includes('invalid login'))
      return 'Incorrect email or password. If you haven\u2019t created an account yet, tap Create Account.'
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
    const { data, error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: window.location.origin + '/' },
    })
    if (err) {
      setError(friendlyError(err.message))
      setLoading(false)
      return
    }
    // Supabase does not error when an email is already registered — it returns a
    // user with an empty identities array, so that sign-up cannot be used to probe
    // who has an account. Without this, a returning tester taps Create Account, sees
    // nothing happen, and has no idea they should be signing in instead.
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      setError('That email already has an account. Sign in instead — use "Forgot password?" if you need to.')
      setLoading(false)
      return
    }
    // With autoconfirm on, sign-up returns a session and onAuthStateChange takes it
    // from here. With autoconfirm OFF there is no session and no error, so the screen
    // would sit there looking broken — say what is actually required instead.
    if (!data.session) {
      setMessage('Account created. Check your email to confirm it, then come back and sign in.')
    }
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
      // Supabase answers this the same way whether or not the address has an
      // account — on purpose, so the form cannot be used to discover who is
      // registered. "Check your email" therefore promises something that may never
      // arrive: a typo'd address, or someone who believes they signed up but did
      // not, waits indefinitely for a mail that was never sent. Say what is actually
      // true, and name the two things worth checking before they keep waiting.
      setMessage(
        `If an account exists for ${email.trim()}, a reset link is on its way. ` +
        'It can take a minute — check spam too. No email means there may be no ' +
        'account for that address, so try creating one.',
      )
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
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 text-center">
                <p className="text-blue-800 font-semibold text-sm">You've been invited to a round!</p>
                <p className="text-blue-600 text-xs mt-0.5">Create an account to join and keep your scores.</p>
              </div>
              {/* Invited players are steered to a real account, not the guest path:
                  an account carries their handicap, history and ledger between
                  rounds and devices, where a guest session dies with the browser.
                  The guest link stays available further down as a fallback if
                  sign-up fails on the day. */}
              <button
                onClick={() => resetState('sign-up')}
                disabled={loading}
                className="w-full h-14 bg-gray-800 text-white dark:bg-brass dark:text-navy text-lg font-bold rounded-2xl shadow-lg disabled:opacity-60 active:bg-gray-900 transition-colors"
              >
                Create your account
              </button>
              <p className="text-center text-xs text-gray-500 dark:text-gray-400 -mt-2">
                Already have an account? Sign in below.
              </p>
            </>
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
              autoFocus={!inviteCode}
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
              className="w-full h-14 bg-gray-800 text-white dark:bg-brass dark:text-navy text-lg font-bold rounded-2xl shadow-lg disabled:opacity-60 active:bg-gray-900 transition-colors"
            >
              {loading ? 'Loading...' : 'Sign In'}
            </button>
            {/* Was text-xs grey and easy to miss entirely — someone who cannot sign
                in is exactly the person who needs to find this, and they were
                reporting there was no way to reset at all. */}
            <button
              onClick={() => resetState('forgot-password')}
              className="w-full text-center text-sm font-semibold text-amber-600 underline py-1"
            >
              Forgot your password?
            </button>
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
                onBlur={() => setEmailTouched(true)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                autoComplete="email"
                aria-describedby={emailLooksWrong ? 'email-hint' : undefined}
                className={`w-full h-12 px-4 rounded-xl border dark:bg-gray-700 dark:text-gray-100 text-base focus:outline-none focus:ring-2 ${
                  emailLooksWrong
                    ? 'border-amber-400 focus:ring-amber-500'
                    : 'border-gray-300 dark:border-gray-600 focus:ring-amber-500'
                }`}
                autoFocus
              />
              {/* Caught at blur rather than at submit. A mistyped address is the one
                  unrecoverable mistake here — the password reset goes to whatever
                  they typed — so it is worth flagging before they commit to it.
                  This only catches structural nonsense; gmial.com still gets through. */}
              {emailLooksWrong && (
                <p id="email-hint" className="text-xs mt-1.5 text-amber-600">
                  That doesn't look like an email address — check it before continuing.
                </p>
              )}
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
                  aria-describedby={mode === 'sign-up' ? 'password-req' : undefined}
                  className="w-full h-12 px-4 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                {/* The requirement lived only in the placeholder, so it vanished on
                    the first keystroke — you learned about the minimum by being
                    rejected for missing it. This stays put and counts down, so the
                    rule is visible at the moment it is being broken. */}
                {mode === 'sign-up' && (
                  <p
                    id="password-req"
                    className={`text-xs mt-1.5 ${
                      password.length === 0
                        ? 'text-gray-500 dark:text-gray-400'
                        : password.length < 8
                          ? 'text-amber-600'
                          : 'text-green-600'
                    }`}
                  >
                    {password.length === 0
                      ? 'At least 8 characters'
                      : password.length < 8
                        ? `${8 - password.length} more character${8 - password.length === 1 ? '' : 's'}`
                        : 'Long enough \u2713'}
                  </p>
                )}
              </div>
            )}

            {error && <p className="text-red-500 text-sm">{error}</p>}

            {mode === 'sign-up' && (
              <button
                onClick={() => resetState('forgot-password')}
                className="w-full text-center text-sm font-semibold text-amber-600 underline py-1"
              >
                Already have an account? Reset your password
              </button>
            )}

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full h-14 bg-gray-800 text-white dark:bg-brass dark:text-navy text-lg font-bold rounded-2xl shadow-lg disabled:opacity-60 active:bg-gray-900 transition-colors"
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
