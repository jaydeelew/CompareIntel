/**
 * Round-trip text ↔ image mode preserves selections per mode.
 */

import { act, renderHook } from '@testing-library/react'
import * as React from 'react'
import { describe, expect, it } from 'vitest'

import { usePerModeModelSelection } from '../../hooks/usePerModeModelSelection'
import type { ModelsByProvider } from '../../types'

function mockCatalog(): ModelsByProvider {
  return {
    OpenAI: [
      {
        id: 'openai/gpt-text',
        name: 'GPT Text',
        description: '',
        category: 'Language',
        provider: 'OpenAI',
        tier_access: 'unregistered',
        supports_image_generation: false,
      },
      {
        id: 'openai/gpt-text-2',
        name: 'GPT Text 2',
        description: '',
        category: 'Language',
        provider: 'OpenAI',
        tier_access: 'unregistered',
        supports_image_generation: false,
      },
      {
        id: 'openai/image-gen',
        name: 'GPT Image',
        description: '',
        category: 'Image',
        provider: 'OpenAI',
        tier_access: 'unregistered',
        supports_image_generation: true,
      },
      {
        id: 'openai/image-gen-2',
        name: 'GPT Image 2',
        description: '',
        category: 'Image',
        provider: 'OpenAI',
        tier_access: 'unregistered',
        supports_image_generation: true,
      },
    ],
  } as ModelsByProvider
}

function useHarness(initialMode: 'text' | 'image' = 'text') {
  const catalog = mockCatalog()
  const [modelMode, setModelMode] = React.useState<'text' | 'image'>(initialMode)
  const [selectedModels, setSelectedModels] = React.useState<string[]>([])
  const [originalSelectedModels, setOriginalSelectedModels] = React.useState<string[]>([])

  const perMode = usePerModeModelSelection({
    modelMode,
    selectedModels,
    setSelectedModels,
    originalSelectedModels,
    setOriginalSelectedModels,
    modelsByProvider: catalog,
    isAuthenticated: false,
    user: null,
    maxModelsLimit: 3,
    modelsLoaded: true,
  })

  return {
    modelMode,
    setModelMode,
    selectedModels,
    setSelectedModels,
    ...perMode,
  }
}

describe('usePerModeModelSelection', () => {
  it('restores text selection after visiting image mode and back', () => {
    const { result } = renderHook(() => useHarness('text'))

    act(() => {
      result.current.setSelectedModels(['openai/gpt-text', 'openai/gpt-text-2'])
    })
    expect(result.current.selectedModels).toEqual(['openai/gpt-text', 'openai/gpt-text-2'])

    act(() => {
      result.current.setModelMode('image')
    })
    expect(result.current.selectedModels).toEqual([])

    act(() => {
      result.current.setSelectedModels(['openai/image-gen'])
    })
    expect(result.current.selectedModels).toEqual(['openai/image-gen'])

    act(() => {
      result.current.setModelMode('text')
    })
    expect(result.current.selectedModels).toEqual(['openai/gpt-text', 'openai/gpt-text-2'])

    act(() => {
      result.current.setModelMode('image')
    })
    expect(result.current.selectedModels).toEqual(['openai/image-gen'])
  })

  it('restores image selection after visiting text mode and back', () => {
    const { result } = renderHook(() => useHarness('image'))

    act(() => {
      result.current.setSelectedModels(['openai/image-gen', 'openai/image-gen-2'])
    })

    act(() => {
      result.current.setModelMode('text')
    })
    expect(result.current.selectedModels).toEqual([])

    act(() => {
      result.current.setSelectedModels(['openai/gpt-text'])
    })

    act(() => {
      result.current.setModelMode('image')
    })
    expect(result.current.selectedModels).toEqual(['openai/image-gen', 'openai/image-gen-2'])
  })

  it('preserves text cache when toggling to image without selecting image models', () => {
    const { result } = renderHook(() => useHarness('text'))

    act(() => {
      result.current.setSelectedModels(['openai/gpt-text', 'openai/gpt-text-2'])
    })

    act(() => {
      result.current.setModelMode('image')
    })
    expect(result.current.selectedModels).toEqual([])

    act(() => {
      result.current.setModelMode('text')
    })
    expect(result.current.selectedModels).toEqual(['openai/gpt-text', 'openai/gpt-text-2'])
  })
})
