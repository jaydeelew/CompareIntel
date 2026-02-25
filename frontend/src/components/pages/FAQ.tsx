/**
 * FAQ Page Component
 * SEO-optimized FAQ page with structured data for rich snippets
 */

import React, { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { faqData } from '../../data/faq'
import { BackToMainCTA } from '../shared'
import './Pages.css'

interface FAQItemProps {
  id: string
  question: string
  answer: React.ReactNode
  isOpen: boolean
  onToggle: () => void
}

const FAQItem: React.FC<FAQItemProps> = ({ id, question, answer, isOpen, onToggle }) => {
  return (
    <div id={id} className={`faq-item ${isOpen ? 'open' : ''}`}>
      <button className="faq-question" onClick={onToggle} aria-expanded={isOpen}>
        <span>{question}</span>
        <svg
          className={`faq-icon ${isOpen ? 'rotated' : ''}`}
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
      <div className={`faq-answer ${isOpen ? 'visible' : ''}`}>{answer}</div>
    </div>
  )
}

// Generate FAQ structured data for SEO
const generateFAQStructuredData = () => {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqData.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text:
          typeof item.answer === 'string'
            ? item.answer
            : 'See our FAQ page for the detailed answer.',
      },
    })),
  }
}

export const FAQ: React.FC = () => {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set())
  const location = useLocation()

  // Open and scroll to FAQ item when navigating with hash (e.g. /faq#credits-system)
  useEffect(() => {
    const hash = location.hash.slice(1)
    if (hash && faqData.some(item => item.id === hash)) {
      setOpenItems(prev => new Set([...prev, hash]))
      // Scroll element into view after accordion opens (delay allows React to render)
      const id = setTimeout(() => {
        const el = document.getElementById(hash)
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 150)
      return () => clearTimeout(id)
    }
  }, [location.hash])

  // Inject FAQ structured data for SEO
  useEffect(() => {
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.id = 'faq-structured-data'
    script.textContent = JSON.stringify(generateFAQStructuredData())
    document.head.appendChild(script)

    return () => {
      const existingScript = document.getElementById('faq-structured-data')
      if (existingScript) {
        existingScript.remove()
      }
    }
  }, [])

  const toggleItem = (id: string) => {
    setOpenItems(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  return (
    <div className="seo-page">
      <div className="seo-page-container">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span className="breadcrumb-separator">/</span>
          <span aria-current="page">FAQ</span>
        </nav>

        <article className="seo-page-content">
          <header className="seo-page-header">
            <h1>Frequently Asked Questions</h1>
            <p className="seo-page-intro">
              Find answers to common questions about CompareIntel, AI technology, and how to get the
              most out of comparing AI models. Whether you're new to AI or an experienced user,
              we've got you covered.
            </p>
          </header>

          <section className="seo-section">
            <div className="faq-list">
              {faqData.map(item => (
                <FAQItem
                  key={item.id}
                  id={item.id}
                  question={item.question}
                  answer={item.answer}
                  isOpen={openItems.has(item.id)}
                  onToggle={() => toggleItem(item.id)}
                />
              ))}
            </div>
          </section>

          <section className="seo-section">
            <h2>Still Have Questions?</h2>
            <p>
              If you couldn't find the answer you're looking for, feel free to reach out to us at{' '}
              <a href="mailto:support@compareintel.com">support@compareintel.com</a>. We're happy to
              help!
            </p>
          </section>

          <BackToMainCTA
            title="Ready to Compare AI Models?"
            description="Got your questions answered? Now it's time to try CompareIntel for yourself! Compare different AI models side-by-side and discover which one works best for your needs."
            primaryButtonText="Start Comparing AI Models"
            secondaryButtonText="Learn More About Us"
            secondaryButtonLink="/about"
          />
        </article>
      </div>
    </div>
  )
}
