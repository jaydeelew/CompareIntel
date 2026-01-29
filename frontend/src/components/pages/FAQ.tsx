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

// AI Basics for Beginners section - appears first in the FAQ
const aiBasicsFaqData = [
  {
    id: 'what-is-ai',
    question: 'What is AI and how does it work?',
    answer: (
      <>
        <p>
          <strong>Artificial Intelligence (AI)</strong> refers to computer systems designed to
          perform tasks that typically require human intelligence. Modern AI assistants like
          ChatGPT, Claude, and Gemini are powered by <strong>Large Language Models (LLMs)</strong>—
          sophisticated programs trained on massive amounts of text to understand and generate
          human-like responses. These models are continuously evolving, with new versions released
          regularly.
        </p>
        <p>
          When you type a question, the AI doesn't "think" like a human. Instead, it predicts the
          most likely helpful response based on patterns it learned during training. The result is a
          conversational experience that can help with writing, coding, research, creative projects,
          and much more.
        </p>
        <p>
          <a href="/glossary">Explore our AI Glossary →</a> for more terms explained in plain
          English.
        </p>
      </>
    ),
  },
  {
    id: 'what-is-context-window',
    question: 'What is a "context window" and why does it matter?',
    answer: (
      <>
        <p>
          A <strong>context window</strong> is like an AI's short-term memory—it's the maximum
          amount of text the model can "see" and remember during a conversation. This includes
          everything: your questions, the AI's responses, and any documents you share.
        </p>
        <p>
          Context windows are measured in "tokens" (roughly ¾ of a word). Here's what different
          sizes mean:
        </p>
        <ul>
          <li>
            <strong>8K tokens (~6,000 words):</strong> Good for short conversations and quick
            questions
          </li>
          <li>
            <strong>32K tokens (~24,000 words):</strong> Can handle longer documents or extended
            conversations
          </li>
          <li>
            <strong>128K+ tokens (~100,000 words):</strong> Can process entire books or very long
            documents at once
          </li>
        </ul>
        <p>
          <strong>Why it matters:</strong> If your conversation exceeds the context window, the AI
          will "forget" the earliest parts. Models with larger context windows are better for
          analyzing long documents or having extended conversations.
        </p>
      </>
    ),
  },
  {
    id: 'what-is-knowledge-cutoff',
    question: 'What is a "knowledge cutoff" date?',
    answer: (
      <>
        <p>
          The <strong>knowledge cutoff</strong> is the date when an AI model's training data ends.
          The model doesn't inherently "know" about events, discoveries, or changes that happened
          after this date.
        </p>
        <p>
          For example, if a model has a knowledge cutoff of January 2024, it won't know about news
          from March 2024—unless it has <strong>web search</strong> capability enabled, which allows
          it to look up current information in real-time.
        </p>
        <p>
          <strong>Tip:</strong> On CompareIntel, hover over the info icon (ⓘ) next to any model name
          to see its knowledge cutoff date. For time-sensitive questions, enable web search or
          choose models with more recent cutoff dates.
        </p>
      </>
    ),
  },
  {
    id: 'why-different-models',
    question: 'Why are there so many AI models? How do I choose?',
    answer: (
      <>
        <p>
          Different AI companies (called "providers") create their own models, each with unique
          strengths, training approaches, and personalities. Think of it like cars—there are many
          brands, and each has different features and performance characteristics.
        </p>
        <p>
          <strong>Common providers and their models:</strong>
        </p>
        <ul>
          <li>
            <strong>OpenAI:</strong> GPT series and reasoning models — Known for versatility and
            strong general performance
          </li>
          <li>
            <strong>Anthropic:</strong> Claude family (Haiku, Sonnet, Opus) — Known for nuanced
            writing and following instructions carefully
          </li>
          <li>
            <strong>Google:</strong> Gemini family — Known for strong reasoning and multimodal
            capabilities
          </li>
          <li>
            <strong>Meta:</strong> Llama models — Open-source models that run on various platforms
          </li>
        </ul>
        <p>
          <strong>That's why CompareIntel exists!</strong> Instead of guessing which model is best
          for your task, you can ask the same question to multiple models and see which one gives
          you the best answer.
        </p>
      </>
    ),
  },
  {
    id: 'what-are-tokens',
    question: 'What are "tokens" and why do they affect my usage?',
    answer: (
      <>
        <p>
          <strong>Tokens</strong> are the fundamental units AI models use to process text. Think of
          tokens as pieces of words—a token is roughly equivalent to ¾ of a word in English. For
          reference:
        </p>
        <ul>
          <li>"Hello" = 1 token</li>
          <li>"Hello, how are you today?" ≈ 6 tokens</li>
          <li>"Artificial intelligence" = 2–3 tokens</li>
          <li>A typical paragraph ≈ 75–100 tokens</li>
        </ul>
        <p>
          <strong>Input vs. Output Tokens:</strong> When you send a prompt to an AI model, those are{' '}
          <em>input tokens</em>. The AI's response consists of <em>output tokens</em>. Output tokens
          are more computationally expensive because the AI must generate each one, while input
          tokens are simply read. This is why most AI providers (and CompareIntel) weight output
          tokens more heavily in pricing.
        </p>
        <p>
          <strong>How this affects your credits:</strong> On CompareIntel, we convert token usage
          into credits using a weighted formula. See the{' '}
          <a href="#credits-system">"How does the credits system work?"</a> FAQ below for the
          complete breakdown.
        </p>
      </>
    ),
  },
  {
    id: 'can-ai-be-wrong',
    question: 'Can AI be wrong? What are "hallucinations"?',
    answer: (
      <>
        <p>
          <strong>Yes, AI can be wrong.</strong> AI models don't truly "know" facts—they predict
          likely responses based on patterns in their training data. This means they can sometimes
          generate information that sounds convincing but is actually incorrect.
        </p>
        <p>
          This phenomenon is called <strong>"hallucination"</strong>—when an AI confidently states
          something that isn't true. For example, an AI might cite a research paper that doesn't
          exist or give you incorrect historical dates.
        </p>
        <p>
          <strong>Best practices:</strong>
        </p>
        <ul>
          <li>
            <strong>Verify important information</strong> from authoritative sources, especially for
            medical, legal, or financial topics
          </li>
          <li>
            <strong>Use web search</strong> when you need current or factual information
          </li>
          <li>
            <strong>Compare multiple models</strong>—if they all agree, the information is more
            likely to be accurate
          </li>
          <li>
            <strong>Ask for sources</strong>—though AI might still make up citations, it can help
            you identify what to verify
          </li>
        </ul>
      </>
    ),
  },
]

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
      <>
        <p>
          CompareIntel provides access to 65+ of the latest AI models from leading providers
          including OpenAI, Anthropic, Google, Meta, Mistral AI, xAI, and many more. We continuously
          add new models as they're released, so you always have access to the newest AI technology.
        </p>
        <p>
          <strong>
            How many models you can compare simultaneously depends on your subscription tier:
          </strong>
        </p>
        <ul>
          <li>
            <strong>Anonymous and Free tiers:</strong> Up to 3 models per comparison
          </li>
          <li>
            <strong>Starter and Starter+ tiers:</strong> Up to 6 models per comparison
          </li>
          <li>
            <strong>Pro tier:</strong> Up to 9 models per comparison
          </li>
          <li>
            <strong>Pro+ tier:</strong> Up to 12 models per comparison
          </li>
        </ul>
        <p>
          You can select any combination of available models up to your tier's limit. Free and
          unregistered users have access to a selection of free-tier models, while paid tiers unlock
          access to all premium AI models. This tiered approach ensures everyone can use
          CompareIntel while providing clear upgrade paths for users who need to compare more models
          simultaneously or access premium models.
        </p>
      </>
    ),
  },
  {
    id: 'is-it-free',
    question: 'Is CompareIntel free to use?',
    answer: (
      <>
        <p>
          Yes! CompareIntel offers free access options. <strong>Unregistered users</strong> can get
          familiar with the platform with 50 credits per day—no account required. For access to more
          models and additional credits, you can <strong>sign up for a free account</strong>
          which provides 100 credits per day (twice the amount for unregistered users). No credit
          card is required to sign up.
        </p>
        <p>
          <strong>Paid subscription tiers are available</strong> for users who need more credits and
          access to premium AI models. Paid tiers include Starter ($9.95/month), Starter+
          ($19.95/month), Pro ($39.95/month), and Pro+ ($79.95/month), each with increasing credit
          allocations, more models per comparison, and more conversation history storage.
        </p>
      </>
    ),
  },
  {
    id: 'how-does-it-work',
    question: 'How does CompareIntel work?',
    answer: (
      <>
        <p>Using CompareIntel is straightforward:</p>
        <ol>
          <li>
            You can start immediately without an account, or create a free account for more credits
            and features
          </li>
          <li>
            Select the AI models you want to compare from our library of 65+ models (up to 3 models
            for free users, more for paid tiers)
          </li>
          <li>
            Enter your prompt or question in the input field—you can also attach files like PDFs or
            documents
          </li>
          <li>Click "Compare" to send your prompt to all selected models simultaneously</li>
          <li>Watch as responses stream in real-time from each model, appearing token-by-token</li>
          <li>
            Compare the results side-by-side to determine which model performs best for your needs
          </li>
          <li>
            Ask follow-up questions to continue the conversation, or export your comparison in PDF,
            Markdown, HTML, or JSON format
          </li>
        </ol>
      </>
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
        can ask follow-up questions that are sent to all selected models simultaneously. Each model
        maintains its own conversation history (seeing only its own previous responses), allowing
        you to build on previous interactions and test how well each model handles context over
        extended conversations. This is great for comparing how different models maintain context
        and respond to follow-up questions.
      </p>
    ),
  },
  {
    id: 'breakout-conversations',
    question: 'What are breakout conversations and how do they work?',
    answer: (
      <>
        <p>
          Breakout conversations allow you to continue a conversation with just one model from a
          multi-model comparison. This is perfect when you've compared multiple models and found one
          that particularly stands out.
        </p>
        <p>
          <strong>How to use breakout conversations:</strong>
        </p>
        <ul>
          <li>
            During any multi-model comparison, look for the breakout button (↗) in the top-right
            corner of each model's response card
          </li>
          <li>
            Click the breakout button on the model you want to continue with—this instantly creates
            a new, separate conversation with just that model
          </li>
          <li>
            The breakout conversation includes all previous messages from the original comparison
            (both your prompts and that model's responses), so you can continue seamlessly without
            losing context
          </li>
          <li>
            The breakout conversation is completely independent—you can continue chatting with that
            model while the original multi-model comparison remains intact in your history
          </li>
        </ul>
        <p>
          <strong>Key benefits:</strong>
        </p>
        <ul>
          <li>Focus your conversation on the model that's working best for your specific needs</li>
          <li>
            Create multiple breakout conversations from the same comparison, even with the same
            model, to explore different conversation paths
          </li>
          <li>
            Easily identify breakout conversations in your history—they appear with a special badge
            (↗)
          </li>
          <li>Available for both registered and unregistered users</li>
        </ul>
        <p>
          <strong>Example:</strong> You compare models from OpenAI, Anthropic, and Google on a
          coding problem. One gives the best solution, so you break out with that model to ask
          follow-up questions about optimization. The original comparison stays in your history for
          reference.
        </p>
      </>
    ),
  },
  {
    id: 'export-comparisons',
    question: 'Can I export my comparisons?',
    answer: (
      <>
        <p>Yes! CompareIntel offers multiple export options to save and share your comparisons:</p>
        <ul>
          <li>
            <strong>PDF Export:</strong> Generate a professional PDF document with all model
            responses, perfect for sharing, printing, or archiving. Includes proper formatting for
            code blocks, LaTeX equations, and markdown content.
          </li>
          <li>
            <strong>Markdown Export:</strong> Export your comparison as a Markdown file (.md) that
            preserves all formatting. Ideal for documentation, note-taking apps, or version control
            systems. Includes user and assistant message indicators for easy reading.
          </li>
          <li>
            <strong>HTML Export:</strong> Create a standalone HTML file that can be opened in any
            browser or shared via email. Includes all styling and formatting for a complete viewing
            experience.
          </li>
          <li>
            <strong>JSON Export:</strong> Export raw data in JSON format for developers or API
            integration. Includes all conversation data, model metadata, and comparison statistics.
          </li>
        </ul>
        <p>
          All export formats include the original prompt, all model responses, model metadata (name
          and provider), response statistics, and comparison metadata. To export, simply click the
          "Export" button above your comparison results and select your preferred format. The
          filename is automatically generated from your prompt for easy identification.
        </p>
      </>
    ),
  },
  {
    id: 'file-attachments',
    question: 'Can I attach files to my comparisons?',
    answer: (
      <>
        <p>
          Yes! CompareIntel supports file attachments, allowing you to include documents, code
          files, and text files in your comparisons. You can attach files in two ways:
        </p>
        <ul>
          <li>
            <strong>Drag and drop:</strong> Simply drag files from your computer onto the input area
          </li>
          <li>
            <strong>File picker:</strong> Click the file attachment button to browse and select
            files
          </li>
        </ul>
        <p>
          Supported file formats include PDF documents, Word documents (.docx, .doc), text files,
          code files, markdown files, and more. You can attach multiple files to a single comparison
          and arrange them in any order with your text. The file contents are automatically
          extracted and included when sending your prompt to the AI models.
        </p>
        <p>
          <strong>Persistent file context:</strong> Attached files persist across conversation
          sessions, so you can close your browser and return later to ask follow-up questions about
          your documents. The file contents remain available for the models to reference in
          subsequent conversation turns.
        </p>
      </>
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
    id: 'comparing-models',
    question: 'Which AI model is best?',
    answer: (
      <p>
        The "best" AI model depends entirely on your specific use case. OpenAI's GPT models,
        Anthropic's Claude, Google's Gemini, and other leading models each have different strengths.
        Some excel at creative writing, others at code generation, analysis, or following complex
        instructions. The best way to determine which model works better for your needs is to
        compare them directly on CompareIntel with your actual prompts and tasks.
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
      <>
        <p>
          No, you can start using CompareIntel without an account!{' '}
          <strong>Unregistered users</strong>
          receive 50 credits per day and can compare up to 3 models at once. Your conversation
          history is saved locally in your browser. This is perfect for trying out AI model
          comparison and seeing how it works.
        </p>
        <p>
          However, <strong>signing up for a free account</strong> gives you 100 credits per day
          (twice the amount for unregistered users) and access to more models. A free account also
          saves your conversation history in the cloud, allowing you to access it from any device.
          Registration is quick and only requires an email address—no credit card needed.
        </p>
        <p>
          <strong>Paid subscription tiers are available</strong> that unlock access to all premium
          AI models, higher credit allocations (monthly instead of daily), more models per
          comparison (up to 12 for Pro+), and more conversation history storage (up to 80
          conversations for Pro+).
        </p>
      </>
    ),
  },
  {
    id: 'credits-system',
    question: 'How does the credits system work?',
    answer: (
      <>
        <p>
          CompareIntel uses a credit-based system that translates AI token usage into a simple,
          predictable unit. This approach abstracts the complexity of different model pricing while
          ensuring fair and transparent billing.
        </p>
        <p>
          <strong>The Token-to-Credit Formula:</strong>
        </p>
        <ul>
          <li>
            <strong>Effective Tokens</strong> = Input Tokens + (Output Tokens × 2.5)
          </li>
          <li>
            <strong>Credits Used</strong> = Effective Tokens ÷ 1,000
          </li>
        </ul>
        <p>
          The 2.5× multiplier on output tokens reflects the higher computational cost of generating
          text compared to processing input. This industry-standard weighting ensures our pricing
          aligns with actual AI provider costs.
        </p>
        <p>
          <strong>Practical Example:</strong> Suppose you send a 500-word prompt (≈400 input tokens)
          and receive a detailed 800-word response (≈600 output tokens). Your usage would be:
        </p>
        <ul>
          <li>Effective Tokens: 400 + (600 × 2.5) = 1,900</li>
          <li>
            Credits Used: 1,900 ÷ 1,000 = <strong>1.9 credits</strong>
          </li>
        </ul>
        <p>
          When comparing multiple models simultaneously, credits are calculated separately for each
          model's response and summed together.
        </p>
        <p>
          <strong>Credit Allocations:</strong>
        </p>
        <ul>
          <li>
            <strong>Free tiers:</strong> Unregistered users receive 50 credits/day; registered free
            users receive 100 credits/day. Credits reset daily at midnight UTC.
          </li>
          <li>
            <strong>Paid tiers:</strong> Monthly allocations from 1,200 credits (Starter) to 10,000
            credits (Pro+). Credits reset monthly on your billing date. Additional credits can be
            purchased if needed.
          </li>
        </ul>
        <p>
          <strong>Important:</strong> Credits are only deducted upon successful completion—if a
          request fails, no credits are charged. You can monitor your balance in real-time via the
          credit indicator in the interface.
        </p>
      </>
    ),
  },
  {
    id: 'subscription-tiers',
    question: 'What are the different subscription tiers and their limits?',
    answer: (
      <>
        <p>CompareIntel offers several subscription tiers to meet different needs:</p>
        <ul>
          <li>
            <strong>Anonymous (Free):</strong> 50 credits/day, 3 models per comparison, 2 saved
            conversations, 2 saved model selections
          </li>
          <li>
            <strong>Free:</strong> 100 credits/day, 3 models per comparison, 3 saved conversations,
            3 saved model selections
          </li>
          <li>
            <strong>Starter ($9.95/month):</strong> 1,200 credits/month, 6 models per comparison, 10
            saved conversations, 5 saved model selections, access to all premium models
          </li>
          <li>
            <strong>Starter+ ($19.95/month):</strong> 2,500 credits/month, 6 models per comparison,
            20 saved conversations, 10 saved model selections, access to all premium models
          </li>
          <li>
            <strong>Pro ($39.95/month):</strong> 5,000 credits/month, 9 models per comparison, 40
            saved conversations, 15 saved model selections, access to all premium models
          </li>
          <li>
            <strong>Pro+ ($79.95/month):</strong> 10,000 credits/month, 12 models per comparison, 80
            saved conversations, 20 saved model selections, access to all premium models
          </li>
        </ul>
        <p>
          All paid tiers include access to premium AI models that aren't available to free users.
          Paid tiers also allow purchasing additional credits beyond your monthly allocation if
          needed.
        </p>
      </>
    ),
  },
  {
    id: 'saved-selections',
    question: 'Can I save my favorite model combinations?',
    answer: (
      <>
        <p>
          Yes! CompareIntel allows you to save named groups of models for quick access. This feature
          is perfect for organizing different model combinations by use case.
        </p>
        <p>
          <strong>How it works:</strong>
        </p>
        <ul>
          <li>
            After selecting your models, click "Save Selection" and give it a custom name (up to 50
            characters)
          </li>
          <li>Your saved selections are stored locally and persist across sessions</li>
          <li>
            Load any saved selection with a single click to instantly restore your preferred model
            combination
          </li>
          <li>You can rename or delete saved selections as your needs change</li>
          <li>
            <strong>Set a default selection:</strong> Mark any saved selection as your default by
            checking the default checkbox next to it. When you return to CompareIntel, your default
            model selection will automatically be loaded, so your preferred models are already
            selected and ready to use. This saves time by eliminating the need to manually select
            your models each time you visit the site.
          </li>
        </ul>
        <p>
          <strong>Limits by tier:</strong> Unregistered users can save up to 2 selections, free
          users can save 3, and paid tiers can save up to 20 selections (Pro+). This feature works
          great for different use cases—save one selection for coding tasks, another for creative
          writing, and another for data analysis.
        </p>
      </>
    ),
  },
  {
    id: 'conversation-history-limits',
    question: 'How many conversations can I save?',
    answer: (
      <>
        <p>
          Conversation history limits vary by subscription tier. Each conversation (whether it's a
          single comparison or includes follow-up questions) counts as one conversation:
        </p>
        <ul>
          <li>
            <strong>Anonymous:</strong> 2 conversations (stored locally in your browser)
          </li>
          <li>
            <strong>Free:</strong> 3 conversations (stored in the cloud, accessible from any device)
          </li>
          <li>
            <strong>Starter:</strong> 10 conversations
          </li>
          <li>
            <strong>Starter+:</strong> 20 conversations
          </li>
          <li>
            <strong>Pro:</strong> 40 conversations
          </li>
          <li>
            <strong>Pro+:</strong> 80 conversations
          </li>
        </ul>
        <p>
          When you reach your limit, the oldest conversations are automatically removed to make room
          for new ones. You can also manually delete conversations you no longer need. For
          registered users, conversations are stored in the cloud and accessible from any device.
          Unregistered users' conversations are stored locally in their browser.
        </p>
      </>
    ),
  },
  {
    id: 'extended-mode',
    question: 'What is extended mode and when is it used?',
    answer: (
      <>
        <p>
          Extended mode automatically activates for longer conversations and provides increased
          capacity for both input and output:
        </p>
        <ul>
          <li>
            <strong>Standard mode:</strong> Up to 5,000 characters input and 4,000 tokens output per
            model
          </li>
          <li>
            <strong>Extended mode:</strong> Up to 15,000 characters input and 8,192 tokens output
            per model
          </li>
        </ul>
        <p>
          Extended mode is automatically enabled when you have longer conversations (typically after
          several follow-up questions). There are no separate limits for extended mode—it simply
          uses your regular credits. The system automatically manages context to ensure optimal
          performance and prevent context overflow.
        </p>
        <p>
          Extended mode is particularly useful for complex tasks that require more context, such as
          analyzing long documents, having detailed technical discussions, or working through
          multi-step problems.
        </p>
      </>
    ),
  },
  {
    id: 'models-per-comparison',
    question: 'How many models can I compare at once?',
    answer: (
      <>
        <p>
          CompareIntel uses a tiered system that determines how many AI models you can compare
          simultaneously in a single comparison. The number of models you can select increases with
          each subscription tier:
        </p>
        <ul>
          <li>
            <strong>Anonymous (Unregistered) and Free:</strong> Up to 3 models per comparison. This
            tier is perfect for trying out CompareIntel and comparing a few models side-by-side.
            Unregistered users get 50 credits per day, while free registered users get 100 credits
            per day.
          </li>
          <li>
            <strong>Starter ($9.95/month) and Starter+ ($19.95/month):</strong> Up to 6 models per
            comparison. These paid tiers unlock the ability to compare more models simultaneously,
            giving you access to all premium AI models, monthly credit allocations (1,200 credits
            for Starter, 2,500 for Starter+), and more saved conversations.
          </li>
          <li>
            <strong>Pro ($39.95/month):</strong> Up to 9 models per comparison. The Pro tier
            provides 5,000 credits per month and allows you to compare nearly double the number of
            models compared to free tiers, making it ideal for power users who need comprehensive
            model comparisons.
          </li>
          <li>
            <strong>Pro+ ($79.95/month):</strong> Up to 12 models per comparison. The highest tier
            allows you to compare the maximum number of models simultaneously, with 10,000 credits
            per month and the most generous limits for saved conversations and model selections.
          </li>
        </ul>
        <p>
          <strong>How it works:</strong> When you select models for a comparison, CompareIntel
          enforces your tier's model limit. You can choose any combination of available models up to
          your tier's maximum. All selected models receive the same prompt simultaneously, and
          you'll see their responses stream in real-time side-by-side for easy comparison. If you
          try to select more models than your tier allows, CompareIntel will notify you of the
          limit.
        </p>
        <p>
          <strong>Upgrading your tier:</strong> Higher tiers not only increase the number of models
          you can compare at once, but also provide more credits, access to premium models, more
          saved conversations, and more saved model selections. This tiered approach ensures that
          free users can fully experience CompareIntel while providing clear upgrade paths for users
          who need more capacity.
        </p>
      </>
    ),
  },
  {
    id: 'real-time-streaming',
    question: 'How does real-time streaming work?',
    answer: (
      <p>
        CompareIntel uses Server-Sent Events (SSE) to stream responses from AI models in real-time.
        This means you see responses appear token-by-token as the models generate them, rather than
        waiting for the complete response. Each model's response streams independently, so you can
        start reading one model's answer while others are still generating. This provides a much
        faster and more interactive experience compared to waiting for complete responses. Streaming
        works for all models and all conversation types, including follow-up questions.
      </p>
    ),
  },
  {
    id: 'markdown-support',
    question: 'Does CompareIntel support Markdown formatting?',
    answer: (
      <p>
        Yes! CompareIntel fully supports Markdown formatting in AI responses. This includes
        headings, lists (ordered and unordered), bold and italic text, links, tables, code blocks,
        blockquotes, and more. All Markdown is rendered properly in the interface, making it easy to
        read formatted responses. When you export comparisons, Markdown formatting is preserved in
        Markdown and HTML exports, and converted to appropriate formatting in PDF exports.
      </p>
    ),
  },
  {
    id: 'credit-reset',
    question: 'When do my credits reset?',
    answer: (
      <>
        <p>Credit reset timing depends on your subscription tier:</p>
        <ul>
          <li>
            <strong>Anonymous and Free tiers:</strong> Credits reset daily at midnight in your local
            timezone
          </li>
          <li>
            <strong>Paid tiers (Starter, Starter+, Pro, Pro+):</strong> Credits reset monthly on
            your billing date
          </li>
        </ul>
        <p>
          You can always check your current credit balance and when credits will reset next in your
          account dashboard. Unused credits don't roll over—free tier users get a fresh allocation
          each day, and paid tier users get a fresh allocation each month.
        </p>
      </>
    ),
  },
  {
    id: 'premium-models',
    question: 'What are premium AI models and which tier includes them?',
    answer: (
      <>
        <p>
          Premium AI models are the latest and most advanced models from providers like OpenAI,
          Anthropic, Google, and others. These models typically have higher capabilities but also
          higher costs.
        </p>
        <p>
          <strong>Free and Unregistered tiers:</strong> Access to a selection of free-tier models,
          which are still powerful and capable for most use cases.
        </p>
        <p>
          <strong>All Paid Tiers (Starter and above):</strong> Full access to all premium AI models,
          including the latest models from OpenAI, Anthropic, Google, and other leading providers as
          they're released. Paid tiers ensure you always have access to the most cutting-edge AI
          technology available.
        </p>
      </>
    ),
  },
  {
    id: 'browser-fingerprinting',
    question: 'How does CompareIntel track usage for unregistered users?',
    answer: (
      <p>
        For anonymous (unregistered) users, CompareIntel uses browser fingerprinting to track usage
        and enforce rate limits. This creates a unique identifier based on your browser's
        characteristics (like screen resolution, installed fonts, and other
        non-personally-identifiable information) combined with your IP address. This allows us to
        provide a consistent experience and prevent abuse while maintaining your privacy. The
        fingerprint is hashed and cannot be used to identify you personally. If you want a more
        persistent experience with cloud-saved history, we recommend creating a free account.
      </p>
    ),
  },
  {
    id: 'error-handling',
    question: 'What happens if a model fails or returns an error?',
    answer: (
      <>
        <p>If a model fails to respond or returns an error during a comparison:</p>
        <ul>
          <li>The error message is displayed in that model's response card</li>
          <li>Other models' responses continue to stream normally</li>
          <li>No credits are deducted for failed model responses</li>
          <li>You can retry the comparison or continue with the successful models</li>
        </ul>
        <p>
          Common error scenarios include model rate limits, temporary service outages, or invalid
          requests. If you encounter persistent errors, try again in a few moments or select
          different models. If problems continue, contact support.
        </p>
      </>
    ),
  },
  {
    id: 'context-management',
    question: 'How does CompareIntel manage conversation context?',
    answer: (
      <>
        <p>
          CompareIntel intelligently manages conversation context to ensure optimal performance:
        </p>
        <ul>
          <li>
            Each model in a multi-model comparison maintains its own independent conversation
            history
          </li>
          <li>Models only see their own previous responses, not other models' responses</li>
          <li>
            For very long conversations (20+ messages), the system automatically keeps the most
            recent messages while preserving important context
          </li>
          <li>
            Context is preserved across follow-up questions, allowing for natural multi-turn
            conversations
          </li>
        </ul>
        <p>
          This ensures fair comparisons where each model responds independently, and prevents
          context overflow that could degrade response quality. The system automatically handles
          context management transparently—you don't need to worry about it.
        </p>
      </>
    ),
  },
  {
    id: 'web-search',
    question: 'What is web search and how does it work?',
    answer: (
      <>
        <p>
          Web search is a powerful feature that allows compatible AI models to search the Internet
          for real-time, current information. This enables models to answer questions about recent
          events, current data, and time-sensitive information that goes beyond their training data.
        </p>
        <p>
          <strong>How to enable web search:</strong>
        </p>
        <ul>
          <li>
            Look for the web search toggle button (🌐) in the input area, next to the file
            attachment button
          </li>
          <li>Click the toggle to enable web search before sending your prompt</li>
          <li>
            Web search is only available when you have at least one model selected that supports
            this capability
          </li>
          <li>
            Models that support web search are marked with a 🌐 icon next to their name in the model
            selection area
          </li>
        </ul>
        <p>
          <strong>What web search can do:</strong>
        </p>
        <ul>
          <li>
            <strong>Search the Internet:</strong> Models can search for current information on any
            topic
          </li>
          <li>
            <strong>Fetch webpage content:</strong> Models can retrieve detailed content from
            specific URLs when needed
          </li>
          <li>
            <strong>Cite sources:</strong> Models include source URLs and timestamps in their
            responses, so you know where information comes from
          </li>
          <li>
            <strong>Real-time data:</strong> Access current weather, news, stock prices, sports
            scores, and other time-sensitive information
          </li>
        </ul>
        <p>
          <strong>Best use cases for web search:</strong>
        </p>
        <ul>
          <li>Questions about recent news or current events</li>
          <li>Weather forecasts and current conditions for specific locations</li>
          <li>Stock prices and financial market data</li>
          <li>Sports scores and game results</li>
          <li>Product information, release dates, or availability</li>
          <li>Any query requiring information more recent than the model's training data</li>
        </ul>
        <p>
          <strong>Important notes:</strong>
        </p>
        <ul>
          <li>Web search requires a configured search provider (configured by administrators)</li>
          <li>
            Not all models support web search—only models with the 🌐 indicator can use this feature
          </li>
          <li>
            When web search is enabled, models automatically decide when to search based on your
            question
          </li>
          <li>
            Web search may add a few seconds to response time as models fetch information from the
            Internet
          </li>
          <li>
            If web search fails or returns no results, models will explicitly state this rather than
            providing generic information
          </li>
        </ul>
        <p>
          Web search is perfect for comparing how different models gather, evaluate, and synthesize
          current information from the web, making CompareIntel ideal for research tasks that
          require up-to-date data.
        </p>
      </>
    ),
  },
]

// Combine all FAQ data for SEO structured data
const allFaqData = [...aiBasicsFaqData, ...faqData]

// Generate FAQ structured data for SEO
const generateFAQStructuredData = () => {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: allFaqData.map(item => ({
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

          {/* AI Basics for Beginners Section */}
          <section className="seo-section ai-basics-section">
            <div className="ai-basics-header">
              <span className="ai-basics-badge">🎓 New to AI?</span>
              <h2>AI Basics for Beginners</h2>
              <p>
                Start here if you're new to artificial intelligence. These questions cover the
                fundamental concepts you need to understand AI and get the most out of CompareIntel.
              </p>
              <p className="ai-basics-link">
                Want to dive deeper? <Link to="/glossary">Explore our complete AI Glossary →</Link>
              </p>
            </div>
            <div className="faq-list">
              {aiBasicsFaqData.map(item => (
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

          {/* Main FAQ Section */}
          <section className="seo-section">
            <h2>Using CompareIntel</h2>
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
              Start comparing the latest AI models from OpenAI, Anthropic, Google, Meta, and more
              today. Unregistered users can get started immediately with 50 credits per day, or sign
              up for a free account to receive 100 credits per day—no credit card required. Paid
              subscription tiers are available for users who need more credits, access to premium
              models, and higher limits.
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
