import { Component, type ReactNode } from 'react'
import { Sentry } from '../lib/sentry'

interface Props {
  /** What the boundary wraps, for the fallback copy and the Sentry tag. */
  label: string
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * A small boundary for one piece of a screen — a menu, a modal, a panel. The
 * route-level RouteErrorBoundary replaces the whole screen with a recovery card,
 * which is the wrong size for a dropdown that failed to render. This one shows a
 * plain, compact fallback in place and lets the user try again, and the rest of
 * the screen keeps working. Added for the Wolf header-menu freeze (Finding 3):
 * whatever threw there should have shown this, not a hung renderer.
 */
export class InlineErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    Sentry.captureException(error, {
      tags: { area: 'inline-boundary', label: this.props.label },
      extra: { componentStack: info.componentStack },
    })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div
        role="alert"
        className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-3 py-2 text-sm text-amber-900 dark:text-amber-200"
      >
        <p>Something went wrong showing {this.props.label}. The rest of the round is fine.</p>
        <button
          onClick={() => this.setState({ error: null })}
          className="mt-1 text-xs font-semibold underline"
        >
          Try again
        </button>
      </div>
    )
  }
}
