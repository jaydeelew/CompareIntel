/**
 * Export utilities for CompareIntel
 *
 * Provides functions to export comparison results to various formats:
 * - PDF (.pdf) - For general sharing with non-technical users
 * - Markdown (.md) - For developers, documentation, and note-taking apps
 * - HTML (.html) - Standalone web page
 * - JSON (.json) - For developers and APIs
 */

import katex from 'katex'

import type { ComparisonMetadata } from '../types/comparison'
import type { ModelConversation } from '../types/conversation'
import type { Model } from '../types/models'

/**
 * Data structure for exporting a comparison
 */
export interface ComparisonExportData {
  /** The original user prompt */
  prompt: string
  /** ISO timestamp of the comparison */
  timestamp: string
  /** All model conversations */
  conversations: ModelConversation[]
  /** Model details lookup */
  models: Record<string, Model>
  /** Optional comparison metadata */
  metadata?: ComparisonMetadata
}

/**
 * Format a date for display in exports
 */
function formatExportDate(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/**
 * Escape special Markdown characters in text
 */
function escapeMarkdown(text: string): string {
  // Don't escape code blocks or existing markdown formatting
  // Just escape characters that could break the structure
  return text
}

/**
 * Generate a safe filename from the prompt
 */
function generateFilename(prompt: string, extension: string): string {
  // Ensure prompt is a string
  const promptStr = typeof prompt === 'string' ? prompt : String(prompt || 'comparison')
  const sanitized = promptStr
    .slice(0, 30)
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .toLowerCase()
  return `${sanitized || 'comparison'}.${extension}`
}

/**
 * Export comparison to Markdown format
 *
 * Creates a well-structured Markdown document with:
 * - Comparison header with date and prompt
 * - Models summary table
 * - Each model's full conversation
 * - Optional metadata footer
 */
export function exportToMarkdown(data: ComparisonExportData): string {
  const { prompt, timestamp, conversations, models, metadata } = data

  let md = `# CompareIntel - AI Model Comparison\n\n`
  md += `**Date:** ${formatExportDate(timestamp)}\n\n`
  md += `---\n\n`

  // Prompt section
  md += `## Prompt\n\n`
  md += `${escapeMarkdown(prompt)}\n\n`
  md += `---\n\n`

  // Models summary table
  md += `## Models Compared\n\n`
  md += `| Model | Provider | Status | Response Length |\n`
  md += `|-------|----------|--------|----------------|\n`

  conversations.forEach(conv => {
    const model = models[conv.modelId]
    const lastMessage = conv.messages[conv.messages.length - 1]
    const isError = lastMessage?.content?.startsWith('Error:')
    const charCount = lastMessage?.content?.length || 0

    md += `| ${model?.name || conv.modelId} | ${model?.provider || 'Unknown'} | ${isError ? '❌ Failed' : '✅ Success'} | ${charCount.toLocaleString()} chars |\n`
  })

  md += `\n---\n\n`

  // Individual model responses
  md += `## Responses\n\n`

  conversations.forEach(conv => {
    const model = models[conv.modelId]
    md += `### ${model?.name || conv.modelId}\n\n`
    md += `**Provider:** ${model?.provider || 'Unknown'}\n\n`

    conv.messages.forEach(msg => {
      if (msg.type === 'user') {
        md += `#### 👤 User\n\n`
      } else {
        md += `#### 🤖 Assistant\n\n`
      }
      md += `${msg.content}\n\n`
    })

    md += `---\n\n`
  })

  // Metadata section
  if (metadata) {
    md += `## Comparison Details\n\n`
    md += `| Metric | Value |\n`
    md += `|--------|-------|\n`
    md += `| Models Requested | ${metadata.models_requested} |\n`
    md += `| Models Successful | ${metadata.models_successful} |\n`
    if (metadata.models_failed > 0) {
      md += `| Models Failed | ${metadata.models_failed} |\n`
    }
    if (metadata.processing_time_ms) {
      const timeStr =
        metadata.processing_time_ms < 1000
          ? `${metadata.processing_time_ms}ms`
          : `${(metadata.processing_time_ms / 1000).toFixed(1)}s`
      md += `| Processing Time | ${timeStr} |\n`
    }
    if (metadata.credits_used) {
      md += `| Credits Used | ${metadata.credits_used.toFixed(2)} |\n`
    }
    md += `\n`
  }

  // Footer
  md += `---\n\n`
  md += `*Exported from [CompareIntel](https://compareintel.com) - Compare 50+ AI Models Side-by-Side*\n`

  return md
}

/**
 * Export comparison to JSON format
 *
 * Creates a structured JSON document for programmatic use
 */
export function exportToJSON(data: ComparisonExportData): string {
  return JSON.stringify(
    {
      version: '1.0',
      exported_at: new Date().toISOString(),
      source: 'CompareIntel',
      url: 'https://compareintel.com',
      comparison: {
        prompt: data.prompt,
        timestamp: data.timestamp,
        conversations: data.conversations.map(conv => ({
          model_id: conv.modelId,
          model_name: data.models[conv.modelId]?.name || conv.modelId,
          provider: data.models[conv.modelId]?.provider || 'Unknown',
          messages: conv.messages.map(msg => ({
            id: msg.id,
            role: msg.type,
            content: msg.content,
            timestamp: msg.timestamp,
          })),
        })),
        metadata: data.metadata,
      },
    },
    null,
    2
  )
}

/**
 * Generate SVG icon HTML (lucide-react style)
 */
function getIconSVG(
  iconName: 'user' | 'bot' | 'check-circle' | 'x-circle' | 'file-text',
  size: number = 14,
  color: string = 'currentColor'
): string {
  const icons: Record<string, string> = {
    user: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    bot: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2" ry="2"/><path d="M12 11v-6a4 4 0 0 0-8 0v6"/><path d="M12 11v-6a4 4 0 0 1 8 0v6"/><path d="M7 15h10"/></svg>`,
    'check-circle': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    'x-circle': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    'file-text': `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
  }
  return icons[iconName] || ''
}

/**
 * Generate HTML content for PDF export
 *
 * Creates a styled HTML document that will be converted to PDF
 */
function generatePDFHTML(data: ComparisonExportData): string {
  const { prompt, timestamp, conversations, models, metadata } = data

  const styles = `
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        font-size: 12px;
        line-height: 1.5;
        color: #1a1a1a;
        padding: 60px 100px;
        max-width: 800px;
        margin: 0 auto;
      }
      h1 { font-size: 24px; font-weight: 700; margin-bottom: 8px; color: #111; }
      h2 { font-size: 18px; font-weight: 600; margin: 24px 0 12px; color: #222; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
      h3 { font-size: 14px; font-weight: 600; margin: 16px 0 8px; color: #333; }
      .header { margin-bottom: 24px; }
      .date { font-size: 12px; color: #666; margin-bottom: 16px; }
      .prompt-box {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 16px;
        margin: 16px 0;
      }
      .prompt-label { 
        font-size: 11px; 
        font-weight: 600; 
        color: #64748b; 
        text-transform: uppercase; 
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .prompt-label svg { flex-shrink: 0; }
      .prompt-text { font-size: 13px; color: #1e293b; white-space: pre-wrap; }
      table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 11px; }
      th { background: #f1f5f9; font-weight: 600; text-align: left; padding: 10px 12px; border: 1px solid #e2e8f0; }
      td { padding: 10px 12px; border: 1px solid #e2e8f0; }
      .status-success { 
        color: #059669; 
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .status-failed { 
        color: #dc2626; 
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .status-success svg,
      .status-failed svg { flex-shrink: 0; }
      .model-section { margin: 24px 0; page-break-inside: avoid; }
      .model-header {
        background: linear-gradient(135deg, #0ea5e9 0%, #4ec5ff 100%);
        color: white;
        padding: 12px 16px;
        border-radius: 8px 8px 0 0;
        font-weight: 600;
      }
      .model-provider { font-size: 11px; opacity: 0.9; font-weight: 400; }
      .message { padding: 12px 16px; border: 1px solid #e2e8f0; border-top: none; }
      .message:last-child { border-radius: 0 0 8px 8px; }
      .message-user { background: #f0f9ff; }
      .message-assistant { background: #ffffff; }
      .message-label { 
        font-size: 10px; 
        font-weight: 600; 
        color: #64748b; 
        text-transform: uppercase; 
        margin-bottom: 6px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .message-label svg { flex-shrink: 0; }
      .message-content { 
        font-size: 12px; 
        white-space: pre-wrap; 
        word-wrap: break-word;
        line-height: 1.6;
      }
      .message-content p { margin: 0.5em 0; }
      .message-content p:first-child { margin-top: 0; }
      .message-content p:last-child { margin-bottom: 0; }
      .message-content ul, .message-content ol { margin: 0.5em 0; padding-left: 1.5em; }
      .message-content li { margin: 0.25em 0; }
      .message-content h1, .message-content h2, .message-content h3, .message-content h4 { margin: 0.75em 0 0.5em; font-weight: 600; }
      .message-content h1 { font-size: 1.5em; }
      .message-content h2 { font-size: 1.3em; }
      .message-content h3 { font-size: 1.1em; }
      .message-content blockquote { margin: 0.5em 0; padding-left: 1em; border-left: 3px solid #e2e8f0; color: #64748b; }
      .message-content table { width: 100%; border-collapse: collapse; margin: 0.5em 0; }
      .message-content table th, .message-content table td { padding: 6px 8px; border: 1px solid #e2e8f0; }
      .message-content table th { background: #f1f5f9; font-weight: 600; }
      .katex { font-size: 1.1em; }
      .katex-display { margin: 1em 0; }
      .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; text-align: center; }
      pre { background: #1e293b; color: #e2e8f0; padding: 12px; border-radius: 6px; overflow-x: auto; font-family: 'Monaco', 'Menlo', monospace; font-size: 11px; margin: 0.5em 0; }
      code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-family: 'Monaco', 'Menlo', monospace; font-size: 11px; }
      pre code { background: none; padding: 0; }
    </style>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" crossorigin="anonymous" />
  `

  let html = `<!DOCTYPE html><html><head><meta charset="UTF-8">${styles}</head><body>`

  // Header
  html += `<div class="header">`
  html += `<h1>CompareIntel</h1>`
  html += `<div class="date">${formatExportDate(timestamp)}</div>`
  html += `</div>`

  // Prompt
  html += `<div class="prompt-box">`
  html += `<div class="prompt-label">${getIconSVG('file-text', 12, '#64748b')} Prompt</div>`
  html += `<div class="prompt-text">${escapeHtml(prompt)}</div>`
  html += `</div>`

  // Summary table
  html += `<h2>Models Compared</h2>`
  html += `<table>`
  html += `<tr><th>Model</th><th>Provider</th><th>Status</th><th>Length</th></tr>`

  conversations.forEach(conv => {
    const model = models[conv.modelId]
    const lastMessage = conv.messages[conv.messages.length - 1]
    const isError = lastMessage?.content?.startsWith('Error:')
    const charCount = lastMessage?.content?.length || 0

    html += `<tr>`
    html += `<td>${escapeHtml(model?.name || conv.modelId)}</td>`
    html += `<td>${escapeHtml(model?.provider || 'Unknown')}</td>`
    html += `<td class="${isError ? 'status-failed' : 'status-success'}">${isError ? getIconSVG('x-circle', 14, '#dc2626') + ' Failed' : getIconSVG('check-circle', 14, '#059669') + ' Success'}</td>`
    html += `<td>${charCount.toLocaleString()} chars</td>`
    html += `</tr>`
  })

  html += `</table>`

  // Model responses
  html += `<h2>Responses</h2>`

  conversations.forEach(conv => {
    const model = models[conv.modelId]

    html += `<div class="model-section">`
    html += `<div class="model-header">`
    html += `${escapeHtml(model?.name || conv.modelId)}`
    html += `<span class="model-provider"> — ${escapeHtml(model?.provider || 'Unknown')}</span>`
    html += `</div>`

    conv.messages.forEach(msg => {
      const isUser = msg.type === 'user'
      html += `<div class="message ${isUser ? 'message-user' : 'message-assistant'}">`
      html += `<div class="message-label">${isUser ? getIconSVG('user', 12, '#64748b') + ' User' : getIconSVG('bot', 12, '#64748b') + ' Assistant'}</div>`
      html += `<div class="message-content">${formatContentForPDF(msg.content)}</div>`
      html += `</div>`
    })

    html += `</div>`
  })

  // Metadata
  if (metadata) {
    html += `<h2>Details</h2>`
    html += `<table>`
    html += `<tr><th>Metric</th><th>Value</th></tr>`
    html += `<tr><td>Models Requested</td><td>${metadata.models_requested}</td></tr>`
    html += `<tr><td>Models Successful</td><td>${metadata.models_successful}</td></tr>`
    if (metadata.models_failed > 0) {
      html += `<tr><td>Models Failed</td><td>${metadata.models_failed}</td></tr>`
    }
    if (metadata.processing_time_ms) {
      const timeStr =
        metadata.processing_time_ms < 1000
          ? `${metadata.processing_time_ms}ms`
          : `${(metadata.processing_time_ms / 1000).toFixed(1)}s`
      html += `<tr><td>Processing Time</td><td>${timeStr}</td></tr>`
    }
    if (metadata.credits_used) {
      html += `<tr><td>Credits Used</td><td>${metadata.credits_used.toFixed(2)}</td></tr>`
    }
    html += `</table>`
  }

  // Footer
  html += `<div class="footer">Exported from CompareIntel — compareintel.com</div>`

  html += `</body></html>`

  return html
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string | null | undefined): string {
  // Ensure text is a string
  const textStr = typeof text === 'string' ? text : String(text || '')
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return textStr.replace(/[&<>"']/g, m => map[m])
}

/**
 * Safely render LaTeX with KaTeX
 */
function safeRenderKatex(latex: string, displayMode: boolean): string {
  try {
    const cleanLatex = latex
      .trim()
      .replace(/<[^>]*>/g, '')
      .replace(/style="[^"]*"/g, '')
    if (!cleanLatex) return ''

    const options = {
      throwOnError: false,
      strict: false,
      trust: (context: { command?: string }) =>
        ['\\url', '\\href', '\\includegraphics'].includes(context.command || ''),
      macros: {
        '\\eqref': '\\href{###1}{(\\text{#1})}',
      },
      maxSize: 500,
      maxExpand: 1000,
      displayMode,
    }

    return katex.renderToString(cleanLatex, options)
  } catch {
    // Return formatted fallback
    const style = displayMode
      ? 'display: block; border: 1px solid #ccc; padding: 8px; margin: 8px 0; background: #f9f9f9;'
      : 'border: 1px solid #ccc; padding: 2px 4px; background: #f9f9f9;'
    return `<span style="${style} font-family: monospace; font-size: 0.9em;">${latex.trim()}</span>`
  }
}

/**
 * Format content for PDF display with LaTeX and markdown support
 */
function formatContentForPDF(content: string): string {
  // Extract code blocks first to preserve them
  const codeBlocks: string[] = []
  let processed = content.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`
    codeBlocks.push(`<pre><code>${escapeHtml(code)}</code></pre>`)
    return placeholder
  })

  // Process display math ($$...$$ or \[...\])
  processed = processed.replace(/\$\$([^$]+?)\$\$/gs, (_match, math) => {
    return safeRenderKatex(math, true)
  })
  processed = processed.replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_match, math) => {
    return safeRenderKatex(math, true)
  })

  // Process inline math ($...$ or \(...\))
  processed = processed.replace(/(?<!\$)\$([^$\n]+?)\$(?!\$)/g, (_match, math) => {
    return safeRenderKatex(math, false)
  })
  processed = processed.replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_match, math) => {
    return safeRenderKatex(math, false)
  })

  // Process inline code (but not code blocks)
  processed = processed.replace(/`([^`\n]+?)`/g, '<code>$1</code>')

  // Process markdown headers
  processed = processed.replace(/^### (.*$)/gm, '<h3>$1</h3>')
  processed = processed.replace(/^## (.*$)/gm, '<h2>$1</h2>')
  processed = processed.replace(/^# (.*$)/gm, '<h1>$1</h1>')

  // Process bold and italic (order matters - bold first)
  processed = processed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  processed = processed.replace(/\*([^*]+)\*/g, '<em>$1</em>')

  // Process lists - need to handle both ordered and unordered
  // First, mark unordered list items
  processed = processed.replace(/^[*\-+] (.+)$/gm, '<li data-list-type="ul">$1</li>')
  // Then mark ordered list items (only if not already marked)
  processed = processed.replace(/^(\d+)\. (.+)$/gm, (match, _num, content) => {
    // Check if this line already has a list item
    if (!match.includes('<li')) {
      return `<li data-list-type="ol">${content}</li>`
    }
    return match
  })

  // Group consecutive list items by type
  processed = processed.replace(/(<li data-list-type="(ul|ol)">.*?<\/li>\n?)+/g, match => {
    const listType = match.includes('data-list-type="ul"') ? 'ul' : 'ol'
    const cleaned = match.replace(/data-list-type="(ul|ol)"/g, '')
    return `<${listType}>${cleaned}</${listType}>`
  })

  // Process blockquotes
  processed = processed.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')

  // Process horizontal rules
  processed = processed.replace(/^---$/gm, '<hr>')

  // Process links
  processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')

  // Restore code blocks
  codeBlocks.forEach((block, index) => {
    processed = processed.replace(`__CODE_BLOCK_${index}__`, block)
  })

  // Convert line breaks to <br> but preserve paragraphs
  // Split by double newlines for paragraphs
  const paragraphs = processed.split(/\n\n+/)
  processed = paragraphs
    .map(p => {
      const trimmed = p.trim()
      if (!trimmed) return ''
      // If it's already wrapped in a block element, don't wrap again
      if (/^<(h[1-6]|ul|ol|pre|blockquote|hr)/.test(trimmed)) {
        return trimmed.replace(/\n/g, '<br>')
      }
      return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`
    })
    .filter(p => p)
    .join('')

  return processed
}

/**
 * Export comparison to PDF
 *
 * Uses html2canvas and jspdf to generate a high-quality PDF
 */
export async function exportToPDF(data: ComparisonExportData): Promise<void> {
  // Dynamically import PDF libraries to reduce bundle size
  // These are externalized in vite.config.ts to prevent bundling
  const jspdfModule = await import('jspdf')
  const html2canvasModule = await import('html2canvas')

  const jsPDF = jspdfModule.default
  const html2canvas = html2canvasModule.default

  // Create a temporary iframe to completely isolate PDF rendering from main page
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.left = '-20000px'
  iframe.style.top = '-20000px'
  iframe.style.width = '1000px'
  iframe.style.height = '1px'
  iframe.style.border = 'none'
  iframe.style.visibility = 'hidden'
  iframe.style.opacity = '0'
  iframe.style.pointerEvents = 'none'
  iframe.style.zIndex = '-9999'
  iframe.setAttribute('aria-hidden', 'true')
  iframe.setAttribute('role', 'presentation')
  document.body.appendChild(iframe)

  // Wait for iframe to load
  await new Promise<void>(resolve => {
    if (iframe.contentDocument?.readyState === 'complete') {
      resolve()
    } else {
      iframe.onload = () => resolve()
      iframe.src = 'about:blank'
    }
  })

  const container = iframe.contentDocument?.body || iframe.contentWindow?.document.body
  if (!container) {
    document.body.removeChild(iframe)
    throw new Error('Failed to create PDF container')
  }

  container.innerHTML = generatePDFHTML(data)

  try {
    // Wait for any images/fonts to load
    await new Promise(resolve => setTimeout(resolve, 100))

    // Render to canvas (html2canvas can capture iframe content)
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: 1000,
      windowHeight: container.scrollHeight,
    })

    // Create PDF
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'px',
      format: [canvas.width / 2, canvas.height / 2],
    })

    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width / 2, canvas.height / 2)

    // Download
    const filename = generateFilename(data.prompt, 'pdf')
    pdf.save(filename)
  } finally {
    // Clean up - remove iframe
    if (iframe.parentNode) {
      document.body.removeChild(iframe)
    }
  }
}

/**
 * Export comparison to HTML format
 *
 * Creates a standalone styled HTML document
 */
export function exportToHTML(data: ComparisonExportData): string {
  const { prompt, timestamp, conversations, models, metadata } = data

  const styles = `
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        font-size: 14px;
        line-height: 1.6;
        color: #1a1a1a;
        padding: 40px;
        max-width: 900px;
        margin: 0 auto;
        background: #f8fafc;
      }
      .container { background: white; border-radius: 12px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
      h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; color: #0f172a; }
      h2 { font-size: 20px; font-weight: 600; margin: 32px 0 16px; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }
      h3 { font-size: 16px; font-weight: 600; margin: 20px 0 10px; color: #334155; }
      .header { margin-bottom: 24px; border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; }
      .date { font-size: 14px; color: #64748b; margin-bottom: 8px; }
      .prompt-box {
        background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        padding: 20px;
        margin: 20px 0;
      }
      .prompt-label { 
        font-size: 12px; 
        font-weight: 600; 
        color: #475569; 
        text-transform: uppercase; 
        margin-bottom: 10px; 
        letter-spacing: 0.5px;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .prompt-label svg { flex-shrink: 0; }
      .prompt-text { font-size: 15px; color: #1e293b; white-space: pre-wrap; }
      table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px; }
      th { background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; font-weight: 600; text-align: left; padding: 12px 16px; }
      th:first-child { border-radius: 8px 0 0 0; }
      th:last-child { border-radius: 0 8px 0 0; }
      td { padding: 12px 16px; border-bottom: 1px solid #e2e8f0; }
      tr:last-child td:first-child { border-radius: 0 0 0 8px; }
      tr:last-child td:last-child { border-radius: 0 0 8px 0; }
      tr:hover td { background: #f8fafc; }
      .status-success { 
        color: #059669; 
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .status-failed { 
        color: #dc2626; 
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .status-success svg,
      .status-failed svg { flex-shrink: 0; }
      .model-section { margin: 28px 0; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05); }
      .model-header {
        background: linear-gradient(135deg, #0ea5e9 0%, #4ec5ff 100%);
        color: white;
        padding: 16px 20px;
        font-weight: 600;
        font-size: 15px;
      }
      .model-provider { font-size: 12px; opacity: 0.9; font-weight: 400; margin-left: 8px; }
      .message { padding: 16px 20px; border: 1px solid #e2e8f0; border-top: none; background: white; }
      .message:last-child { border-radius: 0 0 12px 12px; }
      .message-user { background: #eff6ff; }
      .message-assistant { background: #ffffff; }
      .message-label { 
        font-size: 11px; 
        font-weight: 600; 
        color: #64748b; 
        text-transform: uppercase; 
        margin-bottom: 8px; 
        letter-spacing: 0.5px;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .message-label svg { flex-shrink: 0; }
      .message-content { 
        font-size: 14px; 
        white-space: pre-wrap; 
        word-wrap: break-word; 
        line-height: 1.7;
      }
      .message-content p { margin: 0.5em 0; }
      .message-content p:first-child { margin-top: 0; }
      .message-content p:last-child { margin-bottom: 0; }
      .message-content ul, .message-content ol { margin: 0.5em 0; padding-left: 1.5em; }
      .message-content li { margin: 0.25em 0; }
      .message-content h1, .message-content h2, .message-content h3, .message-content h4 { margin: 0.75em 0 0.5em; font-weight: 600; }
      .message-content h1 { font-size: 1.5em; }
      .message-content h2 { font-size: 1.3em; }
      .message-content h3 { font-size: 1.1em; }
      .message-content blockquote { margin: 0.5em 0; padding-left: 1em; border-left: 3px solid #e2e8f0; color: #64748b; }
      .message-content table { width: 100%; border-collapse: collapse; margin: 0.5em 0; }
      .message-content table th, .message-content table td { padding: 6px 8px; border: 1px solid #e2e8f0; }
      .message-content table th { background: #f1f5f9; font-weight: 600; }
      .katex { font-size: 1.1em; }
      .katex-display { margin: 1em 0; }
      .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center; }
      .footer a { color: #3b82f6; text-decoration: none; }
      .footer a:hover { text-decoration: underline; }
      pre { background: #1e293b; color: #e2e8f0; padding: 16px; border-radius: 8px; overflow-x: auto; font-family: 'Monaco', 'Menlo', 'Consolas', monospace; font-size: 13px; margin: 12px 0; }
      code { background: #f1f5f9; padding: 3px 8px; border-radius: 4px; font-family: 'Monaco', 'Menlo', 'Consolas', monospace; font-size: 13px; color: #be185d; }
      pre code { background: none; padding: 0; color: inherit; }
    </style>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" crossorigin="anonymous" />
  `

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CompareIntel - AI Model Comparison</title>
  ${styles}
</head>
<body>
  <div class="container">`

  // Header
  html += `<div class="header">`
  html += `<h1>CompareIntel</h1>`
  html += `<div class="date">${formatExportDate(timestamp)}</div>`
  html += `</div>`

  // Prompt
  html += `<div class="prompt-box">`
  html += `<div class="prompt-label">${getIconSVG('file-text', 14, '#475569')} Prompt</div>`
  html += `<div class="prompt-text">${escapeHtml(prompt)}</div>`
  html += `</div>`

  // Summary table
  html += `<h2>Models Compared</h2>`
  html += `<table>`
  html += `<tr><th>Model</th><th>Provider</th><th>Status</th><th>Response Length</th></tr>`

  conversations.forEach(conv => {
    const model = models[conv.modelId]
    const lastMessage = conv.messages[conv.messages.length - 1]
    const isError = lastMessage?.content?.startsWith('Error:')
    const charCount = lastMessage?.content?.length || 0

    html += `<tr>`
    html += `<td><strong>${escapeHtml(model?.name || conv.modelId)}</strong></td>`
    html += `<td>${escapeHtml(model?.provider || 'Unknown')}</td>`
    html += `<td class="${isError ? 'status-failed' : 'status-success'}">${isError ? getIconSVG('x-circle', 16, '#dc2626') + ' Failed' : getIconSVG('check-circle', 16, '#059669') + ' Success'}</td>`
    html += `<td>${charCount.toLocaleString()} characters</td>`
    html += `</tr>`
  })

  html += `</table>`

  // Model responses
  html += `<h2>Responses</h2>`

  conversations.forEach(conv => {
    const model = models[conv.modelId]

    html += `<div class="model-section">`
    html += `<div class="model-header">`
    html += `${escapeHtml(model?.name || conv.modelId)}`
    html += `<span class="model-provider"> — ${escapeHtml(model?.provider || 'Unknown')}</span>`
    html += `</div>`

    conv.messages.forEach(msg => {
      const isUser = msg.type === 'user'
      html += `<div class="message ${isUser ? 'message-user' : 'message-assistant'}">`
      html += `<div class="message-label">${isUser ? getIconSVG('user', 14, '#64748b') + ' User' : getIconSVG('bot', 14, '#64748b') + ' Assistant'}</div>`
      html += `<div class="message-content">${formatContentForHTML(msg.content)}</div>`
      html += `</div>`
    })

    html += `</div>`
  })

  // Metadata
  if (metadata) {
    html += `<h2>Comparison Details</h2>`
    html += `<table>`
    html += `<tr><th>Metric</th><th>Value</th></tr>`
    html += `<tr><td>Models Requested</td><td>${metadata.models_requested}</td></tr>`
    html += `<tr><td>Models Successful</td><td>${metadata.models_successful}</td></tr>`
    if (metadata.models_failed > 0) {
      html += `<tr><td>Models Failed</td><td>${metadata.models_failed}</td></tr>`
    }
    if (metadata.processing_time_ms) {
      const timeStr =
        metadata.processing_time_ms < 1000
          ? `${metadata.processing_time_ms}ms`
          : `${(metadata.processing_time_ms / 1000).toFixed(1)}s`
      html += `<tr><td>Processing Time</td><td>${timeStr}</td></tr>`
    }
    if (metadata.credits_used) {
      html += `<tr><td>Credits Used</td><td>${metadata.credits_used.toFixed(2)}</td></tr>`
    }
    html += `</table>`
  }

  // Footer
  html += `<div class="footer">Exported from <a href="https://compareintel.com">CompareIntel</a> — Compare 50+ AI Models Side-by-Side</div>`

  html += `</div></body></html>`

  return html
}

/**
 * Format content for HTML display with LaTeX and markdown support (same as PDF)
 */
function formatContentForHTML(content: string): string {
  // Use the same formatting function as PDF for consistency
  return formatContentForPDF(content)
}

/**
 * Download a file with the given content
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Export to Markdown and trigger download
 */
export function downloadMarkdown(data: ComparisonExportData): void {
  const content = exportToMarkdown(data)
  const filename = generateFilename(data.prompt, 'md')
  downloadFile(content, filename, 'text/markdown;charset=utf-8')
}

/**
 * Export to JSON and trigger download
 */
export function downloadJSON(data: ComparisonExportData): void {
  const content = exportToJSON(data)
  const filename = generateFilename(data.prompt, 'json')
  downloadFile(content, filename, 'application/json;charset=utf-8')
}

/**
 * Export to HTML and trigger download
 */
export function downloadHTML(data: ComparisonExportData): void {
  const content = exportToHTML(data)
  const filename = generateFilename(data.prompt, 'html')
  downloadFile(content, filename, 'text/html;charset=utf-8')
}
