interface PageContextIntroModalProps {
  onAcknowledge: () => void
}

export function PageContextIntroModal({ onAcknowledge }: PageContextIntroModalProps) {
  return (
    <div className="modal-overlay">
      <div className="modal page-context-intro">
        <h2>About page context</h2>
        <p>
          CompareIntel can read text from your open browser tabs so AI models can answer questions
          about what you&apos;re viewing.
        </p>
        <ul className="page-context-intro-list">
          <li>
            Page text and your current selection are read only when you submit a comparison with
            page context on — not when the side panel opens, and not in the background on every
            website.
          </li>
          <li>Extracted text is included in your prompt and sent to the AI providers you choose.</li>
          <li>You can turn page context off anytime with the toggle above the prompt.</li>
        </ul>
        <p className="page-context-intro-note">
          Chrome cannot inject into chrome:// pages or the Chrome Web Store. On a normal website,
          click the CompareIntel toolbar icon if reading fails.
        </p>
        <button type="button" onClick={onAcknowledge}>
          Got it
        </button>
      </div>
    </div>
  )
}
