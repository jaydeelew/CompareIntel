import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import {
  TIER_PRICING,
  MONTHLY_CREDIT_ALLOCATIONS,
  DAILY_CREDIT_LIMITS,
  MODEL_LIMITS,
} from '../../config/constants'
import { useAuth } from '../../contexts/AuthContext'
import {
  createSubscriptionCheckoutSession,
  type PaidSubscriptionTier,
} from '../../services/billingService'

import './Pricing.css'

/**
 * Pricing - Displays subscription tiers and pricing information
 */
export function Pricing() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [subscribingTier, setSubscribingTier] = useState<string | null>(null)
  const [subscribeError, setSubscribeError] = useState<string | null>(null)

  const handleSubscribe = useCallback(
    async (tier: PaidSubscriptionTier) => {
      if (!user) {
        navigate('/?showAuthModal=signup')
        return
      }
      setSubscribeError(null)
      setSubscribingTier(tier)
      try {
        const url = await createSubscriptionCheckoutSession(tier)
        window.location.href = url
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : 'Checkout could not start. Please try again.'
        setSubscribeError(msg)
        setSubscribingTier(null)
      }
    },
    [user, navigate]
  )

  const handleFreeSignup = useCallback(() => {
    navigate('/?showAuthModal=signup')
  }, [navigate])

  // Define tier display order and metadata
  const tiers = [
    {
      key: 'free',
      name: 'Free',
      price: TIER_PRICING.free,
      credits: DAILY_CREDIT_LIMITS.free,
      period: 'day',
      models: MODEL_LIMITS.free,
      description: 'Perfect for trying out CompareIntel',
      features: [
        `${DAILY_CREDIT_LIMITS.free} credits per day`,
        `Up to ${MODEL_LIMITS.free} models per comparison`,
        'Basic comparison features',
        'No credit card required',
      ],
    },
    {
      key: 'starter',
      name: 'Starter',
      price: TIER_PRICING.starter,
      credits: MONTHLY_CREDIT_ALLOCATIONS.starter,
      period: 'month',
      models: MODEL_LIMITS.starter,
      description: 'Great for regular use',
      features: [
        `${MONTHLY_CREDIT_ALLOCATIONS.starter} credits per month`,
        `Up to ${MODEL_LIMITS.starter} models per comparison`,
        'All comparison features',
        'Metered overage available',
      ],
    },
    {
      key: 'starter_plus',
      name: 'Starter+',
      price: TIER_PRICING.starter_plus,
      credits: MONTHLY_CREDIT_ALLOCATIONS.starter_plus,
      period: 'month',
      models: MODEL_LIMITS.starter_plus,
      description: 'More credits for active users',
      features: [
        `${MONTHLY_CREDIT_ALLOCATIONS.starter_plus} credits per month`,
        `Up to ${MODEL_LIMITS.starter_plus} models per comparison`,
        'All comparison features',
        'Metered overage available',
      ],
    },
    {
      key: 'pro',
      name: 'Pro',
      price: TIER_PRICING.pro,
      credits: MONTHLY_CREDIT_ALLOCATIONS.pro,
      period: 'month',
      models: MODEL_LIMITS.pro,
      description: 'For power users',
      features: [
        `${MONTHLY_CREDIT_ALLOCATIONS.pro} credits per month`,
        `Up to ${MODEL_LIMITS.pro} models per comparison`,
        'All comparison features',
        'Metered overage available',
      ],
    },
    {
      key: 'pro_plus',
      name: 'Pro+',
      price: TIER_PRICING.pro_plus,
      credits: MONTHLY_CREDIT_ALLOCATIONS.pro_plus,
      period: 'month',
      models: MODEL_LIMITS.pro_plus,
      description: 'Maximum capacity',
      features: [
        `${MONTHLY_CREDIT_ALLOCATIONS.pro_plus} credits per month`,
        `Up to ${MODEL_LIMITS.pro_plus} models per comparison`,
        'All comparison features',
        'Metered overage available',
      ],
    },
  ]

  return (
    <div className="pricing-page">
      <div className="pricing-container">
        <h1 className="pricing-title">Pricing Plans</h1>
        <p className="pricing-subtitle">
          Choose the plan that fits your needs. All paid plans include metered overage for
          flexibility.
        </p>

        <div className="pricing-tiers">
          {tiers.map(tier => (
            <div
              key={tier.key}
              className={`pricing-tier ${tier.key === 'free' ? 'pricing-tier-free' : ''}`}
            >
              <div className="pricing-tier-header">
                <h2 className="pricing-tier-name">{tier.name}</h2>
                <p className="pricing-tier-description">{tier.description}</p>
              </div>

              <div className="pricing-tier-price">
                <span className="pricing-tier-price-amount">${tier.price}</span>
                <span className="pricing-tier-price-period">/{tier.period}</span>
              </div>

              <ul className="pricing-tier-features">
                {tier.features.map((feature, index) => (
                  <li key={index} className="pricing-tier-feature">
                    <svg
                      className="pricing-tier-feature-icon"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>

              <div className="pricing-tier-cta">
                {tier.key === 'free' ? (
                  <button
                    type="button"
                    className="pricing-tier-button pricing-tier-button-free"
                    onClick={handleFreeSignup}
                  >
                    Get Started Free
                  </button>
                ) : (
                  <button
                    type="button"
                    className="pricing-tier-button pricing-tier-button-paid"
                    onClick={() => handleSubscribe(tier.key as PaidSubscriptionTier)}
                    disabled={subscribingTier !== null}
                  >
                    {subscribingTier === tier.key ? 'Redirecting…' : 'Subscribe'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {subscribeError && (
          <div className="pricing-error">
            <p>{subscribeError}</p>
          </div>
        )}

        <div className="pricing-notes">
          <h3>About Credits</h3>
          <p>
            Credits are consumed based on the models you use and the length of your prompts.
            Different AI models have different costs. Paid plans offer metered overage, allowing you
            to continue using CompareIntel beyond your monthly allocation at a flat rate per credit.
          </p>
          <p>
            <Link to="/faq">Learn more in our FAQ</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
