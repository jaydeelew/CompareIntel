# CompareIntel Development Workflow

**Important:** SSL certificates must be set up on your AWS EC2 server where `compareintel.com` points, not on your local development machine.

---

## Four Development Environments

1. **Local Development (HTTP):** Fast development with hot reload
2. **Local Development (HTTPS):** Development with self-signed SSL certificates with hot reload
3. **Local Production Testing:** HTTP build testing (no SSL complexity)
4. **AWS Production:** HTTPS with Let's Encrypt certificates

---

## Environment 1: Local Development (HTTP)

### Option A: Local (No Docker) - Recommended for Daily Development

**When to use:** UI work, API development, most feature development, fastest iteration

```bash
# Terminal 1 - Backend
lsof -ti:8000 && echo "Backend already running!" || (cd backend && python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000)

# Terminal 2 - Frontend
lsof -ti:5173 && echo "Frontend already running!" || (cd frontend && npm run dev)

# Check if running:
Backend: Visit http://localhost:8000/docs (should show API documentation)
Frontend: Visit http://localhost:5173 (should show the app)

# Stop servers:
# Option 1: Press Ctrl+C in each terminal (if you have the terminals open)
# Option 2: Kill by port number (if terminals are closed)
lsof -ti:8000 | xargs -r kill -9  # Kill backend (xargs -r prevents error if no process found)
lsof -ti:5173 | xargs -r kill -9  # Kill frontend (xargs -r prevents error if no process found)

# Alternative (more verbose but works on all systems):
# kill -9 $(lsof -ti:8000) 2>/dev/null || echo "Backend not running on port 8000"
# kill -9 $(lsof -ti:5173) 2>/dev/null || echo "Frontend not running on port 5173"
```

**Access:** http://localhost:5173  
**Features:** Fastest startup (~3s), instant hot reload, direct API connection

**Note:** You don't need to run `npm run build` during normal development. The dev server (`npm run dev`) serves files directly from source with hot reload. Only run `npm run build` before deploying to catch build issues early.

### Option B: Docker with Nginx - For Integration Testing

**When to use:** Before commits, testing nginx routing, verifying production-like behavior

```bash
# Start all services
docker compose up

# Stop services
docker compose down
```

**Access:** http://localhost:8080 (nginx proxy)  
**Backend API Docs:** http://localhost:8000/docs  
**Features:** Production-like architecture, nginx handles `/api/*` routing to backend

---

## Environment 2: Local Development (HTTPS)

**Use when testing SSL-dependent features**

### When to Use

- Testing Service Workers, Geolocation, Camera/microphone access
- Before major deployments to production
- Testing payment integrations or OAuth
- Debugging SSL-related issues
- Testing features that require HTTPS (e.g. Screenshot functionality)

### Commands

```bash
# One-time setup: Create self-signed certificates
./create-dev-ssl.sh

# Start HTTPS development environment
docker compose -f docker-compose.dev-ssl.yml up

# Stop HTTPS development environment
docker compose -f docker-compose.dev-ssl.yml down
```

### Access

- **URL:** https://localhost (accept browser security warning)
- **Features:** Hot reload, matches production SSL behavior

---

## Environment 3: Local Production Testing (HTTP)

**Use to test production builds before deployment**

### When to Use

- Testing production build process locally
- Verifying optimized builds work correctly
- Final testing before AWS deployment
- Debugging production build issues
- Running Lighthouse performance audits
- Testing production-optimized assets

### Quick Production Preview (Recommended for Lighthouse Testing)

**For quick local testing of production builds without Docker:**

```bash
cd frontend
npm run build && npm run preview
```

This builds the production bundle and serves it at `http://localhost:4173`. Perfect for:

- Running Lighthouse audits on production builds
- Quick verification that the build works
- Testing performance optimizations
- Checking bundle sizes

**Stop the preview server:** Press `Ctrl+C` in the terminal

### Pre-Deployment Build Check

**Before deploying to production, it's good practice to run `npm run build` locally:**

```bash
cd frontend
npm run build
```

This helps catch build issues early (TypeScript errors, missing files, etc.) before Docker builds on production. You don't need to run this every time you code, but running it before deploying helps ensure a smooth deployment process.

### Commands

```bash
# Build and start production services locally
docker compose -f docker-compose.prod.yml up -d --build

# Clean Docker cache if encountering build errors
docker system prune -a

# If build fails, rebuild with no cache
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d

# Check service status and logs
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f

# Stop production testing
docker compose -f docker-compose.prod.yml down
```

### Access

- **URL:** http://localhost:8080
- **Features:** Production build, optimized assets, no SSL complexity

---

## Environment 4: AWS Production (HTTPS)

**Live production deployment with SSL certificates**

```bash
# SSH into your EC2 instance
ssh -i CompareIntel.pem ubuntu@44.212.141.149

# ONE-TIME: Set up SSL certificates for both domains
./setup-compareintel-ssl.sh

cd CompareIntel

# Pull latest changes
git pull origin master

# Optional: Test build locally first (recommended before deploying)
# cd frontend && npm run build && cd ..

# Stop current production services
docker compose -f docker-compose.ssl.yml down

# Deploy with SSL
docker compose -f docker-compose.ssl.yml up -d --build

# For a clean build - Better when you've made critical config changes
docker compose -f docker-compose.ssl.yml build --no-cache
docker compose -f docker-compose.ssl.yml up -d

# Verify deployment
docker compose -f docker-compose.ssl.yml ps
docker compose -f docker-compose.ssl.yml logs -f

```

### SSL Certificate Management

**Initial Setup (one-time):**

```bash
# Run from home directory (not inside CompareIntel)
cd ~
./setup-compareintel-ssl.sh
```

**Manual Renewal (if auto-renewal fails):**

```bash
cd ~/CompareIntel
docker compose -f docker-compose.ssl.yml down
sudo certbot renew --force-renewal
docker compose -f docker-compose.ssl.yml up -d --build
```

**Check certificate expiration:**

```bash
sudo openssl x509 -in /etc/letsencrypt/live/compareintel.com/fullchain.pem -noout -dates
```

**Auto-renewal hook (if not using setup script):**

Certbot renews certificates automatically, but nginx needs to reload them. Add this hook:

```bash
sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy
sudo tee /etc/letsencrypt/renewal-hooks/deploy/restart-nginx.sh << 'EOF'
#!/bin/bash
cd /home/ubuntu/CompareIntel 2>/dev/null || cd ~/CompareIntel 2>/dev/null
docker compose -f docker-compose.ssl.yml exec -T nginx nginx -s reload 2>/dev/null || true
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/restart-nginx.sh
```

**Verify auto-renewal is active:**

```bash
sudo systemctl status certbot.timer
```

### Access & Verification

- **Primary URL:** https://compareintel.com
- **Secondary URL:** https://www.compareintel.com
- **Features:** Production build, Let's Encrypt SSL, optimized performance
- **File:** `docker-compose.ssl.yml`

**Post-deployment checklist:**

- ✅ Verify padlock icon shows in browser for both URLs
- ✅ Test key functionality
- ✅ Monitor logs for any errors

---

## Production Utility Scripts

Scripts in `backend/scripts/` must be run via Docker in production (no virtual environment on the host):

```bash
# Check model availability (sends email report)
docker exec compareintel-backend-1 python3 /app/scripts/check_model_availability_prod.py

# Set up daily automated check (cron job on host)
./backend/scripts/setup_daily_model_check_prod.sh
```

See `backend/scripts/PRODUCTION_NOTES.md` for detailed documentation and troubleshooting.

---

**Cache Busting**: Your builds automatically generate unique filenames (e.g., `index.abc123.js`) so users always get the latest version without clearing browser cache.

---

## PWA Testing Guide

**Important:** PWA features (service workers, installability) require a **production build** and **HTTPS** (or `localhost`). Service workers are disabled in development mode (`devOptions.enabled: false`).

### Quick PWA Test Setup

**For local PWA testing:**

```bash
cd frontend
npm run build && npm run preview
```

Then visit `http://localhost:4173` (localhost is allowed for PWA testing without HTTPS).

**For HTTPS PWA testing (recommended for full testing):**

```bash
# Use Environment 2 (HTTPS) with production build
cd frontend
npm run build
# Then use docker-compose.dev-ssl.yml or deploy to production
```

### 1. Lighthouse PWA Audit

**Run Lighthouse PWA audit in Chrome DevTools:**

1. Open `http://localhost:4173` (or your production URL)
2. Open Chrome DevTools (F12)
3. Go to **Lighthouse** tab
4. Select **Progressive Web App** category
5. Click **Analyze page load**
6. Review PWA score and checklist

**Key PWA requirements checked:**

- ✅ HTTPS (or localhost)
- ✅ Valid Web App Manifest
- ✅ Service Worker registered
- ✅ Responsive design
- ✅ Fast load times
- ✅ Works offline (basic offline page)

### 2. Service Worker Testing

**Check service worker registration:**

1. Open Chrome DevTools → **Application** tab
2. Click **Service Workers** in left sidebar
3. Verify service worker is **activated and running**
4. Check **Update on reload** to test updates

**Test service worker update flow:**

```bash
# Make a change to your code
# Rebuild
npm run build && npm run preview

# In DevTools → Application → Service Workers:
# 1. Click "Update" button
# 2. Verify new service worker activates
# 3. Test that old cache is cleared
```

**Inspect cached assets:**

1. DevTools → **Application** → **Cache Storage**
2. Check `workbox-precache-*` cache (precached assets)
3. Check `api-cache`, `image-cache`, `font-cache` (runtime caches)

### 3. Installability Testing

**Desktop (Chrome/Edge):**

1. Visit your PWA URL
2. Look for install icon in address bar (or menu)
3. Click **Install** button
4. Verify app installs and opens in standalone window
5. Check app icon appears in applications menu

**Mobile (Android Chrome):**

1. Visit PWA URL
2. Tap browser menu (3 dots)
3. Select **Add to Home screen** or **Install app**
4. Verify app icon appears on home screen
5. Tap icon - should open in standalone mode (no browser UI)

**iOS Safari:**

1. Visit PWA URL
2. Tap **Share** button
3. Select **Add to Home Screen**
4. Verify app icon appears
5. Note: iOS has limited PWA support compared to Android

**Verify manifest:**

1. DevTools → **Application** → **Manifest**
2. Check all fields are correct:
   - Name, short_name, icons
   - Theme color, background color
   - Start URL, scope
   - Display mode (should be "standalone")

### 4. Offline Functionality Testing

**Test offline page:**

1. Visit your PWA URL
2. DevTools → **Network** tab → Check **Offline** checkbox
3. Navigate to a non-cached route (e.g., `/some-page`)
4. Verify `/offline.html` page displays
5. Uncheck **Offline** → Page should reload automatically

**Test cached assets:**

1. Load your PWA normally (online)
2. DevTools → **Network** → Check **Offline**
3. Refresh page
4. Verify:
   - ✅ Page loads from cache
   - ✅ Images/icons load from cache
   - ✅ Fonts load from cache
   - ✅ API calls show "Failed" (expected - API requires network)

**Test API caching (NetworkFirst strategy):**

1. Make API calls while online
2. Go offline
3. API calls should fail (expected - API requires real-time data)
4. Note: Your PWA uses `NetworkFirst` for API, so it won't cache failed requests

### 5. Update Mechanism Testing

**Test auto-update (registerType: 'autoUpdate'):**

1. Load PWA in browser
2. Make code changes and rebuild: `npm run build`
3. Refresh page
4. Service worker should detect update and activate automatically
5. Check console for update messages

**Test update notification (if you add it):**

Currently your PWA uses `autoUpdate`, which updates silently. To test update prompts, you'd need to implement `onNeedRefresh` callback (see `main.tsx`).

### 6. Manifest Validation

**Validate manifest.json:**

1. Visit: `http://localhost:4173/manifest.webmanifest` (or your production URL)
2. Verify JSON is valid and all required fields present
3. Check icons exist at specified paths
4. Use online validator: https://manifest-validator.appspot.com/

**Check icons:**

1. Verify all icon sizes exist in `public/`:
   - `CI_favicon_192x192.png`
   - `CI_favicon_512x512.png`
   - `maskable_icon_x*.png` (various sizes)
2. Test maskable icons render correctly on Android

### 7. Performance Testing

**Test PWA performance impact:**

1. Run Lighthouse **Performance** audit
2. Compare with/without service worker
3. Verify service worker registration doesn't block render (should be deferred)
4. Check cache hit rates in Network tab

**Monitor service worker performance:**

1. DevTools → **Performance** tab
2. Record page load
3. Check service worker registration timing
4. Verify it happens after page load (deferred)

### 8. Browser Compatibility Testing

**Test in multiple browsers:**

- ✅ **Chrome/Edge** (Desktop & Android) - Full PWA support
- ✅ **Firefox** (Desktop & Android) - Good PWA support
- ⚠️ **Safari** (iOS/macOS) - Limited PWA support
- ✅ **Samsung Internet** - Good PWA support

**Check feature support:**

Visit: https://caniuse.com/serviceworkers and https://caniuse.com/web-app-manifest

### Common PWA Testing Issues

**Service worker not registering:**

- ✅ Ensure you're using production build (`npm run build`)
- ✅ Check you're on HTTPS or localhost
- ✅ Verify `devOptions.enabled: false` in `vite.config.ts` (for production)
- ✅ Check browser console for errors

**App not installable:**

- ✅ Verify manifest is valid and accessible
- ✅ Check all required icons exist (192x192, 512x512)
- ✅ Ensure HTTPS (or localhost)
- ✅ Check manifest has `display: "standalone"`

**Offline page not showing:**

- ✅ Verify `offline.html` exists in `public/` folder
- ✅ Check `navigateFallback: '/offline.html'` in `vite.config.ts`
- ✅ Ensure service worker is activated

**Cache not updating:**

- ✅ Check service worker version changed (new build = new hash)
- ✅ Hard refresh (Ctrl+Shift+R) to bypass cache
- ✅ Unregister service worker in DevTools → Application → Service Workers → Unregister

### PWA Testing Checklist

Before deploying to production:

- [ ] Lighthouse PWA audit passes (score > 90)
- [ ] Service worker registers and activates
- [ ] App installs on desktop (Chrome/Edge)
- [ ] App installs on mobile (Android Chrome)
- [ ] Offline page displays when offline
- [ ] Cached assets load when offline
- [ ] Manifest validates correctly
- [ ] All icons display correctly
- [ ] Theme color matches brand
- [ ] App opens in standalone mode
- [ ] Service worker updates automatically
- [ ] No console errors related to PWA

---

**Cache Busting**: Your builds automatically generate unique filenames (e.g., `index.abc123.js`) so users always get the latest version without clearing browser cache.
