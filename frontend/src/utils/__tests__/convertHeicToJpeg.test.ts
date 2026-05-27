import { describe, expect, it, vi, beforeEach } from 'vitest'

import { convertHeicToJpeg, heicOutputFileName, isHeicFile } from '../convertHeicToJpeg'

const mockHeic2Any = vi.fn()

vi.mock('heic2any', () => ({
  default: (...args: unknown[]) => mockHeic2Any(...args),
}))

describe('convertHeicToJpeg', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('isHeicFile', () => {
    it('detects HEIC by extension', () => {
      expect(isHeicFile(new File(['x'], 'photo.heic', { type: '' }))).toBe(true)
      expect(isHeicFile(new File(['x'], 'photo.heif', { type: '' }))).toBe(true)
    })

    it('detects HEIC by mime type', () => {
      expect(isHeicFile(new File(['x'], 'photo', { type: 'image/heic' }))).toBe(true)
      expect(isHeicFile(new File(['x'], 'photo', { type: 'image/heif' }))).toBe(true)
    })

    it('returns false for JPEG', () => {
      expect(isHeicFile(new File(['x'], 'photo.jpg', { type: 'image/jpeg' }))).toBe(false)
    })
  })

  describe('heicOutputFileName', () => {
    it('replaces .heic with .jpg', () => {
      expect(heicOutputFileName('IMG_1234.HEIC')).toBe('IMG_1234.jpg')
    })

    it('uses photo.jpg for empty names', () => {
      expect(heicOutputFileName('')).toBe('photo.jpg')
    })
  })

  describe('convertHeicToJpeg', () => {
    it('returns a JPEG File from heic2any output', async () => {
      const jpegBlob = new Blob(['jpeg-bytes'], { type: 'image/jpeg' })
      mockHeic2Any.mockResolvedValue(jpegBlob)

      const heicFile = new File(['heic-bytes'], 'camera.heic', { type: 'image/heic' })
      const converted = await convertHeicToJpeg(heicFile)

      expect(mockHeic2Any).toHaveBeenCalledWith({
        blob: heicFile,
        toType: 'image/jpeg',
        quality: 0.92,
      })
      expect(converted.name).toBe('camera.jpg')
      expect(converted.type).toBe('image/jpeg')
    })

    it('uses first blob when heic2any returns an array', async () => {
      const jpegBlob = new Blob(['jpeg-bytes'], { type: 'image/jpeg' })
      mockHeic2Any.mockResolvedValue([jpegBlob, new Blob(['extra'])])

      const converted = await convertHeicToJpeg(
        new File(['heic'], 'burst.heic', { type: 'image/heic' })
      )

      expect(converted.name).toBe('burst.jpg')
    })

    it('throws when conversion produces no data', async () => {
      mockHeic2Any.mockResolvedValue([])

      await expect(
        convertHeicToJpeg(new File(['heic'], 'empty.heic', { type: 'image/heic' }))
      ).rejects.toThrow('HEIC conversion produced no image data')
    })
  })
})
