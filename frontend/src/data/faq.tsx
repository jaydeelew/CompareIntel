import React from 'react'
import { Link } from 'react-router-dom'

export interface FAQItemData {
  id: string
  question: string
  answer: React.ReactNode
}

export const faqData: FAQItemData[] = [
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
    id: 'why-different-answers',
    question:
      'I asked the same question to three models and got completely different answers. Is that normal?',
    answer: (
      <>
        <p>
          Yes, that's completely normal and actually one of the main reasons CompareIntel exists!
          Different AI models are trained on different data, use different architectures, and have
          different "personalities" built in by their creators.
        </p>
        <p>
          Think of it like asking three different experts the same question—you'd expect some
          variation in their responses based on their backgrounds and perspectives. Some differences
          you might notice:
        </p>
        <ul>
          <li>
            <strong>Writing style:</strong> Claude tends to be more conversational and nuanced,
            while GPT models are often more direct
          </li>
          <li>
            <strong>Level of detail:</strong> Some models give concise answers while others provide
            comprehensive explanations
          </li>
          <li>
            <strong>Approach to problems:</strong> For coding questions, different models might
            suggest different (but equally valid) solutions
          </li>
          <li>
            <strong>Caution level:</strong> Some models are more conservative about uncertain topics
            while others are more willing to speculate
          </li>
        </ul>
        <p>
          This variation is exactly why comparing models is so valuable—you can find the one that
          best matches your preferences and needs for each type of task.
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
          into credits using a weighted formula. For the complete breakdown, see the{' '}
          <a href="#credits-system">"How does the credits system work?"</a> FAQ below.
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
  {
    id: 'how-accurate',
    question: "How do I know if an AI's answer is actually correct?",
    answer: (
      <>
        <p>
          This is one of the most important questions to ask! AI models are incredibly capable, but
          they're not infallible. Here's how to evaluate accuracy:
        </p>
        <ul>
          <li>
            <strong>Compare across models:</strong> If multiple models give the same answer, it's
            more likely to be correct. This is one of the biggest advantages of CompareIntel
          </li>
          <li>
            <strong>Check for confidence:</strong> Models that hedge their answers ("I think," "It's
            possible that") may be less certain—which can actually be a good sign of honesty
          </li>
          <li>
            <strong>Enable web search:</strong> For factual questions, web search helps models
            ground their answers in current sources
          </li>
          <li>
            <strong>Cross-reference important info:</strong> For anything consequential (medical,
            legal, financial), always verify with authoritative sources
          </li>
          <li>
            <strong>Ask for reasoning:</strong> Request that the model explain its logic—flawed
            reasoning is often easier to spot than a wrong answer
          </li>
        </ul>
        <p>
          Remember: AI is a powerful tool, but it works best when you treat it as a knowledgeable
          assistant rather than an infallible oracle.
        </p>
      </>
    ),
  },
  {
    id: 'gpt-vs-claude',
    question: "What's the difference between GPT and Claude? Which one should I use?",
    answer: (
      <>
        <p>
          GPT (from OpenAI) and Claude (from Anthropic) are two of the most popular AI model
          families, and they have different strengths:
        </p>
        <p>
          <strong>GPT models (OpenAI):</strong>
        </p>
        <ul>
          <li>Generally excellent at a wide range of tasks</li>
          <li>Strong at following complex instructions and coding</li>
          <li>Reasoning models (o1, o3) are particularly good at math and logic</li>
          <li>Very widely used, so lots of community knowledge available</li>
        </ul>
        <p>
          <strong>Claude models (Anthropic):</strong>
        </p>
        <ul>
          <li>Often praised for more natural, nuanced writing</li>
          <li>Tends to be more careful and less likely to make things up</li>
          <li>Generally better at following complex, multi-part instructions</li>
          <li>Strong at analysis and maintaining consistency in long conversations</li>
        </ul>
        <p>
          <strong>The honest answer:</strong> The "best" model depends on your specific task. That's
          exactly why CompareIntel exists—you can test both on your actual prompts and see which one
          works better for you. Many users find they prefer different models for different tasks.
        </p>
      </>
    ),
  },
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
    id: 'run-out-of-credits',
    question: 'What happens if I run out of credits in the middle of a comparison?',
    answer: (
      <>
        <p>
          If you don't have enough credits to complete a comparison, CompareIntel will let you know
          before you send your prompt. The system calculates the estimated cost based on your prompt
          length and number of models selected, and will warn you if you're running low.
        </p>
        <p>
          <strong>If you run out mid-comparison:</strong> In the rare case where a response is
          longer than expected and you run out of credits, you won't be charged for responses that
          couldn't complete. The partial responses you've received will still be visible.
        </p>
        <p>
          <strong>What you can do:</strong>
        </p>
        <ul>
          <li>
            <strong>Wait for reset:</strong> Free tier credits reset daily at midnight in your local
            timezone
          </li>
          <li>
            <strong>Use fewer models:</strong> Compare fewer models at once to use fewer credits per
            comparison
          </li>
          <li>
            <strong>Upgrade your plan:</strong> Paid plans have larger credit allocations that reset
            monthly
          </li>
          <li>
            <strong>Shorter prompts:</strong> More concise prompts use fewer input tokens
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'worth-paying',
    question: 'Is it worth paying for a subscription? The free tier seems pretty good.',
    answer: (
      <>
        <p>
          The free tier is genuinely useful for many users! Whether upgrading is worth it depends on
          how you use CompareIntel:
        </p>
        <p>
          <strong>Free tier might be enough if you:</strong>
        </p>
        <ul>
          <li>Use AI occasionally for quick questions</li>
          <li>Are happy comparing 3 models at a time</li>
          <li>Don't need access to premium/frontier models</li>
          <li>100 credits per day covers your usage</li>
        </ul>
        <p>
          <strong>Consider upgrading if you:</strong>
        </p>
        <ul>
          <li>Use AI daily for work or research</li>
          <li>Want to compare more models simultaneously (up to 12 on Pro+)</li>
          <li>Need access to the latest premium models like GPT-5, Claude Opus, etc.</li>
          <li>Run out of daily credits regularly</li>
          <li>Need to save more conversations for reference</li>
        </ul>
        <p>
          <strong>Our suggestion:</strong> Start with the free tier to see how you use CompareIntel.
          If you find yourself hitting limits or wanting premium models, then consider upgrading.
          There's no pressure—the free tier is genuinely capable.
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
    id: 'conversation-private',
    question: 'Can anyone else see my conversations? Is my data private?',
    answer: (
      <>
        <p>Your conversations are private. Here's how your data is handled:</p>
        <ul>
          <li>
            <strong>Your conversations are not shared</strong> with other CompareIntel users
          </li>
          <li>
            <strong>We don't sell your data</strong> or use it for advertising
          </li>
          <li>
            <strong>Conversations are sent to AI providers</strong> (like OpenAI, Anthropic, Google)
            to generate responses—this is necessary for the service to work
          </li>
          <li>
            <strong>You can delete your conversations</strong> at any time from your history
          </li>
          <li>
            <strong>For anonymous users:</strong> Conversations are stored locally in your browser,
            not on our servers
          </li>
        </ul>
        <p>
          <strong>Important note:</strong> While your data is private from other users, the AI
          providers may retain conversation data according to their own policies. If you're working
          with sensitive information, please review the privacy policies of the specific AI
          providers you're using.
        </p>
        <p>
          For full details, see our <Link to="/privacy-policy">Privacy Policy</Link>.
        </p>
      </>
    ),
  },
  {
    id: 'delete-account',
    question: 'What happens to my data if I delete my account?',
    answer: (
      <>
        <p>If you delete your account:</p>
        <ul>
          <li>Your account credentials are permanently deleted</li>
          <li>Your saved conversations are deleted from our servers</li>
          <li>Your model presets and settings are removed</li>
        </ul>
        <p>
          <strong>Note:</strong> Conversations that were sent to AI providers (OpenAI, Anthropic,
          etc.) may be retained by those providers according to their data policies—this is outside
          our control.
        </p>
        <p>
          To delete your account, go to Account Settings and scroll to the bottom to find the
          account deletion option.
        </p>
      </>
    ),
  },
  {
    id: 'use-for-work',
    question: 'Can I use CompareIntel for work? Is it okay for business use?',
    answer: (
      <>
        <p>Absolutely! Many professionals use CompareIntel for work purposes. It's great for:</p>
        <ul>
          <li>
            <strong>Developers:</strong> Compare how different models generate code, debug errors,
            or explain technical concepts
          </li>
          <li>
            <strong>Writers & marketers:</strong> Test which AI writes the best copy for your brand
            voice
          </li>
          <li>
            <strong>Researchers:</strong> Evaluate AI capabilities for academic or business research
          </li>
          <li>
            <strong>Business analysts:</strong> Compare how models summarize documents or analyze
            data
          </li>
          <li>
            <strong>Teams evaluating AI tools:</strong> Make data-driven decisions about which AI to
            adopt
          </li>
        </ul>
        <p>
          <strong>Considerations for business use:</strong>
        </p>
        <ul>
          <li>
            Review our <Link to="/terms-of-service">Terms of Service</Link> for commercial use
            details
          </li>
          <li>Be mindful of sharing confidential business information with AI models</li>
          <li>Higher tiers (Pro/Pro+) offer more capacity for heavier business use</li>
        </ul>
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
    id: 'works-offline',
    question: 'Does CompareIntel work offline?',
    answer: (
      <p>
        No, CompareIntel requires an internet connection to function. AI models run on remote
        servers, and your prompts need to be sent to these servers to generate responses. However,
        your conversation history (for registered users) is saved in the cloud, so you can access
        your previous conversations from any device once you're back online. Anonymous users'
        history is stored locally in their browser.
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
            <strong>Set a default selection:</strong> Mark any saved selection as default to
            auto-load your preferred models when you return.
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
          Select any combination of available models up to your tier's limit. All receive the same
          prompt simultaneously; responses stream in real-time side-by-side. CompareIntel notifies
          you if you exceed your limit.
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
    id: 'why-some-faster',
    question: 'Why are some models much faster than others?',
    answer: (
      <>
        <p>Model speed varies significantly, and there are several reasons for this:</p>
        <ul>
          <li>
            <strong>Model size:</strong> Larger, more capable models (like GPT-4 or Claude Opus)
            have more parameters and take longer to generate responses than smaller models (like
            GPT-3.5 or Claude Haiku)
          </li>
          <li>
            <strong>Server load:</strong> Popular models may have more users, which can slow
            response times during peak hours
          </li>
          <li>
            <strong>Reasoning models:</strong> Models like o1 and o3 intentionally "think" longer to
            produce better answers—they're slower by design
          </li>
          <li>
            <strong>Response length:</strong> Longer responses take more time to generate
          </li>
          <li>
            <strong>Provider infrastructure:</strong> Different AI companies have different server
            capacities
          </li>
        </ul>
        <p>
          <strong>Tip:</strong> If speed is important, look for models labeled "fast" or smaller
          models within a family (like Haiku instead of Opus, or GPT-4o-mini instead of GPT-4).
          CompareIntel lets you see firsthand how quickly each model responds.
        </p>
      </>
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
    id: 'better-prompts',
    question: 'Any tips for writing better prompts to get better answers?',
    answer: (
      <>
        <p>
          Absolutely! Good prompts make a huge difference in response quality. Here are some
          practical tips:
        </p>
        <ul>
          <li>
            <strong>Be specific:</strong> Instead of "Write about dogs," try "Write a 200-word
            overview of golden retriever temperament for first-time dog owners"
          </li>
          <li>
            <strong>Provide context:</strong> Tell the AI who you are or what you're trying to
            achieve: "I'm a beginner programmer trying to understand recursion..."
          </li>
          <li>
            <strong>Specify the format:</strong> "Give me a bulleted list," "Write this as a formal
            email," or "Explain like I'm 10 years old"
          </li>
          <li>
            <strong>Include examples:</strong> Show the AI what you want by providing a sample of
            the style or format you're looking for
          </li>
          <li>
            <strong>Break complex tasks down:</strong> Instead of one huge request, ask for things
            step by step
          </li>
          <li>
            <strong>Ask for reasoning:</strong> Adding "explain your reasoning" often produces
            better, more thoughtful responses
          </li>
        </ul>
        <p>
          <strong>Pro tip:</strong> Use CompareIntel to test different versions of your prompt! See
          which phrasing gets the best results across models.
        </p>
      </>
    ),
  },
  {
    id: 'copy-responses',
    question: 'Can I copy and paste the AI responses somewhere else?',
    answer: (
      <p>
        Yes! You can select and copy text from any response just like you would on any website. For
        code blocks, there's a convenient copy button that copies the entire code snippet with one
        click. If you want to save or share entire comparisons, use the Export feature to download
        responses as PDF, Markdown, HTML, or JSON files. The exported files preserve all formatting
        including code blocks, equations, and Markdown styling.
      </p>
    ),
  },
  {
    id: 'share-comparisons',
    question: 'Can I share my comparison results with someone else?',
    answer: (
      <>
        <p>
          While CompareIntel doesn't currently have a direct "share link" feature, you can easily
          share your comparisons in several ways:
        </p>
        <ul>
          <li>
            <strong>Export as PDF:</strong> Create a professional PDF document that you can email or
            share via any file-sharing service
          </li>
          <li>
            <strong>Export as HTML:</strong> Generate a standalone webpage file that anyone can open
            in a browser
          </li>
          <li>
            <strong>Export as Markdown:</strong> Perfect for sharing in Slack, Discord, GitHub, or
            any platform that supports Markdown
          </li>
          <li>
            <strong>Copy and paste:</strong> Select the text you want to share and paste it wherever
            you need
          </li>
        </ul>
        <p>
          Simply click the Export button above your comparison results and choose your preferred
          format.
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
    id: 'model-refuses',
    question: 'Why did a model refuse to answer my question?',
    answer: (
      <>
        <p>
          AI models have built-in safety guidelines and may decline certain requests. Common reasons
          for refusals:
        </p>
        <ul>
          <li>
            <strong>Harmful content:</strong> Models won't help with anything dangerous, illegal, or
            harmful
          </li>
          <li>
            <strong>Personal information:</strong> Models avoid sharing private data about real
            people
          </li>
          <li>
            <strong>Medical/legal advice:</strong> Some models are cautious about giving specific
            advice in these areas
          </li>
          <li>
            <strong>Misinformation:</strong> Models may decline to generate content that could
            spread false information
          </li>
          <li>
            <strong>Copyright concerns:</strong> Some models won't reproduce copyrighted content
          </li>
        </ul>
        <p>
          <strong>What you can try:</strong>
        </p>
        <ul>
          <li>Rephrase your question to be more specific about your legitimate intent</li>
          <li>Try a different model—safety thresholds vary between providers</li>
          <li>Break your request into smaller, more focused questions</li>
          <li>Add context about why you need the information</li>
        </ul>
        <p>
          CompareIntel is useful here too—if one model refuses, another might be willing to help
          with legitimate requests.
        </p>
      </>
    ),
  },
  {
    id: 'response-cut-off',
    question: 'Why did the response get cut off in the middle?',
    answer: (
      <>
        <p>Responses can be cut off for a few reasons:</p>
        <ul>
          <li>
            <strong>Output token limit:</strong> Each model has a maximum number of tokens it can
            generate in one response. Standard mode allows up to 4,000 output tokens; extended mode
            allows 8,192
          </li>
          <li>
            <strong>Model's natural stopping point:</strong> Sometimes models finish their thought
            but the ending seems abrupt
          </li>
          <li>
            <strong>Network issues:</strong> Occasionally, connection problems can interrupt
            streaming
          </li>
        </ul>
        <p>
          <strong>If your response was cut off:</strong>
        </p>
        <ul>
          <li>Send a follow-up message asking the model to "continue" or "finish the response"</li>
          <li>For very long content, ask for it in parts (e.g., "Give me the first half of...")</li>
          <li>If the model seems confused, start a new conversation with a more focused prompt</li>
        </ul>
      </>
    ),
  },
  {
    id: 'same-model-different-answers',
    question: 'I asked the same model the same question twice and got different answers. Why?',
    answer: (
      <>
        <p>
          This is actually normal behavior! AI models have a degree of randomness built into their
          response generation, controlled by a setting called "temperature." This is intentional and
          has benefits:
        </p>
        <ul>
          <li>
            <strong>Creativity:</strong> Without some randomness, models would be repetitive and
            less creative
          </li>
          <li>
            <strong>Variety:</strong> For creative tasks, you want different options
          </li>
          <li>
            <strong>Natural conversation:</strong> Real conversations aren't perfectly predictable
          </li>
        </ul>
        <p>
          <strong>What this means for you:</strong>
        </p>
        <ul>
          <li>For factual questions, core facts should remain consistent even if wording varies</li>
          <li>
            For creative tasks, this variability is a feature—you can regenerate to get different
            options
          </li>
          <li>
            If you need consistency, be very specific in your prompts about exactly what you want
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'site-slow',
    question: 'The site seems slow. What can I do?',
    answer: (
      <>
        <p>If CompareIntel feels slow, here are some things to check and try:</p>
        <ul>
          <li>
            <strong>Check your internet connection:</strong> AI responses require a stable
            connection for streaming
          </li>
          <li>
            <strong>Reduce models:</strong> Comparing fewer models simultaneously will feel faster
          </li>
          <li>
            <strong>Use faster models:</strong> Smaller models (like Haiku, GPT-4o-mini) respond
            much faster than larger ones
          </li>
          <li>
            <strong>Shorter prompts:</strong> Very long prompts take longer to process
          </li>
          <li>
            <strong>Try a different browser:</strong> Clear your cache or try a different browser
          </li>
          <li>
            <strong>Check provider status:</strong> Sometimes AI providers experience outages or
            slowdowns that affect all users
          </li>
        </ul>
        <p>
          If problems persist, please contact us at{' '}
          <a href="mailto:support@compareintel.com">support@compareintel.com</a>.
        </p>
      </>
    ),
  },
  {
    id: 'languages-supported',
    question: 'What languages does CompareIntel support?',
    answer: (
      <>
        <p>
          CompareIntel's interface is in English, but you can communicate with AI models in many
          languages! Most modern AI models understand and can respond in:
        </p>
        <ul>
          <li>Major world languages: Spanish, French, German, Portuguese, Italian, Dutch</li>
          <li>Asian languages: Chinese (Simplified & Traditional), Japanese, Korean</li>
          <li>Many other languages including Arabic, Hindi, Russian, Turkish, and more</li>
        </ul>
        <p>
          <strong>Tips for non-English use:</strong>
        </p>
        <ul>
          <li>You can write your prompt in any language</li>
          <li>You can ask models to respond in a specific language</li>
          <li>Quality varies by language and model—comparing models is especially useful here</li>
          <li>Some models are better at certain languages than others</li>
        </ul>
        <p>CompareIntel is actually great for finding which models work best for your language!</p>
      </>
    ),
  },
  {
    id: 'coding-use',
    question: 'Is CompareIntel good for coding and programming questions?',
    answer: (
      <>
        <p>
          Absolutely! CompareIntel is excellent for coding tasks, and many developers use it daily.
          Here's why:
        </p>
        <ul>
          <li>
            <strong>Compare code quality:</strong> Different models write code differently—some
            prefer certain patterns, are more concise, or better at specific languages
          </li>
          <li>
            <strong>Syntax highlighting:</strong> Code blocks are beautifully formatted with syntax
            highlighting for 100+ programming languages
          </li>
          <li>
            <strong>Easy copying:</strong> One-click copy button on all code blocks
          </li>
          <li>
            <strong>Debugging help:</strong> Compare how different models explain and fix bugs
          </li>
          <li>
            <strong>Learn different approaches:</strong> See how various models solve the same
            problem in different ways
          </li>
        </ul>
        <p>
          <strong>Popular for coding:</strong> Python, JavaScript, TypeScript, React, Java, C++,
          Rust, Go, SQL, and essentially any language. You can paste code, ask for reviews, request
          improvements, or get explanations of complex code.
        </p>
      </>
    ),
  },
  {
    id: 'academic-research',
    question: 'Can I use CompareIntel for academic research or school work?',
    answer: (
      <>
        <p>Yes, but with important considerations:</p>
        <p>
          <strong>Great uses for academics:</strong>
        </p>
        <ul>
          <li>Understanding difficult concepts—compare explanations from multiple models</li>
          <li>Brainstorming ideas and research directions</li>
          <li>Getting feedback on writing structure or arguments</li>
          <li>Learning how to approach problems</li>
          <li>Comparing AI model capabilities for AI/ML research</li>
        </ul>
        <p>
          <strong>Important warnings:</strong>
        </p>
        <ul>
          <li>
            <strong>Don't submit AI-generated work as your own</strong>—this is plagiarism at most
            institutions
          </li>
          <li>
            <strong>Verify all facts and citations</strong>—AI can hallucinate sources that don't
            exist
          </li>
          <li>
            <strong>Check your institution's AI policy</strong>—rules vary widely
          </li>
          <li>
            <strong>Use AI as a learning tool</strong>, not a shortcut to avoid learning
          </li>
        </ul>
        <p>
          Used responsibly, AI is a powerful learning companion. Used irresponsibly, it can hurt
          your education and get you in trouble. When in doubt, ask your professor or institution
          about their AI policy.
        </p>
      </>
    ),
  },
  {
    id: 'report-problem',
    question: 'How do I report a problem or get help?',
    answer: (
      <>
        <p>We're here to help! Here's how to get support:</p>
        <ul>
          <li>
            <strong>Email:</strong> Contact us at{' '}
            <a href="mailto:support@compareintel.com">support@compareintel.com</a>
          </li>
          <li>
            <strong>Check this FAQ:</strong> Many common questions are answered here
          </li>
          <li>
            <strong>
              Check our <Link to="/glossary">Glossary</Link>:
            </strong>{' '}
            If you're confused by AI terminology
          </li>
        </ul>
        <p>
          <strong>When reporting a problem, please include:</strong>
        </p>
        <ul>
          <li>What you were trying to do</li>
          <li>What happened instead</li>
          <li>Which models were involved (if applicable)</li>
          <li>Your browser and device type</li>
          <li>Any error messages you saw</li>
        </ul>
        <p>We typically respond within 24-48 hours.</p>
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
          <strong>Important notes:</strong> Web search requires a configured search provider. Only
          models with the 🌐 indicator support it. Models automatically decide when to search.
          Response time may increase by a few seconds. If search fails, models will say so.
        </p>
      </>
    ),
  },
]
