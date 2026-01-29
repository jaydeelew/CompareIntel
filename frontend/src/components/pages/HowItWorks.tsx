/**
 * How It Works Page Component
 * SEO-optimized guide explaining how to use CompareIntel
 */

import React from 'react'
import { Link } from 'react-router-dom'
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
              CompareIntel gives you access to the newest and most capable AI models and makes it
              easy to compare them with a single prompt. We continuously add new models as they're
              released, so you're always working with cutting-edge technology. Whether you're
              evaluating OpenAI's models against Claude, testing Gemini's capabilities, or exploring
              open-source alternatives like Llama, our platform streamlines the comparison process.
            </p>
          </section>

          <section className="seo-section steps-section">
            <h2>Step-by-Step Guide</h2>

            <div className="step-card">
              <div className="step-number">1</div>
              <div className="step-content">
                <h3>Get Started (Account Optional)</h3>
                <p>
                  You can start using CompareIntel right away without an account! Unregistered users
                  can get familiar with the platform by accessing a handful of models. This is
                  perfect for trying out AI model comparison and seeing how it works.
                </p>
                <p>
                  For access to more models and additional credits, sign up for a free account using
                  your email address. Registration is quick and free—no credit card required. Free
                  registered users receive twice the credits of unregistered users, giving you
                  plenty of room to explore different AI models.
                </p>
                <p>
                  <strong>Paid tiers will be available soon</strong> that unlock all of the latest
                  and greatest premium AI models, giving you access to the most advanced
                  capabilities as soon as they're released.
                </p>
                <p>
                  After registering, you'll receive a verification email. Click the link to verify
                  your account and unlock additional features.
                </p>
              </div>
            </div>

            <div className="step-card">
              <div className="step-number">2</div>
              <div className="step-content">
                <h3>Select Your AI Models</h3>
                <p>
                  Browse our library of AI models from leading providers including OpenAI,
                  Anthropic, Google, Meta, Mistral, xAI, and more. Model availability varies by
                  subscription tier. We continuously add new models as they're released, so you're
                  always working with cutting-edge technology.
                </p>
                <p>
                  Anonymous (unregistered) and Free tier users have access to a curated selection of
                  high-quality models perfect for getting started with AI comparison. Free tier
                  users have access to all unregistered tier models plus additional mid-level
                  models, giving you a great selection to explore AI capabilities.
                </p>
                <p>
                  <strong>Premium models will be available to paid subscription users soon.</strong>{' '}
                  Paid subscriptions will unlock access to all premium models as soon as they're
                  released, ensuring you always have access to the most advanced AI capabilities.
                </p>

                <p>
                  Click on each model you want to include in your comparison. Unregistered and
                  Free-tier users can select up to 3 models at a time. Paid tiers will allow the
                  simultaneous selection and comparison of more models.
                </p>
                <p>
                  <strong>Save your favorite model combinations:</strong> Once you've selected your
                  models, you can save this combination with a custom name for quick access later.
                  Saved selections persist across sessions, so you can quickly load your preferred
                  model combinations without manually selecting them each time. Unregistered users
                  can save up to 2 selections, free accounts can save up to 3, and paid tiers offer
                  even more saved selections. This feature works great for different use cases—save
                  one selection for coding tasks, another for creative writing, and another for data
                  analysis.
                </p>
                <p>
                  <strong>Set a default selection:</strong> You can mark any saved selection as your
                  default by checking the default checkbox next to it. When you return to
                  CompareIntel, your default model selection will automatically be loaded, so your
                  preferred models are already selected and ready to use. This saves time by
                  eliminating the need to manually select your models each time you visit the site.
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
                  <strong>Enable web search (optional):</strong> If you're asking questions that
                  require current, real-time information—such as weather, news, stock prices, or
                  recent events—you can enable web search for supported models. Look for the web
                  search toggle button (🌐) in the input area. When enabled, models that support web
                  search will automatically search the Internet for current information and cite
                  their sources. This is perfect for time-sensitive queries that go beyond what's in
                  the model's training data. Note that web search is only available for models that
                  support this capability (indicated by a 🌐 icon next to the model name).
                </p>
                <p>
                  <strong>Finding model cutoff dates:</strong> To help determine if you need web
                  search, you can check each model's knowledge cutoff date by hovering over the info
                  icon (ⓘ) next to the model name in the model selection area. The cutoff date
                  indicates the latest date of information in the model's training data. If your
                  query requires information after this date, you should enable web search for
                  supported models to get current, up-to-date information.
                </p>
                <p>
                  <strong>Attach files (optional):</strong> You can attach documents, code files, or
                  text files to provide context for your comparison. Simply drag and drop files onto
                  the input area or use the file picker button. Supported formats include PDF, Word
                  documents (.docx), text files, code files, and more. You can attach multiple files
                  and mix them with your text in any order. The file contents will be automatically
                  extracted and included in your comparison, and they'll persist across conversation
                  sessions so you can ask follow-up questions about your documents later.
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
                  Once you've completed your comparison, CompareIntel makes it easy to save and
                  share your results. Click the "Export" button above your comparison results to
                  access multiple export options:
                </p>
                <ul>
                  <li>
                    <strong>PDF Export:</strong> Generate a professional PDF document with all model
                    responses, perfect for sharing, printing, or archiving. The PDF includes proper
                    formatting for code blocks, LaTeX equations, and markdown content.
                  </li>
                  <li>
                    <strong>Markdown Export:</strong> Export your comparison as a Markdown file
                    (.md) that preserves all formatting. Ideal for documentation, note-taking apps,
                    or version control systems. The export includes user and assistant message
                    indicators for easy reading.
                  </li>
                  <li>
                    <strong>HTML Export:</strong> Create a standalone HTML file that can be opened
                    in any browser or shared via email. Includes all styling and formatting for a
                    complete viewing experience without needing CompareIntel.
                  </li>
                  <li>
                    <strong>JSON Export:</strong> Export raw data in JSON format for developers or
                    API integration. Includes all conversation data, model metadata, and comparison
                    statistics in a structured format.
                  </li>
                </ul>
                <p>
                  All export formats include the original prompt, all model responses, model
                  metadata (name and provider), response statistics, and comparison metadata. The
                  filename is automatically generated from your prompt for easy identification.
                </p>
              </div>
            </div>

            <div className="step-card">
              <div className="step-number">7</div>
              <div className="step-content">
                <h3>Break Out Individual Models</h3>
                <p>
                  During a multi-model comparison, you might find that one model stands out and you
                  want to focus your conversation on just that model. CompareIntel's breakout
                  feature makes this easy:
                </p>
                <ul>
                  <li>
                    <strong>Look for the breakout button:</strong> In any multi-model comparison,
                    you'll see a breakout button (↗) in the top-right corner of each model's
                    response card.
                  </li>
                  <li>
                    <strong>Click to break out:</strong> Click the breakout button on the model you
                    want to continue with. This instantly creates a new, separate conversation with
                    just that model.
                  </li>
                  <li>
                    <strong>Seamless transition:</strong> The breakout conversation includes all
                    previous messages from the original comparison—both your prompts and that
                    model's responses—so you can continue seamlessly without losing any context.
                  </li>
                  <li>
                    <strong>Independent exploration:</strong> The breakout conversation is
                    completely separate from the original comparison. You can continue chatting with
                    the breakout model while the original multi-model comparison remains intact in
                    your history.
                  </li>
                  <li>
                    <strong>Multiple breakouts:</strong> You can create multiple breakout
                    conversations from the same comparison, even with the same model, allowing you
                    to explore different conversation paths independently.
                  </li>
                  <li>
                    <strong>Easy identification:</strong> Breakout conversations appear in your
                    history with a special badge (↗) so you can easily find and return to them.
                  </li>
                </ul>
                <p>
                  <strong>Example use case:</strong> You compare models from OpenAI, Anthropic, and
                  Google on a coding problem. One gives the best solution, so you break out with
                  that model to ask follow-up questions about optimization and edge cases.
                  Meanwhile, the original comparison stays in your history for reference.
                </p>
                <p>
                  <strong>Available for everyone:</strong> Breakout conversations work for both
                  registered users and unregistered users, so everyone can take advantage of this
                  feature.
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

          <section className="seo-section cta-section">
            <h2>Ready to Start Comparing?</h2>
            <p>
              Now that you know how CompareIntel works, it's time to put it into action. Create your
              free account and start comparing AI models in minutes. With daily credits and access
              to 65+ models, you have everything you need to find the perfect AI for your tasks.
              Plus, registered users get twice the credits of unregistered users.
            </p>
            <Link to="/" className="cta-button">
              Start Comparing Free
            </Link>
          </section>
        </article>
      </div>
    </div>
  )
}
