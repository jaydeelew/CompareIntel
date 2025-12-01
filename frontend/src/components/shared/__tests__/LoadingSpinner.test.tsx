/**
 * Tests for LoadingSpinner component
 */

import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import { LoadingSpinner, FullPageLoadingSpinner, type LoadingSpinnerProps } from '../LoadingSpinner'

describe('LoadingSpinner', () => {
  describe('Rendering', () => {
    it('should render spinner', () => {
      const { container } = render(<LoadingSpinner />)
      const spinner = container.querySelector('[role="status"]')
      expect(spinner).toBeInTheDocument()
    })

    it('should have aria-label for accessibility', () => {
      const { container } = render(<LoadingSpinner />)
      const spinner = container.querySelector('[aria-label="Loading"]')
      expect(spinner).toBeInTheDocument()
    })

    it('should have screen reader only text', () => {
      render(<LoadingSpinner />)
      expect(screen.getByText(/loading\.\.\./i)).toBeInTheDocument()
    })

    it('should render with message', () => {
      render(<LoadingSpinner message="Loading data..." />)
      expect(screen.getByText(/loading data\.\.\./i)).toBeInTheDocument()
    })

    it('should render message in container when provided', () => {
      const { container } = render(<LoadingSpinner message="Loading..." />)
      const containerDiv = container.querySelector('.loading-spinner-container')
      expect(containerDiv).toBeInTheDocument()
    })
  })

  describe('Sizes', () => {
    it.each([
      ['small', 'spinner-small'],
      ['medium', 'spinner-medium'],
      ['large', 'spinner-large'],
    ])('should apply %s size class', (size, expectedClass) => {
      const { container } = render(<LoadingSpinner size={size as LoadingSpinnerProps['size']} />)
      const spinner = container.querySelector('[role="status"]')
      expect(spinner).toHaveClass(expectedClass)
    })
  })

  describe('Styles', () => {
    it('should use modern spinner by default', () => {
      const { container } = render(<LoadingSpinner />)
      const spinner = container.querySelector('[role="status"]')
      expect(spinner).toHaveClass('modern-spinner')
    })

    it('should use modern spinner when modern is true', () => {
      const { container } = render(<LoadingSpinner modern={true} />)
      const spinner = container.querySelector('[role="status"]')
      expect(spinner).toHaveClass('modern-spinner')
    })

    it('should use classic spinner when modern is false', () => {
      const { container } = render(<LoadingSpinner modern={false} />)
      const spinner = container.querySelector('[role="status"]')
      expect(spinner).toHaveClass('spinner')
    })
  })

  describe('Custom className', () => {
    it('should apply custom className', () => {
      const { container } = render(<LoadingSpinner className="custom-class" />)
      const spinner = container.querySelector('[role="status"]')
      expect(spinner).toHaveClass('custom-class')
    })
  })
})

describe('FullPageLoadingSpinner', () => {
  describe('Rendering', () => {
    it('should render full page spinner', () => {
      const { container } = render(<FullPageLoadingSpinner />)
      const fullPageDiv = container.querySelector('.full-page-loading')
      expect(fullPageDiv).toBeInTheDocument()
    })

    it('should render with message', () => {
      render(<FullPageLoadingSpinner message="Loading page..." />)
      expect(screen.getByText(/loading page\.\.\./i)).toBeInTheDocument()
    })

    it('should use large size', () => {
      const { container } = render(<FullPageLoadingSpinner />)
      const spinner = container.querySelector('.spinner-large')
      expect(spinner).toBeInTheDocument()
    })

    it('should use modern spinner', () => {
      const { container } = render(<FullPageLoadingSpinner />)
      const spinner = container.querySelector('.modern-spinner')
      expect(spinner).toBeInTheDocument()
    })
  })
})
