import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

/**
 * `React.lazy` for a named export, hardened against the stale tab case.
 *
 * main.tsx listens for Vite's `vite:preloadError`, calls preventDefault and
 * reloads the page: a tab left open across a deploy asks for a chunk the new
 * build no longer serves, and reloading is the only fix. With preventDefault
 * set, Vite swallows the failure and the dynamic import resolves to undefined
 * instead of rejecting. A plain `.then(m => ({ default: m.Screen }))` then
 * throws "undefined is not an object", the route boundary shows its error
 * card for a moment and ships a Sentry event, and only then does the reload
 * land. This helper keeps Suspense on its fallback instead: the promise never
 * settles, the reload arrives, and nobody sees or logs an error.
 */
export function lazyScreen<M, C extends ComponentType<any>>(
  loader: () => Promise<M>,
  pick: (mod: M) => C,
): LazyExoticComponent<C> {
  return lazy(() =>
    loader().then(mod => (mod == null ? stall<{ default: C }>() : { default: pick(mod) })),
  )
}

/** A promise that never settles. Used only while a page reload is already on its way. */
export function stall<T>(): Promise<T> {
  return new Promise<T>(() => {})
}
