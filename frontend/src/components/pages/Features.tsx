/**
 * Features Page Component
 * SEO-optimized page detailing CompareIntel's capabilities
 */

import React from 'react'
import { Link } from 'react-router-dom'

import { BackToMainCTA } from '../shared'
import './Pages.css'

export const Features: React.FC = () => {
  return (
    <div className="seo-page">
      <div className="seo-page-container">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span className="breadcrumb-separator">/</span>
          <span aria-current="page">Features</span>
        </nav>

        <article className="seo-page-content">
          <header className="seo-page-header">
            <h1>CompareIntel Features</h1>
            <p className="seo-page-intro">
              Discover the powerful features that make CompareIntel the go-to platform for accessing
              and comparing cutting-edge AI models.
            </p>
          </header>

          <section className="seo-section">
            <h2>Always the Latest AI Models</h2>
            <p>
              CompareIntel is committed to providing access to the newest and most capable AI models
              as soon as they become available. We continuously update our platform when AI
              providers release new models, ensuring you're always working with cutting-edge
              technology. Our library includes models from major providers:
            </p>

            <div className="model-providers">
              <div className="provider-card">
                <h3>OpenAI</h3>
                <p>
                  Compare responses from OpenAI's latest GPT and reasoning models, known for their
                  strong general-purpose capabilities and creative outputs.
                </p>
              </div>

              <div className="provider-card">
                <h3>Anthropic</h3>
                <p>
                  Test Claude models, renowned for their helpfulness, harmlessness, and strong
                  performance on complex reasoning tasks.
                </p>
              </div>

              <div className="provider-card">
                <h3>Google</h3>
                <p>
                  Evaluate Google's Gemini family of models, featuring strong multimodal
                  capabilities and advanced reasoning.
                </p>
              </div>

              <div className="provider-card">
                <h3>Meta & Open Source</h3>
                <p>
                  Access Meta's Llama models and other leading open-source alternatives that offer
                  transparency and customization options.
                </p>
              </div>
            </div>
          </section>

          <section className="seo-section">
            <h2>Real-Time Side-by-Side Comparison</h2>
            <p>
              Our real-time comparison feature is at the heart of CompareIntel. Here's what makes it
              powerful:
            </p>
            <ul className="seo-list">
              <li>
                <strong>Simultaneous Queries:</strong> Send your prompt to multiple AI models at
                once. No need to copy-paste between different platforms or wait for one response
                before starting another.
              </li>
              <li>
                <strong>Streaming Responses:</strong> Watch responses appear in real-time as each
                model generates its answer. You'll see exactly how fast each model responds and can
                compare as responses unfold.
              </li>
              <li>
                <strong>Side-by-Side Layout:</strong> Results are displayed in a clean, organized
                grid that makes it easy to compare responses from different models at a glance.
              </li>
              <li>
                <strong>Response Metrics:</strong> Track response time and token usage for each
                model to understand performance characteristics.
              </li>
              <li>
                <strong>Scroll Lock Feature:</strong> When comparing multiple models, enable scroll
                lock to synchronize scrolling across all model result panels. This allows you to
                scroll through all responses simultaneously, making it easier to compare responses
                side-by-side as you read through longer outputs.
              </li>
            </ul>
          </section>

          <section className="seo-section">
            <h2>Advanced Rendering Capabilities</h2>
            <p>
              CompareIntel doesn't just show raw text—we render AI responses beautifully with full
              support for rich formatting:
            </p>

            <div className="feature-detail">
              <h3>LaTeX Mathematical Equations</h3>
              <p>
                Mathematical content is rendered using professional-quality LaTeX formatting.
                Whether you're testing AI models on calculus problems, statistical analysis, or
                complex physics equations, you'll see beautifully formatted mathematical notation
                just like you would in academic papers.
              </p>
              <p>
                Supports both inline equations and display-mode block equations, making it perfect
                for comparing AI performance on STEM-related tasks.
              </p>
            </div>

            <div className="feature-detail">
              <h3>Syntax-Highlighted Code</h3>
              <p>
                Code blocks are rendered with syntax highlighting for over 100 programming
                languages. Compare code generation capabilities across models with proper formatting
                for Python, JavaScript, TypeScript, Java, C++, Rust, Go, and many more.
              </p>
              <p>
                Our syntax highlighting makes it easy to read and compare generated code, helping
                you evaluate code quality, style, and correctness at a glance.
              </p>
            </div>

            <div className="feature-detail">
              <h3>Markdown Formatting</h3>
              <p>
                Full Markdown support means AI responses are displayed with proper headings, lists,
                bold and italic text, links, tables, and more. This ensures you see responses
                exactly as the AI intended them to be read.
              </p>
            </div>
          </section>

          <section className="seo-section">
            <h2>Saved Model Selections</h2>
            <p>
              Save time by storing your favorite model combinations for quick access. CompareIntel's
              saved selections feature lets you create named groups of models that you use
              frequently:
            </p>
            <ul className="seo-list">
              <li>
                <strong>Save Any Combination:</strong> After selecting your models, save the
                combination with a custom name (up to 50 characters). Perfect for organizing
                selections by use case like "Coding Models", "Creative Writing", or "Data Analysis".
              </li>
              <li>
                <strong>Quick Loading:</strong> Load any saved selection with a single click to
                instantly restore your preferred model combination without manually selecting each
                model again.
              </li>
              <li>
                <strong>Manage Your Selections:</strong> Rename or delete saved selections as your
                needs change. Each selection shows how many models it contains and when it was last
                updated.
              </li>
              <li>
                <strong>Tier-Based Limits:</strong> The number of saved selections you can store
                depends on your account tier. Unregistered users can save up to 2 selections, free
                accounts get 3, and paid tiers offer even more (up to 20 for Pro+ users).
              </li>
              <li>
                <strong>Persistent Storage:</strong> Your saved selections are stored locally in
                your browser and persist across sessions. Registered users' selections are tied to
                their account, while unregistered users' selections are preserved using a persistent
                unregistered ID.
              </li>
              <li>
                <strong>Set a Default Selection:</strong> You can mark any saved selection as your
                default. When you return to CompareIntel, your default model selection will
                automatically be loaded, so your preferred models are already selected and ready to
                use. This saves time by eliminating the need to manually select your models each
                time you visit the site. Simply check the default checkbox next to any saved
                selection to make it your default.
              </li>
            </ul>
          </section>

          <section className="seo-section">
            <h2>Multi-Turn Conversation Support</h2>
            <p>
              Real-world AI interactions often involve back-and-forth conversations. CompareIntel
              supports full multi-turn conversations:
            </p>
            <ul className="seo-list">
              <li>
                <strong>Context Retention:</strong> Each model maintains its own conversation
                history (seeing only its own previous responses), allowing you to ask follow-up
                questions and build on previous interactions.
              </li>
              <li>
                <strong>Follow-up Comparisons:</strong> Send follow-up questions to all selected
                models simultaneously to compare how each model handles context and maintains
                conversation continuity.
              </li>
              <li>
                <strong>Conversation History:</strong> Review your conversation history and return
                to previous sessions.
              </li>
            </ul>
          </section>

          <section className="seo-section">
            <h2>Breakout Conversations</h2>
            <p>
              Sometimes during a multi-model comparison, you'll find that one model stands out and
              you want to continue the conversation with just that model. CompareIntel's breakout
              feature lets you seamlessly transition from a multi-model comparison to a focused
              one-on-one conversation:
            </p>
            <ul className="seo-list">
              <li>
                <strong>One-Click Breakout:</strong> Click the breakout button (↗) on any model's
                response card during a multi-model comparison to instantly create a separate
                conversation with just that model.
              </li>
              <li>
                <strong>Preserved History:</strong> The breakout conversation includes all previous
                messages from the original comparison—both your prompts and that model's
                responses—so you can continue seamlessly without losing context.
              </li>
              <li>
                <strong>Independent Conversations:</strong> Breakout conversations are completely
                separate from the original comparison. You can continue chatting with the breakout
                model while the original multi-model comparison remains intact in your history.
              </li>
              <li>
                <strong>Multiple Breakouts:</strong> You can create multiple breakout conversations
                from the same comparison, even with the same model, allowing you to explore
                different conversation paths independently.
              </li>
              <li>
                <strong>Works for Everyone:</strong> Breakout conversations work for both registered
                users and unregistered users, so everyone can take advantage of this powerful
                feature.
              </li>
              <li>
                <strong>Easy Access:</strong> All your breakout conversations appear in your
                conversation history with a special badge (↗) so you can easily identify and return
                to them later.
              </li>
            </ul>
            <p>
              This feature is perfect for when you've compared multiple models and found one that
              particularly resonates with your needs. Instead of continuing with all models, you can
              focus your conversation on the model that's working best for your specific use case.
            </p>
          </section>

          <section className="seo-section">
            <h2>Flexible Access Tiers</h2>
            <p>CompareIntel offers flexible access options to fit your needs:</p>
            <div className="pricing-overview">
              <div className="pricing-tier">
                <h3>Unregistered Access</h3>
                <p>
                  Get familiar with CompareIntel by accessing a handful of models. Perfect for
                  trying out the platform and seeing how AI model comparison works. No account
                  required.
                </p>
              </div>
              <div className="pricing-tier">
                <h3>Free Account</h3>
                <p>
                  Sign up for a free account to access more models and receive twice the credits of
                  unregistered users. Perfect for casual users who want to explore AI comparison
                  without any commitment. No credit card required.
                </p>
              </div>
              <div className="pricing-tier pricing-tier-full">
                <h3>Paid Tiers (Coming Soon)</h3>
                <p>
                  Paid tiers will be available soon that unlock all of the latest and greatest
                  premium AI models. Get access to the most advanced capabilities as soon as they're
                  released, with higher limits and priority access to new models.
                </p>
                <div className="paid-tiers-grid">
                  <div className="paid-tier-item">
                    <h4>Starter</h4>
                    <ul>
                      <li>1,200 credits/month (~240 exchanges)</li>
                      <li>Compare up to 6 models simultaneously</li>
                      <li>10 multi-model conversations saved</li>
                      <li>Email support</li>
                    </ul>
                  </div>
                  <div className="paid-tier-item">
                    <h4>Starter+</h4>
                    <ul>
                      <li>2,500 credits/month (~500 exchanges)</li>
                      <li>Compare up to 6 models simultaneously</li>
                      <li>20 multi-model conversations saved</li>
                      <li>Email support</li>
                    </ul>
                  </div>
                  <div className="paid-tier-item">
                    <h4>Pro</h4>
                    <ul>
                      <li>5,000 credits/month (~1,000 exchanges)</li>
                      <li>Compare up to 9 models simultaneously</li>
                      <li>40 multi-model conversations saved</li>
                      <li>Priority email support</li>
                    </ul>
                  </div>
                  <div className="paid-tier-item">
                    <h4>Pro+</h4>
                    <ul>
                      <li>10,000 credits/month (~2,000 exchanges)</li>
                      <li>Compare up to 12 models simultaneously</li>
                      <li>80 multi-model conversations saved</li>
                      <li>Priority email support</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="seo-section">
            <h2>Document Import & File Support</h2>
            <p>
              Easily incorporate your existing documents into AI comparisons. CompareIntel supports
              importing a variety of file formats to streamline your workflow:
            </p>
            <ul className="seo-list">
              <li>
                <strong>PDF Documents:</strong> Import PDF files and have their content extracted
                automatically for use in your prompts and comparisons.
              </li>
              <li>
                <strong>Text Files:</strong> Drag and drop plain text files (.txt) directly into
                your conversations.
              </li>
              <li>
                <strong>Word Documents:</strong> Upload .docx files and CompareIntel will extract
                the text content for seamless integration with AI models.
              </li>
              <li>
                <strong>Additional Formats:</strong> Support for markdown, code files, and other
                common document types to fit your specific use case.
              </li>
              <li>
                <strong>Multiple Files:</strong> Attach multiple files to a single comparison,
                either via file picker or drag and drop, and arrange them in any order with your
                text.
              </li>
              <li>
                <strong>Persistent File Context:</strong> Attached files persist across conversation
                sessions, allowing you to ask follow-up questions about your documents even after
                closing and reopening your browser.
              </li>
            </ul>
          </section>

          <section className="seo-section">
            <h2>Flexible Output Export Options</h2>
            <p>
              CompareIntel makes it easy to save and share AI responses with powerful copy and
              export functionality:
            </p>
            <ul className="seo-list">
              <li>
                <strong>Copy Formatted Output:</strong> Copy individual model responses with full
                formatting intact—including markdown, code highlighting, and LaTeX equations—ready
                to paste into documents or presentations.
              </li>
              <li>
                <strong>Copy Raw Output:</strong> Extract the raw text response from any model
                without formatting for use in scripts, data processing, or plain text applications.
              </li>
              <li>
                <strong>Copy Entire Conversation:</strong> Export your complete conversation history
                with a specific model, including all prompts and responses, for documentation or
                further analysis.
              </li>
              <li>
                <strong>One-Click Copying:</strong> Each response panel includes convenient copy
                buttons for quick access to both formatted and raw output options.
              </li>
              <li>
                <strong>Export Complete Comparisons:</strong> Export your entire comparison session
                in multiple formats. Choose from PDF for sharing and printing, Markdown for
                documentation and note-taking apps, HTML for standalone web pages, or JSON for
                developers and API integration. Each export includes all model responses, the
                original prompt, model metadata, and comparison statistics.
              </li>
              <li>
                <strong>Professional PDF Exports:</strong> Generate beautifully formatted PDF
                documents with all model responses, complete with proper formatting for code blocks,
                LaTeX equations, and markdown. Perfect for reports, presentations, or archival
                purposes.
              </li>
              <li>
                <strong>Developer-Friendly Formats:</strong> Export to Markdown or JSON for easy
                integration into documentation workflows, version control systems, or custom
                applications. Markdown exports preserve all formatting and are compatible with most
                documentation platforms.
              </li>
              <li>
                <strong>Standalone HTML Exports:</strong> Create self-contained HTML files that can
                be opened in any browser, shared via email, or hosted on a website. Includes all
                styling and formatting for a complete viewing experience.
              </li>
            </ul>
          </section>

          <section className="seo-section">
            <h2>Enterprise-Grade Security</h2>
            <p>
              Your data security is our priority. CompareIntel implements robust security measures
              to protect your information:
            </p>
            <ul className="seo-list">
              <li>
                <strong>HTTPS Encryption:</strong> All data transmitted to and from CompareIntel is
                encrypted using industry-standard TLS/SSL protocols.
              </li>
              <li>
                <strong>Secure Authentication:</strong> Multi-layer authentication protects your
                account and data.
              </li>
              <li>
                <strong>Rate Limiting:</strong> Built-in protections prevent abuse and ensure fair
                usage for all users.
              </li>
              <li>
                <strong>Data Retention Policies:</strong> Clear data handling policies give you
                control over your information.
              </li>
            </ul>
          </section>

          <section className="seo-section">
            <h2>Web Search Integration</h2>
            <p>
              CompareIntel now supports web search capabilities for compatible AI models, enabling
              them to access real-time information from the Internet. This powerful feature allows
              models to search the web and fetch current data, making them capable of answering
              time-sensitive questions with up-to-date information.
            </p>

            <div className="feature-detail">
              <h3>Real-Time Information Access</h3>
              <p>
                When web search is enabled, supported models can search the Internet for current
                information, including:
              </p>
              <ul className="seo-list">
                <li>
                  <strong>Current Events & News:</strong> Get the latest news, recent developments,
                  and current events from around the world
                </li>
                <li>
                  <strong>Weather Information:</strong> Access real-time weather data for any
                  location, including forecasts and current conditions
                </li>
                <li>
                  <strong>Stock Prices & Financial Data:</strong> Get up-to-date stock prices,
                  market data, and financial information
                </li>
                <li>
                  <strong>Sports Scores:</strong> Check live scores, game results, and sports
                  statistics
                </li>
                <li>
                  <strong>Time-Sensitive Queries:</strong> Answer questions that require current
                  information rather than training data
                </li>
              </ul>
            </div>

            <div className="feature-detail">
              <h3>How It Works</h3>
              <p>
                Web search is easy to use and seamlessly integrated into your comparison workflow:
              </p>
              <ul className="seo-list">
                <li>
                  <strong>Toggle Web Search:</strong> Enable web search using the toggle button in
                  the input area before sending your prompt
                </li>
                <li>
                  <strong>Model Support:</strong> Only models that support web search will use this
                  capability—look for the web search indicator (🌐) next to model names
                </li>
                <li>
                  <strong>Automatic Search:</strong> When enabled, models automatically search the
                  web when they encounter questions requiring current information
                </li>
                <li>
                  <strong>Source Citations:</strong> Models cite their sources and include
                  timestamps, so you know where information comes from
                </li>
                <li>
                  <strong>URL Fetching:</strong> Models can fetch detailed content from specific web
                  pages when needed for comprehensive answers
                </li>
              </ul>
            </div>

            <div className="feature-detail">
              <h3>Use Cases</h3>
              <p>Web search is particularly useful for:</p>
              <ul className="seo-list">
                <li>
                  Research tasks requiring current information that wasn't in the model's training
                  data
                </li>
                <li>Questions about recent events, product releases, or breaking news</li>
                <li>
                  Location-specific queries like local weather, business hours, or regional
                  information
                </li>
                <li>
                  Comparing how different models handle real-time information gathering and
                  synthesis
                </li>
                <li>Tasks that benefit from combining AI reasoning with current web data</li>
              </ul>
            </div>

            <p>
              <strong>Note:</strong> Web search requires a configured search provider and is only
              available for models that support this capability. The feature is automatically
              disabled if no search provider is configured or if none of your selected models
              support web search.
            </p>
          </section>

          <section className="seo-section">
            <h2>Progressive Web App (PWA)</h2>
            <p>
              CompareIntel is built as a Progressive Web App, offering a native app-like experience
              right in your browser:
            </p>
            <ul className="seo-list">
              <li>Install on your device for quick access from your home screen</li>
              <li>Fast, responsive interface optimized for both desktop and mobile</li>
              <li>Offline capability for viewing cached content</li>
              <li>Push notifications for important updates (optional)</li>
            </ul>
          </section>

          <BackToMainCTA
            title="Ready to Experience These Features?"
            description="Try CompareIntel today and see these features in action! Compare different AI models side-by-side and discover which one works best for your needs."
            primaryButtonText="Start Comparing AI Models"
          />
        </article>
      </div>
    </div>
  )
}
