import { MODEL_LIMITS } from '../../config/constants'

export const TIER_LABELS: Record<keyof typeof MODEL_LIMITS, string> = {
  unregistered: 'Unregistered',
  free: 'Free',
  starter: 'Starter',
  starter_plus: 'Starter+',
  pro: 'Pro',
  pro_plus: 'Pro+',
}

export function getTierListContent(): string {
  return Object.entries(MODEL_LIMITS)
    .map(([tier, limit]) => `${TIER_LABELS[tier as keyof typeof TIER_LABELS]}: ${limit} models`)
    .join('\n')
}
