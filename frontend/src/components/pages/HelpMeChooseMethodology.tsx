/**
 * Help Me Choose Methodology Page
 *
 * Explains the reasoning, means, and sources used to rank, order, and
 * categorize models in the "Help me choose" dropdown.
 */

import React from 'react'
import { Link } from 'react-router-dom'

import { BackToMainCTA } from '../shared'
import './Pages.css'

export const HelpMeChooseMethodology: React.FC = () => {
  return (
    <div className="seo-page">
      <div className="seo-page-container">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span className="breadcrumb-separator">/</span>
          <span aria-current="page">Help Me Choose Methodology</span>
        </nav>

        <article className="seo-page-content">
          <header className="seo-page-header">
            <h1>Help Me Choose: Ranking Methodology</h1>
            <p className="seo-page-intro">
              This page explains how we rank, order, and categorize AI models in the "Help me
              choose" dropdown. We use only well-respected, publicly available benchmarks and
              user-ratings—never proprietary or unverifiable claims.
            </p>
            <p className="last-updated">Last updated: March 2026</p>
          </header>

          <section className="seo-section">
            <h2>Inclusion Criteria</h2>
            <p>
              A model appears in "Help me choose" only if it meets <strong>all</strong> of the
              following:
            </p>
            <ul className="seo-list">
              <li>
                <strong>Available on CompareIntel:</strong> The model must exist in our models
                registry and be available for comparison.
              </li>
              <li>
                <strong>Public benchmark or user-rating data:</strong> We require at least one of: a
                published benchmark score (e.g., SWE-Bench, MMLU-Pro), a public leaderboard ranking
                (e.g., LMSys Chatbot Arena), or verifiable pricing data (e.g., OpenRouter) for
                cost-effectiveness.
              </li>
              <li>
                <strong>Reputable source:</strong> Benchmarks must come from established,
                peer-reviewed or widely cited sources—not vendor self-reports alone.
              </li>
            </ul>
            <p>
              Models without publicly verifiable performance data (e.g., very new releases before
              benchmark publication) are <em>not</em> included until such data exists.
            </p>
          </section>

          <section className="seo-section">
            <h2>Evidence Sources by Category</h2>
            <p>
              Each category uses one or more primary sources. Hover over a model in "Help me choose"
              to see the specific evidence and source for that recommendation.
            </p>

            <table className="methodology-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Primary Sources</th>
                  <th>Key Metrics</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Best for coding</td>
                  <td>
                    <a
                      href="https://www.swebench.com/verified.html"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      SWE-Bench Verified
                    </a>
                    ,{' '}
                    <a
                      href="https://openlm.ai/swe-bench/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      OpenLM SWE-bench+
                    </a>
                    ,{' '}
                    <a href="https://lmarena.ai/" target="_blank" rel="noopener noreferrer">
                      LMSys Coding Arena
                    </a>
                  </td>
                  <td>% Resolved (500 human-verified GitHub issues)</td>
                </tr>
                <tr>
                  <td>Best for writing</td>
                  <td>
                    <a
                      href="https://kearai.com/leaderboard/creative-writing"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Creative Writing Arena
                    </a>
                    , Mazur Writing Score
                  </td>
                  <td>Human preference, voice consistency</td>
                </tr>
                <tr>
                  <td>Best for reasoning</td>
                  <td>
                    <a
                      href="https://awesomeagents.ai/leaderboards/mmlu-pro-leaderboard/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      MMLU-Pro
                    </a>
                    , Chain-of-thought evals,{' '}
                    <a
                      href="https://lmarena.ai/leaderboard"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      LMSys Chatbot Arena
                    </a>
                  </td>
                  <td>STEM accuracy, multi-step reasoning, Elo</td>
                </tr>
                <tr>
                  <td>Most cost-effective</td>
                  <td>
                    <a
                      href="https://openrouter.ai/docs/overview/models"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      OpenRouter pricing
                    </a>
                    , Artificial Analysis Quality Score
                  </td>
                  <td>$/1M tokens, quality-per-dollar</td>
                </tr>
                <tr>
                  <td>Fastest responses</td>
                  <td>
                    <a href="https://www.ailatency.com/" target="_blank" rel="noopener noreferrer">
                      AILatency
                    </a>
                    ,{' '}
                    <a
                      href="https://artificialanalysis.ai/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Artificial Analysis
                    </a>
                    , LMSys Chatbot Arena
                  </td>
                  <td>Time-to-first-token, throughput, Elo</td>
                </tr>
                <tr>
                  <td>Best for web search</td>
                  <td>Provider documentation</td>
                  <td>supports_web_search, citation quality</td>
                </tr>
                <tr>
                  <td>Best for multilingual</td>
                  <td>
                    Provider documentation,{' '}
                    <a href="https://lmarena.ai/" target="_blank" rel="noopener noreferrer">
                      LMSys Arena
                    </a>
                  </td>
                  <td>Language coverage, multilingual benchmarks</td>
                </tr>
                <tr>
                  <td>Best for long context</td>
                  <td>
                    <a
                      href="https://llmdb.com/benchmarks/mrcr-1m"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Michelangelo Long-Context 1M
                    </a>
                    , Provider documentation
                  </td>
                  <td>Context window size, MRCR score (0–100)</td>
                </tr>
                <tr>
                  <td>Best for legal</td>
                  <td>
                    <a
                      href="https://www.vals.ai/benchmarks/legal_bench-09-08-2025"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      LegalBench
                    </a>
                  </td>
                  <td>Legal reasoning accuracy, six task categories</td>
                </tr>
                <tr>
                  <td>Best for medical</td>
                  <td>
                    <a
                      href="https://www.vals.ai/benchmarks/medqa-08-12-2025"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      MedQA
                    </a>
                  </td>
                  <td>USMLE-style medical QA, clinical reasoning</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="seo-section">
            <h2>Ordering Within Categories</h2>
            <p>
              Within each category, models are ordered <strong>best-to-worst</strong> (top to
              bottom) based on the primary benchmark or metric for that category. For example:
            </p>
            <ul className="seo-list">
              <li>
                <strong>Coding:</strong> Ordered by SWE-Bench Verified % resolved (highest first).
              </li>
              <li>
                <strong>Reasoning:</strong> Ordered by MMLU-Pro score or LMSys Arena Elo.
              </li>
              <li>
                <strong>Cost-effective:</strong> Ordered by quality-per-dollar (best value first).
              </li>
              <li>
                <strong>Fast:</strong> Ordered by latency / time-to-first-token (fastest first).
              </li>
            </ul>
            <p>
              When multiple sources exist for a category, we use the most recent, widely cited
              leaderboard. Different evaluation frameworks (e.g., mini-SWE-agent vs OpenHands for
              SWE-Bench) may yield different scores; we cite the specific source in each model's
              tooltip.
            </p>
          </section>

          <section className="seo-section">
            <h2>Categorization</h2>
            <p>
              A model can appear in multiple categories if it ranks highly in each. For example,
              Claude Opus 4.6 appears in coding, writing, reasoning, and web search because it
              scores well on the relevant benchmarks for each. We do not limit models to a single
              category.
            </p>
            <p>
              Categories are chosen to reflect common use cases: coding, writing, reasoning,
              cost-effectiveness, speed, web-augmented search, multilingual, long context, legal,
              and medical. We avoid categories that lack robust public benchmarks.
            </p>
          </section>

          <section className="seo-section">
            <h2>Updating Recommendations</h2>
            <p>
              Benchmark leaderboards and pricing change over time. We update the "Help me choose"
              recommendations when:
            </p>
            <ul className="seo-list">
              <li>New models are added to CompareIntel and have published benchmark data</li>
              <li>Official leaderboards are updated (e.g., SWE-Bench Verified, LMSys Arena)</li>
              <li>Pricing or availability changes significantly</li>
            </ul>
            <p>
              If you notice a model that should be included based on public benchmarks, or if you
              find an error in our citations, please{' '}
              <a href="mailto:support@compareintel.com">contact us</a>.
            </p>
          </section>

          <BackToMainCTA
            title="Try Help Me Choose"
            description="Use the Help me choose dropdown on the main comparison page to get model recommendations by use case."
            primaryButtonText="Start Comparing AI Models"
          />
        </article>
      </div>
    </div>
  )
}
