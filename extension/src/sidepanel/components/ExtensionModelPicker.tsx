import { useMemo, useState } from 'react'

import type { ModelInfo, User } from '@compareintel/core'
import {
  getUserTierInfo,
  isModelRestrictedForUser,
  type ModelsByProvider,
} from '@compareintel/core'

interface ExtensionModelPickerProps {
  modelsByProvider: ModelsByProvider
  selectedModels: string[]
  maxModels: number
  user: User | null
  onToggleModel: (modelId: string) => void
  onOpenAuth: () => void
}

function restrictionHint(model: ModelInfo, userTier: string): string | null {
  if (userTier === 'unregistered' && model.tier_access === 'free') return 'Free account'
  if (model.tier_access === 'paid') return 'Paid plan'
  return 'Unavailable'
}

export function ExtensionModelPicker({
  modelsByProvider,
  selectedModels,
  maxModels,
  user,
  onToggleModel,
  onOpenAuth,
}: ExtensionModelPickerProps) {
  const isAuthenticated = !!user
  const { userTier, isPaidTier } = getUserTierInfo(isAuthenticated, user)
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(() => new Set())

  const providers = useMemo(
    () => Object.entries(modelsByProvider).sort(([a], [b]) => a.localeCompare(b)),
    [modelsByProvider]
  )

  const toggleProvider = (provider: string) => {
    setExpandedProviders((prev) => {
      const next = new Set(prev)
      if (next.has(provider)) next.delete(provider)
      else next.add(provider)
      return next
    })
  }

  const atLimit = selectedModels.length >= maxModels

  return (
    <div className="model-picker" role="list" aria-label="Model providers">
      {providers.map(([provider, models]) => {
        const selectedInProvider = models.filter((m) => selectedModels.includes(m.id)).length
        const isExpanded = expandedProviders.has(provider)

        return (
          <section key={provider} className="provider-group" role="listitem">
            <button
              type="button"
              className="provider-header"
              onClick={() => toggleProvider(provider)}
              aria-expanded={isExpanded}
            >
              <span className="provider-header-inner">
                <span className="provider-chevron" aria-hidden>
                  {isExpanded ? '▾' : '▸'}
                </span>
                <span className="provider-header-name">{provider}</span>
                <span className="provider-header-meta">
                  {selectedInProvider}/{models.length}
                </span>
              </span>
            </button>
            {isExpanded && (
              <ul className="provider-models">
                {models.map((model) => {
                  const isSelected = selectedModels.includes(model.id)
                  const isRestricted =
                    model.available === false ||
                    isModelRestrictedForUser(model, userTier, isPaidTier)
                  const disabled = isRestricted || (!isSelected && atLimit)
                  const hint = isRestricted ? restrictionHint(model, userTier) : null

                  return (
                    <li key={model.id} className="provider-model-row">
                      <button
                        type="button"
                        className={`model-option ${isSelected ? 'selected' : ''} ${isRestricted ? 'restricted' : ''}`}
                        disabled={disabled}
                        title={
                          isRestricted
                            ? userTier === 'unregistered'
                              ? 'Sign in to access this model'
                              : 'Upgrade to access this model'
                            : model.name
                        }
                        onClick={() => {
                          if (isRestricted) {
                            if (userTier === 'unregistered') onOpenAuth()
                            return
                          }
                          onToggleModel(model.id)
                        }}
                      >
                        <span className="model-option-inner">
                          <span className="model-option-name">
                            {isSelected ? '✓ ' : ''}
                            {model.name}
                          </span>
                          {hint && <span className="model-option-hint">{hint}</span>}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
