/**
 * Tests for configService
 *
 * Tests configuration sync endpoints (currently placeholders).
 */

import { describe, it, expect } from 'vitest'

import * as configService from '../../services/configService'

describe('configService', () => {
  describe('syncConfig', () => {
    it('should return empty config object (placeholder)', async () => {
      const result = await configService.syncConfig()

      expect(result).toEqual({})
    })

    it('should return consistent empty object', async () => {
      const result1 = await configService.syncConfig()
      const result2 = await configService.syncConfig()

      expect(result1).toEqual(result2)
      expect(result1).toEqual({})
    })
  })

  describe('getFeatureFlags', () => {
    it('should return empty feature flags object (placeholder)', async () => {
      const result = await configService.getFeatureFlags()

      expect(result).toEqual({})
    })

    it('should return consistent empty object', async () => {
      const result1 = await configService.getFeatureFlags()
      const result2 = await configService.getFeatureFlags()

      expect(result1).toEqual(result2)
      expect(result1).toEqual({})
    })
  })
})
