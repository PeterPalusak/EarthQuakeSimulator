# Phase 8 — Deployment

**Goal:** a live URL that installs to an Android home screen, deployed automatically on every push
to `main`, with tests gating the deploy.

**Depends on:** phase 5 for a meaningful first deploy. Phases 6 and 7 for the final one.

Full background in [Description.md](../Description.md) §3.7. This file is the task list.

---

## Do this twice

**First pass, at the end of phase 5.** Get a URL live as soon as there is something worth looking
at. Tasks 8.1–8.4 only.

The reason is not enthusiasm — it is that every deployment-specific failure mode in this project
(WASM MIME type, `base` path, HTTPS, service-worker caching) is invisible in development and
appears only on a real host. Hitting them with a simple app takes an hour; hitting them in week
four, with collapse physics and a service worker caching a stale build, takes a day.

It also means phases 6 and 7 can be tested on a phone from a URL rather than a dev server.

**Second pass, after phase 7.** Tasks 8.5 onward: icons, PWA polish, Lighthouse, README.

---

## Tasks

### 8.1 Pick the host

**Recommended: Cloudflare Pages or Netlify.** Connect the GitHub repo, build command
`npm run build`, output directory `dist`. Every push deploys; every pull request gets a preview
URL that can be opened directly on a phone. Both serve `.wasm` correctly and provide HTTPS.

If staying with GitHub Pages — reasonable, since the repo is already there — note that the site is
served from a subpath:

```
https://peterpalusak.github.io/EarthQuakeSimulator/
```

so `base: '/EarthQuakeSimulator/'` in `vite.config.ts` must match the repository name exactly.
**On any other host, set `base: '/'` instead.** Getting this wrong gives a blank page with 404s on
every asset and no useful error — it is the most likely first-deploy failure.

### 8.2 Enable the CI deploy job

Uncomment the deploy job in `.github/workflows/deploy.yml` (stubbed in phase 0.9). The workflow
from [Description.md](../Description.md) §3.7 runs checkout → install → **`npm test`** →
`npm run build` → publish.

Keep `npm test` ahead of the build and let it block the deploy. The physics regression tests from
phases 3, 6 and 7 are exactly the kind that break quietly during tuning; a red deploy is far
cheaper than discovering in a month that buildings no longer collapse.

For GitHub Pages, also enable Pages in the repository settings with source "GitHub Actions".

### 8.3 Verify the WASM loads

The first thing to check on the live URL, because the failure is silent in the console and total
in effect:

```bash
curl -sI https://<your-url>/assets/<hash>.wasm | grep -i content-type
# expect: content-type: application/wasm
```

If this returns `application/octet-stream` or `text/html`, Rapier will not instantiate and the
scene will never appear. All the recommended hosts get it right; a hand-rolled IIS or nginx may
not.

### 8.4 Smoke-test on a real phone

Open the live URL on Android and confirm: scene renders, touch controls work, a building can be
placed, the quake runs. This is the first pass's exit criterion.

---

### 8.5 PWA assets

- `public/icon-192.png` and `public/icon-512.png`, plus a maskable variant. Android's install
  prompt will not appear without correctly sized icons.
- Manifest is already configured in `vite.config.ts` from phase 0.3. Verify `display:
  'fullscreen'` actually takes effect once installed — the reclaimed browser chrome is worth real
  screen area for a 3D app, and it stops edge swipes being intercepted by the browser.

### 8.6 Service-worker update behaviour

Confirm `registerType: 'autoUpdate'` with `skipWaiting` and `clientsClaim` is behaving: deploy a
visible change, reload on a device that has the old version cached, confirm the new version
appears without needing to close every tab.

Stale-service-worker bugs are confusing to debug later because the symptom is "my fix didn't
deploy" when it deployed perfectly.

### 8.7 Offline check

Load the app, enable airplane mode, reload. It should still work — the WASM and all assets are
precached by the phase 0.3 Workbox config. Worth verifying explicitly, since the `wasm` glob
pattern is easy to lose in a config edit.

### 8.8 Performance verification on the live build

Production builds differ from dev: minified, tree-shaken, served over the network.

- Lighthouse on mobile emulation: Performance > 85, PWA installable ✓
- Initial download under 2 MB gzipped (the budget from the index)
- 60 fps with 10 buildings on a real mid-range phone, from the live URL

Check the bundle for accidental bloat:

```bash
npx vite-bundle-visualizer
```

The usual culprit is importing all of `three` rather than the needed modules, or leaving
`r3f-perf` in the production bundle — gate it behind `import.meta.env.DEV`.

### 8.9 README

Replace the stub `README.md` with: a one-line description, the live URL, a screenshot or GIF of a
collapse, local dev instructions, and a link to [Description.md](../Description.md) and
[Implementation_Plan.md](../Implementation_Plan.md).

The GIF does more than any description — a 12-floor block pancaking is what makes someone open the
link.

### 8.10 Optional — Android via Capacitor

Only if a Play Store listing is genuinely wanted. The PWA covers the same ground with no store
review, no signing keys and no account fee.

```bash
npm i @capacitor/core @capacitor/android && npx cap init
npx cap add android
npm run build && npx cap sync
npx cap open android      # Android Studio → signed AAB
```

No code changes required. Requires Android Studio and a Play Console account (one-off fee).
Set `base: '/'` for this build — a Capacitor app loads from the filesystem root, so a GitHub
Pages subpath would break it.

---

## Definition of done

**First pass (after phase 5):**
- [ ] Live URL loads and renders the scene
- [ ] `.wasm` served as `application/wasm`
- [ ] CI builds and deploys on push, with `npm test` gating
- [ ] Works on a real Android phone from the live URL

**Second pass (after phase 7):**
- [ ] Installs to the Android home screen and launches fullscreen
- [ ] Works offline after first load
- [ ] A new deploy reaches an already-installed client without manual cache clearing
- [ ] Lighthouse mobile performance > 85, PWA installable
- [ ] Bundle under 2 MB gzipped
- [ ] README with live URL and a collapse GIF

---

## Gotchas

- **`base` mismatch** — blank page, 404s on every asset. Check this first on any failed deploy.
- **WASM MIME type** — silent total failure. Covered by 8.3.
- **Stale service worker** — "my fix didn't deploy" when it did. Covered by 8.6.
- **`r3f-perf` shipped to production** — a measurable framerate cost, and a debug overlay visible
  to users. Gate it on `import.meta.env.DEV`.
- **Icons missing or wrongly sized** — no install prompt on Android, with no error explaining why.
- **HTTPS is mandatory** for the service worker and the install prompt. All recommended hosts
  provide it; a plain-HTTP LAN address will never show an install option, which is why phase 0
  added `basic-ssl` for device testing.
