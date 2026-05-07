/**
 * Demo presets for mobile capability-card "Try it" buttons.
 *
 * Each tile id maps to a curated prompt and optional preferred model ids
 * (hints — not hard requirements). `pickTwoDemoModels` resolves the best
 * pair the current user is allowed to select.
 */

import type { ModelsByProvider, User } from '../types'
import { getUserTierInfo, isModelRestrictedForUser } from '../utils/modelTierAccess'

/** Delay before auto-submit on mobile so the user can read the prefilled prompt. */
export const CAPABILITY_DEMO_SUBMIT_DELAY_MS = 6000

export interface CapabilityDemoPreset {
  prompt: string
  /** Preferred model ids — used as hints; may not be available for the user's tier. */
  preferredModelIds: string[]
  buttonLabel: string
  /** 'text' (default) or 'image' — controls model mode and which models are eligible. */
  mode?: 'text' | 'image'
}

export const CAPABILITY_DEMO_PRESETS: Record<string, CapabilityDemoPreset> = {
  'natural-language': {
    prompt:
      'What are three practical pros and three practical cons of working remotely full-time versus working in an office? Be concise and give real-world examples.',
    preferredModelIds: ['google/gemini-2.5-flash', 'deepseek/deepseek-chat-v3.1'],
    buttonLabel: 'Try a comparison',
  },
  'code-generation': {
    prompt:
      'Write a JavaScript function called `deepEqual(a, b)` that returns true if two values are deeply equal (handles objects, arrays, null, and primitives). Include brief inline comments and two example test cases.',
    preferredModelIds: ['x-ai/grok-4-fast', 'google/gemini-2.5-flash'],
    buttonLabel: 'Try a comparison',
  },
  'formatted-math': {
    prompt:
      'Prove the identity: the sum from k=1 to n of k² equals n(n+1)(2n+1)/6. Show each step clearly using formatted mathematical notation (LaTeX).',
    preferredModelIds: ['deepseek/deepseek-chat-v3.1', 'google/gemini-2.5-flash'],
    buttonLabel: 'Try a comparison',
  },
  'image-creation': {
    prompt:
      'Two humanoid robots arm-wrestling at an official arm-wrestling table, competing to prove which is the more advanced AI. Include a referee robot, a large promotion banner reading "AI SUPREMACY", dramatic arena lighting, and a roaring crowd of robot spectators.',
    preferredModelIds: ['google/gemini-2.5-flash-image', 'openai/gpt-5-image-mini'],
    buttonLabel: 'Try a comparison',
    mode: 'image',
  },
}

/**
 * Pick two selectable models for a demo comparison.
 *
 * Strategy:
 *  1. Collect all models the user can select (available + tier-allowed).
 *  2. Try preferred ids first; fill remaining slots from other selectable models,
 *     preferring distinct providers for a more interesting comparison.
 *  3. Returns null if fewer than 2 selectable models exist.
 */
export function pickTwoDemoModels(
  tileId: string,
  modelsByProvider: ModelsByProvider,
  isAuthenticated: boolean,
  user: User | null,
  modeOverride?: 'text' | 'image'
): [string, string] | null {
  const preset = CAPABILITY_DEMO_PRESETS[tileId]
  if (!preset) return null

  const { userTier, isPaidTier } = getUserTierInfo(isAuthenticated, user)
  const wantsImage = (modeOverride ?? preset.mode ?? 'text') === 'image'

  // Flatten all selectable models with their provider name attached.
  const selectable: { id: string; provider: string }[] = []
  for (const [provider, models] of Object.entries(modelsByProvider)) {
    for (const m of models) {
      if (m.available === false) continue
      if (isModelRestrictedForUser(m, userTier, isPaidTier)) continue
      if (wantsImage) {
        if (!m.supports_image_generation) continue
      } else {
        if (m.supports_image_generation) continue
      }
      if (m.is_thinking_model) continue
      selectable.push({ id: String(m.id), provider })
    }
  }

  if (selectable.length < 2) return null

  const selectableIds = new Set(selectable.map(s => s.id))
  const picked: string[] = []
  const pickedProviders = new Set<string>()

  const providerOf = (id: string) => selectable.find(s => s.id === id)?.provider ?? ''

  // Phase 1: preferred ids that are selectable.
  for (const id of preset.preferredModelIds) {
    if (picked.length >= 2) break
    if (!selectableIds.has(id)) continue
    if (picked.length === 1 && providerOf(id) === pickedProviders.values().next().value) continue
    picked.push(id)
    pickedProviders.add(providerOf(id))
  }

  // Phase 2: fill from remaining, distinct provider first.
  if (picked.length < 2) {
    for (const s of selectable) {
      if (picked.length >= 2) break
      if (picked.includes(s.id)) continue
      if (picked.length === 1 && pickedProviders.has(s.provider)) continue
      picked.push(s.id)
      pickedProviders.add(s.provider)
    }
  }

  // Phase 3: relax distinct-provider constraint if still short.
  if (picked.length < 2) {
    for (const s of selectable) {
      if (picked.length >= 2) break
      if (picked.includes(s.id)) continue
      picked.push(s.id)
    }
  }

  if (picked.length < 2) return null
  return [picked[0], picked[1]]
}
