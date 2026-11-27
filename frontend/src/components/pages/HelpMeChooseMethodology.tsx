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
            <p className="last-updated">Last updated: November 2026</p>
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

          <section className="seo-section" id="how-each-category-is-measured">
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
                    Percentile within each board.{' '}
                    <a
                      href="https://arena.ai/leaderboard/code"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      LMArena Code Arena
                    </a>{' '}
                    (human preference on web-development tasks) is primary. Models missing there use{' '}
                    <a
                      href="https://labs.scale.com/leaderboard/swe_bench_pro_public"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      SWE-Bench Pro public
                    </a>
                    . The tooltip names the board and the raw score.
                  </td>
                </tr>
                <tr>
                  <td>Best for writing</td>
                  <td>
                    <a
                      href="https://arena.ai/leaderboard/text/creative-writing"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      LMArena Creative Writing
                    </a>{' '}
                    — style-controlled Arena Score from human preference on writing prompts
                  </td>
                </tr>
                <tr>
                  <td>Best for math</td>
                  <td>
                    <a
                      href="https://arena.ai/leaderboard/text/math"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      LMArena math prompts
                    </a>{' '}
                    — style-controlled Arena Score. Human preference on math prompts, not a contest
                    exam.
                  </td>
                </tr>
                <tr>
                  <td>Best for reasoning</td>
                  <td>
                    <a
                      href="https://arena.ai/leaderboard/text/hard-prompts"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      LMArena hard prompts
                    </a>{' '}
                    — style-controlled Arena Score from human preference on harder prompts
                  </td>
                </tr>
                <tr>
                  <td>Best for long context</td>
                  <td>
                    Percentile within each board.{' '}
                    <a
                      href="https://arena.ai/leaderboard/document"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      LMArena Document Arena
                    </a>{' '}
                    is primary. Models missing from that snapshot are filled from the{' '}
                    <a
                      href="https://arena.ai/leaderboard/text/longer-query"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      longer-query
                    </a>{' '}
                    category. These are human preference scores, not a 1M-token recall exam.
                  </td>
                </tr>
                <tr>
                  <td>Best value</td>
                  <td>
                    Published list prices (prompt + completion per million tokens) — current
                    pricing; only models under $1 per million tokens
                  </td>
                </tr>
                <tr>
                  <td>Fastest responses</td>
                  <td>
                    <a
                      href="https://lmspeed.net/leaderboard/model-speed"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      LMSpeed
                    </a>{' '}
                    — output tokens per second. Speed varies by provider and load.
                  </td>
                </tr>
                <tr>
                  <td>Best for multilingual</td>
                  <td>
                    <a
                      href="https://arena.ai/leaderboard/text"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      LMArena non-English
                    </a>{' '}
                    — style-controlled Arena Score on non-English prompts
                  </td>
                </tr>
                <tr>
                  <td>Best for legal</td>
                  <td>
                    Percentile within each board.{' '}
                    <a
                      href="https://www.vals.ai/benchmarks/legal_bench"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      VALS LegalBench
                    </a>{' '}
                    (legal tasks) is primary. Models missing there are filled from{' '}
                    <a
                      href="https://arena.ai/leaderboard/text"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      LMArena legal and government prompts
                    </a>
                    . The tooltip names the board and the raw score.
                  </td>
                </tr>
                <tr>
                  <td>Best for vision</td>
                  <td>
                    <a
                      href="https://lmarena.ai/leaderboard/vision"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Vision Arena (LMArena)
                    </a>{' '}
                    — human preference votes on image+text prompts; Arena Score (higher = better)
                  </td>
                </tr>
                <tr>
                  <td>Best for image generation</td>
                  <td>
                    <a
                      href="https://lmarena.ai/leaderboard/text-to-image"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      LMArena Text-to-Image Arena
                    </a>{' '}
                    — human preference Arena Score
                  </td>
                </tr>
                <tr>
                  <td>Best for medical</td>
                  <td>
                    <a
                      href="https://arena.ai/leaderboard/text"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      LMArena medicine and healthcare prompts
                    </a>{' '}
                    — human preference Arena Score. This is not a physician-graded exam.
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
                <strong>Code Arena (coding)</strong> — People compare model-built web apps
                head-to-head. The Arena Score is a human-preference rating, not a count of solved
                GitHub issues. Models the Code Arena does not list yet fall back to SWE-Bench Pro
                public (percent of repository tasks resolved). Those two numbers are ranked as
                percentiles within their own boards, so a 50% SWE-Bench result is not sorted against
                an Arena Score of 1800.
              </li>
              <li>
                <strong>Creative Writing, math, hard prompts, non-English (LMArena text)</strong> —
                Style-controlled human preference on that kind of prompt. Higher Arena Score is
                better. Math here is preference on math prompts, not a scored contest exam.
              </li>
              <li>
                <strong>Document Arena and longer queries (long context)</strong> — Human preference
                on document and longer-prompt tasks. This is not a 1-million-token recall exam. The
                Document Arena is the primary board; newer models missing from its latest snapshot
                are filled from the longer-query board, again as a percentile within that board.
              </li>
              <li>
                <strong>Best value</strong> — We only include models under $1 per million tokens
                (input + output average). Pricing changes frequently; we update regularly.
              </li>
              <li>
                <strong>Fastest responses</strong> — Output tokens per second from the public
                LMSpeed board. Higher means quicker replies. The number moves with provider and
                load.
              </li>
              <li>
                <strong>LegalBench (legal)</strong> — A public legal-task exam from VALS. Models it
                does not list yet are filled from LMArena legal and government prompts. The tooltip
                says which board the row came from.
              </li>
              <li>
                <strong>Vision Arena and Text-to-Image Arena</strong> — Human preference on
                image-and-text prompts, and on generated images. Higher Arena Score is better.
              </li>
              <li>
                <strong>Medicine and healthcare prompts</strong> — Human preference on medical
                prompts from LMArena. This is not a physician-graded HealthBench score. OpenAI does
                not publish a machine-readable HealthBench leaderboard we can fetch.
              </li>
            </ul>
          </section>

          <section className="seo-section">
            <h2>Limitations</h2>
            <p>
              Benchmarks are helpful, but they’re not perfect. They test specific skills under
              controlled conditions—your real-world tasks may differ. A model people prefer on Code
              Arena may still diverge from your codebase; a “best for writing” model might not match
              your preferred tone. Use these rankings as a starting point, then try the models
              yourself.
            </p>
            <p>
              Arena Scores are published human-preference ratings from LMArena. They are not
              CompareIntel user votes, and they are not exam percents. Where two boards are
              combined, each model is ranked by its percentile on the board that supplied its score.
              A model with no public row is left out rather than given an estimated score.
            </p>
          </section>

          <section className="seo-section">
            <h2>How We Order Models</h2>
            <p>
              Within each category, models are ranked by the number in the tooltip (highest first).
              Coding, legal, and long context use a percentile within one board, so scores from
              different benchmarks are not compared directly. For cost, lower is better; for speed,
              higher is better.
            </p>
          </section>

          <section className="seo-section">
            <h2>Cold-Start Methodology: How We Bootstrap Rankings</h2>
            <p>
              CompareIntel is building toward a ranking system based on real user votes from blind
              side-by-side comparisons. Until we have enough user data, we seed the rankings with
              clearly labeled public benchmark data from trusted third parties.
            </p>
            <h3>Current Data Sources (Live)</h3>
            <p>
              All rankings today come from <strong>public benchmarks</strong>—independent
              evaluations conducted by research labs, universities, and benchmark organizations.
              Each model in "Help me choose" shows its source and score when you hover over it. The
              twelve categories and their sources are documented in this repository's{' '}
              <code>research_model_benchmarks.py</code> and{' '}
              <code>helpMeChooseRecommendations.ts</code> files.
            </p>
            <h3>Planned Data Sources (Not Yet Live)</h3>
            <p>We are developing two additional data sources:</p>
            <ul className="seo-list">
              <li>
                <strong>CompareIntel's own fixed-prompt evaluations (planned):</strong> We plan to
                run standardized evaluations using model-judged scoring. When we do, we will
                disclose the judge model and clearly label these results as CompareIntel
                evaluations—never as user votes.
              </li>
              <li>
                <strong>User votes from blind side-by-side comparisons (planned):</strong> We plan
                to show you two model outputs side-by-side (without revealing which model produced
                each) and ask you to pick the better one. Vote-based rankings will only be shown
                once a model has received at least 200 votes against at least 5 different opponent
                models. This threshold ensures statistical reliability. Models that don't meet the
                threshold will continue to show benchmark-based rankings until enough votes are
                collected.
              </li>
            </ul>
            <h3>Labeling and Transparency</h3>
            <p>
              Every ranking will be labeled by its source type: <strong>Public benchmark</strong>,{' '}
              <strong>CompareIntel evaluation</strong>, or <strong>User votes</strong>. We will
              never present model-judged or synthetic results as user votes. When we transition a
              category from benchmark data to user votes, we will update this page and show vote
              counts alongside rankings so you can see what's behind each number.
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
