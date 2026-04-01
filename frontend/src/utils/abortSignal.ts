/**
 * AbortController.abort() with no argument makes fetch reject with an opaque
 * DOMException ("signal is aborted without reason"). Always pass a reason for
 * clearer errors and user-facing messages.
 */
export function abortControllerWithReason(controller: AbortController, message: string): void {
  try {
    controller.abort(new DOMException(message, 'AbortError'))
  } catch {
    controller.abort()
  }
}

/** True for timed-out or user-cancelled fetches (including legacy browser messages). */
export function isNetworkAbortError(error: unknown): boolean {
  if (error == null || typeof error !== 'object') return false
  const e = error as Error
  if (e.name === 'AbortError') return true
  const msg = typeof e.message === 'string' ? e.message.toLowerCase() : ''
  return msg.includes('abort') || msg.includes('aborted')
}
