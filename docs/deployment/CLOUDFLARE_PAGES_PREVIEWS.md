# Cloudflare Pages PR previews (free plan)

Frontend pull requests should get a public preview URL for reviewers and for Pulse’s advisory visual pass. **Cloudflare Pages on the Free plan** hosts those previews. Jack connects the Pages project in the dashboard; this repo only contains the preview-safe frontend build and the settings to copy.

Live production stays on the existing EC2 + nginx stack. Do **not** attach `compareintel.com` to Pages. Do **not** add a credit card or upgrade the plan.

Related issue: [#35](https://github.com/jaydeelew/CompareIntel/issues/35).

---

## What the repo already does

When `VITE_DEPLOY_ENV=preview` or Cloudflare’s `CF_PAGES=1` is set at build time, `frontend/vite-plugin-preview-deploy.ts`:

| Guard | How |
| --- | --- |
| **noindex** | `index.html` robots/googlebot meta + Pages `_headers` `X-Robots-Tag: noindex, nofollow` + `robots.txt` `Disallow: /` |
| **No analytics beacon** | `isAnalyticsEnabled()` is false; Sentry is not initialized; `VITE_PERFORMANCE_ENDPOINT` is stripped |
| **No production secrets** | `VITE_SENTRY_DSN`, `VITE_PERFORMANCE_ENDPOINT`, `VITE_RECAPTCHA_SITE_KEY`, and `VITE_CF_BEACON_TOKEN` are cleared before Vite inlines env |
| **No prod DB / Stripe live** | `VITE_API_URL` is forced to `/preview-api`. GETs are served from static fixtures. POST/PUT/PATCH/DELETE (including billing) return 403 |

`@compareintel/core` is resolved from `packages/compare-core` via the Vite alias in `frontend/vite.config.ts`. Pages must clone the **repository root** (not an isolated `frontend/` upload) so that alias still works.

Local check:

```bash
cd frontend
npm run build:preview
npm run check:preview-dist
```

---

## Jack: connect Pages (once)

No Cloudflare API token belongs in this repo. Sign in with GitHub in the dashboard.

### 1. Create a free Cloudflare account

1. Open [https://dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up).
2. Use the **Free** plan. You can skip adding a domain and **do not enter a card**.
3. Confirm the email address.

### 2. Authorize GitHub

1. In the dashboard go to **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Install the Cloudflare GitHub app on **jaydeelew/CompareIntel** (this repo only is enough).
3. Allow the app to post preview comments on pull requests.

### 3. Create the Pages project

Suggested project name: `compareintel-frontend-previews`.

| Setting | Value | Why |
| --- | --- | --- |
| **Production branch** | `master` | Pages still builds `master`; that `*.pages.dev` URL is unused. Real prod is EC2. |
| **Preview deployments** | **On** (all non-production branches / PRs) | This is the feature we want |
| **Root directory** | *(leave empty — repo root)* | So `packages/compare-core` is on disk for the Vite alias |
| **Framework preset** | Vite | Optional; the command below overrides it |
| **Build command** | `SKIP_PRERENDER=true npm ci --prefix frontend && SKIP_PRERENDER=true npm run build --prefix frontend` | Install + build `frontend/` with workspace sources available |
| **Build output directory** | `frontend/dist` | Vite outDir |
| **Build watch paths** | `frontend/**,packages/compare-core/**` | Skip Pages builds when only backend/docs change (saves the 500/month quota) |
| **Node.js version** | `24` (or env `NODE_VERSION=24`) | Matches CI. Vite 6 needs Node 18+. Repo `.nvmrc` is `24`. |

Do **not** enable Pages Functions. Do **not** add a custom domain. Do **not** set up Workers paid features.

### 4. Environment variables

Set these on **both** Production and Preview in **Settings → Environment variables**. Previews are the ones that matter; setting both avoids an accidental `master` Pages deploy talking to prod.

| Variable | Value | Notes |
| --- | --- | --- |
| `VITE_DEPLOY_ENV` | `preview` | Belt-and-suspenders with `CF_PAGES=1` |
| `VITE_API_URL` | `/preview-api` | Build also forces this |
| `SKIP_PRERENDER` | `true` | Prerender needs a local preview server; skip on Pages |
| `NODE_VERSION` | `24` | If the UI Node field is empty |

**Never set on Pages:**

- `VITE_SENTRY_DSN`
- `VITE_PERFORMANCE_ENDPOINT`
- `VITE_RECAPTCHA_SITE_KEY`
- `VITE_CF_BEACON_TOKEN`
- Production `VITE_API_URL` (`https://compareintel.com/api` or the EC2 IP)
- Stripe keys, OpenRouter keys, `SECRET_KEY`, database URLs (none of these are Vite vars, but they must not be pasted into Pages)

If a production URL is set by mistake, the preview plugin still replaces it with `/preview-api`.

### 5. PR-only previews

1. **Settings → Builds & deployments → Preview deployments**: Enabled.
2. Leave production branch as `master` but **do not** add a custom domain or CNAME.
3. Optional: under branch control, deploy previews for **None** of the production branch and **All non-production branches** (dashboard wording varies). PRs still get previews.
4. After the first PR build, confirm Cloudflare posted a **Preview: https://&lt;hash&gt;.compareintel-frontend-previews.pages.dev** comment on the GitHub PR.

### 6. Verify a preview

```bash
# HTML noindex
curl -s https://<preview>.pages.dev/ | grep -i 'name="robots"'

# Header noindex (Pages also adds its own X-Robots-Tag on preview URLs)
curl -sI https://<preview>.pages.dev/ | grep -i robots

# Mock API (read-only)
curl -s https://<preview>.pages.dev/preview-api/models.json | head

# Writes must not hit production — 403 from the SPA guard; 404/405 from static hosting
curl -sI -X POST https://<preview>.pages.dev/preview-api/billing/create-checkout-session
```

The homepage should load with fixture models. Compare, register, and Stripe checkout are expected to fail closed.

---

## Free-tier limits (do not upgrade)

Source: [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/) (Free plan).

| Limit | Free plan | Impact on CompareIntel |
| --- | --- | --- |
| Price / card | $0, no card required | Stay on Free |
| Builds per month | **500** | ~16/day. Watch-paths + skipping docs-only PRs helps |
| Concurrent builds | **1** | A second PR waits in queue |
| Build timeout | **20 minutes** | Frontend preview build is well under this (`SKIP_PRERENDER`) |
| Preview deployments | **Unlimited** active | Old PR URLs can stay up |
| Static requests / bandwidth | Unlimited | Fine |
| Files per site | **20,000** | Frontend dist is far below |
| Max file size | **25 MiB** | No single asset should approach this |
| Custom domains | 100 | Unused — do not attach the production domain |
| Projects per account | 100 | One project is enough |
| Pages Functions | Count against Workers Free (100k req/day) | **Do not add Functions** |

If you hit 500 builds in a month, pause preview deployments rather than upgrading. Do not add paid Workers, R2, or other billable products for this.

---

## Files in this repo

| Path | Role |
| --- | --- |
| `frontend/cloudflare/_headers` | Copied to `dist/_headers` on preview builds |
| `frontend/cloudflare/_redirects` | SPA fallback + mock API rewrites |
| `frontend/src/preview/fixtures/` | Read-only GET JSON for models / credits / rate-limit |
| `frontend/vite-plugin-preview-deploy.ts` | noindex, secret stripping, artifact copy |
| `frontend/src/config/deployEnv.ts` | `VITE_DEPLOY_ENV` / `CF_PAGES` detection |
| `frontend/src/preview/apiGuard.ts` | Runtime fetch guard (403 on writes) |
| `frontend/scripts/check-preview-dist.js` | Asserts dist has noindex and no analytics leaks |
| `.nvmrc` | Node 24 for Pages / nvm |

Production nginx and `deploy-production.sh` are unchanged.

---

## Troubleshooting

**Build cannot resolve `@compareintel/core`**  
Root directory must be the repo root, not `frontend/`. The alias is `../packages/compare-core/src`.

**Preview talks to production / Stripe**  
Unset any production `VITE_API_URL` and rebuild. Confirm `VITE_DEPLOY_ENV=preview`. Check the built JS does not contain `https://compareintel.com/api`.

**PR has no preview comment**  
GitHub app permissions (commit statuses + pull request comments). Reinstall the Cloudflare GitHub app on this repo.

**500 builds/month exceeded**  
Tighten build watch paths; close stale PR branches; do not retry green builds.

**Node version too old**  
Set `NODE_VERSION=24`. Cloudflare’s default can still be older than Vite 6 allows.
