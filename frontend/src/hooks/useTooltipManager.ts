import { useState, useEffect, useCallback, useRef } from 'react'

interface UseTooltipManagerProps {
  isMobileLayout: boolean
}

export function useTooltipManager({ isMobileLayout }: UseTooltipManagerProps) {
  const [visibleTooltip, setVisibleTooltip] = useState<string | null>(null)
  const tooltipHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (tooltipHideTimeoutRef.current) {
        clearTimeout(tooltipHideTimeoutRef.current)
      }
    }
  }, [])

  const handleCapabilityTileTap = useCallback(
    (tileId: string) => {
      if (isMobileLayout) {
        if (tooltipHideTimeoutRef.current) {
          clearTimeout(tooltipHideTimeoutRef.current)
          tooltipHideTimeoutRef.current = null
        }
        setVisibleTooltip(tileId)
        tooltipHideTimeoutRef.current = setTimeout(() => {
          setVisibleTooltip(null)
          tooltipHideTimeoutRef.current = null
        }, 4000)
      }
    },
    [isMobileLayout]
  )

  return { visibleTooltip, handleCapabilityTileTap }
}
