import { Link } from 'react-router-dom'

import { DAILY_CREDIT_LIMITS, TIER_PRICING } from '../../config/constants'

import './PricingTeaser.css'

/**
 * PricingTeaser - Displays free tier credits and paid plan pricing
 * Shown under the main hero button to encourage sign-ups
 */
export function PricingTeaser() {
  const freeDailyCredits = DAILY_CREDIT_LIMITS.free
  const lowestPaidPrice = Math.min(
    ...Object.entries(TIER_PRICING)
      .filter(([tier]) => tier !== 'free' && tier !== 'unregistered')
      .map(([, price]) => price)
  )

  return (
    <div className="pricing-teaser">
      <p className="pricing-teaser-text">
        <span className="pricing-teaser-free">{freeDailyCredits} credits/day free</span>
        <span className="pricing-teaser-separator"> • </span>
        <span className="pricing-teaser-paid">Paid plans from ${lowestPaidPrice}/month</span>
        <span className="pricing-teaser-separator"> • </span>
        <Link to="/pricing" className="pricing-teaser-link">
          See plans
        </Link>
      </p>
    </div>
  )
}
