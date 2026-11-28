/**
 * Verdict methodology page
 *
 * Explains the dev-only Verdict popover: the user's pick, a Help Me Choose
 * snapshot, this-run cost, and this-run response time.
 */

import React from 'react'
import { Link } from 'react-router-dom'

import { BackToMainCTA } from '../shared'
import './Pages.css'

export const VerdictMethodology: React.FC = () => {
  return (
    <div className="seo-page">
      <div className="seo-page-container">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span className="breadcrumb-separator">/</span>
          <span aria-current="page">Verdict Methodology</span>
        </nav>

        <article className="seo-page-content">
          <header className="seo-page-header">
            <h1>How Verdict Works</h1>
            <p className="seo-page-intro">
              After a comparison finishes, Verdict is a short summary of this run on CompareIntel.
              It does not pick a winner, score answer quality, or rank models in general.
            </p>
            <p className="last-updated">Last updated: November 2026</p>
          </header>

          <section className="seo-section">
            <h2>What Verdict is</h2>
            <p>
              Verdict opens from the CompareIntel logo next to export and share, once at least two
              models have finished successfully. It uses data this comparison already produced:
              replies on the page, OpenRouter usage when the provider sent it, and client
              timestamps. There is no extra model call and no paid judge.
            </p>
          </section>

          <section className="seo-section" id="your-verdict">
            <h2>Your verdict</h2>
            <p>
              Your verdict is the favorite you mark on a successful result card for this turn. One
              model can be selected at a time. Choosing it again clears the pick. The choice stays
              in the browser for this turn only: it is not saved, not sent to CompareIntel, and a
              follow-up prompt starts with no favorite.
            </p>
            <p>
              If you have not picked one yet, <strong>Pick a favorite</strong> scrolls to the result
              cards. The label is your choice for this turn. It is not a quality score.
            </p>
          </section>

          <section className="seo-section" id="popular-rating-sites">
            <h2>Popular rating sites</h2>
            <p>
              When the prompt matches a Help Me Choose category by keyword, Verdict shows that
              category&apos;s top model from the static catalog, plus the published source and the
              date the catalog was fetched. That snapshot is someone else&apos;s public benchmark,
              not a CompareIntel ranking and not a count of people using CompareIntel.
            </p>
            <p>
              Prompts that do not match a category do not invent a top model. They point at Help Me
              Choose instead.
            </p>
          </section>

          <section className="seo-section" id="cost">
            <h2>Cost (this run, via OpenRouter)</h2>
            <p>
              Cost is the USD OpenRouter reported for this CompareIntel run (<code>usage.cost</code>
              ). It is what this platform was billed for this request, not a lab measurement of the
              raw model and not a price you would see calling a provider directly.
            </p>
            <p>
              If OpenRouter did not send a cost, Verdict shows a dash rather than inventing one.
              Mock mode and some image runs often have no reported cost. When the app already has an
              OpenRouter list price per 1M tokens (from Help Me Choose Best value), that list price
              is shown separately so a dash is not a mystery.
            </p>
            <p>
              <strong>Cheapest here</strong> means the lowest reported cost among models in this
              run. Ties share the label. It is not a global or platform-independent ranking.
            </p>
          </section>

          <section className="seo-section" id="latency">
            <h2>Response time (this run)</h2>
            <p>
              Response time is end-to-end: from the request leaving CompareIntel to the finished
              reply, including OpenRouter, the model provider, and the network. It is not isolated
              model inference speed and will vary with load, region, and routing.
            </p>
            <p>
              <strong>Fastest here</strong> means the shortest measured time in this run. Ties share
              the label. It is not a ranking of how fast the model is on every platform.
            </p>
          </section>

          <section className="seo-section">
            <h2>What it claims — and does not</h2>
            <p>Verdict claims only:</p>
            <ul className="seo-list">
              <li>which successful reply you marked as your favorite for this turn</li>
              <li>
                the top Help Me Choose model for a keyword-matched category, with its source and
                as-of date
              </li>
              <li>this-run cost as OpenRouter reported it</li>
              <li>this-run response time through CompareIntel and OpenRouter</li>
            </ul>
            <p>It does not claim:</p>
            <ul className="seo-list">
              <li>which answer is correct, better, or safer</li>
              <li>
                a CompareIntel vote total, a minimum pool size, or that a ranking has qualified
              </li>
              <li>a ranking of models independent of CompareIntel or OpenRouter</li>
              <li>raw model speed or a provider’s list invoice for this prompt</li>
              <li>that list price equals billed cost for this run</li>
            </ul>
          </section>

          <BackToMainCTA
            title="Run a comparison"
            description="Compare models side-by-side. After at least two succeed, open Verdict for your pick, a public rating snapshot, and this-run cost and response time."
            primaryButtonText="Start Comparing AI Models"
          />
        </article>
      </div>
    </div>
  )
}
