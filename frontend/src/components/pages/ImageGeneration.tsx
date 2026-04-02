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
            <h2>Credits for image models</h2>
            <p>
              Credits are the same currency as for text comparisons, but image models do not all
              bill the same way. Some providers return token usage; others expose a fixed price per
              image. Each model you run is charged separately for its own generation.
            </p>
            <table
              className="methodology-table"
              aria-label="How image generation credits are calculated"
            >
              <thead>
                <tr>
                  <th scope="col">How the model is priced</th>
                  <th scope="col">Credits (simplified)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>Token usage</strong> (API reports prompt + completion tokens)
                  </td>
                  <td>
                    Same rule as text: roughly <strong>1 credit per 1,000 effective tokens</strong>,
                    where effective = input tokens + (output × 2.5). Output counts more because it
                    is usually costlier.
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Per-image</strong> (provider lists a $/image price)
                  </td>
                  <td>
                    <strong>$ per image × 100 × number of images</strong> for that model (rounded up
                    to whole credits, at least 1). So a $0.04 image → 4 credits before rounding
                    rules.
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Fallback</strong> (no token usage and no $/image on file)
                  </td>
                  <td>
                    A small <strong>fixed credits per image</strong> per generation so runs still
                    count against your balance predictably.
                  </td>
                </tr>
              </tbody>
            </table>
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
            <h2>Free Tier: 2 Image Comparison Runs per Day</h2>
            <p>
              Sign up for a free account for image generation. A <strong>comparison</strong> is each
              time you run Compare in image mode with your chosen models—not a limit on the number
              of pictures. Free tier allows <strong>2 such runs per day</strong>, and each run can
              include <strong>up to 3 image models</strong> side-by-side (same model cap as text
              comparisons), so you can see multiple outputs in one go. Usage still draws from your
              daily credits.
            </p>
          </section>

          <section className="seo-section">
            <h2>Paid plans</h2>
            <p>
              Paid tiers use your monthly credit pool (and metered overage when enabled) for image
              generations, the same way as text comparisons, subject to the per-run model limits
              above.
            </p>
          </section>

          <section className="seo-section">
            <h2>In-app messages about image mode</h2>
            <p>
              On the comparison page you may see a short dialog explaining a constraint. Here is
              what each one is about:
            </p>
            <table className="methodology-table" aria-label="Image-related in-app messages">
              <thead>
                <tr>
                  <th scope="col">Message title</th>
                  <th scope="col">What it means</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Image settings updated for your selection</td>
                  <td>
                    Aspect ratio or resolution was adjusted so every selected image model can share
                    one valid combination. The old combo did not work for at least one model in the
                    group.
                  </td>
                </tr>
                <tr>
                  <td>No shared image options</td>
                  <td>
                    There is no single aspect ratio and resolution that all selected models support
                    together. Remove or swap models until their supported sizes overlap, or the
                    Advanced image controls stay disabled.
                  </td>
                </tr>
                <tr>
                  <td>Incompatible image settings</td>
                  <td>
                    The aspect ratio or resolution you are changing to is not supported by one or
                    more selected models. Adjust Advanced settings or deselect those models.
                  </td>
                </tr>
                <tr>
                  <td>Model incompatible with settings</td>
                  <td>
                    Adding this model would break the current aspect ratio or resolution. Change
                    Advanced settings or pick a different model.
                  </td>
                </tr>
                <tr>
                  <td>Switch to Image Generation Models</td>
                  <td>
                    You still have text models selected. Deselect them first, then pick image models
                    via the toggle or Help me choose.
                  </td>
                </tr>
                <tr>
                  <td>Switch to Text Models</td>
                  <td>
                    You still have image models selected. Deselect them first, then switch back to
                    text models with the toggle.
                  </td>
                </tr>
                <tr>
                  <td>Sign Up to Use Image Generation</td>
                  <td>
                    Image generation requires an account. On the free tier you get 2 comparison runs
                    per day in image mode; each run can use up to 3 image models at once. Broader
                    use will follow with paid credits.
                  </td>
                </tr>
              </tbody>
            </table>
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
