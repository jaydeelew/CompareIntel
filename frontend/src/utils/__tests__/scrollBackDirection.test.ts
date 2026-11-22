import { describe, expect, it } from 'vitest'

import { scrollBackDirectionForTarget, type VerticalBox } from '../tutorialPositioning'

function box(top: number, bottom: number): VerticalBox {
  return { top, bottom, width: 120, height: bottom - top }
}

describe('scrollBackDirectionForTarget', () => {
  it('stays hidden when the tooltip is still in the layout viewport', () => {
    window.innerHeight = 800
    expect(scrollBackDirectionForTarget(box(-200, -10), box(40, 180), false)).toBeNull()
  })

  it('shows when the spotlight and the tooltip are both above the layout viewport', () => {
    window.innerHeight = 800
    expect(scrollBackDirectionForTarget(box(-420, -40), box(-200, -20), false)).toBe('up')
  })

  it('shows when both are below the layout viewport', () => {
    window.innerHeight = 800
    expect(scrollBackDirectionForTarget(box(860, 1100), box(1120, 1280), false)).toBe('down')
  })

  it('ignores a spotlight that still intersects the layout viewport', () => {
    window.innerHeight = 800
    expect(scrollBackDirectionForTarget(box(700, 980), box(1000, 1160), false)).toBeNull()
  })

  it('keeps the hint after the tooltip unmounts until the spotlight returns', () => {
    window.innerHeight = 800
    expect(scrollBackDirectionForTarget(box(-420, -40), null, true)).toBe('up')
    expect(scrollBackDirectionForTarget(box(120, 320), null, true)).toBeNull()
  })
})
