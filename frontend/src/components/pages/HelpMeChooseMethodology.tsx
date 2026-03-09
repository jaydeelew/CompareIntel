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
              This page explains how we rank and recommend AI models in the "Help me choose"
              dropdown. In short: we only include models that have been tested and scored by
              independent, publicly available benchmarks—not claims from the companies that make the
              models.
            </p>
            <p>
              <strong>What is a benchmark?</strong> A benchmark is a standardized test that measures
              how well an AI model performs on specific tasks (e.g., writing code, answering
              exam-style questions). Benchmarks give us comparable numbers so we can rank models
              fairly.
            </p>
            <p className="last-updated">Last updated: March 2026</p>
          </header>

          <section className="seo-section">
            <h2>Which Models Are Included?</h2>
            <p>
              A model appears in "Help me choose" only if it meets <strong>all</strong> of the
              following:
            </p>
            <ul className="seo-list">
              <li>
                <strong>Available on CompareIntel:</strong> The model is on our platform and you can
                compare it with others.
              </li>
              <li>
                <strong>Published test score:</strong> We require a numeric score from a public
                benchmark (e.g., SWE-Bench for coding, MMLU-Pro for reasoning). Models without
                verifiable scores are not included.
              </li>
              <li>
                <strong>Trustworthy source:</strong> Scores must come from established, independent
                sources—not the model maker's own claims.
              </li>
            </ul>
            <p>
              Very new models often don't appear until independent benchmarks have been run and
              published. For the full list of models, including the latest releases, use the Select
              Models to Compare section on the main page.
            </p>
          </section>

          <section className="seo-section">
            <h2>Evidence Sources by Category</h2>
            <p>
              Each category uses one or more primary sources. Hover over (or tap the info icon next
              to) a model in "Help me choose" to see the specific evidence and source for that
              recommendation.
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
                  <td>% of real coding tasks solved correctly</td>
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
                  <td>Human ratings for style and consistency</td>
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
                    ,{' '}
                    <a
                      href="https://lmarena.ai/leaderboard"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      LMSys Chatbot Arena
                    </a>
                  </td>
                  <td>Accuracy on expert-level questions (math, science, logic)</td>
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
                  <td>How well the model handles long documents (0–100 score)</td>
                </tr>
                <tr>
                  <td>Best value (cost-effective)</td>
                  <td>
                    <a
                      href="https://openrouter.ai/models"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      OpenRouter pricing
                    </a>
                  </td>
                  <td>
                    Average cost per million tokens. Only models under $1/1M are included. Lower =
                    better value.
                  </td>
                </tr>
                <tr>
                  <td>Fastest responses</td>
                  <td>
                    <a
                      href="https://lmspeed.net/leaderboard/best-throughput-models-weekly"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      LMSpeed
                    </a>
                    , API benchmarks
                  </td>
                  <td>Speed of response (tokens per second). Higher = faster.</td>
                </tr>
                <tr>
                  <td>Best for multilingual</td>
                  <td>
                    <a
                      href="https://llmdb.com/benchmarks/global-mmlu"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Global-MMLU (llmdb.com)
                    </a>
                  </td>
                  <td>Performance across 42 languages (0–100 score).</td>
                </tr>
                <tr>
                  <td>Best for legal</td>
                  <td>
                    <a
                      href="https://www.vals.ai/benchmarks/legal_bench-01-30-2025"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      LegalBench (VALS.ai)
                    </a>
                  </td>
                  <td>Accuracy on 161 legal reasoning tasks</td>
                </tr>
                <tr>
                  <td>Best for medical</td>
                  <td>
                    <a
                      href="https://openai.com/index/healthbench"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      HealthBench
                    </a>
                    , HealthBench Hard
                  </td>
                  <td>Doctor-evaluated medical conversations</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="seo-section">
            <h2>How We Order Models</h2>
            <p>
              Within each category, models are ordered by benchmark score (highest first). Every
              model listed is strong in its category—we rank them to help you choose, not to imply
              any are lacking. Higher scores rank higher, except for cost (where lower cost = better
              value) and speed (where higher throughput = faster).
            </p>
          </section>

          <section className="seo-section">
            <h2>Multiple Categories</h2>
            <p>
              A model can appear in multiple categories if it has benchmark scores for each. For
              example, a strong model might rank well for coding, writing, and reasoning. We don't
              limit models to a single category.
            </p>
          </section>

          <section className="seo-section">
            <h2>When We Update</h2>
            <p>
              We update recommendations when new benchmarks are published, leaderboards change, or
              pricing shifts. If you notice a model that should be included based on public data, or
              if you spot an error in our citations, please{' '}
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
