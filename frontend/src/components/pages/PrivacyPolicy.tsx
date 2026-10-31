/**
 * Privacy Policy Page Component
 * Legal document explaining data collection and usage practices
 */

import React from 'react'
import { Link } from 'react-router-dom'

import { BackToMainCTA } from '../shared'
import './Pages.css'

export const PrivacyPolicy: React.FC = () => {
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="seo-page legal-page">
      <div className="seo-page-container">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span className="breadcrumb-separator">/</span>
          <span aria-current="page">Privacy Policy</span>
        </nav>

        <article className="seo-page-content">
          <header className="seo-page-header">
            <h1>Privacy Policy</h1>
            <p className="last-updated">Last Updated: {currentDate}</p>
          </header>

          <section className="seo-section">
            <h2>Introduction</h2>
            <p>
              Welcome to CompareIntel. We respect your privacy and are committed to protecting your
              personal data. This Privacy Policy explains how we collect, use, disclose, and
              safeguard your information when you use our AI model comparison platform at
              compareintel.com (the "Service"). CompareIntel acts as a pass-through: we send your
              prompts to AI providers and display responses, but we do not access, analyze, train
              on, or use your prompt or response content for any other purpose.
            </p>
            <p>
              By using CompareIntel, you agree to the collection and use of information in
              accordance with this policy. If you do not agree, please do not use our Service.
            </p>
          </section>

          <section className="seo-section">
            <h2>Information We Collect</h2>

            <h3>Information You Provide to Us</h3>
            <p>We collect information that you voluntarily provide when using our Service:</p>
            <ul className="seo-list">
              <li>
                <strong>Account Information:</strong> When you create an account, we collect your
                email address and any profile information you choose to provide.
              </li>
              <li>
                <strong>Prompts and Queries:</strong> Prompts are sent directly to AI providers to
                generate responses. Conversation history may be stored for your use and is only
                accessible to you.
              </li>
              <li>
                <strong>Communications:</strong> If you contact us for support or feedback, we
                collect the information you provide in those communications.
              </li>
            </ul>

            <h3>Information Collected Automatically</h3>
            <p>When you access our Service, we may automatically collect certain information:</p>
            <ul className="seo-list">
              <li>
                <strong>Usage Data:</strong> Information about how you use our Service, including
                the models you compare, frequency of use, and features accessed.
              </li>
              <li>
                <strong>Device Information:</strong> Information about your device, including
                browser type, operating system, and device identifiers.
              </li>
              <li>
                <strong>Log Data:</strong> Server logs that may include your IP address, access
                times, and pages viewed.
              </li>
              <li>
                <strong>Cookies and Similar Technologies:</strong> We use cookies and similar
                tracking technologies to maintain your session and preferences.
              </li>
            </ul>

            <p>
              If you use the CompareIntel browser extension, see{' '}
              <a href="#browser-extension">Browser extension</a> for what it stores, when it reads a
              page, and where that text goes.
            </p>
          </section>

          <section className="seo-section" id="browser-extension">
            <h2>Browser extension</h2>
            <p>
              This section describes the CompareIntel Chrome extension. It uses the same
              CompareIntel account and backend as the website.
            </p>

            <h3>What the extension stores on your device</h3>
            <p>
              Sign-in tokens are stored in Chrome extension storage: the access token in{' '}
              <code>chrome.storage.session</code>, and the refresh token in{' '}
              <code>chrome.storage.local</code> (limited so a regular web page cannot read it).
            </p>
            <p>The extension also keeps a few things on your device in local extension storage:</p>
            <ul className="seo-list">
              <li>Side-panel and font-size preferences</li>
              <li>Whether you have dismissed the page-context explanation</li>
              <li>Named model-selection defaults (which models you chose to compare)</li>
              <li>
                A recent-comparisons list (prompt, answers, and the title and URL of a tab you used
                as context, when that applies)
              </li>
            </ul>
            <p>
              Page text the extension reads for context is held in memory only while you use the
              side panel. It is never written to Chrome storage.
            </p>
            <p>
              If you are signed in, your prompt, including any page text or selection you included,
              and the model answers are saved to your CompareIntel conversation history until you
              delete them. The extension can also copy recent local comparisons into that account
              history after you sign in.
            </p>

            <h3>When it reads a web page</h3>
            <p>
              The extension reads selected text or visible page text only when you submit a
              comparison with page context turned on. That snapshot can include the current tab and
              any tabs you pinned for context, plus each tab&apos;s title and URL. It does not read
              page text when the side panel opens, and it does not read pages in the background.
            </p>
            <p>
              You can turn page context off with the toggle above the prompt. A content script runs
              only on compareintel.com, so the website can pass a sign-in session to the extension.
              The extension does not inject a content script into every website.
            </p>

            <h3>Where the prompt and page text go</h3>
            <p>
              Your prompt, and any selected text or page text included as context, is sent to the
              CompareIntel backend. CompareIntel forwards that text to third-party AI model
              providers through OpenRouter so those models can generate answers. Those providers
              have their own privacy policies. CompareIntel uses this to show the comparison in the
              side panel.
            </p>
            <p>
              The extension also sends a browser fingerprint to CompareIntel so we can apply rate
              limits and show credit balance. That fingerprint is a SHA-256 hash of your browser
              user agent, language, screen size, timezone, and a small canvas drawing. CompareIntel
              stores it in usage logs together with your IP address, your user ID if you are signed
              in, and usage details such as which models ran. That is not an advertising identifier.
            </p>
            <p>
              Those usage logs stay in the database until an administrator runs a cleanup. There is
              an admin tool that can aggregate and delete detailed logs older than a chosen number
              of days (the tool&apos;s default is 90 days), but that cleanup is not run
              automatically. This policy does not promise that logs are deleted after 90 days.
            </p>

            <h3>What the extension does not do</h3>
            <ul className="seo-list">
              <li>
                The extension itself does not include analytics or tracking software. The
                CompareIntel website uses Sentry, including Session Replay, for error monitoring.
              </li>
              <li>The extension does not include ads.</li>
              <li>CompareIntel does not sell the data described in this policy.</li>
            </ul>
            <p>
              Payments through Stripe and approximate location from your IP address are website
              practices. See the rest of this Privacy Policy for how the CompareIntel site handles
              account, log, and payment data.
            </p>

            <h3>How to delete your data</h3>
            <ul className="seo-list">
              <li>
                Uninstall the extension to remove tokens, preferences, and recent comparisons stored
                in Chrome on that browser.
              </li>
              <li>
                On compareintel.com, open Settings and use{' '}
                <strong>Delete all comparison history</strong> to permanently delete saved
                conversations on our servers.
              </li>
              <li>
                To delete your CompareIntel account, email{' '}
                <a href="mailto:support@compareintel.com">support@compareintel.com</a>. Settings can
                delete comparison history, but there is not currently a delete-account button in the
                app.
              </li>
            </ul>
          </section>

          <section className="seo-section">
            <h2>How We Use Your Information</h2>
            <p>We use the information we collect for the following purposes:</p>
            <ul className="seo-list">
              <li>
                <strong>Provide the Service:</strong> To send your prompts to AI providers, deliver
                responses, maintain your account, and enable core functionality.
              </li>
              <li>
                <strong>Improve the Service:</strong> To understand how users interact with our
                platform and make improvements (without access to prompt or response content).
              </li>
              <li>
                <strong>Security:</strong> To detect, prevent, and address technical issues, fraud,
                and abuse of our Service.
              </li>
              <li>
                <strong>Communication:</strong> To respond to your inquiries, send service updates,
                and provide customer support.
              </li>
              <li>
                <strong>Legal Compliance:</strong> To comply with applicable laws, regulations, and
                legal processes.
              </li>
            </ul>
          </section>

          <section className="seo-section">
            <h2>How We Share Your Information</h2>
            <p>
              We do not sell your personal information. We may share your information in the
              following circumstances:
            </p>
            <ul className="seo-list">
              <li>
                <strong>AI Providers:</strong> Prompts are sent directly to the providers you
                select. Each has its own privacy policy. We do not access or use your prompts or
                responses.
              </li>
              <li>
                <strong>Service Providers:</strong> We may share information with vendors who assist
                operations (hosting, analytics). Prompts and responses are never shared with them.
              </li>
              <li>
                <strong>Legal Requirements:</strong> We may disclose information if required by law,
                court order, or governmental authority.
              </li>
              <li>
                <strong>Business Transfers:</strong> In the event of a merger, acquisition, or sale
                of assets, your information may be transferred as part of that transaction.
              </li>
            </ul>
          </section>

          <section className="seo-section">
            <h2>Data Retention</h2>
            <p>
              We retain your personal information for as long as necessary to provide our Service
              and fulfill the purposes described in this Privacy Policy. Specifically:
            </p>
            <ul className="seo-list">
              <li>
                <strong>Account Data:</strong> Retained while your account is active and for a
                reasonable period thereafter.
              </li>
              <li>
                <strong>Conversation History:</strong> Retained only to enable conversation features
                for your use. Only you can access it. Delete anytime from your history.
              </li>
              <li>
                <strong>Usage Data:</strong> Aggregated and anonymized usage data may be retained
                indefinitely for analytics purposes.
              </li>
            </ul>
          </section>

          <section className="seo-section">
            <h2>Data Security</h2>
            <p>
              We implement appropriate technical and organizational measures to protect your
              personal information, including:
            </p>
            <ul className="seo-list">
              <li>HTTPS encryption for all data transmission</li>
              <li>Secure authentication mechanisms</li>
              <li>Regular security assessments and updates</li>
              <li>Access controls limiting who can access personal data</li>
            </ul>
            <p>
              However, no method of transmission over the Internet or electronic storage is 100%
              secure. While we strive to use commercially acceptable means to protect your
              information, we cannot guarantee absolute security.
            </p>
          </section>

          <section className="seo-section">
            <h2>Your Rights and Choices</h2>
            <p>Depending on your location, you may have certain rights regarding your data:</p>
            <ul className="seo-list">
              <li>
                <strong>Access:</strong> Request access to the personal information we hold about
                you.
              </li>
              <li>
                <strong>Correction:</strong> Request correction of inaccurate personal information.
              </li>
              <li>
                <strong>Deletion:</strong> Request deletion of your personal information, subject to
                certain exceptions.
              </li>
              <li>
                <strong>Data Portability:</strong> Request a copy of your data in a portable format.
              </li>
              <li>
                <strong>Opt-Out:</strong> Opt out of certain data processing activities.
              </li>
            </ul>
            <p>
              To exercise these rights, please contact us at{' '}
              <a href="mailto:support@compareintel.com">support@compareintel.com</a>.
            </p>
          </section>

          <section className="seo-section">
            <h2>Cookies and Tracking Technologies</h2>
            <p>
              We use cookies and similar technologies to enhance your experience on our Service.
              Cookies are small data files stored on your device that help us:
            </p>
            <ul className="seo-list">
              <li>Maintain your login session</li>
              <li>Remember your preferences</li>
              <li>Understand how you use our Service</li>
              <li>Improve our Service based on usage patterns</li>
            </ul>
            <p>
              You can control cookies through your browser settings. Note that disabling cookies may
              affect the functionality of our Service.
            </p>
          </section>

          <section className="seo-section">
            <h2>Third-Party Services</h2>
            <p>
              Our Service integrates with third-party AI providers to deliver model responses. When
              you use CompareIntel, your prompts are sent to the providers of the models you select.
              These providers include but are not limited to:
            </p>
            <ul className="seo-list">
              <li>OpenAI (GPT and reasoning models)</li>
              <li>Anthropic (Claude models)</li>
              <li>Google (Gemini models)</li>
              <li>Meta (Llama models)</li>
              <li>xAI (Grok models)</li>
              <li>Mistral AI</li>
              <li>DeepSeek</li>
            </ul>
            <p>
              Each provider has its own privacy policy and data handling practices. We encourage you
              to review their privacy policies to understand how they process your data.
            </p>
          </section>

          <section className="seo-section">
            <h2>Children's Privacy</h2>
            <p>
              Our Service is not intended for children under the age of 13 (or 16 in certain
              jurisdictions). We do not knowingly collect personal information from children. If you
              believe we have collected information from a child, please contact us immediately so
              we can delete it.
            </p>
          </section>

          <section className="seo-section">
            <h2>International Data Transfers</h2>
            <p>
              Your information may be transferred to and processed in countries other than your
              country of residence. These countries may have different data protection laws. By
              using our Service, you consent to such transfers.
            </p>
          </section>

          <section className="seo-section">
            <h2>Changes to This Privacy Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of any changes
              by posting the new Privacy Policy on this page and updating the "Last Updated" date.
              We encourage you to review this Privacy Policy periodically for any changes.
            </p>
          </section>

          <section className="seo-section">
            <h2>Contact Us</h2>
            <p>
              If you have any questions about this Privacy Policy or our data practices, please
              contact us at:
            </p>
            <p>
              <strong>Email:</strong>{' '}
              <a href="mailto:support@compareintel.com">support@compareintel.com</a>
            </p>
          </section>

          <section className="seo-section">
            <h2>Related Documents</h2>
            <ul className="seo-list">
              <li>
                <Link to="/terms-of-service">Terms of Service</Link>
              </li>
            </ul>
          </section>

          <BackToMainCTA
            title="Ready to Get Started?"
            description="Confident in how we protect your data? Start comparing AI models side-by-side and discover which one works best for your needs."
            primaryButtonText="Start Comparing AI Models"
          />
        </article>
      </div>
    </div>
  )
}
