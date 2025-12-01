/**
 * Date and time utilities for CompareIntel frontend.
 *
 * Provides functions for parsing, formatting, and manipulating dates
 * used throughout the application.
 */

/**
 * Parse an ISO date string or Date object and return a Date object.
 *
 * @param date - ISO date string, Date object, or timestamp
 * @returns Date object, or null if parsing fails
 *
 * @example
 * ```typescript
 * parseDate('2025-01-15T10:30:00Z'); // Date object
 * parseDate(new Date()); // Date object
 * parseDate('invalid'); // null
 * ```
 */
export function parseDate(date: string | Date | number): Date | null {
  try {
    const parsed = new Date(date)
    // Check if date is invalid
    if (isNaN(parsed.getTime())) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

/**
 * Check if a date is today.
 *
 * @param dateString - ISO date string to check
 * @returns True if the date is today
 *
 * @example
 * ```typescript
 * isToday(new Date().toISOString()); // true
 * isToday('2024-01-01T00:00:00Z'); // false (if not today)
 * ```
 */
export function isToday(dateString: string): boolean {
  const date = parseDate(dateString)
  if (!date) return false

  const today = new Date()
  return date.toDateString() === today.toDateString()
}

/**
 * Get the start of today in ISO format.
 *
 * @returns ISO date string for the start of today (00:00:00)
 *
 * @example
 * ```typescript
 * getTodayStart(); // "2025-01-15T00:00:00.000Z"
 * ```
 */
export function getTodayStart(): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today.toISOString()
}

/**
 * Get the current date as an ISO string.
 *
 * @returns Current date/time as ISO string
 *
 * @example
 * ```typescript
 * getCurrentISODate(); // "2025-01-15T10:30:45.123Z"
 * ```
 */
export function getCurrentISODate(): string {
  return new Date().toISOString()
}

/**
 * Calculate the difference in milliseconds between two dates.
 *
 * @param date1 - First date (ISO string or Date)
 * @param date2 - Second date (ISO string or Date, defaults to now)
 * @returns Difference in milliseconds (positive if date1 is before date2)
 *
 * @example
 * ```typescript
 * const diff = getDateDiff('2025-01-15T10:00:00Z', '2025-01-15T11:00:00Z');
 * console.log(diff); // 3600000 (1 hour in ms)
 * ```
 */
export function getDateDiff(date1: string | Date, date2: string | Date = new Date()): number {
  const d1 = typeof date1 === 'string' ? parseDate(date1) : date1
  const d2 = typeof date2 === 'string' ? parseDate(date2) : date2

  if (!d1 || !d2 || isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0

  return d2.getTime() - d1.getTime()
}

/**
 * Format a date as a locale-specific date string.
 *
 * @param dateString - ISO date string to format
 * @param locale - Locale string (default: 'en-US')
 * @param options - Intl.DateTimeFormatOptions
 * @returns Formatted date string
 *
 * @example
 * ```typescript
 * formatLocaleDate('2025-01-15T10:30:00Z'); // "Jan 15, 2025"
 * formatLocaleDate('2025-01-15T10:30:00Z', 'en-US', { month: 'short', day: 'numeric' }); // "Jan 15"
 * ```
 */
export function formatLocaleDate(
  dateString: string,
  locale: string = 'en-US',
  options?: Intl.DateTimeFormatOptions
): string {
  const date = parseDate(dateString)
  if (!date || isNaN(date.getTime())) return ''

  return date.toLocaleDateString(locale, options)
}
