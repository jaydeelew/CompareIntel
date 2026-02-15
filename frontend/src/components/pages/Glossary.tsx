/**
 * Glossary Page Component
 * SEO-optimized glossary of AI terms and concepts for beginners
 */

import React, { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'

import { categoryDescriptions, categoryLabels, glossaryTerms } from '../../data/glossary'
import { BackToMainCTA } from '../shared'
import './Pages.css'

// Generate Glossary structured data for SEO (DefinedTermSet schema)
const generateGlossaryStructuredData = () => {
  return {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    '@id': 'https://compareintel.com/glossary',
    name: 'AI Glossary - Artificial Intelligence Terms Explained',
    description:
      'A comprehensive glossary of AI terms and concepts explained in plain English for beginners. Learn about LLMs, tokens, context windows, and more.',
    url: 'https://compareintel.com/glossary',
    hasDefinedTerm: glossaryTerms.map(term => ({
      '@type': 'DefinedTerm',
      '@id': `https://compareintel.com/glossary#${term.id}`,
      name: term.term,
      description: term.definition,
      inDefinedTermSet: 'https://compareintel.com/glossary',
    })),
  }
}

// Generate WebPage structured data for SEO
const generateWebPageStructuredData = () => {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': 'https://compareintel.com/glossary#webpage',
    url: 'https://compareintel.com/glossary',
    name: 'AI Glossary - Learn AI Terms & Concepts | CompareIntel',
    description:
      'Comprehensive AI glossary explaining artificial intelligence terms in plain English. Learn about LLMs, tokens, context windows, hallucinations, and more.',
    isPartOf: {
      '@type': 'WebSite',
      '@id': 'https://compareintel.com/#website',
      name: 'CompareIntel',
      url: 'https://compareintel.com',
    },
    about: {
      '@type': 'Thing',
      name: 'Artificial Intelligence',
    },
    mainEntity: {
      '@id': 'https://compareintel.com/glossary',
    },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: 'https://compareintel.com',
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'AI Glossary',
          item: 'https://compareintel.com/glossary',
        },
      ],
    },
  }
}

export const Glossary: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [expandedTerms, setExpandedTerms] = useState<Set<string>>(new Set())

  // Inject Glossary structured data for SEO
  useEffect(() => {
    // Add DefinedTermSet structured data
    const glossaryScript = document.createElement('script')
    glossaryScript.type = 'application/ld+json'
    glossaryScript.id = 'glossary-structured-data'
    glossaryScript.textContent = JSON.stringify(generateGlossaryStructuredData())
    document.head.appendChild(glossaryScript)

    // Add WebPage structured data
    const webPageScript = document.createElement('script')
    webPageScript.type = 'application/ld+json'
    webPageScript.id = 'glossary-webpage-structured-data'
    webPageScript.textContent = JSON.stringify(generateWebPageStructuredData())
    document.head.appendChild(webPageScript)

    return () => {
      const existingGlossaryScript = document.getElementById('glossary-structured-data')
      if (existingGlossaryScript) {
        existingGlossaryScript.remove()
      }
      const existingWebPageScript = document.getElementById('glossary-webpage-structured-data')
      if (existingWebPageScript) {
        existingWebPageScript.remove()
      }
    }
  }, [])

  const filteredTerms = useMemo(() => {
    let terms = glossaryTerms

    if (selectedCategory) {
      terms = terms.filter(term => term.category === selectedCategory)
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      terms = terms.filter(
        term =>
          term.term.toLowerCase().includes(query) ||
          term.definition.toLowerCase().includes(query) ||
          (term.example && term.example.toLowerCase().includes(query))
      )
    }

    return terms.sort((a, b) => a.term.localeCompare(b.term))
  }, [searchQuery, selectedCategory])

  const toggleTerm = (id: string) => {
    setExpandedTerms(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const categories = ['basics', 'models', 'technical', 'usage']

  return (
    <div className="seo-page">
      <div className="seo-page-container">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span className="breadcrumb-separator">/</span>
          <span aria-current="page">AI Glossary</span>
        </nav>

        <article className="seo-page-content">
          <header className="seo-page-header">
            <h1>AI Glossary</h1>
            <p className="seo-page-intro">
              New to AI? No problem! This glossary explains common AI terms in plain English,
              helping you understand the technology and make the most of CompareIntel.
            </p>
          </header>

          {/* Search and Filter */}
          <section className="glossary-controls">
            <div className="glossary-search">
              <svg
                className="search-icon"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Search terms..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="glossary-search-input"
              />
              {searchQuery && (
                <button
                  className="search-clear"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>

            <div className="glossary-categories">
              <button
                className={`category-button ${selectedCategory === null ? 'active' : ''}`}
                onClick={() => setSelectedCategory(null)}
              >
                All Terms
              </button>
              {categories.map(cat => (
                <button
                  key={cat}
                  className={`category-button ${selectedCategory === cat ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(cat)}
                  title={categoryDescriptions[cat]}
                >
                  {categoryLabels[cat]}
                </button>
              ))}
            </div>
          </section>

          {/* Results count */}
          <p className="glossary-results-count">
            {filteredTerms.length} {filteredTerms.length === 1 ? 'term' : 'terms'}
            {selectedCategory && ` in ${categoryLabels[selectedCategory]}`}
            {searchQuery && ` matching "${searchQuery}"`}
          </p>

          {/* Glossary Terms */}
          <section className="glossary-terms">
            {filteredTerms.length === 0 ? (
              <div className="glossary-empty">
                <p>No terms found matching your search.</p>
                <button
                  onClick={() => {
                    setSearchQuery('')
                    setSelectedCategory(null)
                  }}
                >
                  Clear filters
                </button>
              </div>
            ) : (
              filteredTerms.map(term => {
                const isExpanded = expandedTerms.has(term.id)
                return (
                  <div key={term.id} className={`glossary-term ${isExpanded ? 'expanded' : ''}`}>
                    <button
                      className="glossary-term-header"
                      onClick={() => toggleTerm(term.id)}
                      aria-expanded={isExpanded}
                      id={term.id}
                    >
                      <span className="term-name">{term.term}</span>
                      <span className="term-category-badge">{categoryLabels[term.category]}</span>
                      <svg
                        className={`term-chevron ${isExpanded ? 'rotated' : ''}`}
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    <div className={`glossary-term-content ${isExpanded ? 'visible' : ''}`}>
                      <p className="term-definition">{term.definition}</p>
                      {term.example && (
                        <div className="term-example">
                          <strong>Example:</strong> {term.example}
                        </div>
                      )}
                      {term.relatedTerms && term.relatedTerms.length > 0 && (
                        <div className="term-related">
                          <strong>Related:</strong>{' '}
                          {term.relatedTerms.map((related, idx) => {
                            const relatedTerm = glossaryTerms.find(
                              t => t.term === related || t.term.includes(related)
                            )
                            return (
                              <span key={related}>
                                {relatedTerm ? (
                                  <a
                                    href={`#${relatedTerm.id}`}
                                    onClick={e => {
                                      e.preventDefault()
                                      setExpandedTerms(prev => new Set(prev).add(relatedTerm.id))
                                      document.getElementById(relatedTerm.id)?.scrollIntoView({
                                        behavior: 'smooth',
                                        block: 'center',
                                      })
                                    }}
                                  >
                                    {related}
                                  </a>
                                ) : (
                                  related
                                )}
                                {idx < term.relatedTerms!.length - 1 && ', '}
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </section>

          {/* Call to Action */}
          <BackToMainCTA
            title="Ready to Try AI?"
            description="Now that you understand the basics, put your knowledge to use! Compare different AI models side-by-side and discover which one works best for your needs."
            primaryButtonText="Start Comparing AI Models"
          />
        </article>
      </div>
    </div>
  )
}
