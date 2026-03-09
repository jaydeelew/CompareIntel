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
              choose" dropdown. We include only models with numeric benchmark scores from
              well-respected, publicly available sources—never proprietary or unverifiable claims.
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
                <strong>Numeric benchmark score:</strong> We require a published numeric score from
                a public benchmark (e.g., SWE-Bench %, MMLU-Pro %, Mazur Writing Score, MRCR).
                Models without numeric benchmark evidence are not included.
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
                    ,{' '}
                    <a
                      href="https://lmarena.ai/leaderboard"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      LMSys Chatbot Arena
                    </a>
                  </td>
                  <td>STEM accuracy, multi-step reasoning</td>
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
                  <td>Average cost per 1M tokens (prompt + completion). Lower = better value.</td>
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
                  <td>Throughput (tokens/second). Higher = faster streaming.</td>
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
                  <td>Multilingual evaluation across 42 languages (0–100).</td>
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
                  <td>Accuracy across 161 legal reasoning tasks</td>
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
                  <td>Physician-evaluated clinical conversations</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="seo-section">
            <h2>Ordering Within Categories</h2>
            <p>
              Within each category, models are ordered <strong>best-to-worst</strong> (top to
              bottom) based on the primary benchmark or metric for that category.
            </p>
            <ul className="seo-list">
              <li>
                <strong>Coding:</strong> Ordered by SWE-Bench Verified % resolved (highest first).
              </li>
              <li>
                <strong>Writing:</strong> Ordered by Mazur Writing Score or Creative Writing Arena
                Elo (highest first).
              </li>
              <li>
                <strong>Reasoning:</strong> Ordered by MMLU-Pro score (highest first).
              </li>
              <li>
                <strong>Long context:</strong> Ordered by MRCR score (highest first).
              </li>
              <li>
                <strong>Best value:</strong> Ordered by OpenRouter cost per 1M tokens (lowest
                first).
              </li>
              <li>
                <strong>Fastest responses:</strong> Ordered by LMSpeed throughput, tokens/second
                (highest first).
              </li>
              <li>
                <strong>Multilingual:</strong> Ordered by Global-MMLU score (highest first).
              </li>
              <li>
                <strong>Legal:</strong> Ordered by LegalBench accuracy (highest first).
              </li>
              <li>
                <strong>Medical:</strong> Ordered by HealthBench score (highest first).
              </li>
            </ul>
            <p>
              Only models with numeric benchmark scores are included. We do not add models without
              verifiable benchmark data.
            </p>
          </section>

          <section className="seo-section">
            <h2>Categorization</h2>
            <p>
              A model can appear in multiple categories if it has benchmark scores for each. For
              example, Claude Opus 4.6 appears in coding, writing, and reasoning because it has
              numeric scores on SWE-Bench, Mazur Writing Score, and MMLU-Pro. We do not limit models
              to a single category.
            </p>
            <p>
              We include only categories with reliable, publicly available benchmark sources: coding
              (SWE-Bench), writing (Creative Writing Arena), reasoning (MMLU-Pro), long context
              (Michelangelo MRCR), cost-effective (OpenRouter pricing), fast (LMSpeed), multilingual
              (Global-MMLU), legal (LegalBench), and medical (HealthBench). Categories without
              robust numeric benchmarks are not included.
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
