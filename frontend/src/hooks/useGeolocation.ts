import { useState, useEffect, useRef } from 'react'

import { getUserPreferences } from '../services/userSettingsService'
import type { User } from '../types'

interface UseGeolocationProps {
  isAuthenticated: boolean
  user: User | null
}

export function useGeolocation({ isAuthenticated, user }: UseGeolocationProps) {
  const [userLocation, setUserLocation] = useState<string | null>(null)
  const geolocationDetectedRef = useRef(false)
  const savedLocationLoadedRef = useRef(false)

  useEffect(() => {
    if (!isAuthenticated || !user) return
    if (savedLocationLoadedRef.current) return

    const loadSavedLocation = async () => {
      try {
        const preferences = await getUserPreferences()
        if (preferences.zipcode) {
          const response = await fetch(
            `https://api.zippopotam.us/us/${preferences.zipcode.substring(0, 5)}`
          )
          if (response.ok) {
            const data = await response.json()
            if (data.places && data.places.length > 0) {
              const place = data.places[0]
              const city = place['place name'] || ''
              const state = place['state'] || ''
              const location = [city, state, 'United States'].filter(Boolean).join(', ')
              if (import.meta.env.DEV) {
                console.log(
                  '[Settings] Using saved zipcode location:',
                  location,
                  `(zipcode: ${preferences.zipcode})`
                )
              }
              setUserLocation(location)
              savedLocationLoadedRef.current = true
            }
          } else if (import.meta.env.DEV) {
            console.debug('[Settings] Could not lookup zipcode:', preferences.zipcode)
          }
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.debug('[Settings] Failed to load saved location preference:', error)
        }
      }
    }

    loadSavedLocation()
  }, [isAuthenticated, user])

  useEffect(() => {
    if (geolocationDetectedRef.current) return
    if (savedLocationLoadedRef.current) return

    const handleUserInteraction = async () => {
      if (geolocationDetectedRef.current) return
      if (savedLocationLoadedRef.current) return
      geolocationDetectedRef.current = true

      if (navigator.geolocation) {
        let geolocationAllowed = true
        if (navigator.permissions && navigator.permissions.query) {
          try {
            const permissionStatus = await navigator.permissions.query({ name: 'geolocation' })
            geolocationAllowed = permissionStatus.state !== 'denied'
          } catch {
            // Permissions API not supported or geolocation not in queryable permissions
          }
        }

        if (geolocationAllowed) {
          try {
            navigator.geolocation.getCurrentPosition(
              async position => {
                if (savedLocationLoadedRef.current) {
                  if (import.meta.env.DEV) {
                    console.log('[Geolocation] Skipping - user has saved location in settings')
                  }
                  return
                }
                try {
                  const response = await fetch(
                    `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${position.coords.latitude}&longitude=${position.coords.longitude}&localityLanguage=en`
                  )
                  if (response.ok) {
                    const data = await response.json()
                    const city = data.city || ''
                    const region = data.principalSubdivision || ''
                    let country = data.countryName || ''
                    country = country.replace(/\s*\(the\)\s*$/i, '').trim()
                    const parts = [city, region, country].filter(Boolean)
                    if (parts.length > 0) {
                      const location = parts.join(', ')
                      if (import.meta.env.DEV) {
                        console.log('[Geolocation] Successfully detected location:', location)
                      }
                      setUserLocation(location)
                    }
                  }
                } catch (error) {
                  if (import.meta.env.DEV) {
                    console.debug('Failed to get location from coordinates:', error)
                  }
                }
              },
              error => {
                if (import.meta.env.DEV) {
                  console.debug('Geolocation not available:', error.message)
                }
              },
              { timeout: 5000, enableHighAccuracy: false }
            )
          } catch (error) {
            if (import.meta.env.DEV) {
              console.debug('Geolocation access blocked:', error)
            }
          }
        } else if (import.meta.env.DEV) {
          console.debug('[Geolocation] Access denied by permissions policy')
        }
      }

      window.removeEventListener('click', handleUserInteraction)
      window.removeEventListener('touchstart', handleUserInteraction)
      window.removeEventListener('scroll', handleUserInteraction)
    }

    window.addEventListener('click', handleUserInteraction, { once: true })
    window.addEventListener('touchstart', handleUserInteraction, { once: true })
    window.addEventListener('scroll', handleUserInteraction, { once: true, passive: true })

    const timeoutId = setTimeout(() => {
      if (!geolocationDetectedRef.current && !savedLocationLoadedRef.current) {
        handleUserInteraction()
      }
    }, 5000)

    return () => {
      window.removeEventListener('click', handleUserInteraction)
      window.removeEventListener('touchstart', handleUserInteraction)
      window.removeEventListener('scroll', handleUserInteraction)
      clearTimeout(timeoutId)
    }
  }, [])

  return { userLocation }
}
