/**
 * Validation utilities for CompareIntel frontend.
 *
 * Provides functions for validating user input, sanitizing data,
 * and checking constraints.
 */

/**
 * Sanitize a model ID for use in HTML id attributes and CSS selectors.
 *
 * Replaces any characters that are not alphanumeric, underscore, or hyphen
 * with a hyphen to ensure valid HTML id attributes.
 *
 * @param modelId - Model ID to sanitize
 * @returns Sanitized model ID safe for HTML attributes
 *
 * @example
 * ```typescript
 * getSafeId('gpt-4-turbo'); // "gpt-4-turbo"
 * getSafeId('model@id#123'); // "model-id-123"
 * ```
 */
export function getSafeId(modelId: string): string {
  // Safety check for undefined/null values
  if (!modelId || typeof modelId !== 'string') {
    return 'unknown'
  }
  return modelId.replace(/[^a-zA-Z0-9_-]/g, '-')
}

/**
 * Validate email address format.
 *
 * Uses a simple regex pattern to check if an email address is valid.
 * For production use, consider using a more robust validation library.
 *
 * @param email - Email address to validate
 * @returns True if email format is valid, false otherwise
 *
 * @example
 * ```typescript
 * validateEmail('user@example.com'); // true
 * validateEmail('invalid-email'); // false
 * ```
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Validate input length against a maximum character limit.
 *
 * @param input - Input text to validate
 * @param maxLength - Maximum allowed length
 * @returns Object with validation result and error message if invalid
 *
 * @example
 * ```typescript
 * validateInputLength('Hello', 10); // { isValid: true, error: null }
 * validateInputLength('This is too long', 10); // { isValid: false, error: "..." }
 * ```
 */
export function validateInputLength(
  input: string,
  maxLength: number
): { isValid: boolean; error: string | null } {
  if (input.length > maxLength) {
    return {
      isValid: false,
      error: `Input exceeds maximum length of ${maxLength.toLocaleString()} characters. Current length: ${input.length.toLocaleString()}`,
    }
  }
  return { isValid: true, error: null }
}

/**
 * Check if input is empty or only whitespace.
 *
 * @param input - Input text to check
 * @returns True if input is empty or whitespace only
 *
 * @example
 * ```typescript
 * isEmpty(''); // true
 * isEmpty('   '); // true
 * isEmpty('hello'); // false
 * ```
 */
export function isEmpty(input: string): boolean {
  return input.trim().length === 0
}

/**
 * Validate that input is not empty.
 *
 * @param input - Input text to validate
 * @param fieldName - Name of the field for error message (default: "Input")
 * @returns Object with validation result and error message if invalid
 *
 * @example
 * ```typescript
 * validateNotEmpty('hello', 'Question'); // { isValid: true, error: null }
 * validateNotEmpty('', 'Question'); // { isValid: false, error: "Question is required" }
 * ```
 */
export function validateNotEmpty(
  input: string,
  fieldName: string = 'Input'
): { isValid: boolean; error: string | null } {
  if (isEmpty(input)) {
    return {
      isValid: false,
      error: `${fieldName} is required`,
    }
  }
  return { isValid: true, error: null }
}
