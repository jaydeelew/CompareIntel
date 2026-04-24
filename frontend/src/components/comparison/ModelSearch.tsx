/**
 * ModelSearch - Typeahead to find models by name, id, or provider and add them to the comparison.
 */

import Search from 'lucide-react/dist/esm/icons/search'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'

import type { Model, ModelsByProvider, User } from '../../types'
import { getUserTierInfo, isModelRestrictedForUser } from '../../utils/modelTierAccess'

const MAX_SUGGESTIONS = 40

function flattenModels(modelsByProvider: ModelsByProvider): Model[] {
  const out: Model[] = []
  for (const list of Object.values(modelsByProvider)) {
    for (const m of list) {
      out.push(m)
    }
  }
  return out
}

function normalize(s: string): string {
  return s.trim().toLowerCase()
}

function scoreMatch(model: Model, q: string): number {
  const name = normalize(model.name)
  const id = normalize(String(model.id))
  const prov = normalize(model.provider)
  if (name === q || id === q) return 0
  if (name.startsWith(q) || id.startsWith(q)) return 1
  if (prov.startsWith(q)) return 2
  if (name.includes(q) || id.includes(q) || prov.includes(q)) return 3
  return 4
}

export interface ModelSearchProps {
  modelsByProvider: ModelsByProvider
  selectedModels: string[]
  onToggleModel: (modelId: string) => void
  disabled?: boolean
  isFollowUpMode?: boolean
  originalSelectedModels?: string[]
  isAuthenticated: boolean
  user: User | null
  maxModelsLimit: number
  imageModelsDisabledForUnregistered?: boolean
  onShowDisabledModelModal?: (info: {
    userTier: 'unregistered' | 'free'
    modelTierAccess: 'free' | 'paid'
    modelName?: string
    imageMode?: boolean
  }) => void
}

export function ModelSearch({
  modelsByProvider,
  selectedModels,
  onToggleModel,
  disabled = false,
  isFollowUpMode = false,
  originalSelectedModels = [],
  isAuthenticated,
  user,
  maxModelsLimit,
  imageModelsDisabledForUnregistered = false,
  onShowDisabledModelModal,
}: ModelSearchProps) {
  const uid = useId()
  const listboxId = `${uid}-listbox`
  const rootRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const { userTier, isPaidTier } = useMemo(
    () => getUserTierInfo(isAuthenticated, user),
    [isAuthenticated, user]
  )

  const allFlat = useMemo(() => flattenModels(modelsByProvider), [modelsByProvider])

  const qNorm = normalize(query)
  const suggestions = useMemo(() => {
    if (!qNorm) return []
    const scored = allFlat
      .map(m => ({ m, s: scoreMatch(m, qNorm) }))
      .filter(x => x.s < 4)
      .sort((a, b) => {
        if (a.s !== b.s) return a.s - b.s
        return a.m.name.localeCompare(b.m.name)
      })
      .slice(0, MAX_SUGGESTIONS)
      .map(x => x.m)
    return scored
  }, [allFlat, qNorm])

  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      const el = rootRef.current
      if (!el || !(e.target instanceof Node) || el.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [])

  const trySelectModel = useCallback(
    (model: Model) => {
      if (disabled) return

      if (selectedModels.some(id => String(id) === String(model.id))) {
        setQuery('')
        setOpen(false)
        return
      }

      if (model.available === false) return

      if (imageModelsDisabledForUnregistered) {
        if (onShowDisabledModelModal) {
          onShowDisabledModelModal({
            userTier: 'unregistered',
            modelTierAccess: model.tier_access === 'paid' ? 'paid' : 'free',
            modelName: model.name,
            imageMode: true,
          })
        }
        return
      }

      const restricted = isModelRestrictedForUser(model, userTier, isPaidTier)
      const requiresUpgrade = restricted && (userTier === 'unregistered' || userTier === 'free')
      if (requiresUpgrade) {
        if (onShowDisabledModelModal) {
          onShowDisabledModelModal({
            userTier: userTier as 'unregistered' | 'free',
            modelTierAccess: model.tier_access === 'paid' ? 'paid' : 'free',
            modelName: model.name,
            imageMode: false,
          })
        }
        return
      }

      if (isFollowUpMode && !originalSelectedModels.includes(model.id)) {
        return
      }

      if (selectedModels.length >= maxModelsLimit) {
        return
      }

      onToggleModel(model.id)
      setQuery('')
      setOpen(false)
      setActiveIndex(0)
    },
    [
      disabled,
      selectedModels,
      imageModelsDisabledForUnregistered,
      onShowDisabledModelModal,
      userTier,
      isPaidTier,
      isFollowUpMode,
      originalSelectedModels,
      maxModelsLimit,
      onToggleModel,
    ]
  )

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && suggestions.length > 0) {
      setActiveIndex(0)
      setOpen(true)
      e.preventDefault()
      return
    }
    if (!open) return

    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, Math.max(0, suggestions.length - 1)))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(0, i - 1))
      return
    }
    if (e.key === 'Enter' && suggestions.length > 0) {
      const m = suggestions[activeIndex]
      if (m) {
        e.preventDefault()
        trySelectModel(m)
      }
    }
  }

  const showList = open && qNorm.length > 0 && suggestions.length > 0
  const showEmpty = open && qNorm.length > 0 && suggestions.length === 0

  return (
    <div ref={rootRef} className="model-search">
      <div className="model-search-combo">
        <div
          className={`model-search-input-shell${showList || showEmpty ? ' model-search-input-shell--open' : ''}`}
        >
          <Search className="model-search-input-icon" size={17} strokeWidth={2} aria-hidden />
          <input
            id={`${uid}-input`}
            type="text"
            inputMode="search"
            enterKeyHint="search"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listboxId}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search by name or provider…"
            aria-label="Search models by name or provider"
            className="model-search-input"
            disabled={disabled}
            value={query}
            onChange={e => {
              const next = e.target.value
              setActiveIndex(0)
              setQuery(next)
              setOpen(true)
            }}
            onFocus={() => {
              if (normalize(query)) setOpen(true)
            }}
            onKeyDown={onKeyDown}
          />
        </div>

        {showList && (
          <ul
            id={listboxId}
            role="listbox"
            className="model-search-suggestions"
            aria-label="Model suggestions"
          >
            {suggestions.map((model, idx) => {
              const selected = selectedModels.some(id => String(id) === String(model.id))
              const unavailable = model.available === false
              const restricted = isModelRestrictedForUser(model, userTier, isPaidTier)
              const followUpBlocked =
                isFollowUpMode &&
                !originalSelectedModels.includes(model.id) &&
                !selectedModels.includes(model.id)
              const atLimitBlocked =
                selectedModels.length >= maxModelsLimit && !selectedModels.includes(model.id)
              const noOpRow =
                unavailable ||
                followUpBlocked ||
                (atLimitBlocked && !restricted && !imageModelsDisabledForUnregistered)
              const isActive = idx === activeIndex
              return (
                <li key={model.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    className={`model-search-suggestion${isActive ? ' model-search-suggestion--active' : ''}${noOpRow ? ' model-search-suggestion--disabled' : ''}${selected ? ' model-search-suggestion--picked' : ''}${restricted && !selected ? ' model-search-suggestion--locked' : ''}`}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => trySelectModel(model)}
                  >
                    <span className="model-search-suggestion-main">
                      <span className="model-search-suggestion-name">{model.name}</span>
                      <span className="model-search-suggestion-meta">{model.provider}</span>
                    </span>
                    {selected && <span className="model-search-suggestion-badge">Selected</span>}
                    {restricted && !selected && (
                      <span className="model-search-suggestion-badge model-search-suggestion-badge--muted">
                        Upgrade
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {showEmpty && (
          <div className="model-search-empty" role="status">
            No models match that search. Try another spelling or check the provider list below.
          </div>
        )}
      </div>
    </div>
  )
}
