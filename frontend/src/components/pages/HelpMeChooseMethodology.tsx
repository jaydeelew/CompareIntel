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
            <p>
              Why independent? Companies often report their own cherry-picked results. Benchmarks
              run by third parties use the same tasks for every model, so you can compare apples to
              apples. We link to each source so you can verify the numbers yourself.
            </p>
            <p className="last-updated">Last updated: April 2026</p>
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
                      href="https://labs.scale.com/leaderboard/swe_bench_pro_public"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      SWE-Bench Pro
                    </a>{' '}
                    (public split) — long-horizon software engineering tasks in real repositories; %
                    resolved (scores are lower than classic SWE-Bench Verified leaderboards)
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
                  <td>Best for math</td>
                  <td>
                    <a
                      href="https://llmdb.com/benchmarks/math"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      MATH
                    </a>
                    ,{' '}
                    <a
                      href="https://llmdb.com/benchmarks/gsm8k"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      GSM8K
                    </a>{' '}
                    — competition math and grade-school arithmetic
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
                  <td>Best for image generation</td>
                  <td>
                    <a
                      href="https://kearai.com/leaderboard/text-to-image"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Text-to-Image Arena
                    </a>{' '}
                    — human preference votes from creators
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
            <h2>What the Benchmarks Actually Test</h2>
            <p>Curious what these scores mean in practice? Here’s a quick overview:</p>
            <ul className="seo-list">
              <li>
                <strong>SWE-Bench Pro (coding)</strong> — Challenging, long-horizon software
                engineering: models work in full repositories and must produce patches that resolve
                realistic tasks (public split on the Scale Labs leaderboard). Percentages are not
                comparable to SWE-Bench Verified scores from other sites.
              </li>
              <li>
                <strong>Creative Writing Arena (writing)</strong> — Human raters compare model
                outputs head-to-head and assign Elo ratings, similar to chess rankings. Higher Elo =
                better style and consistency.
              </li>
              <li>
                <strong>MATH / GSM8K (math)</strong> — MATH: 12,500 competition mathematics problems
                requiring multi-step reasoning. GSM8K: 8,500 grade school math word problems. Both
                use a 0–100 scale; higher = better at mathematical problem-solving.
              </li>
              <li>
                <strong>MMLU-Pro (reasoning)</strong> — Expert-level multiple-choice questions
                across math, science, law, and more. Tests broad knowledge and logical reasoning.
              </li>
              <li>
                <strong>Long context (MRCR, LongBench)</strong> — “Needle in a haystack” style
                tests: can the model find and use specific information buried in documents up to 1M
                tokens?
              </li>
              <li>
                <strong>Best value</strong> — We only include models under $1 per million tokens
                (input + output average). Pricing changes frequently; we update regularly.
              </li>
              <li>
                <strong>Fastest responses</strong> — Measured in tokens per second. Higher = quicker
                replies. Useful when latency matters more than raw capability.
              </li>
              <li>
                <strong>Global-MMLU (multilingual)</strong> — Tests performance across 42 languages.
                Useful if you work in non-English contexts.
              </li>
              <li>
                <strong>LegalBench (legal)</strong> — 161 legal reasoning tasks: contract analysis,
                statutory interpretation, and more. Geared toward legal professionals.
              </li>
              <li>
                <strong>HealthBench (medical)</strong> — Physician-evaluated medical conversations.
                Scores come from published research; useful for healthcare-related use cases.
              </li>
            </ul>
          </section>

          <section className="seo-section">
            <h2>Limitations</h2>
            <p>
              Benchmarks are helpful, but they’re not perfect. They test specific skills under
              controlled conditions—your real-world tasks may differ. A model that excels at
              SWE-Bench Pro may still diverge from your codebase; a “best for writing” model might
              not match your preferred tone. Use these rankings as a starting point, then try the
              models yourself.
            </p>
            <p>
              Some categories have sparse benchmark coverage (e.g., long context, multilingual). We
              supplement automated data with published scores from model announcements when
              available.
            </p>
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
