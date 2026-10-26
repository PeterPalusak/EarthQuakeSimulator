import { lazy, Suspense } from 'react'

/**
 * Live fps, draw calls and physics step time, in the corner of the scene.
 *
 * r3f-perf is a dev tool: it costs measurable frame time and puts a debug overlay in front of
 * users. The `import.meta.env.DEV` guard wraps the `lazy()` call itself rather than only the
 * render, so the constant folds to `false` in a production build and Rollup drops the dynamic
 * import with it — otherwise the chunk is still emitted into `dist/`, 96 KB of code that is
 * never fetched but looks very much like it ships.
 */
const Perf = import.meta.env.DEV
  ? lazy(async () => ({ default: (await import('r3f-perf')).Perf }))
  : null

export function PerfOverlay() {
  if (!Perf) return null
  return (
    <Suspense fallback={null}>
      <Perf position="bottom-left" />
    </Suspense>
  )
}
