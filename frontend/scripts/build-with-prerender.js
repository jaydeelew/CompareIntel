#!/usr/bin/env node
/**
 * Build with Prerendering
 * 
 * Orchestrates the full build process:
 * 1. Generate sitemap
 * 2. Run TypeScript compiler
 * 3. Run Vite build
 * 4. Start preview server
 * 5. Run prerender script
 * 6. Shut down preview server
 * 
 * Usage: node scripts/build-with-prerender.js
 */

import { spawn } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function runCommand(command, args, description) {
  return new Promise((resolve, reject) => {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`🔧 ${description}`)
    console.log(`   Command: ${command} ${args.join(' ')}`)
    console.log('='.repeat(60))
    
    const proc = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
    })
    
    proc.on('error', (error) => {
      console.error(`❌ Failed to run ${command}:`, error.message)
      reject(error)
    })
    
    proc.on('exit', (code) => {
      if (code === 0) {
        console.log(`✅ ${description} complete`)
        resolve()
      } else {
        reject(new Error(`${description} failed with exit code ${code}`))
      }
    })
  })
}

function isPreviewDeploy() {
  const explicit = (process.env.VITE_DEPLOY_ENV || '').trim().toLowerCase()
  if (explicit === 'production') return false
  if (explicit === 'preview') return true
  const cf = (process.env.CF_PAGES || '').trim().toLowerCase()
  return cf === '1' || cf === 'true'
}

async function build() {
  const skipPrerender =
    process.env.SKIP_PRERENDER === 'true' || isPreviewDeploy()
  
  try {
    // Step 1: Generate sitemap
    await runCommand(
      'node',
      [join(__dirname, 'generate-sitemap.js')],
      'Generating sitemap'
    )
    
    // Step 2: TypeScript compiler
    await runCommand(
      'npx',
      ['tsc', '-b'],
      'Running TypeScript compiler'
    )
    
    // Step 3: Vite build
    await runCommand(
      'npx',
      ['vite', 'build'],
      'Building with Vite'
    )
    
    if (skipPrerender) {
      console.log('\n' + '='.repeat(60))
      console.log('⚠️  Skipping prerendering (SKIP_PRERENDER=true)')
      console.log('   Pages will be rendered client-side only')
      console.log('='.repeat(60) + '\n')
      return
    }
    
    // Step 4: Start preview server in background
    console.log(`\n${'='.repeat(60)}`)
    console.log('🚀 Starting preview server for prerendering')
    console.log('='.repeat(60))
    
    const previewServer = spawn('node', [join(__dirname, 'preview-server.js')], {
      stdio: 'pipe',
      detached: false,
    })
    
    let serverReady = false
    
    // Wait for server to be ready
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Preview server failed to start within 30 seconds'))
      }, 30000)
      
      previewServer.stdout.on('data', (data) => {
        const output = data.toString()
        process.stdout.write(output)
        
        if (output.includes('Preview server running') && !serverReady) {
          serverReady = true
          clearTimeout(timeout)
          resolve()
        }
      })
      
      previewServer.stderr.on('data', (data) => {
        process.stderr.write(data)
      })
      
      previewServer.on('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
      
      previewServer.on('exit', (code) => {
        clearTimeout(timeout)
        if (code !== 0 && !serverReady) {
          reject(new Error(`Preview server exited with code ${code}`))
        }
      })
    })
    
    // Give it a moment to fully initialize
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Step 5: Run prerender
    try {
      await runCommand(
        'node',
        [join(__dirname, 'prerender.js'), join(__dirname, '..', 'dist'), 'http://localhost:4173'],
        'Prerendering pages'
      )
    } finally {
      // Step 6: Shut down preview server
      console.log('\n🛑 Shutting down preview server')
      previewServer.kill('SIGTERM')
      
      // Give it a moment to shut down gracefully
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Force kill if still running
      if (!previewServer.killed) {
        previewServer.kill('SIGKILL')
      }
    }
    
    console.log('\n' + '='.repeat(60))
    console.log('✨ Build with prerendering complete!')
    console.log('='.repeat(60) + '\n')
    
  } catch (error) {
    console.error('\n' + '='.repeat(60))
    console.error('❌ Build failed:', error.message)
    console.error('='.repeat(60) + '\n')
    process.exit(1)
  }
}

build()
