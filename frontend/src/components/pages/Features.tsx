/**
 * Features Page Component
 * SEO-optimized page detailing CompareIntel's capabilities
 */

import React from 'react'
import { Link } from 'react-router-dom'
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
              Discover the powerful features that make CompareIntel the most comprehensive AI model
              comparison platform available.
            </p>
          </header>

          <section className="seo-section">
            <h2>Comprehensive AI Model Library</h2>
            <p>
              CompareIntel provides access to over 50 leading AI models from the world's top AI
              companies. Our extensive library includes:
            </p>

            <div className="model-providers">
              <div className="provider-card">
                <h3>OpenAI Models</h3>
                <p>
                  Compare responses from GPT-4, GPT-4o, GPT-4 Turbo, and other OpenAI models known
                  for their strong general-purpose capabilities and creative outputs.
                </p>
                <ul>
                  <li>GPT-4o - Latest multimodal flagship model</li>
                  <li>GPT-4 Turbo - Faster, more cost-effective GPT-4</li>
                  <li>GPT-4 - Original large language model</li>
                  <li>GPT-3.5 Turbo - Fast and efficient for many tasks</li>
                </ul>
              </div>

              <div className="provider-card">
                <h3>Anthropic Models</h3>
                <p>
                  Test Claude models, renowned for their helpfulness, harmlessness, and strong
                  performance on complex reasoning tasks.
                </p>
                <ul>
                  <li>Claude 3.5 Sonnet - Best balance of speed and intelligence</li>
                  <li>Claude 3 Opus - Most capable for complex tasks</li>
                  <li>Claude 3 Sonnet - Fast and efficient</li>
                  <li>Claude 3 Haiku - Ultra-fast for quick responses</li>
                </ul>
              </div>

              <div className="provider-card">
                <h3>Google Models</h3>
                <p>
                  Evaluate Google's Gemini family of models, featuring strong multimodal
                  capabilities and advanced reasoning.
                </p>
                <ul>
                  <li>Gemini Pro - Balanced performance model</li>
                  <li>Gemini Ultra - Most capable Gemini model</li>
                  <li>Gemini Flash - Optimized for speed</li>
                </ul>
              </div>

              <div className="provider-card">
                <h3>Meta & Open Source</h3>
                <p>
                  Access Meta's Llama models and other leading open-source alternatives that offer
                  transparency and customization options.
                </p>
                <ul>
                  <li>Llama 3.1 - Latest Meta foundation model</li>
                  <li>Llama 3 - Previous generation Llama</li>
                  <li>Mistral Large - European AI leader</li>
                  <li>Mixtral - Mixture of experts model</li>
                </ul>
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
            <h2>Multi-Turn Conversation Support</h2>
            <p>
              Real-world AI interactions often involve back-and-forth conversations. CompareIntel
              supports full multi-turn conversations:
            </p>
            <ul className="seo-list">
              <li>
                <strong>Context Retention:</strong> Each model maintains its conversation history,
                allowing you to ask follow-up questions and build on previous responses.
              </li>
              <li>
                <strong>Per-Model Conversations:</strong> Continue conversations with individual
                models independently, exploring different directions with each.
              </li>
              <li>
                <strong>Conversation History:</strong> Review your conversation history and return
                to previous sessions.
              </li>
            </ul>
          </section>

          <section className="seo-section">
            <h2>Flexible Pricing Tiers</h2>
            <p>CompareIntel offers flexible pricing options to fit your needs:</p>
            <div className="pricing-overview">
              <div className="pricing-tier">
                <h3>Free Tier</h3>
                <p>
                  Get started with 10 free model responses per day. Perfect for casual users who
                  want to explore AI comparison without any commitment. No credit card required.
                </p>
              </div>
              <div className="pricing-tier">
                <h3>Premium Plans</h3>
                <p>
                  For power users and professionals who need more responses, our premium plans offer
                  higher limits and additional features. Scale your usage as your needs grow.
                </p>
              </div>
            </div>
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

          <section className="seo-section cta-section">
            <h2>Ready to Experience These Features?</h2>
            <p>
              Start comparing AI models today and discover which ones work best for your specific
              needs. With over 50 models to choose from and powerful comparison tools, CompareIntel
              helps you make informed decisions about AI technology.
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
