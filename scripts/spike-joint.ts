/**
 * Phase 3 spike (plan/03-physics.md): verify the joint approach against the installed Rapier
 * before building the full Building component.
 *
 * plan/03-physics.md proposes a spherical joint plus an angular motor spring. In the installed
 * Rapier (0.14) `configureMotorPosition` lives only on UnitImpulseJoint (revolute/prismatic),
 * not on SphericalImpulseJoint — so that API does not exist here. This spike tests the shear
 * storey instead:
 *
 *   generic joint  — locks LinY and all three angular axes, leaving X/Z free
 *   spring joint   — zero rest length between the same anchor pair, giving a linear lateral
 *                    restoring force solved implicitly by Rapier (stable at high stiffness)
 *
 * One storey, base fixed. Push it sideways and measure the free-vibration period against
 * the analytic 2*pi*sqrt(m/k).
 */
import RAPIER from '@dimforge/rapier3d-compat'

await RAPIER.init()

const H = 3
const M = Number(process.env.SPIKE_M ?? 15_000)
const K = Number(process.env.SPIKE_K ?? 5.92e7)
const C = Number(process.env.SPIKE_C ?? 0)
const DT = 1 / 120
const STEPS = 1200

const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
world.timestep = DT
world.numSolverIterations = 8

const base = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0))
world.createCollider(RAPIER.ColliderDesc.cuboid(5, 0.5, 5), base)

const floor = world.createRigidBody(
  RAPIER.RigidBodyDesc.dynamic().setTranslation(0, H / 2, 0).lockRotations().setCanSleep(false),
)
world.createCollider(RAPIER.ColliderDesc.cuboid(3, H / 2, 3).setMass(M), floor)

const a1 = { x: 0, y: 0.5, z: 0 } // top face of the base, in base-local space
const a2 = { x: 0, y: -H / 2, z: 0 } // bottom face of the floor, in floor-local space

const mask =
  RAPIER.JointAxesMask.LinY |
  RAPIER.JointAxesMask.AngX |
  RAPIER.JointAxesMask.AngY |
  RAPIER.JointAxesMask.AngZ

const guide = world.createImpulseJoint(
  RAPIER.JointData.generic(a1, a2, { x: 1, y: 0, z: 0 }, mask),
  base,
  floor,
  true,
)
// Jointed neighbours touch face-to-face. Leaving contacts on means sliding friction between
// them silently dissipates the sway — which reads as a mystery damping term.
if (process.env.SPIKE_CONTACTS !== '1') guide.setContactsEnabled(false)
if (process.env.SPIKE_NOSPRING !== "1") world.createImpulseJoint(RAPIER.JointData.spring(0, K, C, a1, a2), base, floor, true)

floor.applyImpulse({ x: M * 0.5, y: 0, z: 0 }, true)

const xs: number[] = []
let nanAt = -1
for (let i = 0; i < STEPS; i++) {
  world.step()
  const x = floor.translation().x
  if (nanAt < 0 && !Number.isFinite(x)) nanAt = i
  xs.push(x)
}

const crossings: number[] = []
for (let i = 1; i < xs.length; i++) {
  if (xs[i - 1] <= 0 && xs[i] > 0) crossings.push(i * DT)
}
const periods = crossings.slice(1).map((t, i) => t - crossings[i])
const mean = periods.reduce((s, p) => s + p, 0) / Math.max(periods.length, 1)

const peakEarly = Math.max(...xs.slice(0, 240).map(Math.abs))
const peakLate = Math.max(...xs.slice(-240).map(Math.abs))

console.log('NaN at step     ', nanAt < 0 ? 'never' : nanAt)
console.log('peak |x| early  ', peakEarly.toFixed(5), 'm')
console.log('peak |x| late   ', peakLate.toFixed(5), 'm   (growth =', (peakLate / peakEarly).toFixed(3), ')')
console.log('y drift         ', (floor.translation().y - H / 2).toExponential(2), 'm')
console.log('period measured ', mean.toFixed(4), 's   analytic', (2 * Math.PI * Math.sqrt(M / K)).toFixed(4), 's')
console.log('cycles found    ', periods.length)

console.log('x trace (every 3rd step, first 60):')
console.log(xs.filter((_, i) => i % 3 === 0).slice(0, 40).map((v) => v.toFixed(5)).join(' '))
console.log('min x', Math.min(...xs).toExponential(2), ' max x', Math.max(...xs).toExponential(2))
