/**
 * Brand icon generation script
 * Produces all icon assets under frontend/public/brand/ per the icon inventory plan.
 *
 * Usage: npm run generate:icons
 *
 * Sources:
 * - CI_favicon_tab.svg → brand/tab.svg
 * - CI_Icon.svg → brand/logo.svg, maskable set
 * - CI_favicon_1024x1024.png → pwa-any (192, 512, 1024)
 * - CI_favicon_circle_safe.svg → serp-circle, favicon.ico
 *
 * Requires: sharp, png-to-ico
 */

import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PUBLIC_DIR = join(__dirname, '..', 'public');
const BRAND_DIR = join(PUBLIC_DIR, 'brand');

const TAB_SVG = join(PUBLIC_DIR, 'CI_favicon_tab.svg');
const LOGO_SVG = join(PUBLIC_DIR, 'CI_Icon.svg');
const CIRCLE_SAFE_SVG = join(PUBLIC_DIR, 'CI_favicon_circle_safe.svg');
const FULLBLEED_1024 = join(PUBLIC_DIR, 'CI_favicon_1024x1024.png');

const MASKABLE_SIZES = [48, 72, 96, 128, 192, 384, 512];

async function generatePNG(size, outputPath, options = {}) {
  const {
    padding = 0,
    background = { r: 0, g: 0, b: 0, alpha: 0 },
    sourceSvg,
    sourcePng
  } = options;

  const input = sourcePng
    ? readFileSync(sourcePng)
    : Buffer.from(sourceSvg);

  const resizeOpts = {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 }
  };

  if (padding > 0 && background.alpha === 1) {
    const innerSize = Math.round(size * (1 - padding * 2));
    const paddingPx = Math.round(size * padding);
    const iconBuffer = await sharp(input)
      .resize(innerSize, innerSize, resizeOpts)
      .png()
      .toBuffer();
    await sharp({
      create: {
        width: size,
        height: size,
        channels: 3,
        background: { r: background.r, g: background.g, b: background.b }
      }
    })
      .composite([{ input: iconBuffer, left: paddingPx, top: paddingPx }])
      .png()
      .toFile(outputPath);
  } else if (padding > 0) {
    const innerSize = Math.round(size * (1 - padding * 2));
    const paddingPx = Math.round(size * padding);
    const buffer = await sharp(input)
      .resize(innerSize, innerSize, resizeOpts)
      .png()
      .toBuffer();
    await sharp(buffer)
      .extend({
        top: paddingPx,
        bottom: paddingPx,
        left: paddingPx,
        right: paddingPx,
        background
      })
      .resize(size, size)
      .png()
      .toFile(outputPath);
  } else {
    await sharp(input)
      .resize(size, size, resizeOpts)
      .png()
      .toFile(outputPath);
  }
  console.log(`✓ ${outputPath.replace(PUBLIC_DIR, '').replace(/^\//, '')} (${size}×${size})`);
}

async function generateICO(outputPath) {
  const circleSafeSvgContent = readFileSync(CIRCLE_SAFE_SVG, 'utf-8');
  const sizes = [16, 32, 48];
  const pngBuffers = [];
  for (const size of sizes) {
    const buffer = await sharp(Buffer.from(circleSafeSvgContent))
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toBuffer();
    pngBuffers.push(buffer);
  }
  const icoBuffer = await pngToIco(pngBuffers);
  writeFileSync(outputPath, icoBuffer);
  console.log(`✓ brand/favicon.ico (multi-resolution ICO)`);
}

async function main() {
  console.log('Brand icon generation → frontend/public/brand/\n');
  mkdirSync(BRAND_DIR, { recursive: true });

  if (!existsSync(TAB_SVG)) {
    console.error(`❌ Source not found: ${TAB_SVG}`);
    process.exit(1);
  }
  if (!existsSync(LOGO_SVG)) {
    console.error(`❌ Source not found: ${LOGO_SVG}`);
    process.exit(1);
  }
  if (!existsSync(CIRCLE_SAFE_SVG)) {
    console.error(`❌ Source not found: ${CIRCLE_SAFE_SVG}`);
    process.exit(1);
  }

  const tabSvgContent = readFileSync(TAB_SVG, 'utf-8');
  const logoSvgContent = readFileSync(LOGO_SVG, 'utf-8');
  const circleSafeSvgContent = readFileSync(CIRCLE_SAFE_SVG, 'utf-8');

  // 1. Copy SVGs
  console.log('Copying SVGs...');
  copyFileSync(TAB_SVG, join(BRAND_DIR, 'tab.svg'));
  copyFileSync(LOGO_SVG, join(BRAND_DIR, 'logo.svg'));
  console.log('✓ brand/tab.svg');
  console.log('✓ brand/logo.svg\n');

  // 2. PWA any (192, 512, 1024) from full-bleed 1024 or logo SVG
  console.log('PWA any (full-bleed)...');
  if (existsSync(FULLBLEED_1024)) {
    await generatePNG(192, join(BRAND_DIR, 'pwa-any-192.png'), { sourcePng: FULLBLEED_1024 });
    await generatePNG(512, join(BRAND_DIR, 'pwa-any-512.png'), { sourcePng: FULLBLEED_1024 });
    copyFileSync(FULLBLEED_1024, join(BRAND_DIR, 'pwa-any-1024.png'));
    console.log('✓ brand/pwa-any-1024.png (from CI_favicon_1024x1024.png)\n');
  } else {
    await generatePNG(192, join(BRAND_DIR, 'pwa-any-192.png'), { sourceSvg: logoSvgContent });
    await generatePNG(512, join(BRAND_DIR, 'pwa-any-512.png'), { sourceSvg: logoSvgContent });
    await generatePNG(1024, join(BRAND_DIR, 'pwa-any-1024.png'), { sourceSvg: logoSvgContent });
  }

  // 3. SERP / circle-safe (192, 512)
  console.log('SERP circle-safe...');
  await generatePNG(192, join(BRAND_DIR, 'serp-circle-192.png'), {
    sourceSvg: circleSafeSvgContent
  });
  await generatePNG(512, join(BRAND_DIR, 'serp-circle-512.png'), {
    sourceSvg: circleSafeSvgContent
  });

  // 4. favicon.ico (canonical in brand/; copy to root for crawlers requesting /favicon.ico)
  console.log('\nFavicon ICO...');
  const brandFavicon = join(BRAND_DIR, 'favicon.ico');
  await generateICO(brandFavicon);
  copyFileSync(brandFavicon, join(PUBLIC_DIR, 'favicon.ico'));
  console.log('✓ favicon.ico (root copy for crawlers)\n');

  // 5. Optional rel="icon" (16, 32) and apple-touch-icon (180) from tab SVG
  console.log('\nOptional favicon PNGs...');
  await generatePNG(16, join(BRAND_DIR, 'icon-16.png'), { sourceSvg: tabSvgContent });
  await generatePNG(32, join(BRAND_DIR, 'icon-32.png'), { sourceSvg: tabSvgContent });
  await generatePNG(180, join(BRAND_DIR, 'apple-touch-icon-180.png'), { sourceSvg: tabSvgContent });

  // 6. Maskable set (logo with 20% padding)
  console.log('\nPWA maskable...');
  for (const size of MASKABLE_SIZES) {
    await generatePNG(size, join(BRAND_DIR, `pwa-maskable-${size}.png`), {
      sourceSvg: logoSvgContent,
      padding: 0.2,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    });
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
