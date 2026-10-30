/**
 * Public read-only shared comparison page.
 */

import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { ApiError } from '../../services/api/errors'
import { getSharedComparison, type PublicShareSnapshot } from '../../services/shareService'
import { applySharePageMeta } from '../../utils/pageMeta'
import { BackToMainCTA } from '../shared'

import './Pages.css'
import './SharedComparison.css'

export const SharedComparison: React.FC = () => {
  const { shareSlug = '' } = useParams<{ shareSlug: string }>()
  const [snapshot, setSnapshot] = useState<PublicShareSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setSnapshot(null)

    getSharedComparison(shareSlug)
      .then(data => {
        if (cancelled) return
        setSnapshot(data)
        applySharePageMeta(data, `/c/${data.slug}`)
      })
      .catch(err => {
        if (cancelled) return
        if (err instanceof ApiError && err.status === 404) {
          setError('This shared comparison is invalid or is no longer public.')
        } else {
          setError('Unable to load this shared comparison.')
        }
        applySharePageMeta(null, `/c/${shareSlug}`)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [shareSlug])

  return (
    <div className="seo-page shared-comparison-page">
      <div className="seo-page-container">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span className="breadcrumb-separator">/</span>
          <span aria-current="page">Shared comparison</span>
        </nav>

        <article className="seo-page-content">
          <header className="seo-page-header">
            <h1>Shared comparison</h1>
            <p className="seo-page-intro">
              A read-only snapshot of a CompareIntel model comparison. Try the same prompt yourself
              in the app.
            </p>
          </header>

          {loading && <p>Loading shared comparison…</p>}

          {!loading && error && (
            <section className="seo-section">
              <p>{error}</p>
              <p>
                <Link to="/" className="cta-button primary">
                  Try your own comparison
                </Link>
              </p>
            </section>
          )}

          {!loading && snapshot && (
            <>
              <section className="seo-section">
                <h2>Prompt</h2>
                <pre className="shared-comparison-prompt">{snapshot.prompt}</pre>
              </section>

              {snapshot.responses.map(item => (
                <section className="seo-section" key={item.model_id}>
                  <h2>{item.model_name}</h2>
                  <pre className="shared-comparison-response">{item.content}</pre>
                </section>
              ))}

              <p className="shared-comparison-note">
                This snapshot does not include account information.
              </p>

              <p>
                <Link to="/" className="cta-button primary">
                  Try your own comparison
                </Link>
              </p>
            </>
          )}
        </article>

        <BackToMainCTA />
      </div>
    </div>
  )
}
