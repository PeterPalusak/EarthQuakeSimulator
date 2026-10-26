import type RapierNamespace from '@dimforge/rapier3d-compat'

export type Rapier = typeof RapierNamespace

let rapier: Rapier | null = null
let ready: Promise<Rapier> | null = null

/**
 * Loads and instantiates Rapier. Idempotent.
 *
 * Dynamically imported on purpose: `@dimforge/rapier3d-compat` base64-inlines its WebAssembly
 * binary, which is ~1 MB gzipped — more than the rest of the app put together. Keeping it in
 * its own chunk lets the UI and the 3D scene paint while physics is still downloading, which
 * is what the 4G time-to-interactive budget in Implementation_Plan.md needs. It also means a
 * host that mis-serves `.wasm` cannot break the app, since no `.wasm` is fetched separately.
 */
export function initRapier(): Promise<Rapier> {
  ready ??= import('@dimforge/rapier3d-compat').then(async (module) => {
    const api = module.default
    await api.init()
    rapier = api
    return api
  })
  return ready
}

/** The loaded namespace. Throws if `initRapier()` has not resolved yet. */
export function getRapier(): Rapier {
  if (!rapier) throw new Error('Rapier is not initialised — await initRapier() first.')
  return rapier
}
