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
const WINDOWS_SVG = join(PUBLIC_DIR, 'CI_favicon_tab.svg'); // Lighter colors for Windows
const CIRCLE_SAFE_SVG = join(PUBLIC_DIR, 'CI_favicon_circle_safe.svg'); // Circle-safe for Google search

// Favicon sizes (standard + apple-touch)
const FAVICON_SIZES = [16, 32, 180, 192, 512];

// Maskable icon sizes (for PWA)
const MASKABLE_SIZES = [48, 72, 96, 128, 192, 384, 512];

// Windows-specific icon sizes (for taskbar)
const WINDOWS_SIZES = [192, 512];

// Read the SVG sources
const svgContent = readFileSync(SOURCE_SVG, 'utf-8');
const windowsSvgContent = readFileSync(WINDOWS_SVG, 'utf-8');
const circleSafeSvgContent = readFileSync(CIRCLE_SAFE_SVG, 'utf-8');

/**
 * Generate a PNG from SVG at specified size
 */
async function generatePNG(size, outputPath, options = {}) {
  const { padding = 0, background = { r: 0, g: 0, b: 0, alpha: 0 }, sourceSvg = svgContent } = options;

  // Calculate inner size after padding
  const innerSize = Math.round(size * (1 - padding * 2));
  const paddingPx = Math.round(size * padding);

  // If we have an opaque background (like for maskable icons), create directly on that background
  if (padding > 0 && background.alpha === 1) {
    // Create a white canvas and composite the icon on top
    const iconBuffer = await sharp(Buffer.from(sourceSvg))
      .resize(innerSize, innerSize, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
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
      .composite([{
        input: iconBuffer,
        left: paddingPx,
        top: paddingPx
      }])
      .png()
      .toFile(outputPath);
  } else if (padding > 0) {
    // For transparent backgrounds, use the original extend method
    const buffer = await sharp(Buffer.from(sourceSvg))
      .resize(innerSize, innerSize, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
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
      .resize(size, size) // Ensure exact size after rounding
      .png()
      .toFile(outputPath);
  } else {
    await sharp(Buffer.from(sourceSvg))
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

  if (!existsSync(WINDOWS_SVG)) {
    console.error(`❌ Windows SVG not found: ${WINDOWS_SVG}`);
    process.exit(1);
  }

  if (!existsSync(CIRCLE_SAFE_SVG)) {
    console.error(`❌ Circle-safe SVG not found: ${CIRCLE_SAFE_SVG}`);
    process.exit(1);
  }

  // Generate standard favicons (transparent background)
  // Note: 192x192 and 512x512 are generated separately with lighter colors for Windows
  // 16x16, 32x32, and 180x180 use lighter colors for better browser tab visibility
  console.log('📁 Generating favicons...');
  for (const size of FAVICON_SIZES) {
    // Skip 192 and 512 - these will be generated with lighter colors for Windows
    if (size === 192 || size === 512) continue;
    
    const filename = size === 180 ? 'CI_favicon_180x180.png' :
      size === 32 ? 'CI_favicon_32x32.png' :
        'CI_favicon_16x16.png';
    // Use lighter colors for browser favicons (16x16, 32x32) and Apple touch icon (180x180)
    // for better visibility in browser tabs and consistency with SVG favicon
    await generatePNG(size, join(PUBLIC_DIR, filename), {
      sourceSvg: windowsSvgContent
    });
  }

  // Generate base CI_favicon.png (512x512) - circle-safe for Google search results
  await generatePNG(512, join(PUBLIC_DIR, 'CI_favicon.png'), {
    sourceSvg: circleSafeSvgContent
  });

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

  // Generate standard large icons (circle-safe for Google search results)
  // Google Search applies a circular mask to favicons, so these need the icon
  // scaled down to fit within the inscribed circle with margin
  console.log('\n📁 Generating circle-safe large icons (for Google search / PWA)...');
  for (const size of WINDOWS_SIZES) {
    const filename = size === 512 ? 'CI_favicon_512x512.png' : 'CI_favicon_192x192.png';
    await generatePNG(size, join(PUBLIC_DIR, filename), {
      sourceSvg: circleSafeSvgContent
    });
  }

  // Generate favicon.ico
  console.log('\n📁 Generating favicon.ico...');
  await generateICO(join(PUBLIC_DIR, 'favicon.ico'));

  console.log('\n✅ Icon generation complete!');
}

main().catch(console.error);

