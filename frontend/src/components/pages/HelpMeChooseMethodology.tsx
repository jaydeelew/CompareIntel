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
            <h1>Help Me Choose: How We Rank Models</h1>
            <p className="seo-page-intro">
              We only recommend models that have been tested by independent benchmarks—not by the
              companies that make them. A benchmark is a standard test (like an exam) that gives us
              comparable scores so we can rank models fairly.
            </p>
            <p className="last-updated">Last updated: March 2026</p>
          </header>

          <section className="seo-section">
            <h2>Which Models Are Included?</h2>
            <p>
              A model appears only if it is on our platform and has a published score from an
              independent source.
            </p>
            <p>
              New models often don't appear until benchmarks have been run. For the full model list,
              use the main comparison page.
            </p>
          </section>

          <section className="seo-section">
            <h2>How Each Category Is Measured</h2>
            <p>Hover over any model in "Help me choose" to see its score and source.</p>

            <table className="methodology-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>How we measure it</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Best for coding</td>
                  <td>
                    <a
                      href="https://openlm.ai/swe-bench/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      SWE-Bench
                    </a>{' '}
                    — real coding tasks solved correctly
                  </td>
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
                    </a>{' '}
                    — human ratings for style and consistency
                  </td>
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
                    </a>{' '}
                    — expert-level questions (math, science, logic)
                  </td>
                </tr>
                <tr>
                  <td>Best for long context</td>
                  <td>
                    <a
                      href="https://llmdb.com/benchmarks/mrcr-1m"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      MRCR
                    </a>
                    ,{' '}
                    <a
                      href="https://awesomeagents.ai/leaderboards/long-context-benchmarks-leaderboard/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Awesome Agents
                    </a>
                    ,{' '}
                    <a
                      href="https://longbench2.github.io/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      LongBench v2
                    </a>{' '}
                    — how well the model finds and uses information in long documents
                  </td>
                </tr>
                <tr>
                  <td>Best value</td>
                  <td>
                    <a
                      href="https://openrouter.ai/models"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      OpenRouter
                    </a>{' '}
                    — current pricing; only models under $1 per million tokens
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
                    </a>{' '}
                    — response speed
                  </td>
                </tr>
                <tr>
                  <td>Best for multilingual</td>
                  <td>
                    <a
                      href="https://llmdb.com/benchmarks/global-mmlu"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Global-MMLU
                    </a>{' '}
                    — performance across 42 languages
                  </td>
                </tr>
                <tr>
                  <td>Best for legal</td>
                  <td>
                    <a
                      href="https://www.vals.ai/benchmarks/legal_bench"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      LegalBench
                    </a>{' '}
                    — 161 legal reasoning tasks
                  </td>
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
                    </a>{' '}
                    — doctor-evaluated medical conversations
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="seo-section">
            <h2>How We Order Models</h2>
            <p>
              Within each category, models are ranked by score (highest first). Every model listed
              is strong—we rank them to help you choose. For cost, lower is better; for speed,
              higher is better.
            </p>
          </section>

          <section className="seo-section">
            <h2>Multiple Categories</h2>
            <p>
              A model can appear in multiple categories if it scores well in each. A strong model
              might rank for coding, writing, and reasoning.
            </p>
          </section>

          <section className="seo-section">
            <h2>When We Update</h2>
            <p>
              We update when new benchmarks or pricing data are published. See an error or missing
              model? <a href="mailto:support@compareintel.com">Contact us</a>.
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
