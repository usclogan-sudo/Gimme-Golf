import { useState } from 'react'
import { submitFeedback, type FeedbackCategory } from '../lib/feedback'

interface Props {
  userId: string | null
  defaultEmail?: string
  onClose: () => void
}

const CATEGORIES: { key: FeedbackCategory; label: string; emoji: string }[] = [
  { key: 'bug',    label: 'Something broke', emoji: '🐞' },
  { key: 'idea',   label: 'Idea',            emoji: '💡' },
  { key: 'praise', label: 'Praise',          emoji: '⛳' },
  { key: 'other',  label: 'Other',           emoji: '✉️' },
]

export function FeedbackModal({ userId, defaultEmail, onClose }: Props) {
  const [category, setCategory] = useState<FeedbackCategory>('bug')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState(defaultEmail ?? '')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const handleSend = async () => {
    setError(null)
    setSending(true)
    const result = await submitFeedback({
      userId,
      userEmail: email,
      category,
      message,
    })
    setSending(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setSent(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-4 pt-10">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md max-h-full overflow-auto">
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-gray-900 dark:text-gray-100">
            {sent ? "Thanks — we've got it." : 'Send feedback'}
          </h2>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 text-2xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {sent ? (
          <div className="px-5 pb-5 space-y-3 text-center">
            <p className="text-5xl">📬</p>
            <p className="text-gray-600 dark:text-gray-300 text-sm">We read every one. If you left an email and it needs a reply, we'll be in touch.</p>
            <button
              onClick={onClose}
              className="w-full h-12 bg-gray-800 text-white dark:bg-brass dark:text-navy font-bold rounded-xl active:bg-gray-900 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="px-5 pb-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                What kind?
              </label>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map(c => (
                  <button
                    key={c.key}
                    onClick={() => setCategory(c.key)}
                    className={`h-12 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
                      category === c.key
                        ? 'bg-gray-800 text-white dark:bg-brass dark:text-navy'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200'
                    }`}
                  >
                    <span>{c.emoji}</span>
                    <span>{c.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {category === 'bug' ? "What happened?" : category === 'idea' ? "What's the idea?" : 'Tell us'}
              </label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={5}
                placeholder={
                  category === 'bug'
                    ? "I tapped X and Y happened…"
                    : category === 'idea'
                    ? 'It would be great if…'
                    : 'Anything on your mind.'
                }
                className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Email <span className="font-normal normal-case text-gray-400">(optional — only if you want a reply)</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full h-12 px-4 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 text-base focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <p className="text-xs text-gray-400">
              We'll auto-attach your app version, platform, and current screen — saves you typing.
            </p>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <button
              onClick={handleSend}
              disabled={sending || !message.trim()}
              className="w-full h-14 bg-gray-800 text-white dark:bg-brass dark:text-navy text-lg font-bold rounded-2xl shadow-lg disabled:opacity-40 active:bg-gray-900 transition-colors"
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
