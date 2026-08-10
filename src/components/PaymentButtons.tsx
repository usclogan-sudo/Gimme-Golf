import { useState } from 'react'
import {
  venmoLink,
  venmoWebLink,
  zelleLink,
  cashAppLink,
  paypalLink,
} from '../lib/gameLogic'
import type { Player } from '../types'

function smartVenmoLink(username: string, amountCents: number, note: string): string {
  const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent)
  if (isMobile) return venmoLink(username, amountCents, note)
  return venmoWebLink(username, amountCents, note)
}

/** Returns the preferred payment method for a player (first available) */
export function getPreferredPayment(player: Player): { method: string; handle: string; link?: string } | null {
  if (player.venmoUsername) return { method: 'Venmo', handle: `@${player.venmoUsername.replace('@', '')}` }
  if (player.zelleIdentifier) return { method: 'Zelle', handle: player.zelleIdentifier }
  if (player.cashAppUsername) return { method: 'Cash App', handle: `$${player.cashAppUsername.replace('$', '')}` }
  if (player.paypalEmail) return { method: 'PayPal', handle: player.paypalEmail }
  return null
}

export function PaymentButtons({ toPlayer, amountCents, note, compact }: { toPlayer: Player; amountCents: number; note: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const fullNote = `Gimme Golf — ${note}`
  // amountCents is always real cents here (callers convert points→cents for the
  // deep links); surface it as points (1 pt = $1) so no $ appears in-app.
  const copyText = `Pay ${toPlayer.name} ${Math.round(amountCents / 100)} pts for ${fullNote}`
  const handleCopy = () => {
    navigator.clipboard.writeText(copyText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  const hasVenmo = !!toPlayer.venmoUsername
  const hasZelle = !!toPlayer.zelleIdentifier
  const hasCashApp = !!toPlayer.cashAppUsername
  const hasPaypal = !!toPlayer.paypalEmail
  const hasAny = hasVenmo || hasZelle || hasCashApp || hasPaypal

  const methods = [
    hasVenmo && { key: 'venmo', label: 'Venmo', href: smartVenmoLink(toPlayer.venmoUsername!, amountCents, fullNote), bg: 'bg-blue-600 active:bg-blue-700 text-white' },
    hasZelle && { key: 'zelle', label: 'Zelle', href: zelleLink(toPlayer.zelleIdentifier!), bg: 'bg-purple-600 active:bg-purple-700 text-white' },
    hasCashApp && { key: 'cashapp', label: 'Cash App', href: cashAppLink(toPlayer.cashAppUsername!, amountCents, fullNote), bg: 'bg-green-600 active:bg-green-700 text-white' },
    hasPaypal && { key: 'paypal', label: 'PayPal', href: paypalLink(toPlayer.paypalEmail!, amountCents), bg: 'bg-yellow-500 active:bg-yellow-600 text-black' },
  ].filter(Boolean) as { key: string; label: string; href: string; bg: string }[]

  // Compact mode: show only primary button + "more" link
  if (compact && hasAny) {
    const primary = methods[0]
    const others = methods.slice(1)
    return (
      <div className="space-y-1">
        <a href={primary.href} target="_blank" rel="noopener noreferrer"
          className={`w-full h-10 font-semibold rounded-xl flex items-center justify-center text-sm ${primary.bg}`}>
          Pay via {primary.label}
        </a>
        {others.length > 0 && !showMore && (
          <button onClick={() => setShowMore(true)} className="text-xs text-gray-400 underline w-full text-center">
            More options
          </button>
        )}
        {showMore && (
          <div className="flex flex-wrap gap-1.5">
            {others.map(m => (
              <a key={m.key} href={m.href} target="_blank" rel="noopener noreferrer"
                className={`flex-1 min-w-[80px] h-9 font-semibold rounded-lg flex items-center justify-center text-xs ${m.bg}`}>
                {m.label}
              </a>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {hasAny ? (
        <>
          <div className="flex flex-wrap gap-2">
            {hasVenmo && (
              <a href={smartVenmoLink(toPlayer.venmoUsername!, amountCents, fullNote)} target="_blank" rel="noopener noreferrer"
                className="flex-1 min-w-[120px] h-11 bg-blue-600 text-white font-semibold rounded-xl flex items-center justify-center gap-1.5 active:bg-blue-700 text-sm">
                Venmo
              </a>
            )}
            {hasZelle && (
              <a href={zelleLink(toPlayer.zelleIdentifier!)} target="_blank" rel="noopener noreferrer"
                className="flex-1 min-w-[120px] h-11 bg-purple-600 text-white font-semibold rounded-xl flex items-center justify-center gap-1.5 active:bg-purple-700 text-sm">
                Zelle
              </a>
            )}
            {hasCashApp && (
              <a href={cashAppLink(toPlayer.cashAppUsername!, amountCents, fullNote)} target="_blank" rel="noopener noreferrer"
                className="flex-1 min-w-[120px] h-11 bg-green-600 text-white font-semibold rounded-xl flex items-center justify-center gap-1.5 active:bg-gray-800 text-sm">
                Cash App
              </a>
            )}
            {hasPaypal && (
              <a href={paypalLink(toPlayer.paypalEmail!, amountCents)} target="_blank" rel="noopener noreferrer"
                className="flex-1 min-w-[120px] h-11 bg-yellow-500 text-black font-semibold rounded-xl flex items-center justify-center gap-1.5 active:bg-yellow-600 text-sm">
                PayPal
              </a>
            )}
          </div>
          <button onClick={handleCopy} className={`w-full text-center text-xs transition-colors ${copied ? 'text-green-600 font-semibold' : 'text-gray-400 underline'}`}>
            {copied ? 'Copied!' : 'Or copy payment details'}
          </button>
        </>
      ) : (
        <button onClick={handleCopy}
          className={`w-full h-11 font-semibold rounded-xl transition-colors ${copied ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 active:bg-gray-200'}`}>
          {copied ? 'Copied!' : 'Copy settle message'}
        </button>
      )}
    </div>
  )
}
