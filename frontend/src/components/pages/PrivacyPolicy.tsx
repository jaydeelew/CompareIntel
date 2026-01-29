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
              compareintel.com (the "Service").
            </p>
            <p>
              Please read this Privacy Policy carefully. By using CompareIntel, you agree to the
              collection and use of information in accordance with this policy. If you do not agree
              with our policies and practices, please do not use our Service.
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
                <strong>Prompts and Queries:</strong> The prompts you submit to compare AI models
                are sent directly to the respective AI providers (such as OpenAI, Anthropic, Google,
                etc.) to generate responses. CompareIntel acts solely as a pass-through service and
                does not access, analyze, train on, or use your prompts or AI model responses for
                any purpose other than displaying them back to you. While conversation history may
                be stored to enable conversation features, this data is only accessible to you and
                is not used by CompareIntel for any other purpose.
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
          </section>

          <section className="seo-section">
            <h2>How We Use Your Information</h2>
            <p>We use the information we collect for the following purposes:</p>
            <ul className="seo-list">
              <li>
                <strong>Provide the Service:</strong> To facilitate sending your prompts to AI
                providers and delivering AI model responses back to you, maintain your account, and
                enable the core functionality of CompareIntel. CompareIntel does not access or use
                the content of your prompts or responses.
              </li>
              <li>
                <strong>Improve the Service:</strong> To understand how users interact with our
                platform and make improvements to features and user experience. This analysis does
                not include access to your prompts or AI model responses.
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
                <strong>AI Providers:</strong> Your prompts are sent directly to the AI model
                providers you select (such as OpenAI, Anthropic, Google, etc.) in order to generate
                responses. Each provider has its own privacy policy governing their handling of this
                data. CompareIntel does not access, analyze, or use your prompts or responses.
              </li>
              <li>
                <strong>Service Providers:</strong> We may share information with third-party
                vendors who assist in operating our Service, such as hosting providers and analytics
                services. However, your prompts and AI model responses are never shared with these
                service providers.
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
                <strong>Conversation History:</strong> Your prompts and AI responses may be retained
                solely to enable conversation history features for your use. This data is only
                accessible to you and is not used by CompareIntel for any other purpose. You can
                delete your conversation history at any time.
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
