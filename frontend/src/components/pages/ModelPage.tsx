/**
 * /models/<slug> template — prerendered specs, unique metadata, JSON-LD.
 */

import React from 'react'
import { Link, useParams } from 'react-router-dom'

import { getSeoModelBySlug, seoCatalog } from '../../data/seo/catalog'

import { JsonLd } from './JsonLd'
import { NotFound } from './NotFound'
import './Pages.css'

const BASE_URL = 'https://compareintel.com'

function softwareApplicationLd(model: NonNullable<ReturnType<typeof getSeoModelBySlug>>) {
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: model.name,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web',
    url: `${BASE_URL}${model.path}`,
    description: model.page.description,
    author: {
      '@type': 'Organization',
      name: model.provider,
    },
  }
  const priceRow = model.specRows.find(row => row.key === 'priceIn')
  if (priceRow) {
    const amount = priceRow.value.match(/\$([0-9]+(?:\.[0-9]+)?)/)?.[1]
    if (amount) {
      data.offers = {
        '@type': 'Offer',
        price: amount,
        priceCurrency: 'USD',
        description: 'Input price per 1M tokens via OpenRouter',
      }
    }
  }
  return data
}

function breadcrumbLd(model: NonNullable<ReturnType<typeof getSeoModelBySlug>>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: `${BASE_URL}/`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Models',
        item: `${BASE_URL}/models`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: model.name,
        item: `${BASE_URL}${model.path}`,
      },
    ],
  }
}

export const ModelPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>()
  const model = slug ? getSeoModelBySlug(slug) : undefined

  if (!model) {
    return <NotFound />
  }

  const snapshotDate = model.source.openrouterSnapshot || seoCatalog.sources.snapshotDate
  const ctaLabel = `Compare ${model.name} side by side`

  return (
    <div className="seo-page">
      <JsonLd id="model-software-application" data={softwareApplicationLd(model)} />
      <JsonLd id="model-breadcrumb" data={breadcrumbLd(model)} />
      <div className="seo-page-container">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span className="breadcrumb-separator">/</span>
          <Link to="/models">Models</Link>
          <span className="breadcrumb-separator">/</span>
          <span aria-current="page">{model.name}</span>
        </nav>

        <article className="seo-page-content">
          <header className="seo-page-header">
            <h1>
              {model.name} by {model.provider}
            </h1>
            <p className="seo-page-intro">{model.summary}</p>
            <p className="seo-model-cta-wrap">
              <Link to={model.compareHref} className="cta-button primary seo-model-cta">
                {ctaLabel}
              </Link>
            </p>
          </header>

          {model.specRows.length > 0 && (
            <section className="seo-section" aria-labelledby="model-specs-heading">
              <h2 id="model-specs-heading">Specs</h2>
              <table className="methodology-table seo-model-spec-table">
                <tbody>
                  {model.specRows.map(row => (
                    <tr key={row.key}>
                      <th scope="row">{row.label}</th>
                      <td>{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {model.related.length > 0 && (
            <section className="seo-section" aria-labelledby="related-models-heading">
              <h2 id="related-models-heading">Related models</h2>
              <ul className="seo-list">
                {model.related.map(related => (
                  <li key={related.id}>
                    <Link to={related.path}>
                      {related.name} by {related.provider}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="last-updated seo-source-line">
            Last updated {seoCatalog.generatedAt} from the CompareIntel model registry
            {snapshotDate ? ` and an OpenRouter spec snapshot dated ${snapshotDate}` : ''}.
            {model.source.openrouterUrl ? (
              <>
                {' '}
                Pricing and context figures follow{' '}
                <a href={model.source.openrouterUrl} rel="noopener noreferrer">
                  OpenRouter
                </a>
                .
              </>
            ) : null}
          </p>
        </article>
      </div>
    </div>
  )
}
