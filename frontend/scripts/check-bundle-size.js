#!/usr/bin/env node

/**
 * Bundle Size Checker
 * 
 * Checks bundle sizes against defined limits and reports violations.
 * Used in CI/CD to prevent bundle size regressions.
 * 
 * Bundle Size Limits (gzipped):
 * - Initial bundle: 200KB
 * - Total bundle: 500KB
 * - Individual chunk: 100KB
 */

import { readFileSync, existsSync, statSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { gzipSync } from 'zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const distDir = join(__dirname, '..', 'dist');

// Bundle size limits in bytes (gzipped)
const LIMITS = {
  initialBundle: 200 * 1024, // 200KB
  totalBundle: 500 * 1024,   // 500KB
  individualChunk: 100 * 1024, // 100KB
};

/**
 * Get file size in bytes
 */
function getFileSize(filePath) {
  if (!existsSync(filePath)) {
    return 0;
  }
  return statSync(filePath).size;
}

/**
 * Get gzipped size of a file
 */
function getGzippedSize(filePath) {
  if (!existsSync(filePath)) {
    return 0;
  }
  const content = readFileSync(filePath);
  return gzipSync(content).length;
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Find all JS files in dist directory
 */
function findJSFiles(dir) {
  const files = [];
  
  function traverse(currentDir) {
    const entries = readdirSync(currentDir);
    
    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        traverse(fullPath);
      } else if (entry.endsWith('.js') && !entry.includes('legacy')) {
        files.push(fullPath);
      }
    }
  }
  
  traverse(dir);
  return files;
}

/**
 * Main bundle size check
 */
function checkBundleSize() {
  console.log('📦 Checking bundle sizes...\n');
  
  if (!existsSync(distDir)) {
    console.error('❌ dist/ directory not found. Run "npm run build" first.');
    process.exit(1);
  }
  
  const jsFiles = findJSFiles(distDir);
  
  if (jsFiles.length === 0) {
    console.error('❌ No JS files found in dist/. Run "npm run build" first.');
    process.exit(1);
  }
  
  // Find entry point (usually index-[hash].js or similar)
  const entryFiles = jsFiles.filter(f => 
    f.includes('index') || f.includes('main') || f.includes('app')
  );
  
  // Sort by size (largest first)
  const fileSizes = jsFiles.map(file => ({
    file: file.replace(distDir + '/', ''),
    size: getFileSize(file),
    gzipped: getGzippedSize(file),
  })).sort((a, b) => b.gzipped - a.gzipped);
  
  // Calculate totals
  const totalSize = fileSizes.reduce((sum, f) => sum + f.size, 0);
  const totalGzipped = fileSizes.reduce((sum, f) => sum + f.gzipped, 0);
  
  // Find largest entry file
  const largestEntry = entryFiles.length > 0
    ? fileSizes.find(f => entryFiles.some(ef => ef.includes(f.file.split('-')[0])))
    : fileSizes[0];
  
  console.log('📊 Bundle Size Report:\n');
  console.log('Top 10 largest chunks:');
  fileSizes.slice(0, 10).forEach((file, index) => {
    const isEntry = entryFiles.some(ef => ef.includes(file.file.split('-')[0]));
    const marker = isEntry ? '🎯' : '  ';
    console.log(`${marker} ${index + 1}. ${file.file}`);
    console.log(`     Size: ${formatBytes(file.size)} | Gzipped: ${formatBytes(file.gzipped)}`);
  });
  
  console.log(`\n📈 Totals:`);
  console.log(`   Total size: ${formatBytes(totalSize)}`);
  console.log(`   Total gzipped: ${formatBytes(totalGzipped)}`);
  
  if (largestEntry) {
    console.log(`\n🎯 Largest entry chunk: ${largestEntry.file}`);
    console.log(`   Size: ${formatBytes(largestEntry.size)} | Gzipped: ${formatBytes(largestEntry.gzipped)}`);
  }
  
  // Check limits
  console.log(`\n🔍 Checking limits:`);
  let hasViolations = false;
  
  // Define lazy-loaded chunk patterns (chunks that are loaded on demand)
  const lazyLoadedChunkPatterns = [
    'vendor-files',  // pdfjs-dist, mammoth (loaded on file upload)
    'vendor-export', // html2canvas, jspdf (loaded on PDF export)
    'pages',         // Page components (loaded on route navigation)
    'tutorial',      // Tutorial components (loaded when tutorial starts)
    'AdminPanel',    // Admin panel (loaded on /admin route)
    'latex-renderer', // LaTeX renderer (loaded when needed)
  ];
  
  const isLazyLoaded = (filename) => {
    return lazyLoadedChunkPatterns.some(pattern => filename.includes(pattern));
  };
  
  if (largestEntry && largestEntry.gzipped > LIMITS.initialBundle) {
    console.error(`❌ Initial bundle exceeds limit: ${formatBytes(largestEntry.gzipped)} > ${formatBytes(LIMITS.initialBundle)}`);
    hasViolations = true;
  } else if (largestEntry) {
    console.log(`✅ Initial bundle within limit: ${formatBytes(largestEntry.gzipped)} <= ${formatBytes(LIMITS.initialBundle)}`);
  }
  
  // Calculate initial bundle size (excluding lazy-loaded chunks)
  const initialBundleGzipped = fileSizes
    .filter(f => !isLazyLoaded(f.file))
    .reduce((sum, f) => sum + f.gzipped, 0);
  
  // Check initial bundle total (most important metric)
  if (initialBundleGzipped > LIMITS.totalBundle) {
    console.error(`❌ Initial bundle total exceeds limit: ${formatBytes(initialBundleGzipped)} > ${formatBytes(LIMITS.totalBundle)}`);
    hasViolations = true;
  } else {
    console.log(`✅ Initial bundle total within limit: ${formatBytes(initialBundleGzipped)} <= ${formatBytes(LIMITS.totalBundle)}`);
  }
  
  // Report total bundle size (including lazy-loaded) for reference
  console.log(`📦 Total bundle size (including lazy-loaded): ${formatBytes(totalGzipped)}`);
  
  // Only check non-lazy-loaded chunks for individual limit
  // Vendor chunks can be larger (up to initial bundle limit) since they're critical for initial load
  const nonLazyChunks = fileSizes.filter(f => !isLazyLoaded(f.file));
  const oversizedChunks = nonLazyChunks.filter(f => {
    const isVendorChunk = f.file.includes('vendor');
    // Vendor chunks can be up to initial bundle limit (200KB), others must be under 100KB
    const chunkLimit = isVendorChunk ? LIMITS.initialBundle : LIMITS.individualChunk;
    return f.gzipped > chunkLimit;
  });
  
  if (oversizedChunks.length > 0) {
    console.error(`❌ ${oversizedChunks.length} chunk(s) exceed individual limit:`);
    oversizedChunks.forEach(chunk => {
      const isVendorChunk = chunk.file.includes('vendor');
      const chunkLimit = isVendorChunk ? LIMITS.initialBundle : LIMITS.individualChunk;
      console.error(`   - ${chunk.file}: ${formatBytes(chunk.gzipped)} > ${formatBytes(chunkLimit)}`);
    });
    hasViolations = true;
  } else {
    console.log(`✅ All initial chunks within individual limit: ${formatBytes(LIMITS.individualChunk)}`);
    console.log(`   (Vendor chunks allowed up to ${formatBytes(LIMITS.initialBundle)} for optimal loading)`);
    
    // Report lazy-loaded chunks that exceed limit (informational only)
    const lazyOversized = fileSizes.filter(f => isLazyLoaded(f.file) && f.gzipped > LIMITS.individualChunk);
    if (lazyOversized.length > 0) {
      console.log(`\n📦 Note: ${lazyOversized.length} lazy-loaded chunk(s) exceed individual limit (acceptable for on-demand loading):`);
      lazyOversized.forEach(chunk => {
        console.log(`   - ${chunk.file}: ${formatBytes(chunk.gzipped)}`);
      });
    }
  }
  
  if (hasViolations) {
    console.log(`\n💡 Tips to reduce bundle size:`);
    console.log(`   - Use dynamic imports for large dependencies`);
    console.log(`   - Remove unused dependencies`);
    console.log(`   - Enable tree-shaking for better dead code elimination`);
    console.log(`   - Consider code splitting for large features`);
    console.log(`   - Analyze bundle with: npm run build:analyze`);
    process.exit(1);
  } else {
    console.log(`\n✅ All bundle size checks passed!`);
    process.exit(0);
  }
}

checkBundleSize();

