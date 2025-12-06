# Progressive Web App (PWA) Setup

CompareIntel is configured as a Progressive Web App, allowing users to install it on their devices for a native-like experience.

## Features

- **Installable**: Users can add CompareIntel to their home screen
- **Offline Support**: Shows a friendly offline page when no connection is available
- **Auto-Update**: Service worker automatically updates when new versions are deployed
- **Caching**: Smart caching strategies for optimal performance

## Configuration

The PWA is configured in `frontend/vite.config.ts` using `vite-plugin-pwa`.

### Key Settings

| Setting            | Value        | Description                                   |
| ------------------ | ------------ | --------------------------------------------- |
| `registerType`     | `autoUpdate` | Automatically updates the service worker      |
| `display`          | `standalone` | App runs in its own window without browser UI |
| `theme_color`      | `#2563eb`    | Blue color matching brand                     |
| `background_color` | `#ffffff`    | White background for splash screen            |

### Caching Strategies

| Resource Type        | Strategy      | Cache Duration    |
| -------------------- | ------------- | ----------------- |
| API calls (`/api/*`) | Network First | 24 hours          |
| Images               | Cache First   | 30 days           |
| Fonts                | Cache First   | 1 year            |
| Static assets        | Precache      | Until new version |

## Icons

The PWA uses icons from `frontend/public/`:

### Standard Icons

- `CI_favicon_192x192.png` - Standard icon (192x192)
- `CI_favicon_512x512.png` - Large icon (512x512)

### Maskable Icons (for Android Adaptive Icons)

Dedicated maskable icons with proper safe zone padding:

- `maskable_icon_x48.png` (48x48)
- `maskable_icon_x72.png` (72x72)
- `maskable_icon_x96.png` (96x96)
- `maskable_icon_x128.png` (128x128)
- `maskable_icon_x192.png` (192x192)
- `maskable_icon_x384.png` (384x384)
- `maskable_icon_x512.png` (512x512)

You can verify maskable icons at [maskable.app/editor](https://maskable.app/editor)

## Testing the PWA

### Prerequisites

1. Install dependencies:

   ```bash
   cd frontend
   npm install
   ```

2. Build the production version:

   ```bash
   npm run build
   ```

3. Serve the build:
   ```bash
   npm run preview
   ```

### Using Chrome DevTools

1. Open `http://localhost:4173` in Chrome
2. Open DevTools (F12 or Cmd+Option+I)
3. Go to **Application** tab

#### Check Manifest

- Click **Manifest** in the sidebar
- Verify all fields are populated correctly
- Check that icons load properly

#### Check Service Worker

- Click **Service Workers** in the sidebar
- Verify the service worker is registered
- Status should show "activated and running"
- Check for any errors in the console

#### Test Offline Mode

1. In the Service Workers section, check "Offline"
2. Reload the page
3. You should see the offline page (`offline.html`)
4. Uncheck "Offline" to restore connection

#### Test Installation

1. Look for the install icon in Chrome's address bar (+ icon)
2. Or go to Menu → "Install CompareIntel..."
3. Complete the installation
4. The app should open in its own window

### Lighthouse PWA Audit

1. Open Chrome DevTools
2. Go to **Lighthouse** tab
3. Select "Progressive Web App" category
4. Click "Analyze page load"
5. Review the PWA score and any recommendations

#### Expected Results

- ✅ Installable
- ✅ PWA Optimized
- ✅ Registers a service worker
- ✅ Responds with 200 when offline
- ✅ Uses HTTPS (production only)

### Testing on Mobile

#### Android

1. Open Chrome on Android
2. Navigate to the production URL
3. Tap the "Add to Home screen" banner or use menu
4. Install the app
5. Open from home screen and verify standalone mode

#### iOS (Safari)

1. Open Safari on iOS
2. Navigate to the production URL
3. Tap the Share button
4. Select "Add to Home Screen"
5. Open from home screen

### Testing Cache Behavior

1. Load the app normally
2. Open DevTools → Application → Cache Storage
3. Verify caches are created:
   - `workbox-precache-*` - Precached static assets
   - `api-cache` - API responses (after making requests)
   - `image-cache` - Cached images
   - `font-cache` - Cached fonts

### Testing Auto-Update

1. Make a change to the app
2. Rebuild: `npm run build`
3. The service worker should update automatically
4. Users will get the new version on their next visit

## Troubleshooting

### Service Worker Not Registering

- Ensure you're serving over HTTPS (or localhost)
- Check console for registration errors
- Clear browser cache and try again

### App Not Installable

- Ensure manifest is loading correctly
- Check that all required manifest fields are present
- Verify icons are accessible

### Offline Page Not Showing

- Check that `offline.html` exists in `public/`
- Verify `navigateFallback` is set correctly in config
- Ensure service worker is activated

### Cache Not Updating

- Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
- Manually unregister service worker in DevTools
- Clear site data and reload

## Production Considerations

1. **HTTPS Required**: PWAs require HTTPS in production
2. **Cache Busting**: Asset hashes ensure cache updates on deploy
3. **Manifest URL**: The plugin generates `/manifest.webmanifest`
4. **Service Worker Scope**: Covers entire site (`/`)

## Files Modified

- `frontend/vite.config.ts` - PWA plugin configuration
- `frontend/index.html` - PWA meta tags
- `frontend/public/offline.html` - Offline fallback page
- `frontend/package.json` - Added `vite-plugin-pwa` dependency
