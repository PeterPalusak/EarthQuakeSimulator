// Vitest runs in the `node` environment by default (see vite.config.ts) — the sim tests need
// no DOM. Component tests opt into jsdom with a `// @vitest-environment jsdom` docblock, and
// this setup file wires up the DOM matchers for them when they do.
if (typeof window !== 'undefined') {
  await import('@testing-library/jest-dom/vitest')
}
