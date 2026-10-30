/**
 * /models index — featured models grouped by provider.
 */

import React from 'react'
import { Link } from 'react-router-dom'

import { getFeaturedModelsGroupedByProvider, seoCatalog } from '../../data/seo/catalog'

import { JsonLd } from './JsonLd'
import './Pages.css'

const BASE_URL = 'https://compareintel.com'

function breadcrumbList() {
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
    ],
  }
}

function itemList(groups: ReturnType<typeof getFeaturedModelsGroupedByProvider>) {
  const models = groups.flatMap(group => group.models)
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'AI models on CompareIntel',
    itemListElement: models.map((model, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${BASE_URL}${model.path}`,
      name: model.name,
    })),
  }
}

export const ModelsIndex: React.FC = () => {
  const groups = getFeaturedModelsGroupedByProvider()
  const snapshotDate = seoCatalog.sources.snapshotDate

  return (
    <div className="seo-page">
      <JsonLd id="models-index-breadcrumb" data={breadcrumbList()} />
      <JsonLd id="models-index-itemlist" data={itemList(groups)} />
      <div className="seo-page-container">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span className="breadcrumb-separator">/</span>
          <span aria-current="page">Models</span>
        </nav>

        <article className="seo-page-content">
          <header className="seo-page-header">
            <h1>AI Models on CompareIntel</h1>
            <p className="seo-page-intro">
              Specs and original summaries for high-interest models, grouped by provider. Open a
              page to compare that model side by side in the live app.
            </p>
          </header>

          {groups.map(group => (
            <section className="seo-section" key={group.provider}>
              <h2>{group.provider}</h2>
              <ul className="seo-model-index-list">
                {group.models.map(model => (
                  <li key={model.id}>
                    <Link to={model.path}>{model.name}</Link>
                    <span className="seo-model-index-category">{model.category}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <p className="last-updated seo-source-line">
            Last updated {seoCatalog.generatedAt} from the CompareIntel model registry
            {snapshotDate ? ` and an OpenRouter spec snapshot dated ${snapshotDate}` : ''}.
          </p>
        </article>
      </div>
    </div>
  )
}
