import React from 'react'

interface JsonLdProps {
  id: string
  data: Record<string, unknown> | Array<Record<string, unknown>>
}

/**
 * Inline JSON-LD so prerendered HTML includes structured data without waiting
 * on a useEffect. Crawlers that do not execute JS still see the script tag.
 */
export const JsonLd: React.FC<JsonLdProps> = ({ id, data }) => {
  return (
    <script
      id={id}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}
