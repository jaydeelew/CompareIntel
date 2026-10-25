/**
 * 404 Not Found Page Component
 * SEO-optimized 404 error page
 */

import React from 'react'
import { Link } from 'react-router-dom'

import './Pages.css'

export const NotFound: React.FC = () => {
  return (
    <div className="seo-page">
      <div className="seo-page-container">
        <article className="seo-page-content" style={{ textAlign: 'center', paddingTop: '4rem' }}>
          <header className="seo-page-header">
            <h1>404 - Page Not Found</h1>
            <p className="seo-page-intro">
              Sorry, the page you're looking for doesn't exist or has been moved.
            </p>
          </header>

          <section className="seo-section">
            <p>The page you requested could not be found. This might be because:</p>
            <ul
              className="seo-list"
              style={{ textAlign: 'left', maxWidth: '600px', margin: '2rem auto' }}
            >
              <li>The URL was typed incorrectly</li>
              <li>The page has been moved or deleted</li>
              <li>The link you followed is outdated</li>
            </ul>

            <div style={{ marginTop: '3rem' }}>
              <Link to="/" className="cta-button primary">
                Go to Homepage
              </Link>
            </div>

            <div style={{ marginTop: '2rem' }}>
              <h2>Popular Pages</h2>
              <nav
                style={{
                  display: 'flex',
                  gap: '1rem',
                  justifyContent: 'center',
                  flexWrap: 'wrap',
                  marginTop: '1rem',
                }}
              >
                <Link to="/about" className="text-link">
                  About
                </Link>
                <Link to="/features" className="text-link">
                  Features
                </Link>
                <Link to="/how-it-works" className="text-link">
                  How It Works
                </Link>
                <Link to="/faq" className="text-link">
                  FAQ
                </Link>
                <Link to="/image-generation" className="text-link">
                  Image Generation
                </Link>
              </nav>
            </div>
          </section>
        </article>
      </div>
    </div>
  )
}
