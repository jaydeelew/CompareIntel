import React from 'react'

/**
 * Button component props
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Button variant for styling */
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  /** Button size */
  size?: 'small' | 'medium' | 'large'
  /** Whether button is in loading state */
  isLoading?: boolean
  /** Full width button */
  fullWidth?: boolean
  /** Icon element to display before text */
  icon?: React.ReactNode
  /** Icon element to display after text */
  iconAfter?: React.ReactNode
}

/**
 * Reusable Button component with consistent styling
 *
 * @example
 * ```tsx
 * <Button variant="primary" onClick={handleClick}>
 *   Submit
 * </Button>
 * ```
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'medium',
      isLoading = false,
      fullWidth = false,
      icon,
      iconAfter,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const baseClasses = 'button'
    const variantClasses = `button-${variant}`
    const sizeClasses = `button-${size}`
    const widthClasses = fullWidth ? 'button-full-width' : ''
    const loadingClasses = isLoading ? 'button-loading' : ''

    const combinedClassName = [
      baseClasses,
      variantClasses,
      sizeClasses,
      widthClasses,
      loadingClasses,
      className,
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <button ref={ref} className={combinedClassName} disabled={disabled || isLoading} {...props}>
        {isLoading && (
          <span className="button-spinner" aria-hidden="true">
            ⏳
          </span>
        )}
        {!isLoading && icon && (
          <span className="button-icon-before" aria-hidden="true">
            {icon}
          </span>
        )}
        {children}
        {!isLoading && iconAfter && (
          <span className="button-icon-after" aria-hidden="true">
            {iconAfter}
          </span>
        )}
      </button>
    )
  }
)

Button.displayName = 'Button'
