/**
 * How It Works Page Component
 * SEO-optimized guide explaining how to use CompareIntel
 */

import React from 'react'
import { Link } from 'react-router-dom'

import { BackToMainCTA } from '../shared'
import './Pages.css'

export const HowItWorks: React.FC = () => {
  return (
    <div className="seo-page">
      <div className="seo-page-container">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span className="breadcrumb-separator">/</span>
          <span aria-current="page">How It Works</span>
        </nav>

        <article className="seo-page-content">
          <header className="seo-page-header">
            <h1>How CompareIntel Works</h1>
            <p className="seo-page-intro">
              Learn how to access and compare cutting-edge AI models side-by-side to find the best
              AI for your needs in just a few simple steps.
            </p>
          </header>

          <section className="seo-section">
            <h2>Getting Started with AI Model Comparison</h2>
            <p>
              CompareIntel makes it easy to compare AI models with a single prompt. Whether you're
              evaluating OpenAI's models against Claude, testing Gemini, or exploring alternatives
              like Llama, the platform streamlines the process.
            </p>
          </section>

          <section className="seo-section steps-section">
            <h2>Step-by-Step Guide</h2>

            <div className="step-card">
              <div className="step-number">1</div>
              <div className="step-content">
                <h3>Get Started (Account Optional)</h3>
                <p>
                  Start right away without an account—a handful of models are available to try. For
                  more models and credits, sign up for a free account (no credit card required).
                  Free users receive twice the credits of unregistered users. After registering,
                  verify your email to unlock additional features. Paid tiers are coming soon.
                </p>
              </div>
            </div>

            <div className="step-card">
              <div className="step-number">2</div>
              <div className="step-content">
                <h3>Select Your AI Models</h3>
                <p>
                  Browse models from OpenAI, Anthropic, Google, Meta, Mistral, xAI, and more.
                  Unregistered and Free users can select up to 3 models; paid tiers allow more.
                  Model availability varies by tier. Premium models are coming soon for paid users.
                </p>
                <p>
                  <strong>Save your favorite combinations:</strong> Save a model selection with a
                  custom name for quick access later (2 for unregistered, 3 for free, more for
                  paid).
                  <strong>Set a default:</strong> Mark any selection as default to auto-load when
                  you return.
                </p>
              </div>
            </div>

            <div className="step-card">
              <div className="step-number">3</div>
              <div className="step-content">
                <h3>Enter Your Prompt</h3>
                <p>
                  Type your prompt or question in the input field. This is the same prompt that will
                  be sent to all selected AI models simultaneously. You can ask anything—from simple
                  questions to complex coding tasks or creative writing challenges.
                </p>
                <p>
                  <strong>Enable web search (optional):</strong> For current information (weather,
                  news, stocks), use the toggle (🌐) in the input area. Supported models will search
                  and cite sources. Hover over the info icon (ⓘ) next to a model name to see its
                  knowledge cutoff date.
                </p>
                <p>
                  <strong>Attach files (optional):</strong> Drag and drop or use the file picker.
                  Supported: PDF, Word, text, code. Contents persist across sessions for follow-ups.
                </p>
                <p>
                  <strong>Tips for effective prompts:</strong>
                </p>
                <ul>
                  <li>Be specific about what you want the AI to do</li>
                  <li>Include relevant context or constraints</li>
                  <li>Specify the format you'd like for the response</li>
                  <li>For code tasks, mention the programming language</li>
                  <li>
                    When using files, reference them in your prompt (e.g., "Summarize this document"
                    or "What are the key points in the attached file?")
                  </li>
                  <li>
                    For current information queries, enable web search to get real-time data from
                    the Internet
                  </li>
                </ul>
              </div>
            </div>

            <div className="step-card">
              <div className="step-number">4</div>
              <div className="step-content">
                <h3>Compare Responses in Real-Time</h3>
                <p>
                  Click the "Compare" button to send your prompt to all selected models at once.
                  CompareIntel's real-time streaming shows you each model's response as it's
                  generated—no waiting for all responses to complete.
                </p>
                <p>
                  Each response appears in its own card with the model name clearly labeled. You can
                  watch multiple responses stream simultaneously and see which models respond
                  faster.
                </p>
                <p>
                  <strong>Response features include:</strong>
                </p>
                <ul>
                  <li>Syntax-highlighted code blocks for programming responses</li>
                  <li>Beautiful LaTeX rendering for mathematical equations</li>
                  <li>Full Markdown formatting with headings, lists, and emphasis</li>
                  <li>Response time metrics to compare model speed</li>
                </ul>
              </div>
            </div>

            <div className="step-card">
              <div className="step-number">5</div>
              <div className="step-content">
                <h3>Continue Conversations</h3>
                <p>
                  Want to ask follow-up questions or dive deeper? You can continue the conversation
                  with all selected models. When you send a follow-up message, it goes to all models
                  in your comparison simultaneously. Each model maintains its own independent
                  conversation context (receiving only its own previous responses, not other models'
                  responses), allowing you to:
                </p>
                <ul>
                  <li>Ask follow-up questions that all models respond to simultaneously</li>
                  <li>Request modifications or improvements from each model</li>
                  <li>Test how well each model maintains context over multiple turns</li>
                  <li>Compare how different models handle follow-up questions</li>
                </ul>
                <p>
                  Your conversation history is saved, so you can return to previous sessions at any
                  time.
                </p>
                <p>
                  <strong>Want to continue with just one model?</strong> If you found a model that
                  gave a particularly good response and want to focus your conversation on just that
                  model, use the breakout feature described in Step 6 below.
                </p>
              </div>
            </div>

            <div className="step-card">
              <div className="step-number">6</div>
              <div className="step-content">
                <h3>Export Your Comparisons</h3>
                <p>
                  Click "Export" above your results to save as PDF, Markdown, HTML, or JSON. All
                  formats include the prompt, model responses, metadata, and statistics. The
                  filename is auto-generated from your prompt.
                </p>
              </div>
            </div>

            <div className="step-card">
              <div className="step-number">7</div>
              <div className="step-content">
                <h3>Break Out Individual Models</h3>
                <p>
                  Found a model that stands out? Click the breakout button (↗) on any response card
                  to start a separate conversation with just that model. Your comparison context
                  carries over, and the original comparison stays in your history. You can create
                  multiple breakouts from the same comparison. Available for all users.
                </p>
              </div>
            </div>
          </section>

          <section className="seo-section">
            <h2>Use Cases for AI Model Comparison</h2>

            <div className="use-case-grid">
              <div className="use-case-card">
                <h3>🖥️ Code Generation</h3>
                <p>
                  Compare how different AI models write code. Test them on algorithm implementation,
                  debugging tasks, or generating boilerplate code. See which models produce cleaner,
                  more efficient, or more correctly formatted code for your preferred programming
                  language.
                </p>
              </div>

              <div className="use-case-card">
                <h3>📝 Content Writing</h3>
                <p>
                  Evaluate AI models for blog posts, marketing copy, technical documentation, or
                  creative writing. Compare tone, style, accuracy, and creativity across different
                  models to find the best fit for your content needs.
                </p>
              </div>

              <div className="use-case-card">
                <h3>🔢 Mathematical Problems</h3>
                <p>
                  Test mathematical reasoning capabilities with equations, proofs, and word
                  problems. CompareIntel's LaTeX rendering displays mathematical notation
                  beautifully, making it easy to verify accuracy.
                </p>
              </div>

              <div className="use-case-card">
                <h3>🎓 Educational Content</h3>
                <p>
                  Find the best AI for explaining complex topics, creating study materials, or
                  answering student questions. Compare how well different models break down concepts
                  and adjust to different learning levels.
                </p>
              </div>

              <div className="use-case-card">
                <h3>📊 Data Analysis</h3>
                <p>
                  Compare AI models on data interpretation, statistical analysis, and generating
                  insights from information. See which models provide the most accurate and
                  actionable analysis.
                </p>
              </div>

              <div className="use-case-card">
                <h3>🌐 Translation & Languages</h3>
                <p>
                  Test multilingual capabilities by comparing translations, language understanding,
                  and content generation in different languages. Some models excel in specific
                  language pairs or regions.
                </p>
              </div>

              <div className="use-case-card">
                <h3>🔍 Real-Time Information</h3>
                <p>
                  Use web search to compare how different models gather and synthesize current
                  information from the Internet. Perfect for questions about recent news, weather,
                  stock prices, sports scores, or any time-sensitive data that requires up-to-date
                  information.
                </p>
              </div>
            </div>
          </section>

          <section className="seo-section">
            <h2>Understanding Your Results</h2>
            <p>
              When comparing AI model responses, consider these factors to determine which model
              best suits your needs:
            </p>
            <ul className="seo-list">
              <li>
                <strong>Accuracy:</strong> Does the response correctly answer your question or
                complete the task? Check facts, code correctness, and logical reasoning.
              </li>
              <li>
                <strong>Completeness:</strong> Does the model fully address all aspects of your
                prompt, or does it miss important details?
              </li>
              <li>
                <strong>Clarity:</strong> Is the response well-organized and easy to understand?
                Good formatting and structure matter.
              </li>
              <li>
                <strong>Speed:</strong> For time-sensitive applications, response time can be a
                deciding factor. Some models are significantly faster than others.
              </li>
              <li>
                <strong>Style:</strong> Different models have different "voices." Some are more
                conversational, others more formal or technical.
              </li>
              <li>
                <strong>Cost-effectiveness:</strong> Consider whether a less expensive model meets
                your needs just as well as a premium one.
              </li>
            </ul>
          </section>

          <section className="seo-section">
            <h2>Tips for Effective Comparisons</h2>
            <ol className="seo-list numbered">
              <li>
                <strong>Use realistic prompts:</strong> Test models with the actual types of tasks
                you need them for, not just simple examples.
              </li>
              <li>
                <strong>Try multiple prompts:</strong> A model that excels at one task may not be
                the best for another. Test a variety of scenarios.
              </li>
              <li>
                <strong>Consider edge cases:</strong> Test how models handle unusual inputs,
                ambiguous questions, or complex requirements.
              </li>
              <li>
                <strong>Evaluate follow-up quality:</strong> Use multi-turn conversations to see how
                well models maintain context and improve their responses.
              </li>
              <li>
                <strong>Compare similar model sizes:</strong> For fair comparisons, consider
                grouping models by capability tier (e.g., flagship vs. efficient models).
              </li>
            </ol>
          </section>

          <BackToMainCTA
            title="Ready to Put This Into Action?"
            description="Now that you know how CompareIntel works, it's time to try it yourself! Start comparing AI models in minutes and discover which one works best for your needs."
            primaryButtonText="Start Comparing AI Models"
          />
        </article>
      </div>
    </div>
  )
}
