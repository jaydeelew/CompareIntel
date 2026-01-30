/**
 * Glossary Page Component
 * SEO-optimized glossary of AI terms and concepts for beginners
 */

import React, { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'

import { BackToMainCTA } from '../shared'
import './Pages.css'

interface GlossaryTerm {
  id: string
  term: string
  definition: string
  example?: string
  relatedTerms?: string[]
  category: 'basics' | 'models' | 'technical' | 'usage'
}

const glossaryTerms: GlossaryTerm[] = [
  // AI Basics
  {
    id: 'artificial-intelligence',
    term: 'Artificial Intelligence (AI)',
    definition:
      'Computer systems designed to perform tasks that typically require human intelligence, such as understanding language, recognizing patterns, making decisions, and generating text or images.',
    example:
      "When you ask ChatGPT to write an email for you, that's AI understanding your request and generating a response.",
    relatedTerms: ['Machine Learning', 'Large Language Model'],
    category: 'basics',
  },
  {
    id: 'large-language-model',
    term: 'Large Language Model (LLM)',
    definition:
      'A type of AI that has been trained on massive amounts of text data to understand and generate human-like text. These models can answer questions, write content, translate languages, and have conversations.',
    example:
      'GPT, Claude, and Gemini are all large language models. They learned language patterns from billions of text examples.',
    relatedTerms: ['AI Model', 'Training Data', 'Artificial Intelligence'],
    category: 'basics',
  },
  {
    id: 'ai-model',
    term: 'AI Model',
    definition:
      'A specific AI system created by a company or research team. Different models have different strengths, capabilities, and personalities. Think of them like different "brands" of AI assistants.',
    example:
      'OpenAI makes GPT models, Anthropic makes Claude, and Google makes Gemini. Each model responds differently to the same question.',
    relatedTerms: ['Large Language Model', 'Provider'],
    category: 'basics',
  },
  {
    id: 'prompt',
    term: 'Prompt',
    definition:
      "The text you type to communicate with an AI model. It's your question, instruction, or request that tells the AI what you want it to do.",
    example:
      '"Write me a poem about the ocean" or "Explain quantum physics in simple terms" are both prompts.',
    relatedTerms: ['Response', 'Context Window'],
    category: 'basics',
  },
  {
    id: 'response',
    term: 'Response',
    definition:
      'The text that an AI model generates in reply to your prompt. The quality and style of responses vary between different AI models.',
    example:
      'After you ask "What is the capital of France?", the AI\'s answer "The capital of France is Paris" is the response.',
    relatedTerms: ['Prompt', 'Token'],
    category: 'basics',
  },
  {
    id: 'chatbot',
    term: 'Chatbot',
    definition:
      'An AI application designed for back-and-forth conversation. Modern chatbots use large language models to provide intelligent, contextual responses.',
    example:
      'ChatGPT, Claude, and Gemini are all chatbots that can have extended conversations with you.',
    relatedTerms: ['Large Language Model', 'Conversation'],
    category: 'basics',
  },

  // Technical Terms
  {
    id: 'context-window',
    term: 'Context Window',
    definition:
      'The maximum amount of text an AI model can "see" and remember during a conversation. It includes both your messages and the AI\'s responses. Think of it as the AI\'s short-term memory capacity.',
    example:
      'A model with a 128K token context window can process roughly 100,000 words at once—about the length of a novel. A smaller 8K window is more like a long article.',
    relatedTerms: ['Token', 'Conversation', 'Memory'],
    category: 'technical',
  },
  {
    id: 'token',
    term: 'Token',
    definition:
      'The fundamental unit AI models use to process text. A token represents approximately ¾ of a word in English. AI models read input and generate output one token at a time, and usage-based billing is calculated from token counts.',
    example:
      'The sentence "Hello, how are you?" contains about 6 tokens. A typical paragraph is 75–100 tokens. On CompareIntel, tokens are converted to credits for simplified billing.',
    relatedTerms: ['Context Window', 'Input Tokens', 'Output Tokens', 'Credits'],
    category: 'technical',
  },
  {
    id: 'input-tokens',
    term: 'Input Tokens',
    definition:
      'The tokens comprising your prompt and conversation history sent to the AI. Input tokens count toward context window usage and contribute to credit consumption, though at a lower rate than output tokens.',
    example:
      "When you paste a 1,000-word document and ask the AI to summarize it, that's approximately 750 input tokens. On CompareIntel, input tokens are counted at face value in the credit formula.",
    relatedTerms: ['Token', 'Output Tokens', 'Context Window', 'Effective Tokens'],
    category: 'technical',
  },
  {
    id: 'output-tokens',
    term: 'Output Tokens',
    definition:
      'The tokens generated by the AI in its response. Output tokens are computationally more expensive than input tokens because the model must predict and generate each one, which is why most AI services—including CompareIntel—weight them more heavily in pricing.',
    example:
      'A detailed 800-word response contains roughly 600 output tokens. On CompareIntel, output tokens are weighted at 2.5× in the effective tokens calculation, reflecting their higher computational cost.',
    relatedTerms: ['Token', 'Input Tokens', 'Response', 'Effective Tokens', 'Credits'],
    category: 'technical',
  },
  {
    id: 'knowledge-cutoff',
    term: 'Knowledge Cutoff',
    definition:
      'The date when the AI\'s training data ends. The model doesn\'t "know" about events, discoveries, or changes that happened after this date unless it has access to web search.',
    example:
      "If a model has a knowledge cutoff of January 2024, it won't know about events from March 2024 unless you tell it or it can search the web.",
    relatedTerms: ['Training Data', 'Web Search'],
    category: 'technical',
  },
  {
    id: 'training-data',
    term: 'Training Data',
    definition:
      'The massive collection of text (books, websites, articles, code, etc.) that an AI model learned from. The quality and breadth of training data affects what the model knows and how well it performs.',
    example:
      'A model trained on lots of scientific papers will be better at scientific topics. One trained on code repositories will be better at programming.',
    relatedTerms: ['Knowledge Cutoff', 'Large Language Model'],
    category: 'technical',
  },
  {
    id: 'hallucination',
    term: 'Hallucination',
    definition:
      'When an AI generates information that sounds plausible but is actually false or made up. This happens because AI predicts likely text rather than truly "knowing" facts.',
    example:
      "An AI might confidently cite a study that doesn't exist or give you incorrect historical dates. Always verify important information.",
    relatedTerms: ['Response', 'Training Data'],
    category: 'technical',
  },
  {
    id: 'streaming',
    term: 'Streaming',
    definition:
      'When AI responses appear word-by-word or chunk-by-chunk instead of all at once. This lets you start reading the response immediately rather than waiting for the entire answer.',
    example:
      'On CompareIntel, you see responses "typing" in real-time. This is streaming—the AI is generating and sending text as it creates it.',
    relatedTerms: ['Response', 'Token'],
    category: 'technical',
  },
  {
    id: 'inference',
    term: 'Inference',
    definition:
      'The process of an AI model generating a response to your prompt. It\'s when the AI "thinks" and produces output. This is different from training, which is how the model learned.',
    example:
      "Every time you send a message to ChatGPT and get a reply, that's the model performing inference.",
    relatedTerms: ['Response', 'Training Data'],
    category: 'technical',
  },

  // Models & Providers
  {
    id: 'provider',
    term: 'Provider',
    definition:
      'The company or organization that creates and offers an AI model. Different providers have different approaches to AI development and different model capabilities.',
    example:
      'OpenAI, Anthropic, Google, Meta, xAI, Mistral, and DeepSeek are all AI providers, each offering their own family of models.',
    relatedTerms: ['AI Model', 'Large Language Model'],
    category: 'models',
  },
  {
    id: 'open-source-model',
    term: 'Open Source Model',
    definition:
      'An AI model whose code and/or weights are publicly available for anyone to use, modify, and deploy. These models promote transparency and allow for community improvements.',
    example:
      "Meta's Llama models are open source, meaning developers can download and run them on their own computers.",
    relatedTerms: ['AI Model', 'Provider'],
    category: 'models',
  },
  {
    id: 'closed-source-model',
    term: 'Closed Source / Proprietary Model',
    definition:
      "An AI model that is only accessible through the provider's official service. The model's inner workings are not publicly shared.",
    example:
      "OpenAI's GPT models and Anthropic's Claude are closed source—you can only use them through their official services.",
    relatedTerms: ['AI Model', 'Provider', 'Open Source Model'],
    category: 'models',
  },
  {
    id: 'model-family',
    term: 'Model Family',
    definition:
      'A group of related AI models from the same provider, usually with different sizes and capabilities. Larger models in a family are typically more capable but slower and more expensive.',
    example:
      "OpenAI's GPT family includes various versions optimized for different use cases. Claude has Haiku (fast), Sonnet (balanced), and Opus (most capable).",
    relatedTerms: ['AI Model', 'Provider'],
    category: 'models',
  },
  {
    id: 'multimodal',
    term: 'Multimodal',
    definition:
      'AI models that can understand and/or generate multiple types of content—not just text, but also images, audio, or video.',
    example:
      'Many modern AI models can analyze images you upload. Some models can also generate images from text descriptions.',
    relatedTerms: ['AI Model', 'Large Language Model'],
    category: 'models',
  },

  // Usage & Features
  {
    id: 'conversation',
    term: 'Conversation / Chat History',
    definition:
      'The ongoing exchange between you and an AI model. The AI uses previous messages in the conversation to understand context and provide relevant responses.',
    example:
      'If you say "Tell me about dogs" then later ask "How long do they live?", the AI knows "they" refers to dogs because of conversation context.',
    relatedTerms: ['Context Window', 'Prompt', 'Response'],
    category: 'usage',
  },
  {
    id: 'follow-up',
    term: 'Follow-up',
    definition:
      'Continuing a conversation with additional questions or requests that build on previous responses. This lets you explore topics in depth.',
    example:
      'After an AI explains a concept, you might follow up with "Can you give me an example?" or "What are the drawbacks?"',
    relatedTerms: ['Conversation', 'Context Window'],
    category: 'usage',
  },
  {
    id: 'comparison',
    term: 'Model Comparison',
    definition:
      'Sending the same prompt to multiple AI models simultaneously to see how each one responds. This helps you find the best model for your specific needs.',
    example:
      'On CompareIntel, you can ask three different models the same coding question and see which gives the best solution.',
    relatedTerms: ['AI Model', 'Prompt', 'Response'],
    category: 'usage',
  },
  {
    id: 'web-search',
    term: 'Web Search (for AI)',
    definition:
      'A feature that allows AI models to search the internet for current information, overcoming the knowledge cutoff limitation.',
    example:
      'With web search enabled, you can ask "What happened in the news today?" and the AI can look it up rather than saying it doesn\'t know.',
    relatedTerms: ['Knowledge Cutoff', 'AI Model'],
    category: 'usage',
  },
  {
    id: 'api',
    term: 'API (Application Programming Interface)',
    definition:
      'A way for software applications to communicate with AI models. APIs allow developers to build AI features into their own apps and services.',
    example:
      'CompareIntel uses APIs to connect to multiple AI providers, letting you access different models all in one place.',
    relatedTerms: ['Provider', 'AI Model'],
    category: 'usage',
  },
  {
    id: 'rate-limiting',
    term: 'Rate Limiting',
    definition:
      'Restrictions on how many requests you can make to an AI service in a given time period. This prevents overuse and ensures fair access for everyone.',
    example:
      'If you hit a rate limit, you might need to wait a few minutes before sending more messages.',
    relatedTerms: ['API', 'Credits'],
    category: 'usage',
  },
  {
    id: 'credits',
    term: 'Credits',
    definition:
      "CompareIntel's unit of usage measurement that abstracts token costs into a simple, predictable system. Credits are calculated from effective tokens: 1 credit equals 1,000 effective tokens, where effective tokens account for both input and output with weighted pricing.",
    example:
      'A typical comparison might use 2,000 input tokens and 1,500 output tokens. The effective tokens would be 2,000 + (1,500 × 2.5) = 5,750, costing approximately 5.75 credits.',
    relatedTerms: ['Token', 'Input Tokens', 'Output Tokens', 'Effective Tokens'],
    category: 'usage',
  },
  {
    id: 'effective-tokens',
    term: 'Effective Tokens',
    definition:
      'A weighted calculation that reflects the true cost of AI processing. Effective tokens combine input tokens (your prompts) and output tokens (AI responses), with output tokens weighted at 2.5× because generating text requires significantly more computation than reading it.',
    example:
      'If you send 1,000 input tokens and receive 2,000 output tokens, your effective tokens are 1,000 + (2,000 × 2.5) = 6,000 effective tokens, which equals 6 credits on CompareIntel.',
    relatedTerms: ['Token', 'Input Tokens', 'Output Tokens', 'Credits'],
    category: 'usage',
  },
]

const categoryLabels: Record<string, string> = {
  basics: '🎯 AI Basics',
  models: '🤖 Models & Providers',
  technical: '⚙️ Technical Terms',
  usage: '💡 Usage & Features',
}

const categoryDescriptions: Record<string, string> = {
  basics: "Start here if you're completely new to AI",
  models: 'Understanding different AI systems and who makes them',
  technical: 'Deeper concepts for those wanting to learn more',
  usage: 'How to use AI tools effectively',
}

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
