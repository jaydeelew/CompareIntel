import { useEffect, useRef, useState } from 'react'

import {
  getUserPreferences,
  updateUserPreferences,
  USER_PREFERENCES_UPDATED_EVENT,
  REQUEST_PERSIST_IMAGE_COMPOSER_ADVANCED_EVENT,
  REQUEST_PERSIST_TEXT_COMPOSER_ADVANCED_EVENT,
  type UserPreferences,
} from '../services/userSettingsService'

const DEBOUNCE_MS = 600

export function usePersistedComposerAdvancedSettings(options: {
  isAuthenticated: boolean
  userId: number | undefined
  temperature: number
  topP: number
  maxTokens: number | null
  aspectRatio: string
  imageSize: string
  setTemperature: (v: number) => void
  setTopP: (v: number) => void
  setMaxTokens: (v: number | null) => void
  setAspectRatio: (v: string) => void
  setImageSize: (v: string) => void
}): void {
  const {
    isAuthenticated,
    userId,
    temperature,
    topP,
    maxTokens,
    aspectRatio,
    imageSize,
    setTemperature,
    setTopP,
    setMaxTokens,
    setAspectRatio,
    setImageSize,
  } = options

  const [rememberText, setRememberText] = useState(false)
  const [rememberImage, setRememberImage] = useState(false)

  const latestTextRef = useRef({ temperature, topP, maxTokens })
  const latestImageRef = useRef({ aspectRatio, imageSize })
  latestTextRef.current = { temperature, topP, maxTokens }
  latestImageRef.current = { aspectRatio, imageSize }

  const textDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const imageDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isAuthenticated || userId == null) {
      setRememberText(false)
      setRememberImage(false)
      return
    }

    let cancelled = false
    getUserPreferences()
      .then(prefs => {
        if (cancelled) return
        setRememberText(prefs.remember_text_advanced_settings)
        setRememberImage(prefs.remember_image_advanced_settings)
        if (prefs.remember_text_advanced_settings && prefs.text_composer_advanced) {
          const t = prefs.text_composer_advanced
          if (typeof t.temperature === 'number') {
            setTemperature(Math.max(0, Math.min(2, t.temperature)))
          }
          if (typeof t.top_p === 'number') {
            setTopP(Math.max(0, Math.min(1, t.top_p)))
          }
          if ('max_tokens' in t) {
            setMaxTokens(t.max_tokens ?? null)
          }
        }
        if (prefs.remember_image_advanced_settings && prefs.image_composer_advanced) {
          const img = prefs.image_composer_advanced
          if (typeof img.aspect_ratio === 'string') {
            setAspectRatio(img.aspect_ratio)
          }
          if (typeof img.image_size === 'string') {
            setImageSize(img.image_size)
          }
        }
      })
      .catch(() => {
        /* preferences optional for composer */
      })

    const onPrefsUpdated = (e: Event) => {
      const detail = (e as CustomEvent<UserPreferences>).detail
      if (!detail) return
      if (detail.remember_text_advanced_settings !== undefined) {
        setRememberText(detail.remember_text_advanced_settings)
      }
      if (detail.remember_image_advanced_settings !== undefined) {
        setRememberImage(detail.remember_image_advanced_settings)
      }
    }
    window.addEventListener(USER_PREFERENCES_UPDATED_EVENT, onPrefsUpdated)

    return () => {
      cancelled = true
      window.removeEventListener(USER_PREFERENCES_UPDATED_EVENT, onPrefsUpdated)
    }
  }, [isAuthenticated, userId, setTemperature, setTopP, setMaxTokens, setAspectRatio, setImageSize])

  useEffect(() => {
    if (!isAuthenticated || userId == null) return

    const persistTextNow = () => {
      const t = latestTextRef.current
      void updateUserPreferences({
        text_composer_advanced: {
          temperature: t.temperature,
          top_p: t.topP,
          max_tokens: t.maxTokens,
        },
      })
        .then(updated => {
          window.dispatchEvent(new CustomEvent(USER_PREFERENCES_UPDATED_EVENT, { detail: updated }))
        })
        .catch(() => {
          /* non-fatal */
        })
    }

    const persistImageNow = () => {
      const img = latestImageRef.current
      void updateUserPreferences({
        image_composer_advanced: {
          aspect_ratio: img.aspectRatio,
          image_size: img.imageSize,
        },
      })
        .then(updated => {
          window.dispatchEvent(new CustomEvent(USER_PREFERENCES_UPDATED_EVENT, { detail: updated }))
        })
        .catch(() => {
          /* non-fatal */
        })
    }

    window.addEventListener(REQUEST_PERSIST_TEXT_COMPOSER_ADVANCED_EVENT, persistTextNow)
    window.addEventListener(REQUEST_PERSIST_IMAGE_COMPOSER_ADVANCED_EVENT, persistImageNow)
    return () => {
      window.removeEventListener(REQUEST_PERSIST_TEXT_COMPOSER_ADVANCED_EVENT, persistTextNow)
      window.removeEventListener(REQUEST_PERSIST_IMAGE_COMPOSER_ADVANCED_EVENT, persistImageNow)
    }
  }, [isAuthenticated, userId])

  useEffect(() => {
    if (!isAuthenticated || !rememberText) return
    if (textDebounceRef.current) {
      clearTimeout(textDebounceRef.current)
    }
    textDebounceRef.current = setTimeout(() => {
      textDebounceRef.current = null
      const t = latestTextRef.current
      void updateUserPreferences({
        text_composer_advanced: {
          temperature: t.temperature,
          top_p: t.topP,
          max_tokens: t.maxTokens,
        },
      })
        .then(updated => {
          window.dispatchEvent(new CustomEvent(USER_PREFERENCES_UPDATED_EVENT, { detail: updated }))
        })
        .catch(() => {
          /* non-fatal */
        })
    }, DEBOUNCE_MS)
    return () => {
      if (textDebounceRef.current) {
        clearTimeout(textDebounceRef.current)
        textDebounceRef.current = null
      }
    }
  }, [isAuthenticated, rememberText, temperature, topP, maxTokens])

  useEffect(() => {
    if (!isAuthenticated || !rememberImage) return
    if (imageDebounceRef.current) {
      clearTimeout(imageDebounceRef.current)
    }
    imageDebounceRef.current = setTimeout(() => {
      imageDebounceRef.current = null
      const img = latestImageRef.current
      void updateUserPreferences({
        image_composer_advanced: {
          aspect_ratio: img.aspectRatio,
          image_size: img.imageSize,
        },
      })
        .then(updated => {
          window.dispatchEvent(new CustomEvent(USER_PREFERENCES_UPDATED_EVENT, { detail: updated }))
        })
        .catch(() => {
          /* non-fatal */
        })
    }, DEBOUNCE_MS)
    return () => {
      if (imageDebounceRef.current) {
        clearTimeout(imageDebounceRef.current)
        imageDebounceRef.current = null
      }
    }
  }, [isAuthenticated, rememberImage, aspectRatio, imageSize])
}
