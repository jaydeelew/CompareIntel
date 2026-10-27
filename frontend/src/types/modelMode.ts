export const MODEL_MODE = {
  TEXT: 'text',
  IMAGE: 'image',
  VOICE: 'voice',
} as const

export type ModelMode = (typeof MODEL_MODE)[keyof typeof MODEL_MODE]
