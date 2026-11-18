import Globe from 'lucide-react/dist/esm/icons/globe'
import React, { useEffect, useMemo, useState } from 'react'

import {
  fetchLinkPreview,
  linkPreviewImageSrc,
  type LinkPreviewData,
} from '../../services/linkPreviewService'
import {
  extractExternalUrlsFromAnswer,
  MAX_LINK_PREVIEW_CARDS,
} from '../../utils/extractAnswerLinks'

import './LinkPreviewCards.css'

export interface LinkPreviewCardsProps {
  answerText: string
  enabled: boolean
  /** When true, do not fetch (streaming still in progress). */
  defer?: boolean
}

function siteLabel(data: LinkPreviewData, url: string): string {
  if (data.site_name?.trim()) return data.site_name.trim()
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    return host
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

const LinkPreviewCardsInner: React.FC<LinkPreviewCardsProps> = ({
  answerText,
  enabled,
  defer = false,
}) => {
  const urls = useMemo(
    () =>
      enabled && !defer ? extractExternalUrlsFromAnswer(answerText, MAX_LINK_PREVIEW_CARDS) : [],
    [answerText, defer, enabled]
  )

  const [previews, setPreviews] = useState<LinkPreviewData[]>([])
  const [failed, setFailed] = useState<Set<string>>(() => new Set())
  const [brokenImages, setBrokenImages] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    setBrokenImages(new Set())
    if (!urls.length) {
      setPreviews([])
      return undefined
    }

    let cancelled = false
    const load = async () => {
      const results: LinkPreviewData[] = []
      await Promise.all(
        urls.map(async url => {
          try {
            const data = await fetchLinkPreview(url)
            if (!cancelled) results.push(data)
          } catch {
            if (!cancelled) setFailed(prev => new Set(prev).add(url))
          }
        })
      )
      if (!cancelled) {
        results.sort((a, b) => urls.indexOf(a.url) - urls.indexOf(b.url))
        setPreviews(results)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [urls])

  if (!enabled || defer || !urls.length) {
    return null
  }

  const cards = previews.length
    ? previews
    : urls
        .filter(u => !failed.has(u))
        .map(
          url =>
            ({
              title: siteLabel({ site_name: null } as LinkPreviewData, url),
              site_name: null,
              image: null,
              description: null,
              price: null,
              currency: null,
              fetched_at: '',
              url,
            }) satisfies LinkPreviewData
        )

  if (!cards.length) {
    return null
  }

  return (
    <div className="link-preview-row" data-testid="link-preview-row" aria-label="Link previews">
      {cards.map(card => {
        const href = card.url
        const title = card.title?.trim() || siteLabel(card, href)
        const site = siteLabel(card, href)
        const price = priceLine(card)
        const imageSrc = card.image ? linkPreviewImageSrc(card.image) : null
        const showImage = Boolean(imageSrc) && !brokenImages.has(href)
        return (
          <a
            key={href}
            className="link-preview-card"
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            data-testid="link-preview-card"
          >
            <div className="link-preview-card__image-wrap">
              {showImage ? (
                <img
                  className="link-preview-card__image"
                  src={imageSrc!}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  decoding="async"
                  onError={() => setBrokenImages(prev => new Set(prev).add(href))}
                />
              ) : (
                <Globe className="link-preview-card__image--placeholder" aria-hidden />
              )}
            </div>
            <div className="link-preview-card__body">
              <span className="link-preview-card__title">{title}</span>
              <span className="link-preview-card__site">{site}</span>
              {price && (
                <span className="link-preview-card__price">
                  {price}
                  {card.fetched_at ? (
                    <span className="link-preview-card__price-note"> · as of preview</span>
                  ) : null}
                </span>
              )}
            </div>
          </a>
        )
      })}
    </div>
  )
}

export const LinkPreviewCards = React.memo(LinkPreviewCardsInner)
LinkPreviewCards.displayName = 'LinkPreviewCards'
