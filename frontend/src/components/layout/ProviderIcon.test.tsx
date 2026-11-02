import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ProviderIcon } from './ProviderIcon'

describe('ProviderIcon', () => {
  it('renders the dedicated Qwen mark for image and text models', () => {
    const { container } = render(<ProviderIcon provider="Qwen" />)
    expect(container.querySelector('svg')).not.toBeNull()
    expect(container.textContent).not.toContain('Qw')
  })
})
