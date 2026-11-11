import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

import type { ModelsByProvider, User } from '../types'
import {
  createEmptyPerModeSelectionCache,
  type ModelMode,
  type PerModeSelectionCache,
  sanitizeModeSelection,
  sanitizePerModeCache,
} from '../utils/perModeModelSelection'

export interface UsePerModeModelSelectionOptions {
  modelMode: ModelMode
  selectedModels: string[]
  setSelectedModels: React.Dispatch<React.SetStateAction<string[]>>
  originalSelectedModels: string[]
  setOriginalSelectedModels: React.Dispatch<React.SetStateAction<string[]>>
  modelsByProvider: ModelsByProvider
  isAuthenticated: boolean
  user: User | null
  maxModelsLimit: number
  modelsLoaded: boolean
}

export interface UsePerModeModelSelectionReturn {
  clearAllModeCaches: () => void
  getPerModeCacheSnapshot: () => PerModeSelectionCache
  hydratePerModeCache: (cache: PerModeSelectionCache, mode: ModelMode) => void
  rememberCurrentModeInCache: () => void
}

/**
 * Remembers selected models separately for text vs image mode and restores them on toggle.
 */
export function usePerModeModelSelection({
  modelMode,
  selectedModels,
  setSelectedModels,
  originalSelectedModels,
  setOriginalSelectedModels,
  modelsByProvider,
  isAuthenticated,
  user,
  maxModelsLimit,
  modelsLoaded,
}: UsePerModeModelSelectionOptions): UsePerModeModelSelectionReturn {
  const selectionCacheRef = useRef<PerModeSelectionCache>(createEmptyPerModeSelectionCache())
  const originalCacheRef = useRef<PerModeSelectionCache>(createEmptyPerModeSelectionCache())
  const prevModeRef = useRef<ModelMode>(modelMode)
  const isRestoringFromModeSwitchRef = useRef(false)

  const rememberCurrentModeInCache = useCallback(() => {
    selectionCacheRef.current[modelMode] = [...selectedModels]
    originalCacheRef.current[modelMode] = [...originalSelectedModels]
  }, [modelMode, selectedModels, originalSelectedModels])

  const clearAllModeCaches = useCallback(() => {
    selectionCacheRef.current = createEmptyPerModeSelectionCache()
    originalCacheRef.current = createEmptyPerModeSelectionCache()
  }, [])

  const getPerModeCacheSnapshot = useCallback((): PerModeSelectionCache => {
    rememberCurrentModeInCache()
    return {
      text: [...selectionCacheRef.current.text],
      image: [...selectionCacheRef.current.image],
    }
  }, [rememberCurrentModeInCache])

  const hydratePerModeCache = useCallback((cache: PerModeSelectionCache, mode: ModelMode) => {
    selectionCacheRef.current = {
      text: [...cache.text],
      image: [...cache.image],
    }
    originalCacheRef.current = createEmptyPerModeSelectionCache()
    prevModeRef.current = mode
  }, [])

  // Keep per-mode caches aligned when the user changes selection (not on mode-only re-renders).
  const modelModeRef = useRef(modelMode)
  modelModeRef.current = modelMode

  useEffect(() => {
    if (isRestoringFromModeSwitchRef.current) return
    selectionCacheRef.current[modelModeRef.current] = [...selectedModels]
  }, [selectedModels])

  useEffect(() => {
    if (isRestoringFromModeSwitchRef.current) return
    originalCacheRef.current[modelModeRef.current] = [...originalSelectedModels]
  }, [originalSelectedModels])

  // Restore the other mode's selection when toggling text ↔ image.
  useLayoutEffect(() => {
    const prevMode = prevModeRef.current
    if (prevMode === modelMode) return
    if (!modelsLoaded) {
      prevModeRef.current = modelMode
      return
    }

    selectionCacheRef.current[prevMode] = [...selectedModels]
    originalCacheRef.current[prevMode] = [...originalSelectedModels]

    const sanitizedCaches = sanitizePerModeCache(
      selectionCacheRef.current,
      modelsByProvider,
      isAuthenticated,
      user,
      maxModelsLimit
    )
    selectionCacheRef.current = sanitizedCaches
    originalCacheRef.current = sanitizePerModeCache(
      originalCacheRef.current,
      modelsByProvider,
      isAuthenticated,
      user,
      maxModelsLimit
    )

    const restored = selectionCacheRef.current[modelMode]
    const restoredOriginal = originalCacheRef.current[modelMode]

    isRestoringFromModeSwitchRef.current = true
    setSelectedModels(restored)
    setOriginalSelectedModels(restoredOriginal)
    prevModeRef.current = modelMode
    queueMicrotask(() => {
      isRestoringFromModeSwitchRef.current = false
    })
  // selectedModels captured when modelMode changes; sync effects update cache between toggles.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run only on mode/catalog changes
  }, [
    modelMode,
    modelsLoaded,
    modelsByProvider,
    isAuthenticated,
    user,
    maxModelsLimit,
    setSelectedModels,
    setOriginalSelectedModels,
  ])

  // When the catalog or user tier changes, prune both mode caches and re-apply current mode.
  useEffect(() => {
    if (isRestoringFromModeSwitchRef.current) return
    if (!modelsLoaded) return

    const sanitizedSelection = sanitizePerModeCache(
      selectionCacheRef.current,
      modelsByProvider,
      isAuthenticated,
      user,
      maxModelsLimit
    )
    const sanitizedOriginal = sanitizePerModeCache(
      originalCacheRef.current,
      modelsByProvider,
      isAuthenticated,
      user,
      maxModelsLimit
    )

    const selectionChanged =
      sanitizedSelection.text.join('\0') !== selectionCacheRef.current.text.join('\0') ||
      sanitizedSelection.image.join('\0') !== selectionCacheRef.current.image.join('\0')
    const originalChanged =
      sanitizedOriginal.text.join('\0') !== originalCacheRef.current.text.join('\0') ||
      sanitizedOriginal.image.join('\0') !== originalCacheRef.current.image.join('\0')

    if (!selectionChanged && !originalChanged) return

    selectionCacheRef.current = sanitizedSelection
    originalCacheRef.current = sanitizedOriginal

    const currentSelection = sanitizedSelection[modelMode]
    const currentOriginal = sanitizedOriginal[modelMode]
    const selectionSame =
      currentSelection.length === selectedModels.length &&
      currentSelection.every((id, i) => id === selectedModels[i])
    const originalSame =
      currentOriginal.length === originalSelectedModels.length &&
      currentOriginal.every((id, i) => id === originalSelectedModels[i])

    if (!selectionSame) {
      setSelectedModels(currentSelection)
    }
    if (!originalSame) {
      setOriginalSelectedModels(currentOriginal)
    }
  }, [
    modelsLoaded,
    modelsByProvider,
    isAuthenticated,
    user,
    maxModelsLimit,
    modelMode,
    selectedModels,
    originalSelectedModels,
    setSelectedModels,
    setOriginalSelectedModels,
  ])

  return {
    clearAllModeCaches,
    getPerModeCacheSnapshot,
    hydratePerModeCache,
    rememberCurrentModeInCache,
  }
}

/** Public helper for tests and session restore. */
export function restoreSelectionForMode(
  cache: PerModeSelectionCache,
  modelMode: ModelMode,
  modelsByProvider: ModelsByProvider,
  isAuthenticated: boolean,
  user: User | null,
  maxModelsLimit: number
): string[] {
  return sanitizeModeSelection({
    modelIds: cache[modelMode],
    modelMode,
    modelsByProvider,
    isAuthenticated,
    user,
    maxModelsLimit,
  })
}
