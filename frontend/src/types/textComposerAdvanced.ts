/**
 * Text-model Advanced settings (temperature, top-p, max output tokens).
 * Persisted with conversation history (API + localStorage) and saved model selections.
 */
export interface TextComposerAdvancedSettings {
  temperature: number
  topP: number
  maxTokens: number | null
}

/** Image-model Advanced (aspect ratio, output size); persisted with history and saved selections. */
export interface ImageComposerAdvancedSettings {
  aspectRatio: string
  imageSize: string
}
