import { lazy, Suspense } from 'react'

// r3f-perf is a dev tool: it costs measurable frame time and shows a debug overlay to users.
// Lazy + DEV-gated so the production bundle never contains it.
const Perf = lazy(async () => ({ default: (await import('r3f-perf')).Perf }))

export function PerfOverlay() {
  if (!import.meta.env.DEV) return null
  return (
    <Suspense fallback={null}>
      <Perf position="bottom-left" />
    </Suspense>
  )
}
