#!/usr/bin/env node
/**
 * Sitemap Date Updater
 * 
 * Automatically updates lastmod dates in sitemap.xml during build.
 * Run this script as part of the build process to ensure sitemap
 * dates are always current.
 * 
 * Usage: node scripts/update-sitemap.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITEMAP_PATH = join(__dirname, '..', 'public', 'sitemap.xml');

function updateSitemapDates() {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
  
  console.log(`📍 Updating sitemap.xml with date: ${today}`);
  
  try {
    let content = readFileSync(SITEMAP_PATH, 'utf-8');
    
    // Update all lastmod dates to today
    const updatedContent = content.replace(
      /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g,
      `<lastmod>${today}</lastmod>`
    );
    
    writeFileSync(SITEMAP_PATH, updatedContent, 'utf-8');
    
    // Count updated entries
    const matches = content.match(/<lastmod>/g);
    const count = matches ? matches.length : 0;
    
    console.log(`✅ Updated ${count} URLs in sitemap.xml`);
    
  } catch (error) {
    console.error('❌ Error updating sitemap:', error.message);
    process.exit(1);
  }
}

updateSitemapDates();
