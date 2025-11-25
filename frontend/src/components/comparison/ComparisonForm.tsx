import React, { memo, useEffect, useCallback, useMemo } from 'react';
import type { User } from '../../types';
import type { ConversationSummary, ModelConversation } from '../../types';
import type { ModelsByProvider } from '../../types/models';
import { truncatePrompt, formatDate } from '../../utils';
import { getConversationLimit, getDailyLimit } from '../../config/constants';

interface ComparisonFormProps {
  // Input state
  input: string;
  setInput: (value: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement>;

  // Mode state
  isFollowUpMode: boolean;
  isLoading: boolean;
  isAnimatingButton: boolean;
  isAnimatingTextarea: boolean;

  // User state
  isAuthenticated: boolean;
  user: User | null;

  // Conversations
  conversations: ModelConversation[];

  // History
  showHistoryDropdown: boolean;
  setShowHistoryDropdown: (show: boolean) => void;
  conversationHistory: ConversationSummary[];
  isLoadingHistory: boolean;
  historyLimit: number;
  currentVisibleComparisonId: string | null;

  // Handlers
  onSubmitClick: () => void;
  onContinueConversation: () => void;
  onNewComparison: () => void;
  onLoadConversation: (summary: ConversationSummary) => void;
  onDeleteConversation: (summary: ConversationSummary, e: React.MouseEvent) => void;

  // Utilities
  renderUsagePreview: () => React.ReactNode;

  // Model selection
  selectedModels: string[];
  
  // Models data for token limit calculations
  modelsByProvider: ModelsByProvider;
}

/**
 * ComparisonForm component - handles the main input area, history, and controls
 * 
 * @example
 * ```tsx
 * <ComparisonForm
 *   input={input}
 *   setInput={setInput}
 *   onSubmitClick={handleSubmit}
 *   {...otherProps}
 * />
 * ```
 */
export const ComparisonForm = memo<ComparisonFormProps>(({
  input,
  setInput,
  textareaRef,
  isFollowUpMode,
  isLoading,
  isAnimatingButton,
  isAnimatingTextarea,
  isAuthenticated,
  user,
  conversations,
  showHistoryDropdown,
  setShowHistoryDropdown,
  conversationHistory,
  isLoadingHistory,
  historyLimit,
  currentVisibleComparisonId,
  onSubmitClick,
  onContinueConversation,
  onNewComparison,
  onLoadConversation,
  onDeleteConversation,
  renderUsagePreview,
  selectedModels,
  modelsByProvider,
}) => {
  const messageCount = conversations.length > 0 ? conversations[0]?.messages.length || 0 : 0;

  // Calculate token usage and percentage remaining
  const tokenUsageInfo = useMemo(() => {
    if (!isFollowUpMode || selectedModels.length === 0 || conversations.length === 0) {
      return null;
    }

    // Get min max input tokens from selected models (convert max_input_chars to tokens by dividing by 4)
    const modelLimits = selectedModels
      .map(modelId => {
        for (const providerModels of Object.values(modelsByProvider)) {
          const model = providerModels.find(m => m.id === modelId);
          if (model && model.max_input_chars) {
            // Convert chars to tokens (1 token ≈ 4 chars)
            return model.max_input_chars / 4;
          }
        }
        return null;
      })
      .filter((limit): limit is number => limit !== null);

    if (modelLimits.length === 0) {
      return null;
    }

    const minMaxInputTokens = Math.min(...modelLimits);

    // Calculate current input token usage
    // Current input tokens
    const currentInputTokens = Math.ceil(input.length / 4);

    // Conversation history tokens
    const conversationHistoryMessages = conversations
      .filter(conv => selectedModels.includes(conv.modelId) && conv.messages.length > 0);
    
    if (conversationHistoryMessages.length === 0) {
      return null;
    }

    // Use the first selected conversation's messages
    const messages = conversationHistoryMessages[0].messages;
    const conversationHistoryTokens = messages.reduce((sum, msg) => {
      const content = msg.content || '';
      return sum + Math.ceil(content.length / 4);
    }, 0);

    // Total input tokens (current input + conversation history)
    const totalInputTokens = currentInputTokens + conversationHistoryTokens;

    // Calculate percentage remaining
    const percentageUsed = (totalInputTokens / minMaxInputTokens) * 100;
    const percentageRemaining = Math.max(0, 100 - percentageUsed);

    return {
      minMaxInputTokens,
      currentInputTokens,
      conversationHistoryTokens,
      totalInputTokens,
      percentageUsed,
      percentageRemaining,
      isExceeded: totalInputTokens > minMaxInputTokens,
    };
  }, [isFollowUpMode, selectedModels, conversations, input, modelsByProvider]);

  // Auto-expand textarea based on content (like ChatGPT)
  // Scrollable after 5 lines (6th line triggers scrolling)
  const adjustTextareaHeight = useCallback(() => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;

    // Check if we're on mobile viewport (max-width: 768px)
    const isMobile = window.innerWidth <= 768;

    // On mobile, keep height fixed at min-height and enable scrolling
    if (isMobile) {
      const computedStyle = window.getComputedStyle(textarea);
      const cssMinHeight = parseFloat(computedStyle.minHeight) || 40;
      textarea.style.height = `${cssMinHeight}px`;
      textarea.style.overflowY = 'auto';
      return;
    }

    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';

    // Calculate height for exactly 5 lines of text
    const computedStyle = window.getComputedStyle(textarea);
    const fontSize = parseFloat(computedStyle.fontSize);
    const lineHeight = parseFloat(computedStyle.lineHeight) || fontSize * 1.6;
    const paddingTop = parseFloat(computedStyle.paddingTop);
    const paddingBottom = parseFloat(computedStyle.paddingBottom);

    // Get CSS min-height value to respect it (important for responsive design)
    const cssMinHeight = parseFloat(computedStyle.minHeight) || 0;

    // Calculate height for exactly 5 lines of text content
    const lineHeightPx = lineHeight;
    const fiveLinesHeight = lineHeightPx * 5; // Height for 5 lines of text

    // maxHeight = 5 lines + top padding + bottom padding
    // This ensures exactly 5 lines are visible before scrolling starts
    const maxHeight = fiveLinesHeight + paddingTop + paddingBottom;

    // Use the maximum of calculated minHeight and CSS min-height to respect responsive design
    const calculatedMinHeight = lineHeightPx + paddingTop + paddingBottom;
    const minHeight = Math.max(calculatedMinHeight, cssMinHeight);
    const scrollHeight = textarea.scrollHeight;

    // When empty, use exactly the CSS min-height to match the action area height
    const isEmpty = !input.trim();
    let newHeight: number;

    if (isEmpty) {
      // Force empty textarea to match action area height exactly
      newHeight = cssMinHeight;
    } else {
      // Set height to maxHeight (5 lines) when content exceeds it, otherwise grow with content
      // But ensure it's at least the CSS min-height
      newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
    }

    textarea.style.height = `${newHeight}px`;

    // Enable scrolling when 6th line is needed (content exceeds 5 lines)
    if (scrollHeight > maxHeight) {
      textarea.style.overflowY = 'auto';
    } else {
      textarea.style.overflowY = 'hidden';
      // Reset scroll position when not scrolling
      textarea.scrollTop = 0;
    }
  }, [input]);

  // Adjust height when input changes
  useEffect(() => {
    // Use requestAnimationFrame to ensure DOM is updated
    requestAnimationFrame(() => {
      adjustTextareaHeight();
    });
  }, [input, adjustTextareaHeight]);

  // Adjust height on window resize - ensure it recalculates after media query changes
  useEffect(() => {
    let resizeTimeout: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      // Clear any pending resize handler
      clearTimeout(resizeTimeout);
      // Use a small delay to ensure media queries have been applied
      resizeTimeout = setTimeout(() => {
        requestAnimationFrame(() => {
          adjustTextareaHeight();
        });
      }, 100);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimeout);
    };
  }, [adjustTextareaHeight]);

  // Initial height adjustment on mount
  useEffect(() => {
    // Small delay to ensure textarea is rendered
    const timer = setTimeout(() => {
      adjustTextareaHeight();
    }, 0);
    return () => clearTimeout(timer);
  }, [adjustTextareaHeight]);


  return (
    <>
      <div className="follow-up-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
        {isFollowUpMode ? (
          <>
            <h2 style={{ margin: 0 }}>
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Follow Up Mode
            </h2>
            <button
              onClick={onNewComparison}
              className="textarea-icon-button new-inquiry-button"
              title="Exit follow up mode"
              disabled={isLoading}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                minWidth: '32px',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{
                  width: '20px',
                  height: '20px',
                  display: 'block',
                  flexShrink: 0
                }}
              >
                <path d="M12 2v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            </button>
            <span style={{
              fontSize: 'clamp(1.25rem, 3vw, 1.5rem)',
              fontWeight: 700,
              color: 'transparent',
              textAlign: 'center',
              margin: 0,
              letterSpacing: '-0.025em',
              textShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
              background: 'linear-gradient(135deg, #ffffff 0%, #e2e8f0 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text'
            }}>
              {tokenUsageInfo 
                ? `${Math.round(tokenUsageInfo.percentageRemaining)}% capacity remaining`
                : `${messageCount + (input.trim() ? 1 : 0)} message context`}
            </span>
          </>
        ) : (
          <h2>Enter Your Prompt</h2>
        )}
      </div>

      <div className={`textarea-container ${isAnimatingTextarea ? 'animate-pulse-border' : ''}`}>
        {/* Wrapper for textarea */}
        <div className="textarea-wrapper">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              // adjustTextareaHeight will be called via useEffect
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (isFollowUpMode) {
                  onContinueConversation();
                } else {
                  onSubmitClick();
                }
              }
            }}
            placeholder={isFollowUpMode
              ? "Continue your conversation here"
              : "Let's get started..."
            }
            className="hero-input-textarea"
            rows={1}
            data-testid="comparison-input-textarea"
          />
        </div>

        {/* Actions area below textarea - looks like part of textarea */}
        <div className="textarea-actions-area">
          {/* History Toggle Button - positioned on left side */}
          <button
            type="button"
            className={`history-toggle-button ${showHistoryDropdown ? 'active' : ''}`}
            onClick={() => setShowHistoryDropdown(!showHistoryDropdown)}
            title="Load previous conversations"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          <div className="textarea-actions">
            <button
              onClick={isFollowUpMode ? onContinueConversation : onSubmitClick}
              disabled={isLoading}
              className={`textarea-icon-button submit-button ${!isFollowUpMode && !input.trim() ? 'not-ready' : ''} ${isAnimatingButton ? 'animate-pulse-glow' : ''}`}
              title={(() => {
                if (isFollowUpMode && tokenUsageInfo) {
                  if (tokenUsageInfo.isExceeded) {
                    return 'Input capacity exceeded - inputs may be truncated';
                  }
                  return 'Continue conversation';
                }
                return isFollowUpMode ? 'Continue conversation' : 'Compare models';
              })()}
              data-testid="comparison-submit-button"
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7 14l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* History List */}
        {showHistoryDropdown && (() => {
          // Check if notification should be shown
          const userTier = isAuthenticated ? user?.subscription_tier || 'free' : 'anonymous';
          const tierLimit = getConversationLimit(userTier);
          const shouldShowNotification = (userTier === 'anonymous' || userTier === 'free') &&
            conversationHistory.length >= tierLimit;

          // Allow scrolling when notification is present to ensure message is always visible
          const shouldHideScrollbar = historyLimit <= 3 && !shouldShowNotification;

          // Calculate max height based on user tier
          // Each entry: 1rem top padding (16px) + content (~23px prompt + 8px margin + ~15px meta) + 1rem bottom padding (16px) ≈ 78px
          // Plus borders between items (1px each)
          // Notification height: ~70px (margin-top 8px + padding-top 8px + 2 lines of text ~41px + padding-bottom 8px + some buffer)
          const getMaxHeight = () => {
            const notificationHeight = shouldShowNotification ? 70 : 0;

            if (historyLimit === 2) {
              return `${165 + notificationHeight}px`; // Height for 2 entries + notification if present
            }
            return `${250 + notificationHeight}px`; // Height for 3 entries + notification if present
          };

          return (
            <div
              className={`history-inline-list ${shouldHideScrollbar ? 'no-scrollbar' : 'scrollable'}`}
              style={{ maxHeight: getMaxHeight() }}
            >
              {isLoadingHistory ? (
                <div className="history-loading">Loading...</div>
              ) : conversationHistory.length === 0 ? (
                <div className="history-empty">No conversation history</div>
              ) : (
                <>
                  {conversationHistory
                    .slice(0, historyLimit)
                    .map((summary) => {
                      const isActive = currentVisibleComparisonId && String(summary.id) === currentVisibleComparisonId;

                      return (
                        <div
                          key={summary.id}
                          className={`history-item ${isActive ? 'history-item-active' : ''}`}
                          onClick={() => onLoadConversation(summary)}
                        >
                          <div className="history-item-content">
                            <div className="history-item-prompt">{truncatePrompt(summary.input_data)}</div>
                            <div className="history-item-meta">
                              <span className="history-item-models">{summary.models_used.length} model{summary.models_used.length !== 1 ? 's' : ''}</span>
                              <span className="history-item-date">{formatDate(summary.created_at)}</span>
                            </div>
                          </div>
                          <button
                            className="history-item-delete"
                            onClick={(e) => onDeleteConversation(summary, e)}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}

                  {/* Tier limit message */}
                  {(() => {
                    const userTier = isAuthenticated ? user?.subscription_tier || 'free' : 'anonymous';
                    const tierLimit = getConversationLimit(userTier);

                    if (userTier !== 'anonymous' && userTier !== 'free') {
                      return null;
                    }

                    const visibleCount = conversationHistory.length;
                    const isAtLimit = visibleCount >= tierLimit;

                    if (!isAtLimit) {
                      return null;
                    }

                    if (!isAuthenticated) {
                      return (
                        <div className="history-signup-prompt">
                          <div className="history-signup-message">
                            <span className="history-signup-line">You can only save the last 2 comparisons.</span>
                            <span className="history-signup-line"> Sign up for a free account to save more!</span>
                          </div>
                        </div>
                      );
                    } else {
                      return (
                        <div className="history-signup-prompt">
                          <div className="history-signup-message">
                            <span className="history-signup-line">You only have 3 saves for your tier.</span>
                            <span className="history-signup-line"> Upgrade to Starter for 10 saved comparisons or Pro for 50!</span>
                          </div>
                        </div>
                      );
                    }
                  })()}
                </>
              )}
            </div>
          );
        })()}
      </div>

      {/* Usage Preview - Regular Mode */}
      {!isFollowUpMode && (
        <div className="usage-preview-container">
          {(input.trim() || selectedModels.length > 0) && renderUsagePreview()}
        </div>
      )}

      {/* Context Warning & Usage Preview - Follow-up Mode */}
      {isFollowUpMode && conversations.length > 0 && (() => {
        let warningLevel: 'info' | 'medium' | 'high' | 'critical' | null = null;
        let warningMessage = '';
        let warningIcon = '';

        if (tokenUsageInfo) {
          const { percentageRemaining, isExceeded } = tokenUsageInfo;

          if (isExceeded) {
            // Exceeded max input - allow but warn about consequences
            warningLevel = 'critical';
            warningIcon = '⚠️';
            warningMessage = 'You\'ve exceeded the maximum input capacity. Inputs may be truncated. Starting a new comparison is strongly recommended for best results.';
          } else if (percentageRemaining <= 0) {
            // At max input
            warningLevel = 'critical';
            warningIcon = '🚫';
            warningMessage = 'Maximum input capacity reached. Please start a fresh comparison for continued assistance.';
          } else if (percentageRemaining <= 10) {
            // 0-10% remaining
            warningLevel = 'critical';
            warningIcon = '✨';
            warningMessage = 'Time for a fresh start! Starting a new comparison will give you the best response quality and speed.';
          } else if (percentageRemaining <= 25) {
            // 10-25% remaining
            warningLevel = 'high';
            warningIcon = '💡';
            warningMessage = 'Consider starting a fresh comparison! New conversations help maintain optimal context and response quality.';
          } else if (percentageRemaining <= 50) {
            // 25-50% remaining
            warningLevel = 'medium';
            warningIcon = '🎯';
            warningMessage = 'Pro tip: Fresh comparisons provide more focused and relevant responses!';
          } else if (percentageRemaining <= 75) {
            // 50-75% remaining
            warningLevel = 'info';
            warningIcon = 'ℹ️';
            warningMessage = 'Reminder: Starting a new comparison helps keep responses sharp and context-focused.';
          }
        }

        return (
          <>
            {messageCount > 0 && (
              <div className="usage-preview-container">
                {renderUsagePreview()}
              </div>
            )}

            {warningLevel && (
              <div className={`context-warning ${warningLevel}`}>
                <div className="context-warning-content">
                  <div className="context-warning-message">
                    <span className="context-warning-icon">{warningIcon}</span>{warningMessage}
                  </div>
                </div>
              </div>
            )}
          </>
        );
      })()}
    </>
  );
});

ComparisonForm.displayName = 'ComparisonForm';

