/**
 * FAQ Page Component
 * SEO-optimized FAQ page with structured data for rich snippets
 */

import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import './Pages.css'

interface FAQItemProps {
  question: string
  answer: React.ReactNode
  isOpen: boolean
  onToggle: () => void
}

const FAQItem: React.FC<FAQItemProps> = ({ question, answer, isOpen, onToggle }) => {
  return (
    <div className={`faq-item ${isOpen ? 'open' : ''}`}>
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

const faqData = [
  {
    id: 'what-is-compareintel',
    question: 'What is CompareIntel?',
    answer: (
      <p>
        CompareIntel is an AI model comparison platform that gives you access to the latest and
        greatest artificial intelligence models available. We continuously update our platform as
        new models are released, allowing you to test and compare responses from cutting-edge AI
        models side-by-side. You can send the same prompt to multiple models simultaneously and see
        how each one responds, making it easy to evaluate which AI model works best for your
        specific needs.
      </p>
    ),
  },
  {
    id: 'how-many-models',
    question: 'How many AI models can I compare?',
    answer: (
      <p>
        CompareIntel provides access to a wide range of the latest AI models from leading providers
        including OpenAI (GPT-4, GPT-4o), Anthropic (Claude 3.5 Sonnet, Claude 3 Opus), Google
        (Gemini Pro, Gemini Ultra), Meta (Llama 3), Mistral AI, and many more. We continuously add
        new models as they're released, so you always have access to the newest AI technology. You
        can select any combination of models to compare in a single query.
      </p>
    ),
  },
  {
    id: 'is-it-free',
    question: 'Is CompareIntel free to use?',
    answer: (
      <>
        <p>
          Yes! CompareIntel offers a free tier with daily credits. This is perfect for casual users
          who want to explore different AI models without any commitment. No credit card is required
          to sign up.
        </p>
        <p>
          For users who need more responses, we offer premium plans with higher limits and
          additional features.
        </p>
      </>
    ),
  },
  {
    id: 'how-does-it-work',
    question: 'How does CompareIntel work?',
    answer: (
      <ol>
        <li>Create a free account on CompareIntel</li>
        <li>Select the AI models you want to compare from our library of 50+ models</li>
        <li>Enter your prompt or question in the input field</li>
        <li>Click "Compare" to send your prompt to all selected models simultaneously</li>
        <li>Watch as responses stream in real-time from each model</li>
        <li>Compare the results side-by-side to determine which model performs best</li>
      </ol>
    ),
  },
  {
    id: 'what-can-i-compare',
    question: 'What types of tasks can I compare AI models on?',
    answer: (
      <>
        <p>You can compare AI models on virtually any text-based task, including:</p>
        <ul>
          <li>
            <strong>Code Generation:</strong> Compare how different models write code in Python,
            JavaScript, TypeScript, Java, and other languages
          </li>
          <li>
            <strong>Writing & Content:</strong> Evaluate creative writing, blog posts, marketing
            copy, and technical documentation
          </li>
          <li>
            <strong>Mathematical Problems:</strong> Test mathematical reasoning with full LaTeX
            equation rendering
          </li>
          <li>
            <strong>Analysis & Reasoning:</strong> Compare analytical capabilities on complex
            problems
          </li>
          <li>
            <strong>Q&A and Research:</strong> Evaluate accuracy and depth of responses to factual
            questions
          </li>
          <li>
            <strong>Summarization:</strong> See how different models summarize long documents
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'latex-support',
    question: 'Does CompareIntel support mathematical equations?',
    answer: (
      <p>
        Yes! CompareIntel fully supports LaTeX mathematical notation. When AI models include
        mathematical equations in their responses, they are rendered beautifully using
        professional-quality formatting. This includes both inline equations and display-mode block
        equations, making CompareIntel ideal for STEM-related comparisons.
      </p>
    ),
  },
  {
    id: 'code-highlighting',
    question: 'Is code syntax highlighting supported?',
    answer: (
      <p>
        Absolutely. CompareIntel renders code blocks with syntax highlighting for over 100
        programming languages. This makes it easy to read and compare code generated by different AI
        models. Supported languages include Python, JavaScript, TypeScript, Java, C++, Rust, Go,
        Ruby, PHP, Swift, Kotlin, and many more.
      </p>
    ),
  },
  {
    id: 'conversation-history',
    question: 'Can I have multi-turn conversations with AI models?',
    answer: (
      <p>
        Yes, CompareIntel supports multi-turn conversations. After receiving initial responses, you
        can continue the conversation with individual models. Each model maintains its conversation
        history, allowing you to ask follow-up questions and build on previous responses. This is
        great for testing how well models handle context over extended interactions.
      </p>
    ),
  },
  {
    id: 'data-security',
    question: 'Is my data secure on CompareIntel?',
    answer: (
      <>
        <p>
          Yes, we take data security seriously. CompareIntel implements several security measures:
        </p>
        <ul>
          <li>All data is transmitted over HTTPS with TLS/SSL encryption</li>
          <li>Secure authentication protects your account</li>
          <li>Rate limiting prevents abuse</li>
          <li>Clear data retention policies give you control over your information</li>
        </ul>
        <p>
          For more details, please review our <Link to="/privacy-policy">Privacy Policy</Link>.
        </p>
      </>
    ),
  },
  {
    id: 'gpt4-vs-claude',
    question: 'Which is better: GPT-4 or Claude?',
    answer: (
      <p>
        The "best" AI model depends entirely on your specific use case. GPT-4 and Claude each have
        different strengths. GPT-4 is known for its broad general knowledge and creative
        capabilities, while Claude excels at following complex instructions and producing
        well-structured outputs. The best way to determine which model works better for your needs
        is to compare them directly on CompareIntel with your actual prompts and tasks.
      </p>
    ),
  },
  {
    id: 'api-access',
    question: 'Does CompareIntel have an API?',
    answer: (
      <p>
        CompareIntel is currently available as a web application. We use a unified API backend that
        connects to multiple AI providers, but direct API access for external applications is not
        currently offered. The web interface provides the full comparison experience with all
        features including real-time streaming and rich rendering.
      </p>
    ),
  },
  {
    id: 'mobile-support',
    question: 'Can I use CompareIntel on mobile devices?',
    answer: (
      <p>
        Yes! CompareIntel is built as a Progressive Web App (PWA) and is fully responsive, working
        on smartphones and tablets as well as desktop computers. You can even install it on your
        device's home screen for quick access. The interface adapts to your screen size while
        maintaining full functionality.
      </p>
    ),
  },
  {
    id: 'model-updates',
    question: 'How often are new AI models added?',
    answer: (
      <p>
        Providing access to cutting-edge AI models is a core value of CompareIntel. We prioritize
        adding new models as soon as they become available from providers. When OpenAI, Anthropic,
        Google, Meta, or other providers release new AI models, we work to add them to CompareIntel
        as quickly as possible—often within days of their public release. This commitment ensures
        you're always able to evaluate the most advanced AI technology available.
      </p>
    ),
  },
  {
    id: 'account-required',
    question: 'Do I need an account to use CompareIntel?',
    answer: (
      <p>
        Yes, a free account is required to use CompareIntel. This allows us to provide you with your
        free daily quota of model responses, save your conversation history, and maintain a secure,
        personalized experience. Registration is quick and only requires an email address.
      </p>
    ),
  },
]

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
  const [openItems, setOpenItems] = useState<Set<string>>(new Set(['what-is-compareintel']))

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
              Find answers to common questions about CompareIntel, the AI model comparison platform
              that helps you test and compare over 50 AI models side-by-side.
            </p>
          </header>

          <section className="seo-section">
            <div className="faq-list">
              {faqData.map(item => (
                <FAQItem
                  key={item.id}
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

          <section className="seo-section cta-section">
            <h2>Ready to Compare AI Models?</h2>
            <p>
              Start comparing GPT-4, Claude, Gemini, Llama, and 50+ other AI models today. Sign up
              for free and receive daily credits—no credit card required. Registered users get twice
              the credits of unregistered users.
            </p>
            <Link to="/" className="cta-button">
              Start Comparing Free
            </Link>
          </section>
        </article>
      </div>
    </div>
  )
}
