/**
 * About Page Component
 * SEO-optimized page providing detailed information about CompareIntel
 */

import React from 'react'
import { Link } from 'react-router-dom'
import './Pages.css'

export const About: React.FC = () => {
  return (
    <div className="seo-page">
      <div className="seo-page-container">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span className="breadcrumb-separator">/</span>
          <span aria-current="page">About</span>
        </nav>

        <article className="seo-page-content">
          <header className="seo-page-header">
            <h1>About CompareIntel</h1>
            <p className="seo-page-intro">
              The leading AI model comparison platform that helps you make informed decisions by
              testing multiple AI models side-by-side.
            </p>
          </header>

          <section className="seo-section">
            <h2>What is CompareIntel?</h2>
            <p>
              CompareIntel is a powerful web application designed to help users compare responses
              from over 50 leading artificial intelligence models simultaneously. Whether you're a
              developer evaluating AI tools for your next project, a researcher comparing language
              model capabilities, or a business professional seeking the best AI solution for your
              needs, CompareIntel provides the tools you need to make data-driven decisions.
            </p>
            <p>
              Our platform supports the most popular AI models including GPT-4 and GPT-4o from
              OpenAI, Claude 3.5 Sonnet and Claude 3 Opus from Anthropic, Google's Gemini Pro and
              Gemini Ultra, Meta's Llama 3, Mistral AI's models, and many more. With CompareIntel,
              you can send the same prompt to multiple models and receive their responses in
              real-time, making it easy to evaluate which model performs best for your specific use
              case.
            </p>
          </section>

          <section className="seo-section">
            <h2>Why Compare AI Models?</h2>
            <p>
              The AI landscape is evolving rapidly, with new models being released frequently. Each
              model has its own strengths and weaknesses:
            </p>
            <ul className="seo-list">
              <li>
                <strong>Code Generation:</strong> Some models excel at writing clean, efficient code
                in various programming languages, while others may struggle with complex algorithms
                or specific frameworks.
              </li>
              <li>
                <strong>Natural Language Understanding:</strong> Different models have varying
                capabilities in understanding context, nuance, and following complex instructions.
              </li>
              <li>
                <strong>Mathematical Reasoning:</strong> Certain AI models are better equipped to
                handle mathematical problems, from basic arithmetic to advanced calculus and
                statistical analysis.
              </li>
              <li>
                <strong>Creative Writing:</strong> When it comes to creative tasks like writing
                stories, marketing copy, or poetry, models can produce vastly different results.
              </li>
              <li>
                <strong>Response Speed:</strong> Performance varies significantly between models,
                which can be crucial for time-sensitive applications.
              </li>
              <li>
                <strong>Cost Efficiency:</strong> Different models have different pricing
                structures, and sometimes a more affordable model may meet your needs just as well
                as a premium one.
              </li>
            </ul>
            <p>
              By comparing models side-by-side, you can identify which AI best fits your specific
              requirements without having to subscribe to multiple services or build custom testing
              infrastructure.
            </p>
          </section>

          <section className="seo-section">
            <h2>Our Mission</h2>
            <p>
              At CompareIntel, our mission is to democratize access to AI comparison tools. We
              believe that everyone should be able to make informed decisions about which AI models
              to use, without needing deep technical expertise or expensive enterprise solutions.
            </p>
            <p>
              We're committed to providing a transparent, unbiased platform where you can see
              exactly how different AI models respond to your prompts. We don't favor any particular
              AI provider—our goal is to help you find the best tool for your needs.
            </p>
          </section>

          <section className="seo-section">
            <h2>Key Features</h2>
            <div className="features-grid">
              <div className="feature-item">
                <h3>50+ AI Models</h3>
                <p>
                  Access a comprehensive library of over 50 AI models from leading providers
                  including OpenAI, Anthropic, Google, Meta, Mistral, and more.
                </p>
              </div>
              <div className="feature-item">
                <h3>Real-Time Comparison</h3>
                <p>
                  Send your prompt to multiple models simultaneously and watch responses stream in
                  real-time, side-by-side.
                </p>
              </div>
              <div className="feature-item">
                <h3>Beautiful Rendering</h3>
                <p>
                  Full support for LaTeX mathematical equations, Markdown formatting, and
                  syntax-highlighted code blocks.
                </p>
              </div>
              <div className="feature-item">
                <h3>Multi-Turn Conversations</h3>
                <p>
                  Continue conversations with individual models while maintaining context across
                  multiple exchanges.
                </p>
              </div>
              <div className="feature-item">
                <h3>Free Tier Available</h3>
                <p>Get started for free—no credit card required.</p>
              </div>
              <div className="feature-item">
                <h3>Privacy Focused</h3>
                <p>
                  Your prompts and conversations are handled securely with enterprise-grade
                  protection.
                </p>
              </div>
            </div>
          </section>

          <section className="seo-section">
            <h2>Who Uses CompareIntel?</h2>
            <p>
              CompareIntel serves a diverse community of users across various industries and use
              cases:
            </p>
            <ul className="seo-list">
              <li>
                <strong>Software Developers:</strong> Evaluate AI coding assistants for code
                generation, debugging, and code review tasks.
              </li>
              <li>
                <strong>Data Scientists:</strong> Compare models for data analysis, explanation
                generation, and research assistance.
              </li>
              <li>
                <strong>Content Creators:</strong> Find the best AI for writing, editing, and
                creative content generation.
              </li>
              <li>
                <strong>Educators:</strong> Assess AI models for educational content, tutoring
                assistance, and curriculum development.
              </li>
              <li>
                <strong>Business Professionals:</strong> Evaluate AI solutions for customer service,
                document analysis, and business intelligence.
              </li>
              <li>
                <strong>Researchers:</strong> Benchmark AI capabilities and study model behavior
                across different domains.
              </li>
            </ul>
          </section>

          <section className="seo-section">
            <h2>Getting Started</h2>
            <p>Ready to compare AI models? Getting started with CompareIntel is easy:</p>
            <ol className="seo-list numbered">
              <li>
                Visit our <Link to="/">homepage</Link> and create a free account
              </li>
              <li>Select the AI models you want to compare</li>
              <li>Enter your prompt or question</li>
              <li>Watch as responses stream in from each model</li>
              <li>Compare results and make informed decisions</li>
            </ol>
            <p>
              No credit card is required to start comparing AI models. Our free tier provides daily
              credits for comparing models, and registered users receive twice the credits of
              unregistered users—perfect for casual users and those wanting to explore the platform.
            </p>
          </section>

          <section className="seo-section cta-section">
            <h2>Start Comparing Today</h2>
            <p>
              Join thousands of users who trust CompareIntel to help them find the best AI models
              for their needs. Whether you're comparing GPT-4 vs Claude, evaluating Gemini against
              Llama, or testing any combination of 50+ models, CompareIntel makes it easy.
            </p>
            <Link to="/" className="cta-button">
              Try CompareIntel Free
            </Link>
          </section>
        </article>
      </div>
    </div>
  )
}
