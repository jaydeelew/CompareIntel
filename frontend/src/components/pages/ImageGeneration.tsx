/**
 * Image Generation Page Component
 * SEO-optimized page for CompareIntel's image generation comparison feature
 */

import React from 'react'
import { Link } from 'react-router-dom'

import { BackToMainCTA } from '../shared'
import './Pages.css'

export const ImageGeneration: React.FC = () => {
  return (
    <div className="seo-page">
      <div className="seo-page-container">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span className="breadcrumb-separator">/</span>
          <span aria-current="page">Image Generation</span>
        </nav>

        <article className="seo-page-content">
          <header className="seo-page-header">
            <h1>AI Image Generation Comparison</h1>
            <p className="seo-page-intro">
              Compare image generation models side-by-side. Enter a prompt and see how different AI
              models create images from your description.
            </p>
          </header>

          <section className="seo-section">
            <h2>How It Works</h2>
            <p>
              Switch to &quot;Image generation models&quot; in the model selector on the main
              comparison page. Select one or more image-capable models, enter your prompt, and run a
              comparison. Each model will generate an image based on your description, displayed
              side-by-side for easy comparison. Use Advanced settings to choose aspect ratio (1:1,
              16:9, etc.) and resolution (1K–4K); options vary by model.
            </p>
          </section>

          <section className="seo-section">
            <h2>Supported Models</h2>
            <p>
              We support top image generation models from leading providers, including Google Gemini
              image models, Black Forest Labs Flux, and others. Visit the main comparison page and
              toggle to &quot;Image generation models&quot; to see the full list of available
              models.
            </p>
          </section>

          <section className="seo-section">
            <h2>Free Tier: 2 Image Comparisons Per Day</h2>
            <p>
              Sign up for a free account to run 2 image comparisons per day. This lets you try the
              feature and compare outputs from different models without any cost.
            </p>
          </section>

          <section className="seo-section">
            <h2>Paid Tiers Coming Soon</h2>
            <p>
              Paid tiers will allow as many image generations as you have credits for. Credits are
              consumed based on each model&apos;s per-image pricing. Stay tuned for updates.
            </p>
          </section>

          <BackToMainCTA
            title="Ready to Compare Image Models?"
            description="Switch to image generation mode on the main page, select models, and start comparing AI-generated images."
            primaryButtonText="Start Image Comparison"
          />
        </article>
      </div>
    </div>
  )
}
