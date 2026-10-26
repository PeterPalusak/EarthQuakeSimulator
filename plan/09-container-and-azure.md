# Phase 9 — Container & Azure deployment (optional)

**Goal:** the same `dist/` served from a container image, running on Azure behind HTTPS, rebuilt and
redeployed on every push to `main`.

**Depends on:** phase 8 (the static deploy works and the deployment-specific failure modes are
already understood). Can be done immediately after phase 5 if Azure is the required target from the
start — in that case do phase 8 tasks 8.1–8.4 against the container instead of a static host.

**Optional on purpose.** Phase 8 already produces a live, installable, CDN-backed URL for €0. Do
this phase only if one of these is true:

- Azure is the mandated hosting platform (corporate policy, existing subscription)
- You need control over HTTP headers — in particular COOP/COEP, if Rapier is ever switched to its
  multithreaded build
- You want a reproducible, self-hostable artefact ("here is an image, run it anywhere")

Full background in [Description.md](../Description.md) §3.8 and §3.9. This file is the task list.

---

## Decide first: do you actually need the container?

| If you want… | Use | Cost |
|---|---|---|
| Just a URL on Azure | **Azure Static Web Apps** — no container, task 9.9 | €0 |
| A container on Azure | **Azure Container Apps** — tasks 9.1–9.8 | ~€5/mo (registry) |
| An always-on container with slots | App Service for Containers | ~€13/mo + registry |

Static Web Apps is a genuinely better fit for a static PWA than any container: global CDN, free
HTTPS, PR preview environments. If nobody is asking for a container, task 9.9 is the whole phase.

---

## Tasks

### 9.1 Make `base` a build argument

**Do this before anything else** — it is the first thing that breaks.

`vite.config.ts` currently hard-codes `base: '/EarthQuakeSimulator/'` for GitHub Pages (phase 0.3).
A container serves from the root. Replace it with:

```ts
base: process.env.VITE_BASE ?? '/',
```

and add `VITE_BASE: /EarthQuakeSimulator/` to the `env:` block of the existing Pages workflow, so
phase 8's deploy keeps working unchanged. Verify both: `npm run build` produces root-relative paths
in `dist/index.html`, and the Pages build still produces prefixed ones.

### 9.2 `.dockerignore`

Write this before the Dockerfile. Without it `node_modules` (~300 MB) is sent to the build daemon
on every build, which turns a 20-second build into a two-minute one.

```
node_modules
dist
.git
e2e
playwright-report
test-results
*.md
```

### 9.3 `nginx.conf`

Take it verbatim from [Description.md](../Description.md) §3.8. Four things it must do:

1. **SPA fallback** — `try_files $uri $uri/ /index.html`
2. **`.wasm` → `application/wasm`** via the `types { } default_type` idiom (a bare `types` block
   collides with the image's `mime.types`)
3. **Cache policy** — `/assets/*` immutable; `index.html`, `sw.js` and `manifest.webmanifest`
   `no-cache`
4. **gzip** for js/css/wasm/json

Item 3 is the one that bites later: an immutable `sw.js` means deployed fixes never reach returning
users, and the symptom looks like a broken pipeline rather than a caching bug.

### 9.4 `Dockerfile`

Multi-stage, from §3.8: `node:20-alpine` builds, `nginxinc/nginx-unprivileged:1.27-alpine` serves.

- Copy `package*.json` and run `npm ci` **before** copying the source, so dependency installation
  stays in a cached layer.
- Use the unprivileged nginx image — it runs as non-root and listens on **8080**, which is what
  Container Apps and most Kubernetes policies want.
- `ARG VITE_BASE=/` so the image can be rebuilt for a subpath if ever needed.

### 9.5 Verify the image locally

```bash
docker build -t quake:dev .
docker run --rm -p 8080:8080 quake:dev
```

Check, in this order — each one is a known silent failure:

```bash
curl -sI localhost:8080/ | head -1                               # 200
curl -s  localhost:8080/ | grep -o 'src="[^"]*"'                 # paths start with /assets/, not /EarthQuakeSimulator/
curl -sI localhost:8080/assets/<hash>.wasm | grep -i content-type # application/wasm
curl -sI localhost:8080/sw.js | grep -i cache-control             # no-cache
curl -s  localhost:8080/healthz                                   # ok
```

Then open `http://localhost:8080`, place a building, run a quake. `localhost` counts as a secure
context, so the service worker registers here even without HTTPS.

Image size should land around 60 MB. If it is 1 GB, the `.dockerignore` is missing or the build
stage was not actually multi-stage.

### 9.6 E2E against the image

Point the Playwright smoke test from phase 8 at the container rather than the dev server, so CI
tests the artefact that actually ships:

```bash
docker run -d --name quake-ci -p 8080:8080 quake:ci
npx playwright test --base-url http://localhost:8080
docker rm -f quake-ci
```

This is where a wrong `base` or a broken WASM MIME type gets caught automatically, instead of by
someone opening the live URL on a phone.

### 9.7 Provision Azure

Commands in [Description.md](../Description.md) §3.9. Summary:

```
rg-quake  ├── acrquake<n>        Azure Container Registry, Basic
          ├── cae-quake          Container Apps environment
          └── quake              Container App — ingress external, target port 8080,
                                 min-replicas 0, 0.25 vCPU / 0.5 GiB
```

Key flags:

- `--registry-identity system` — system-assigned managed identity with `AcrPull`, so no registry
  password exists anywhere.
- `--target-port 8080` — must match the nginx listener or ingress returns 502 with no useful log.
- `--min-replicas 0` — scale to zero. Costs nothing idle; first request after idle takes ~1–3 s.
  Set it to 1 if a first impression must be instant.

Build with **`az acr build`**, not `docker build && docker push`: it builds server-side, needs no
local daemon, and cannot produce an `arm64` image that crash-loops on Azure.

Exit check:

```bash
az containerapp show -n quake -g rg-quake --query properties.configuration.ingress.fqdn -o tsv
curl -sI https://<fqdn>/assets/<hash>.wasm | grep -i content-type
```

### 9.8 Continuous deployment with OIDC

Add `.github/workflows/azure-container.yml` from §3.9. Set it up **passwordless**:

1. Create a user-assigned managed identity (or app registration) in the same subscription.
2. Add a federated credential for
   `repo:PeterPalusak/EarthQuakeSimulator:ref:refs/heads/main`.
3. Grant it `AcrPush` on the registry and `Contributor` on `rg-quake`.
4. Store `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` as repository **variables**
   (they are identifiers, not secrets).

The workflow needs `permissions: id-token: write` or `azure/login` fails with an opaque OIDC error.

Keep `npm test` ahead of the image build and let it block the deploy, for the same reason as phase
8.2 — the physics regression tests break quietly during tuning.

Tag images with `${{ github.sha }}`. Container Apps creates a revision per image change, so an
immutable tag makes rollback a single `az containerapp update --image …:<previous-sha>`. A floating
`latest` may not even register as a change.

**Decide what happens to the GitHub Pages workflow.** Running both is fine and gives you two URLs,
but then the two `base` values must stay correct in both — the most likely way this phase breaks a
month later. If Azure becomes the real home, delete the Pages workflow.

### 9.9 Alternative — Azure Static Web Apps (no container)

If the container was never a hard requirement, this replaces 9.2–9.8 entirely:

```bash
az staticwebapp create -n swa-quake -g rg-quake -l westeurope --sku Free \
  --source https://github.com/PeterPalusak/EarthQuakeSimulator \
  --branch main --app-location "/" --output-location "dist" --login-with-github
```

It generates its own workflow. Still do task 9.1 (`base` must be `/`), and add the
`staticwebapp.config.json` from §3.9 for the SPA fallback, the `.wasm` MIME type and the `sw.js`
cache header — SWA needs the same four things nginx does, just declared differently.

### 9.10 Update the README

Add the container section: how to build and run the image in one command, and the live Azure URL.
A reader with Docker should be able to run the app without installing Node.

---

## Definition of done

- [ ] `docker build` produces an image under ~100 MB
- [ ] `docker run -p 8080:8080` serves a working app at `http://localhost:8080` — scene renders,
      building places, quake runs
- [ ] `.wasm` is served as `application/wasm`; `sw.js` is `no-cache`; `/assets/*` is immutable
- [ ] Playwright smoke test passes against the container
- [ ] Live Azure HTTPS URL loads and works on a real Android phone, including PWA install
- [ ] Push to `main` rebuilds the image and updates the Container App automatically, gated on
      `npm test`
- [ ] Rollback verified once: redeploy the previous image tag and confirm the old build returns
- [ ] README documents the container route

---

## Gotchas

- **`base` left at `/EarthQuakeSimulator/`** — blank page, 404 on every asset. Check this first on
  any failed container deploy. Task 9.1 exists to prevent it.
- **Port mismatch** — `--target-port` must equal the nginx `listen` port (8080). The failure is a
  502 from ingress with nothing in the container log, because nginx is perfectly healthy and simply
  never contacted.
- **Architecture mismatch** — an `arm64` image built on an Apple Silicon machine pulls fine and then
  crash-loops on Azure. Use `az acr build`, or `docker build --platform linux/amd64`.
- **A bare `types { application/wasm wasm; }` block** in `nginx.conf` collides with the image's own
  `mime.types` and nginx refuses to start. Use the `types { } default_type` form inside a
  `location ~* \.wasm$`.
- **Missing `.dockerignore`** — slow builds, and a stale host `dist/` can be copied into the image
  and silently override the freshly built one.
- **Cold start on scale-to-zero** — ~1–3 s on the first request after idle. Expected behaviour, not
  a performance regression. Do not chase it in the profiler.
- **Two deploy workflows with two different `base` values** — if both GitHub Pages and Azure stay
  live, one of them will eventually be built with the other's base. Prefer deleting one.
