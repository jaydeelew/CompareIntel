export const CI_BRIDGE_SOURCE = 'compareintel-extension'

export const CI_PAGE_MESSAGE = {
  AUTH: 'CI_AUTH',
  LOGOUT: 'CI_LOGOUT',
  HANDOFF_REQUEST: 'CI_HANDOFF_REQUEST',
  HANDOFF_RESPONSE: 'CI_HANDOFF_RESPONSE',
  EXTENSION_LOGOUT: 'CI_EXTENSION_LOGOUT',
} as const

export interface ExtensionHandoffPayload {
  input: string
  selectedModels: string[]
  results: Array<{
    modelId: string
    modelName: string
    content: string
    isStreaming: boolean
    error: string | null
    isComplete: boolean
  }>
  conversationHistory: Array<{ role: string; content: string; model_id?: string }>
  conversationId: number | null
  browserFingerprint?: string
  accessToken?: string
  refreshToken?: string
}

export interface CiHandoffResponsePageMessage {
  source: typeof CI_BRIDGE_SOURCE
  type: typeof CI_PAGE_MESSAGE.HANDOFF_RESPONSE
  payload: ExtensionHandoffPayload | null
}

export type CiPageMessage =
  | {
      source: typeof CI_BRIDGE_SOURCE
      type: typeof CI_PAGE_MESSAGE.HANDOFF_RESPONSE
      payload: ExtensionHandoffPayload | null
    }
  | {
      source: typeof CI_BRIDGE_SOURCE
      type: typeof CI_PAGE_MESSAGE.HANDOFF_REQUEST
    }
  | {
      source: typeof CI_BRIDGE_SOURCE
      type: typeof CI_PAGE_MESSAGE.EXTENSION_LOGOUT
    }

export function isCiPageMessage(data: unknown): data is CiPageMessage {
  if (!data || typeof data !== 'object') return false
  const message = data as { source?: unknown; type?: unknown }
  return message.source === CI_BRIDGE_SOURCE && typeof message.type === 'string'
}
