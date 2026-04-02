/**
 * Fired after billing changes. Listeners refetch `/credits/balance` only.
 * Callers (e.g. StripeCheckoutReturnSync) should `refreshUser()` first so AuthContext matches the DB.
 */
export const BILLING_UPDATED_EVENT = 'compareintel-billing-updated'

const BILLING_DISPATCH_DEBOUNCE_MS = 400
let billingDispatchTimer: ReturnType<typeof setTimeout> | null = null

/** Coalesces rapid calls (e.g. legacy double-dispatch) into one event. */
export function dispatchBillingUpdated(): void {
  if (billingDispatchTimer !== null) {
    clearTimeout(billingDispatchTimer)
  }
  billingDispatchTimer = setTimeout(() => {
    billingDispatchTimer = null
    window.dispatchEvent(new CustomEvent(BILLING_UPDATED_EVENT))
  }, BILLING_DISPATCH_DEBOUNCE_MS)
}

/** Fire billing listeners immediately (clears pending debounced dispatch). Use after checkout retries. */
export function dispatchBillingUpdatedImmediate(): void {
  if (billingDispatchTimer !== null) {
    clearTimeout(billingDispatchTimer)
    billingDispatchTimer = null
  }
  window.dispatchEvent(new CustomEvent(BILLING_UPDATED_EVENT))
}
