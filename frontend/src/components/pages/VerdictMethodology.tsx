/**
 * Verdict methodology page
 *
 * Explains the post-comparison Verdict panel: agreement heuristic, cost
 * source, what latency means, and what the panel does and does not claim.
 */

import React from 'react'
import { Link } from 'react-router-dom'

import { AGREEMENT_HEURISTIC_NOTE } from '../../utils/verdictAgreement'
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
              After a comparison finishes, Verdict summarizes this run on CompareIntel. It does not
              pick a winner, score answer quality, or rank models in general.
            </p>
            <p className="last-updated">Last updated: November 2026</p>
          </header>

          <section className="seo-section">
            <h2>What Verdict is</h2>
            <p>
              Verdict is a compact panel above the result cards. It uses data this comparison
              already produced: replies on the page, OpenRouter usage when the provider sent it, and
              client timestamps. There is no extra model call and no paid judge.
            </p>
          </section>

          <section className="seo-section" id="agreement">
            <h2>Agreement</h2>
            <p>
              Agreement is a local heuristic. It compares successful replies with token overlap
              (Jaccard similarity on normalized words) and, when replies look like short or numeric
              answers, an exact match on the extracted final answer.
            </p>
            <ul className="seo-list">
              <li>
                <strong>Agree</strong> — extracted answers match, or overlap is high
              </li>
              <li>
                <strong>Partly agree</strong> — moderate overlap without extractable answers
              </li>
              <li>
                <strong>Conflict</strong> — extracted answers differ, or overlap is low
              </li>
              <li>
                <strong>Needs 2+ models</strong> — fewer than two successful replies (one model, or
                the rest failed)
              </li>
            </ul>
            <p>{AGREEMENT_HEURISTIC_NOTE} It never claims which answer is right.</p>
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
              <li>this-run cost as OpenRouter reported it</li>
              <li>this-run response time through CompareIntel and OpenRouter</li>
              <li>whether replies look similar under a simple local heuristic</li>
              <li>a related Help Me Choose category from prompt keywords</li>
            </ul>
            <p>It does not claim:</p>
            <ul className="seo-list">
              <li>which answer is correct, better, or safer</li>
              <li>a ranking of models independent of CompareIntel or OpenRouter</li>
              <li>raw model speed or a provider’s list invoice for this prompt</li>
              <li>that list price equals billed cost for this run</li>
            </ul>
          </section>

          <BackToMainCTA
            title="Run a comparison"
            description="Compare models side-by-side. After they finish, open Verdict for this-run cost, response time, and agreement — then read the answers yourself."
            primaryButtonText="Start Comparing AI Models"
          />
        </article>
      </div>
    </div>
  )
}
