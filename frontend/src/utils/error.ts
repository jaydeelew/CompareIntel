/**
 * Error handling utilities for CompareIntel frontend.
 *
 * Provides functions for displaying user-friendly error messages
 * and handling errors in the UI.
 */

/**
 * Notification type for user feedback.
 */
export type NotificationType = 'success' | 'error'

/**
 * Notification controller returned by showNotification.
 * Provides methods to update or remove the notification.
 */
export interface NotificationController {
  (): void // Can be called directly to remove the notification
  update: (msg: string, type?: NotificationType) => void // Update notification in place
  clearAutoRemove: () => void // Clear the auto-remove timeout
  setIcon: (iconHtml: string) => void // Set a custom icon
}

/**
 * Show a temporary notification to the user.
 *
 * Creates a styled notification element that appears in the top-right corner
 * of the screen and automatically disappears after 3 seconds.
 *
 * Features:
 * - Smooth animations (slide in from right, fade out)
 * - Icon support (checkmark for success, X for error)
 * - Backdrop blur effect
 * - Responsive positioning
 *
 * @param msg - Message to display
 * @param type - Notification type ('success' or 'error', default: 'success')
 * @returns A notification controller with update and remove methods
 *
 * @example
 * ```typescript
 * showNotification('Comparison completed successfully!', 'success');
 * const notification = showNotification('Processing...', 'success');
 * // ... later ...
 * notification.update('Done!', 'success'); // Update in place
 * // or
 * notification(); // Remove notification
 * ```
 */
export function showNotification(
  msg: string,
  type: NotificationType = 'success'
): NotificationController {
  const notif = document.createElement('div')

  // Create container with icon and text
  const container = document.createElement('div')
  container.style.display = 'flex'
  container.style.alignItems = 'center'
  container.style.gap = '12px'

  // Add icon
  const icon = document.createElement('div')
  icon.innerHTML = type === 'success' ? '✓' : '✕'
  icon.style.fontSize = '1.1rem'
  icon.style.fontWeight = 'bold'
  icon.style.display = 'flex'
  icon.style.alignItems = 'center'
  icon.style.justifyContent = 'center'
  icon.style.width = '24px'
  icon.style.height = '24px'
  icon.style.borderRadius = '50%'
  icon.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'
  icon.style.backdropFilter = 'blur(8px)'

  // Add text
  const text = document.createElement('span')
  text.textContent = msg
  text.style.fontWeight = '500'
  text.style.fontSize = '0.95rem'
  text.style.letterSpacing = '0.025em'

  container.appendChild(icon)
  container.appendChild(text)
  notif.appendChild(container)

  // Calculate top position by counting existing notifications
  // Use a data attribute to reliably identify notification elements
  const existingNotifications = Array.from(
    document.querySelectorAll('[data-notification="true"]')
  ) as HTMLElement[]
  const baseTop = 24
  const notificationSpacing = 12 // Space between notifications
  const notificationHeight = 80 // Approximate height of a notification (including padding)

  // Calculate top position: base position + (number of existing notifications * (height + spacing))
  const topPosition =
    baseTop + existingNotifications.length * (notificationHeight + notificationSpacing)

  // Mark this element as a notification for future queries
  notif.setAttribute('data-notification', 'true')

  // Main notification styling
  notif.style.position = 'fixed'
  notif.style.top = `${topPosition}px`
  notif.style.right = '24px'
  notif.style.zIndex = '9999'
  notif.style.padding = '16px 24px'
  notif.style.borderRadius = '16px'
  notif.style.background =
    type === 'success'
      ? 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)'
      : 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)'
  notif.style.color = 'white'
  notif.style.boxShadow =
    '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04), 0 0 0 1px rgba(255, 255, 255, 0.1)'
  notif.style.backdropFilter = 'blur(16px)'
  notif.style.border = '1px solid rgba(255, 255, 255, 0.2)'
  notif.style.pointerEvents = 'none'
  notif.style.transform = 'translateX(100%) scale(0.9)'
  notif.style.transition = 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
  notif.style.opacity = '0'
  notif.style.maxWidth = '400px'
  notif.style.minWidth = '280px'

  document.body.appendChild(notif)

  // Animate in
  requestAnimationFrame(() => {
    notif.style.transform = 'translateX(0) scale(1)'
    notif.style.opacity = '1'
  })

  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let removed = false

  // Function to clear the auto-remove timeout
  const clearAutoRemove = () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  }

  // Function to set a custom icon
  const setIcon = (iconHtml: string) => {
    if (removed) return
    icon.innerHTML = iconHtml
  }

  // Function to update the notification text and type in place
  const updateNotification = (newMsg: string, newType: NotificationType = 'success') => {
    if (removed) {
      // If notification was removed, create a new one
      return
    }

    // Update icon
    icon.innerHTML = newType === 'success' ? '✓' : '✕'

    // Update text
    text.textContent = newMsg

    // Update background color
    notif.style.background =
      newType === 'success'
        ? 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)'
        : 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)'

    // Reset timeout - notification will stay for another 1.5 seconds (shorter for completion messages)
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    timeoutId = setTimeout(() => {
      removeNotification(false) // Use animation for automatic removal
    }, 1500)
  }

  // Cleanup function to manually remove the notification
  // When called manually (e.g., to replace with another notification), removes instantly
  // When called automatically after timeout, uses animation
  const removeNotification = (instant: boolean = true) => {
    if (removed) return
    removed = true

    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }

    if (instant) {
      // Remove instantly without animation when manually called
      notif.remove()
    } else {
      // Use animation when automatically removed after timeout
      notif.style.transform = 'translateX(100%) scale(0.9)'
      notif.style.opacity = '0'
      setTimeout(() => notif.remove(), 400)
    }
  }

  // Animate out automatically after 3 seconds
  timeoutId = setTimeout(() => {
    removeNotification(false) // Use animation for automatic removal
  }, 3000)

  // Return both update and remove functions as a NotificationController
  const result = removeNotification as NotificationController
  result.update = updateNotification
  result.clearAutoRemove = clearAutoRemove
  result.setIcon = setIcon
  return result
}

/**
 * Format an error message for display to the user.
 *
 * Extracts user-friendly error messages from various error formats
 * (Error objects, API error responses, etc.).
 *
 * @param error - Error to format (Error object, string, or unknown)
 * @param defaultMessage - Default message if error cannot be formatted
 * @returns Formatted error message string
 *
 * @example
 * ```typescript
 * formatError(new Error('Something went wrong')); // "Something went wrong"
 * formatError('Simple string error'); // "Simple string error"
 * formatError({ detail: 'API error' }); // "API error"
 * ```
 */
export function formatError(
  error: unknown,
  defaultMessage: string = 'An unexpected error occurred'
): string {
  if (typeof error === 'string') {
    return error
  }

  if (error instanceof Error) {
    return error.message
  }

  if (error && typeof error === 'object') {
    const errorObj = error as Record<string, unknown>
    if ('detail' in errorObj && typeof errorObj.detail === 'string') {
      return errorObj.detail
    }
    if ('message' in errorObj && typeof errorObj.message === 'string') {
      return errorObj.message
    }
  }

  return defaultMessage
}

/**
 * Check if a message content represents an error.
 *
 * Detects error messages from model responses, handling various formats:
 * - Messages starting with "Error:" (case-insensitive)
 * - Errors appended mid-stream (e.g., "Response text... Error: Network connection lost")
 * - Messages with leading/trailing whitespace
 * - Known backend error patterns
 *
 * @param content - Message content to check
 * @returns True if the content represents an error, false otherwise
 *
 * @example
 * ```typescript
 * isErrorMessage('Error: Network connection lost'); // true
 * isErrorMessage('error: Something went wrong'); // true
 * isErrorMessage('  Error: Timeout'); // true
 * isErrorMessage('Response text... Error: Network connection lost'); // true
 * isErrorMessage('This is a normal response'); // false
 * ```
 */
export function isErrorMessage(content: string | null | undefined): boolean {
  if (!content || typeof content !== 'string') {
    return false
  }

  const trimmed = content.trim()
  if (trimmed.length === 0) {
    return false
  }

  // Check if content contains "Error:" anywhere (case-insensitive)
  // This handles cases where error is appended mid-stream (even without spaces)
  if (!/Error:/i.test(trimmed)) {
    return false
  }

  // Find the last occurrence of "Error:" (errors are typically appended at the end)
  const errorIndex = trimmed.toLowerCase().lastIndexOf('error:')

  // Check if it matches known backend error patterns
  const errorText = trimmed.substring(errorIndex)
  const knownErrorPatterns = [
    /^Error:\s*(Timeout|Rate\s*limit|Model\s*not\s*available|Authentication\s*failed|Network\s*connection\s*lost)/i,
    /^Error:\s*\d+/, // Error: 404, Error: 500, etc.
    /^Error:\s*[A-Z][^.!?]{0,100}$/, // Error: followed by short capitalized description
  ]

  if (knownErrorPatterns.some(pattern => pattern.test(errorText))) {
    return true
  }

  // Heuristic: if "Error:" appears in the last 200 characters, it's likely an appended error
  const distanceFromEnd = trimmed.length - errorIndex
  if (distanceFromEnd <= 200) {
    return true
  }

  // If "Error:" appears early and content is long/structured, it's likely an explanation
  if (errorIndex < 100 && trimmed.length > 200) {
    const hasMultipleSentences = (trimmed.match(/[.!?]\s+/g) || []).length >= 2
    if (hasMultipleSentences) {
      return false // Likely an explanation
    }
  }

  // Default: treat as error if "Error:" is present
  return true
}
