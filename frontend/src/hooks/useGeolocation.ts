import { useState, useEffect, useRef } from 'react'

import { getUserPreferences } from '../services/userSettingsService'
import type { User } from '../types'
import logger from '../utils/logger'

function isValidLatLon(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  )
}

function stripCountrySuffix(country: string): string {
  return country.replace(/\s*\(the\)\s*$/i, '').trim()
}

/** Photon (Komoot) reverse geocode — primary provider. */
function formatLocationFromPhotonProperties(props: Record<string, unknown>): string | null {
  const city = typeof props.city === 'string' ? props.city : ''
  const region =
    typeof props.state === 'string'
      ? props.state
      : typeof props.county === 'string'
        ? props.county
        : ''
  const country = stripCountrySuffix(typeof props.country === 'string' ? props.country : '')
  const parts = [city, region, country].filter(Boolean)
  if (parts.length === 0) return null
  return parts.join(', ')
}

function photonReverseUrl(lat: number, lon: number): string {
  const q = `lat=${lat}&lon=${lon}&lang=en`
  // Same-origin API proxy (FastAPI) — avoids CORS and nginx outbound HTTPS to Komoot (often 503 in Docker).
  // Vite dev proxies /api to the backend (vite.config.ts). Vitest uses direct URL for stable mocks.
  if (import.meta.env.MODE === 'test') {
    return `https://photon.komoot.io/reverse?${q}`
  }
  return `/api/v1/geo/photon/reverse?${q}`
}

function locationFromPhotonJson(data: {
  features?: Array<{ properties?: Record<string, unknown> }>
}): string | null {
  const props = data.features?.[0]?.properties
  if (!props) return null
  return formatLocationFromPhotonProperties(props)
}

async function reverseGeocodePhoton(lat: number, lon: number): Promise<string | null> {
  try {
    const url = photonReverseUrl(lat, lon)
    const response = await fetch(url)
    if (!response.ok) return null
    const data = (await response.json()) as {
      features?: Array<{ properties?: Record<string, unknown> }>
    }
    return locationFromPhotonJson(data)
  } catch (error) {
    logger.debug('[Geolocation] Photon request failed:', error)
    return null
  }
}

/**
 * BigDataCloud reverse geocode — CORS-friendly fallback when Photon is unavailable.
 * The client-side endpoint requires no API key and sends `Access-Control-Allow-Origin: *`,
 * so it avoids the CORS failures we see when Photon's error pages lack CORS headers.
 */
async function reverseGeocodeBigDataCloud(lat: number, lon: number): Promise<string | null> {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`
    const response = await fetch(url)
    if (!response.ok) return null
    const data = (await response.json()) as {
      city?: string
      locality?: string
      principalSubdivision?: string
      countryName?: string
    }
    const city = data.city || data.locality || ''
    const region = data.principalSubdivision || ''
    const country = stripCountrySuffix(data.countryName || '')
    const parts = [city, region, country].filter(Boolean)
    return parts.length > 0 ? parts.join(', ') : null
  } catch (error) {
    logger.debug('[Geolocation] BigDataCloud request failed:', error)
    return null
  }
}

async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  const primary = await reverseGeocodePhoton(lat, lon)
  if (primary) return primary
  return reverseGeocodeBigDataCloud(lat, lon)
}

interface UseGeolocationProps {
  isAuthenticated: boolean
  user: User | null
}

export function useGeolocation({ isAuthenticated, user }: UseGeolocationProps) {
  const [userLocation, setUserLocation] = useState<string | null>(null)
  const geolocationDetectedRef = useRef(false)
  const savedLocationLoadedRef = useRef(false)

  useEffect(() => {
    if (!isAuthenticated || user?.id == null) return
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
              logger.debug(
                '[Settings] Using saved zipcode location:',
                location,
                preferences.zipcode
              )
              setUserLocation(location)
              savedLocationLoadedRef.current = true
            }
          } else {
            logger.debug('[Settings] Could not lookup zipcode:', preferences.zipcode)
          }
        }
      } catch (error) {
        logger.debug('[Settings] Failed to load saved location preference:', error)
      }
    }

    loadSavedLocation()
  }, [isAuthenticated, user?.id])

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
                  logger.debug('[Geolocation] Skipping - user has saved location in settings')
                  return
                }
                try {
                  // Round to 6 decimal places (~0.1m) to avoid floating-point string issues
                  const lat = Number(position.coords.latitude.toFixed(6))
                  const lon = Number(position.coords.longitude.toFixed(6))
                  if (!isValidLatLon(lat, lon)) {
                    logger.debug('[Geolocation] Ignoring invalid coordinates:', lat, lon)
                    return
                  }
                  const location = await reverseGeocode(lat, lon)
                  if (location) {
                    logger.debug('[Geolocation] Successfully detected location:', location)
                    setUserLocation(location)
                  }
                } catch (error) {
                  logger.debug('Failed to get location from coordinates:', error)
                }
              },
              error => {
                logger.debug('Geolocation not available:', error.message)
              },
              { timeout: 5000, enableHighAccuracy: false }
            )
          } catch (error) {
            logger.debug('Geolocation access blocked:', error)
          }
        } else {
          logger.debug('[Geolocation] Access denied by permissions policy')
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
