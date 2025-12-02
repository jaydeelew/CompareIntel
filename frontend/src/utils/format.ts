/**
 * Formatting utilities for CompareIntel frontend.
 *
 * Provides functions for formatting text, numbers, dates, and other data
 * for display in the UI.
 */

/**
 * Format a date string as a relative time (e.g., "2h ago", "Yesterday").
 *
 * Formats dates relative to the current time for better readability.
 * Falls back to absolute date formatting for older dates.
 *
 * @param dateString - ISO date string to format
 * @returns Formatted date string (e.g., "Just now", "5m ago", "Yesterday", "Jan 15")
 *
 * @example
 * ```typescript
 * formatDate(new Date().toISOString()); // "Just now"
 * formatDate(new Date(Date.now() - 300000).toISOString()); // "5m ago"
 * formatDate(new Date(Date.now() - 86400000).toISOString()); // "Yesterday"
 * ```
 */
export function formatDate(dateString: string): string {
  // Safety check for invalid or undefined date strings
  if (!dateString || typeof dateString !== 'string') {
    return ''
  }

  try {
    const date = new Date(dateString)
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return ''
    }

    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

/**
 * Format a date as a time string (e.g., "3:45 PM").
 *
 * @param dateString - ISO date string to format
 * @param locale - Locale string (default: browser default)
 * @returns Formatted time string
 *
 * @example
 * ```typescript
 * formatTime(new Date().toISOString()); // "3:45:23 PM"
 * ```
 */
export function formatTime(dateString: string, locale?: string): string {
  // Safety check for invalid or undefined date strings
  if (!dateString || typeof dateString !== 'string') {
    return ''
  }

  try {
    const date = new Date(dateString)
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return ''
    }
    return date.toLocaleTimeString(locale)
  } catch {
    return ''
  }
}

/**
 * Format a number with locale-specific formatting (e.g., thousands separators).
 *
 * @param value - Number to format
 * @param locale - Locale string (default: browser default)
 * @returns Formatted number string
 *
 * @example
 * ```typescript
 * formatNumber(1234567); // "1,234,567" (in en-US locale)
 * formatNumber(1234.56); // "1,234.56"
 * ```
 */
export function formatNumber(value: number, locale?: string): string {
  return value.toLocaleString(locale)
}

/**
 * Truncate text to a maximum length, appending ellipsis if truncated.
 *
 * @param text - Text to truncate
 * @param maxLength - Maximum length before truncation (default: 60)
 * @returns Truncated text with ellipsis if needed
 *
 * @example
 * ```typescript
 * truncatePrompt('This is a very long text', 10); // "This is a ..."
 * truncatePrompt('Short', 10); // "Short"
 * ```
 */
export function truncatePrompt(text: string, maxLength: number = 60): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

/**
 * Format a conversation message for display with timestamp.
 *
 * @param role - Message role ('user' or 'assistant')
 * @param content - Message content
 * @param timestamp - ISO date string
 * @returns Formatted message string
 *
 * @example
 * ```typescript
 * formatConversationMessage('user', 'Hello', new Date().toISOString());
 * // "[You] 3:45 PM\nHello"
 * ```
 */
export function formatConversationMessage(
  role: 'user' | 'assistant',
  content: string,
  timestamp: string
): string {
  const label = role === 'user' ? 'You' : 'AI'
  const time = formatTime(timestamp)
  return `[${label}] ${time}\n${content}`
}
