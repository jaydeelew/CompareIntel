import React, { useEffect, useState } from 'react'

import {
  fetchLinkPreview,
  linkPreviewImageSrc,
  type LinkPreviewData,
} from '../../services/linkPreviewService'

import './InlineLinkPreview.css'

function siteLabel(data: LinkPreviewData, url: string): string {
  if (data.site_name?.trim()) return data.site_name.trim()
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function priceLine(data: LinkPreviewData): string | null {
  if (!data.price?.trim()) return null
  const currency = data.currency?.trim()
  const amount = data.price.trim()
  return currency ? `${currency} ${amount}` : amount
}

function faviconForUrl(pageUrl: string): string {
  try {
    const host = new URL(pageUrl).hostname
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`
  } catch {
    return ''
  }
}

/** Prefer contain + light pad for likely logos / small OG assets. */
function shouldContainImage(imageUrl: string, title: string): boolean {
  const hay = `${imageUrl} ${title}`.toLowerCase()
  return /logo|icon|favicon|opengraph-icon|sprite|badge/.test(hay)
}

export interface InlineLinkPreviewProps {
  url: string
  defer?: boolean
}

/**
 * Inline rich card after a link’s block. No DOM until the proxied image loads; then fades in.
 */
export const InlineLinkPreview: React.FC<InlineLinkPreviewProps> = ({ url, defer = false }) => {
  const [meta, setMeta] = useState<LinkPreviewData | null>(null)
  const [discarded, setDiscarded] = useState(false)
  const [imageReady, setImageReady] = useState(false)

  useEffect(() => {
    if (defer) {
      setMeta(null)
      setDiscarded(false)
      setImageReady(false)
      return undefined
    }
    let cancelled = false
    setMeta(null)
    setDiscarded(false)
    setImageReady(false)

    void (async () => {
      try {
        const data = await fetchLinkPreview(url)
        if (cancelled) return
        if (data.error || !data.image?.trim()) {
          setDiscarded(true)
          return
        }
        setMeta(data)
      } catch {
        if (!cancelled) setDiscarded(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [url, defer])

  if (defer || discarded || !meta?.image?.trim()) {
    return null
  }

  const imageSrc = linkPreviewImageSrc(meta.image)

  if (!imageReady) {
    return (
      <img
        className="link-preview-preload"
        src={imageSrc}
        alt=""
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => setImageReady(true)}
        onError={() => setDiscarded(true)}
      />
    )
  }

  const title = meta.title?.trim() || siteLabel(meta, url)
  const site = siteLabel(meta, url)
  const price = priceLine(meta)
  const favicon = faviconForUrl(url)
  const containImage = shouldContainImage(meta.image ?? '', title)

  return (
    <a
      className="link-preview-card link-preview-card--inline is-visible"
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      data-testid="link-preview-card-inline"
    >
      <div className="link-preview-card__image-wrap">
        <img
          className={`link-preview-card__image${containImage ? ' link-preview-card__image--contain' : ''}`}
          src={imageSrc}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          decoding="async"
        />
      </div>
      <div className="link-preview-card__body">
        <span className="link-preview-card__title">{title}</span>
        <span className="link-preview-card__site-row">
          {favicon ? (
            <img
              className="link-preview-card__favicon"
              src={favicon}
              alt=""
              width={14}
              height={14}
              loading="lazy"
              decoding="async"
              onError={e => {
                e.currentTarget.style.display = 'none'
              }}
            />
          ) : null}
          <span className="link-preview-card__site">{site}</span>
        </span>
        {price && (
          <span className="link-preview-card__price">
            {price}
            {meta.fetched_at ? (
              <span className="link-preview-card__price-note"> · as of preview</span>
            ) : null}
          </span>
        )}
      </div>
    </a>
  )
}

InlineLinkPreview.displayName = 'InlineLinkPreview'
