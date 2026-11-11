import { useCallback, useLayoutEffect, useState, type RefObject } from 'react'

import {
  computeIconTrackFit,
  getDefaultTrackMetrics,
  type IconTrackFitParams,
} from './fitSelectedModelIconTrack'

const IDLE_FIT: IconTrackFitParams = {
  fitted: false,
  overlapPx: 0,
  slotPx: 44,
  discScale: 1,
}

export function useSelectedModelIconTrackFit(
  iconCount: number,
  containerRef: RefObject<HTMLElement | null>
): IconTrackFitParams {
  const [fit, setFit] = useState<IconTrackFitParams>(IDLE_FIT)

  const remeasure = useCallback(() => {
    const container = containerRef.current
    if (!container || iconCount === 0) {
      setFit(IDLE_FIT)
      return
    }

    const rootFontSizePx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    const metrics = getDefaultTrackMetrics(window.innerWidth, rootFontSizePx)
    const availableWidthPx = container.clientWidth

    const next = computeIconTrackFit({
      ...metrics,
      availableWidthPx,
      iconCount,
    })
    setFit(prev =>
      prev.fitted === next.fitted &&
      Math.abs(prev.overlapPx - next.overlapPx) < 0.25 &&
      Math.abs(prev.slotPx - next.slotPx) < 0.25 &&
      Math.abs(prev.discScale - next.discScale) < 0.001
        ? prev
        : next
    )
  }, [containerRef, iconCount])

  useLayoutEffect(() => {
    remeasure()
  }, [remeasure])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => {
      remeasure()
    })
    observer.observe(container)

    const onWindowResize = () => remeasure()
    window.addEventListener('resize', onWindowResize)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', onWindowResize)
    }
  }, [containerRef, remeasure])

  return fit
}
