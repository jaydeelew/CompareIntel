import React from 'react'

/**
 * Input component props
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Label text for the input */
  label?: string
  /** Error message to display */
  error?: string
  /** Helper text to display below input */
  helperText?: string
  /** Icon element to display before input */
  icon?: React.ReactNode
  /** Icon element to display after input */
  iconAfter?: React.ReactNode
  /** Full width input */
  fullWidth?: boolean
  /** Input container className */
  containerClassName?: string
}

/**
 * Reusable Input component with label, error, and helper text support
 *
 * @example
 * ```tsx
 * <Input
 *   label="Email"
 *   type="email"
 *   error={errors.email}
 *   placeholder="Enter your email"
 * />
 * ```
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      icon,
      iconAfter,
      fullWidth = false,
      containerClassName = '',
      className = '',
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`
    const hasError = Boolean(error)

    const inputClassName = [
      'input',
      hasError ? 'input-error' : '',
      icon ? 'input-with-icon-before' : '',
      iconAfter ? 'input-with-icon-after' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ')

    const containerClass = [
      'input-container',
      fullWidth ? 'input-container-full-width' : '',
      containerClassName,
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <div className={containerClass}>
        {label && (
          <label htmlFor={inputId} className="input-label">
            {label}
          </label>
        )}
        <div className="input-wrapper">
          {icon && (
            <span className="input-icon-before" aria-hidden="true">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={inputClassName}
            aria-invalid={hasError}
            aria-describedby={
              error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined
            }
            {...props}
          />
          {iconAfter && (
            <span className="input-icon-after" aria-hidden="true">
              {iconAfter}
            </span>
          )}
        </div>
        {error && (
          <span id={`${inputId}-error`} className="input-error-text" role="alert">
            {error}
          </span>
        )}
        {!error && helperText && (
          <span id={`${inputId}-helper`} className="input-helper-text">
            {helperText}
          </span>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

/**
 * Textarea component props
 */
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Label text for the textarea */
  label?: string
  /** Error message to display */
  error?: string
  /** Helper text to display below textarea */
  helperText?: string
  /** Full width textarea */
  fullWidth?: boolean
  /** Textarea container className */
  containerClassName?: string
}

/**
 * Reusable Textarea component with label, error, and helper text support
 *
 * @example
 * ```tsx
 * <Textarea
 *   label="Message"
 *   rows={4}
 *   placeholder="Enter your message"
 * />
 * ```
 */
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      error,
      helperText,
      fullWidth = false,
      containerClassName = '',
      className = '',
      id,
      ...props
    },
    ref
  ) => {
    const textareaId = id || `textarea-${Math.random().toString(36).substr(2, 9)}`
    const hasError = Boolean(error)

    const textareaClassName = ['textarea', hasError ? 'textarea-error' : '', className]
      .filter(Boolean)
      .join(' ')

    const containerClass = [
      'textarea-container',
      fullWidth ? 'textarea-container-full-width' : '',
      containerClassName,
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <div className={containerClass}>
        {label && (
          <label htmlFor={textareaId} className="textarea-label">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={textareaClassName}
          aria-invalid={hasError}
          aria-describedby={
            error ? `${textareaId}-error` : helperText ? `${textareaId}-helper` : undefined
          }
          {...props}
        />
        {error && (
          <span id={`${textareaId}-error`} className="textarea-error-text" role="alert">
            {error}
          </span>
        )}
        {!error && helperText && (
          <span id={`${textareaId}-helper`} className="textarea-helper-text">
            {helperText}
          </span>
        )}
      </div>
    )
  }
)

Textarea.displayName = 'Textarea'
