/**
 * Tests for TutorialBackdrop component
 */

import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

import { TutorialBackdrop } from '../TutorialBackdrop'

describe('TutorialBackdrop', () => {
  it('should render loading cutout when isLoadingStreamingPhase and loadingStreamingCutout provided', () => {
    render(
      <TutorialBackdrop
        isLoadingStreamingPhase={true}
        loadingStreamingCutout={{ top: 100, left: 50, width: 200, height: 80 }}
        useRoundedCutout={false}
        textareaCutoutToUse={null}
        shouldExcludeTextarea={false}
        shouldExcludeDropdown={false}
        dropdownCutout={null}
        targetCutout={null}
        buttonCutout={null}
      />
    )

    const cutout = document.querySelector('.tutorial-backdrop-cutout')
    expect(cutout).toBeInTheDocument()
    expect(cutout).toHaveStyle({
      top: '100px',
      left: '50px',
      width: '200px',
      height: '80px',
    })
  })

  it('should render rounded cutout when useRoundedCutout and textareaCutoutToUse', () => {
    render(
      <TutorialBackdrop
        isLoadingStreamingPhase={false}
        loadingStreamingCutout={null}
        useRoundedCutout={true}
        textareaCutoutToUse={{ top: 200, left: 100, width: 400, height: 120 }}
        shouldExcludeTextarea={false}
        shouldExcludeDropdown={false}
        dropdownCutout={null}
        targetCutout={null}
        buttonCutout={null}
      />
    )

    const cutout = document.querySelector('.tutorial-backdrop-cutout')
    expect(cutout).toBeInTheDocument()
    expect(cutout).toHaveStyle({ borderRadius: '32px' })
  })

  it('should render 4-panel backdrop when shouldExcludeTextarea and textareaCutoutToUse', () => {
    render(
      <TutorialBackdrop
        isLoadingStreamingPhase={false}
        loadingStreamingCutout={null}
        useRoundedCutout={false}
        textareaCutoutToUse={{ top: 150, left: 80, width: 300, height: 100 }}
        shouldExcludeTextarea={true}
        shouldExcludeDropdown={false}
        dropdownCutout={null}
        targetCutout={null}
        buttonCutout={null}
      />
    )

    const panels = document.querySelectorAll('.tutorial-backdrop')
    expect(panels).toHaveLength(4)
    expect(document.querySelector('.tutorial-backdrop-top')).toBeInTheDocument()
    expect(document.querySelector('.tutorial-backdrop-bottom')).toBeInTheDocument()
    expect(document.querySelector('.tutorial-backdrop-left')).toBeInTheDocument()
    expect(document.querySelector('.tutorial-backdrop-right')).toBeInTheDocument()
  })

  it('should render dropdown cutout when shouldExcludeDropdown and dropdownCutout', () => {
    render(
      <TutorialBackdrop
        isLoadingStreamingPhase={false}
        loadingStreamingCutout={null}
        useRoundedCutout={false}
        textareaCutoutToUse={null}
        shouldExcludeTextarea={false}
        shouldExcludeDropdown={true}
        dropdownCutout={{ top: 50, left: 20, width: 250, height: 150 }}
        targetCutout={null}
        buttonCutout={null}
      />
    )

    const cutout = document.querySelector('.tutorial-backdrop-cutout')
    expect(cutout).toBeInTheDocument()
  })

  it('should render target cutout when targetCutout provided', () => {
    render(
      <TutorialBackdrop
        isLoadingStreamingPhase={false}
        loadingStreamingCutout={null}
        useRoundedCutout={false}
        textareaCutoutToUse={null}
        shouldExcludeTextarea={false}
        shouldExcludeDropdown={false}
        dropdownCutout={null}
        targetCutout={{
          top: 100,
          left: 50,
          width: 200,
          height: 80,
          borderRadius: 12,
        }}
        buttonCutout={null}
      />
    )

    const cutout = document.querySelector('.tutorial-backdrop-cutout')
    expect(cutout).toBeInTheDocument()
    expect(cutout).toHaveStyle({ borderRadius: '12px' })
  })

  it('should render default backdrop with button cutout when buttonCutout provided', () => {
    render(
      <TutorialBackdrop
        isLoadingStreamingPhase={false}
        loadingStreamingCutout={null}
        useRoundedCutout={false}
        textareaCutoutToUse={null}
        shouldExcludeTextarea={false}
        shouldExcludeDropdown={false}
        dropdownCutout={null}
        targetCutout={null}
        buttonCutout={{ top: 300, left: 400, radius: 24 }}
      />
    )

    const backdrop = document.querySelector('.tutorial-backdrop')
    expect(backdrop).toBeInTheDocument()
    expect(backdrop).not.toHaveClass('tutorial-backdrop-cutout')
  })

  it('should stop propagation on backdrop click', async () => {
    const user = userEvent.setup()
    const onParentClick = vi.fn()

    // Use 4-panel backdrop - it does not have pointer-events: none (unlike cutouts)
    const { container } = render(
      <div onClick={onParentClick}>
        <TutorialBackdrop
          isLoadingStreamingPhase={false}
          loadingStreamingCutout={null}
          useRoundedCutout={false}
          textareaCutoutToUse={{ top: 50, left: 50, width: 100, height: 100 }}
          shouldExcludeTextarea={true}
          shouldExcludeDropdown={false}
          dropdownCutout={null}
          targetCutout={null}
          buttonCutout={null}
        />
      </div>
    )

    const backdrop = container.querySelector('.tutorial-backdrop')
    expect(backdrop).toBeInTheDocument()
    await user.click(backdrop as HTMLElement)
    expect(onParentClick).not.toHaveBeenCalled()
  })
})
