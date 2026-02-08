import { useCallback } from 'react'

import type { ModelConversation, ResultTab, ActiveResultTabs } from '../types'
import { RESULT_TAB } from '../types'
import { showNotification, getSafeId, formatConversationMessage } from '../utils'

export interface UseScreenshotCopyOptions {
  /** Current conversations */
  conversations: ModelConversation[]
  /** Active result tabs for each model (formatted vs raw) */
  activeResultTabs: ActiveResultTabs
  /** Function to switch result tab for a model */
  switchResultTab: (modelId: string, tab: ResultTab) => void
}

export interface UseScreenshotCopyReturn {
  /** Take a screenshot of a model's conversation content and copy to clipboard */
  handleScreenshot: (modelId: string) => Promise<void>
  /** Copy entire conversation history as raw text */
  handleCopyResponse: (modelId: string) => Promise<void>
  /** Copy a single message (screenshot if formatted, text if raw) */
  handleCopyMessage: (modelId: string, messageId: string, messageContent: string) => Promise<void>
}

/**
 * Hook for screenshot and copy functionality on model response cards
 * Handles:
 * - Taking screenshots of formatted conversation content and copying to clipboard
 * - Copying raw conversation history as text
 * - Copying individual messages (as screenshots when in formatted mode, as text in raw mode)
 */
export function useScreenshotCopy({
  conversations,
  activeResultTabs,
  switchResultTab,
}: UseScreenshotCopyOptions): UseScreenshotCopyReturn {
  /**
   * Take a screenshot of the message area for a specific model and copy to clipboard
   */
  const handleScreenshot = useCallback(
    async (modelId: string) => {
      const safeId = getSafeId(modelId)
      const content = document.querySelector(
        `#conversation-content-${safeId}`
      ) as HTMLElement | null
      if (!content) {
        showNotification('Screenshot target not found.', 'error')
        return
      }

      // Check if formatted tab is active, if not temporarily switch to it for copying
      // Use type assertion to handle string indexing into ActiveResultTabs
      const currentTab =
        (activeResultTabs as unknown as Record<string, ResultTab>)[modelId] || RESULT_TAB.FORMATTED
      const needsTabSwitch = currentTab !== RESULT_TAB.FORMATTED

      if (needsTabSwitch) {
        // Temporarily switch to formatted tab to render formatted content
        switchResultTab(modelId, RESULT_TAB.FORMATTED)
        // Wait for DOM to update and formatted content to render
        await new Promise<void>(resolve => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              // Additional delay to ensure LatexRenderer has rendered
              setTimeout(resolve, 100)
            })
          })
        })
      }

      // Show immediate feedback and store notification controller to update it when done
      const copyingNotification = showNotification('Copying screenshot...', 'success')
      // Clear auto-remove timeout so notification stays until we update it
      copyingNotification.clearAutoRemove()
      // Set timer icon for the copying notification
      copyingNotification.setIcon(
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>'
      )

      // Store original styles that we'll modify
      const prevOverflow = content.style.overflow
      const prevMaxHeight = content.style.maxHeight

      // Expand to show all content
      content.style.overflow = 'visible'
      content.style.maxHeight = 'none'

      try {
        // Start importing the library and waiting for repaint in parallel for faster processing
        const [htmlToImage] = await Promise.all([
          import('html-to-image'),
          // Use requestAnimationFrame for better timing - ensures browser has painted
          new Promise<void>(resolve => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => resolve())
            })
          }),
        ])

        const toBlob = htmlToImage.toBlob

        // Use the actual computed background color to preserve the dark theme
        const computedBg = getComputedStyle(content).backgroundColor
        const backgroundColor =
          computedBg && computedBg !== 'transparent' && computedBg !== 'rgba(0, 0, 0, 0)'
            ? computedBg
            : getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim() ||
              '#12121c'

        // Use html-to-image which typically preserves colors better
        const blob = await toBlob(content, {
          pixelRatio: 2, // High quality
          backgroundColor,
          // Skip external fonts to avoid CORS SecurityError when reading cross-origin stylesheets
          skipFonts: true,
          // Removed cacheBust for faster processing (not needed for DOM elements)
          style: {
            // Ensure the element is fully visible
            overflow: 'visible',
            maxHeight: 'none',
          },
        })

        if (blob && navigator.clipboard && window.ClipboardItem) {
          try {
            // Try to write to clipboard with retry logic
            let copySuccess = false
            let lastError: Error | null = null

            // Attempt clipboard write with up to 2 retries
            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })])
                copySuccess = true
                break
              } catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err))
                // Use console.warn for expected errors (document not focused, permission denied)
                // to avoid flooding console with errors during normal operation
                console.warn(`Clipboard copy attempt ${attempt + 1} failed:`, lastError.message)

                // If it's a permission error or security error, don't retry
                if (
                  lastError.name === 'NotAllowedError' ||
                  lastError.name === 'SecurityError' ||
                  lastError.message.includes('permission') ||
                  lastError.message.includes('denied')
                ) {
                  break
                }

                // Wait a bit before retrying (only if not the last attempt)
                if (attempt < 2) {
                  await new Promise(resolve => setTimeout(resolve, 200))
                }
              }
            }

            if (copySuccess) {
              // Update notification in place for seamless transition
              copyingNotification.update('Screenshot copied to clipboard!', 'success')
            } else {
              // Show specific error message
              const errorMsg = lastError
                ? `Clipboard copy failed: ${lastError.message || lastError.name || 'Unknown error'}. Image downloaded instead.`
                : 'Clipboard copy failed. Image downloaded instead.'
              copyingNotification.update(errorMsg, 'error')
              // Use console.warn since clipboard failures are expected when document isn't focused
              console.warn('Clipboard copy failed after retries:', lastError?.message)

              // Fallback: download the image
              const link = document.createElement('a')
              link.download = `model_${safeId}_messages.png`
              link.href = URL.createObjectURL(blob)
              link.click()
              URL.revokeObjectURL(link.href)
            }
          } catch (err) {
            // Catch any unexpected errors during the retry logic
            const error = err instanceof Error ? err : new Error(String(err))
            const errorMsg = `Clipboard copy failed: ${error.message || error.name || 'Unknown error'}. Image downloaded instead.`
            copyingNotification.update(errorMsg, 'error')
            console.error('Unexpected error during clipboard copy:', error)

            // Fallback: download the image
            const link = document.createElement('a')
            link.download = `model_${safeId}_messages.png`
            link.href = URL.createObjectURL(blob)
            link.click()
            URL.revokeObjectURL(link.href)
          }
        } else if (blob) {
          // Clipboard API not available
          const reason = !navigator.clipboard
            ? 'Clipboard API not available'
            : !window.ClipboardItem
              ? 'ClipboardItem not supported'
              : 'Unknown reason'
          copyingNotification.update(`${reason}. Image downloaded.`, 'error')
          console.warn('Clipboard not supported:', {
            clipboard: !!navigator.clipboard,
            ClipboardItem: !!window.ClipboardItem,
          })
          const link = document.createElement('a')
          link.download = `model_${safeId}_messages.png`
          link.href = URL.createObjectURL(blob)
          link.click()
          URL.revokeObjectURL(link.href)
        } else {
          copyingNotification.update('Could not create image blob.', 'error')
          console.error('Failed to create image blob from content element')
        }
      } catch (err) {
        copyingNotification.update('Screenshot failed: ' + (err as Error).message, 'error')
      } finally {
        // Restore original styles
        content.style.overflow = prevOverflow
        content.style.maxHeight = prevMaxHeight

        // Restore original tab if we switched it
        if (needsTabSwitch) {
          switchResultTab(modelId, currentTab)
        }
      }
    },
    [activeResultTabs, switchResultTab]
  )

  /**
   * Copy the entire conversation history as raw text
   */
  const handleCopyResponse = useCallback(
    async (modelId: string) => {
      // Find the conversation for this model
      const conversation = conversations.find(conv => conv.modelId === modelId)
      if (!conversation) {
        showNotification('Model response not found.', 'error')
        return
      }

      if (conversation.messages.length === 0) {
        showNotification('No messages to copy.', 'error')
        return
      }

      // Format the entire conversation history
      const formattedHistory = conversation.messages
        .map(msg => formatConversationMessage(msg.type, msg.content, msg.timestamp))
        .join('\n\n---\n\n')

      try {
        await navigator.clipboard.writeText(formattedHistory)
        showNotification('Raw conversation copied to clipboard!', 'success')
      } catch (err) {
        showNotification('Failed to copy to clipboard.', 'error')
        console.error('Copy failed:', err)
      }
    },
    [conversations]
  )

  /**
   * Copy a single message (screenshot if in formatted mode, text if in raw mode)
   */
  const handleCopyMessage = useCallback(
    async (modelId: string, messageId: string, messageContent: string) => {
      const safeId = getSafeId(modelId)
      const messageSafeId = getSafeId(messageId)
      const messageContentId = `message-content-${safeId}-${messageSafeId}`
      const currentTab =
        (activeResultTabs as unknown as Record<string, ResultTab>)[modelId] || RESULT_TAB.FORMATTED

      try {
        if (currentTab === RESULT_TAB.FORMATTED) {
          // Take a screenshot of the formatted message
          const messageElement = document.querySelector(
            `#${messageContentId}`
          ) as HTMLElement | null
          if (!messageElement) {
            showNotification('Message element not found.', 'error')
            return
          }

          // Wait for DOM to be ready (in case LatexRenderer is still rendering)
          await new Promise<void>(resolve => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                // Additional delay to ensure LatexRenderer has rendered
                setTimeout(resolve, 100)
              })
            })
          })

          // Show immediate feedback
          const copyingNotification = showNotification('Copying screenshot...', 'success')
          copyingNotification.clearAutoRemove()
          copyingNotification.setIcon(
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>'
          )

          // Store original styles that we'll modify
          const prevOverflow = messageElement.style.overflow
          const prevOverflowX = messageElement.style.overflowX
          const prevMaxHeight = messageElement.style.maxHeight
          const prevPadding = messageElement.style.padding
          const prevMargin = messageElement.style.margin

          // Expand to show all content and remove margin so the border isn't clipped
          messageElement.style.overflow = 'visible'
          messageElement.style.overflowX = 'visible'
          messageElement.style.maxHeight = 'none'
          messageElement.style.padding =
            messageElement.style.padding || getComputedStyle(messageElement).padding
          messageElement.style.margin = '0'

          try {
            // Start importing the library and waiting for repaint in parallel
            const [htmlToImage] = await Promise.all([
              import('html-to-image'),
              new Promise<void>(resolve => {
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => resolve())
                })
              }),
            ])

            const toBlob = htmlToImage.toBlob

            // Use the element's own computed background color to preserve the dark theme
            // This ensures the area behind the border-radius corners matches the element background
            const computedBg = getComputedStyle(messageElement).backgroundColor
            const backgroundColor =
              computedBg && computedBg !== 'transparent' && computedBg !== 'rgba(0, 0, 0, 0)'
                ? computedBg
                : getComputedStyle(document.documentElement)
                    .getPropertyValue('--bg-tertiary')
                    .trim() || '#151520'

            // Create screenshot of the message element
            const blob = await toBlob(messageElement, {
              pixelRatio: 2, // High quality
              backgroundColor,
              style: {
                overflow: 'visible',
                overflowX: 'visible',
                maxHeight: 'none',
                margin: '0',
              },
            })

            if (blob && navigator.clipboard && window.ClipboardItem) {
              try {
                // Try to write to clipboard with retry logic
                let copySuccess = false
                let lastError: Error | null = null

                for (let attempt = 0; attempt < 3; attempt++) {
                  try {
                    await navigator.clipboard.write([
                      new window.ClipboardItem({ 'image/png': blob }),
                    ])
                    copySuccess = true
                    break
                  } catch (err) {
                    lastError = err instanceof Error ? err : new Error(String(err))

                    if (
                      lastError.name === 'NotAllowedError' ||
                      lastError.name === 'SecurityError' ||
                      lastError.message.includes('permission') ||
                      lastError.message.includes('denied')
                    ) {
                      break
                    }

                    if (attempt < 2) {
                      await new Promise(resolve => setTimeout(resolve, 200))
                    }
                  }
                }

                if (copySuccess) {
                  copyingNotification.update('Screenshot copied to clipboard!', 'success')
                } else {
                  const errorMsg = lastError
                    ? `Clipboard copy failed: ${lastError.message || lastError.name || 'Unknown error'}. Image downloaded instead.`
                    : 'Clipboard copy failed. Image downloaded instead.'
                  copyingNotification.update(errorMsg, 'error')

                  // Fallback: download the image
                  const link = document.createElement('a')
                  link.download = `message_${safeId}_${messageSafeId}.png`
                  link.href = URL.createObjectURL(blob)
                  link.click()
                  URL.revokeObjectURL(link.href)
                }
              } catch (err) {
                const error = err instanceof Error ? err : new Error(String(err))
                copyingNotification.update(
                  `Clipboard copy failed: ${error.message || error.name || 'Unknown error'}. Image downloaded instead.`,
                  'error'
                )

                // Fallback: download the image
                const link = document.createElement('a')
                link.download = `message_${safeId}_${messageSafeId}.png`
                link.href = URL.createObjectURL(blob)
                link.click()
                URL.revokeObjectURL(link.href)
              }
            } else if (blob) {
              const reason = !navigator.clipboard
                ? 'Clipboard API not available'
                : !window.ClipboardItem
                  ? 'ClipboardItem not supported'
                  : 'Unknown reason'
              copyingNotification.update(`${reason}. Image downloaded.`, 'error')
              const link = document.createElement('a')
              link.download = `message_${safeId}_${messageSafeId}.png`
              link.href = URL.createObjectURL(blob)
              link.click()
              URL.revokeObjectURL(link.href)
            } else {
              copyingNotification.update('Could not create image blob.', 'error')
            }
          } catch (err) {
            copyingNotification.update('Screenshot failed: ' + (err as Error).message, 'error')
          } finally {
            // Restore original styles
            messageElement.style.overflow = prevOverflow
            messageElement.style.overflowX = prevOverflowX
            messageElement.style.maxHeight = prevMaxHeight
            messageElement.style.padding = prevPadding
            messageElement.style.margin = prevMargin
          }
        } else {
          // Raw mode: copy the raw content as text
          await navigator.clipboard.writeText(messageContent)
          showNotification('Message copied to clipboard!', 'success')
        }
      } catch (err) {
        showNotification('Failed to copy message.', 'error')
        console.error('Copy failed:', err)
      }
    },
    [activeResultTabs]
  )

  return {
    handleScreenshot,
    handleCopyResponse,
    handleCopyMessage,
  }
}
