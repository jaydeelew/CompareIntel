/**
 * Icon Generation Script
 * Generates all required PNG icons from CI_Icon.svg
 * 
 * Usage: npm run generate:icons
 * 
 * Requires: sharp, png-to-ico (npm install --save-dev sharp png-to-ico)
 */

import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PUBLIC_DIR = join(__dirname, '..', 'public');
const SOURCE_SVG = join(PUBLIC_DIR, 'CI_Icon.svg');

// Favicon sizes (standard + apple-touch)
const FAVICON_SIZES = [16, 32, 180, 192, 512];

// Maskable icon sizes (for PWA)
const MASKABLE_SIZES = [48, 72, 96, 128, 192, 384, 512];

// Read the SVG source
const svgContent = readFileSync(SOURCE_SVG, 'utf-8');

/**
 * Generate a PNG from SVG at specified size
 */
async function generatePNG(size, outputPath, options = {}) {
  const { padding = 0, background = { r: 0, g: 0, b: 0, alpha: 0 } } = options;

  // Calculate inner size after padding
  const innerSize = Math.round(size * (1 - padding * 2));
  const paddingPx = Math.round(size * padding);

  // Render SVG to buffer at inner size
  const buffer = await sharp(Buffer.from(svgContent))
    .resize(innerSize, innerSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer();

  // If padding is needed, extend the canvas
  if (padding > 0) {
    await sharp(buffer)
      .extend({
        top: paddingPx,
        bottom: paddingPx,
        left: paddingPx,
        right: paddingPx,
        background
      })
      .resize(size, size) // Ensure exact size after rounding
      .png()
      .toFile(outputPath);
  } else {
    await sharp(Buffer.from(svgContent))
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(outputPath);
  }

  console.log(`✓ Generated: ${outputPath} (${size}x${size})`);
}

/**
 * Generate ICO file from multiple PNG sizes
 * Creates a multi-resolution ICO with 16x16, 32x32, and 48x48 sizes
 */
async function generateICO(outputPath) {
  // Generate temporary PNGs for ICO
  const sizes = [16, 32, 48];
  const pngBuffers = [];

  for (const size of sizes) {
    const buffer = await sharp(Buffer.from(svgContent))
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toBuffer();
    pngBuffers.push(buffer);
  }

  // Convert to ICO
  const icoBuffer = await pngToIco(pngBuffers);
  writeFileSync(outputPath, icoBuffer);

  console.log(`✓ Generated: ${outputPath} (multi-resolution ICO)`);
}

async function main() {
  console.log('🎨 Generating icons from CI_Icon.svg...\n');

  if (!existsSync(SOURCE_SVG)) {
    console.error(`❌ Source SVG not found: ${SOURCE_SVG}`);
    process.exit(1);
  }

  // Generate standard favicons (transparent background)
  console.log('📁 Generating favicons...');
  for (const size of FAVICON_SIZES) {
    const filename = size === 512 ? 'CI_favicon_512x512.png' :
      size === 192 ? 'CI_favicon_192x192.png' :
        size === 180 ? 'CI_favicon_180x180.png' :
          size === 32 ? 'CI_favicon_32x32.png' :
            'CI_favicon_16x16.png';
    await generatePNG(size, join(PUBLIC_DIR, filename));
  }

  // Generate base CI_favicon.png (512x512)
  await generatePNG(512, join(PUBLIC_DIR, 'CI_favicon.png'));

  // Generate maskable icons (with 20% padding for safe zone)
  // Android's maskable icon safe zone is the inner 80% (circle with 40% radius)
  // Using 20% padding on each side ensures the icon stays well within the safe zone
  console.log('\n📁 Generating maskable icons...');
  for (const size of MASKABLE_SIZES) {
    const filename = `maskable_icon_x${size}.png`;
    // 20% padding on each side = 40% total, leaving 60% for the icon (well within safe zone)
    await generatePNG(size, join(PUBLIC_DIR, filename), {
      padding: 0.2,
      background: { r: 255, g: 255, b: 255, alpha: 1 } // White background for maskable
    });
  }

  // Generate base maskable_icon.png (512x512)
  await generatePNG(512, join(PUBLIC_DIR, 'maskable_icon.png'), {
    padding: 0.2,
    background: { r: 255, g: 255, b: 255, alpha: 1 }
  });

  // Generate additional variants mentioned in public folder
  console.log('\n📁 Generating additional variants...');

  // Blue background variant
  await generatePNG(512, join(PUBLIC_DIR, 'CI_favicon_blue.png'));

  // White variant (icon on white bg) - for dark mode contexts
  await generatePNG(512, join(PUBLIC_DIR, 'CI_favicon_white.png'), {
    background: { r: 255, g: 255, b: 255, alpha: 1 }
  });

  // Generate favicon.ico
  console.log('\n📁 Generating favicon.ico...');
  await generateICO(join(PUBLIC_DIR, 'favicon.ico'));

  console.log('\n✅ Icon generation complete!');
}

main().catch(console.error);

