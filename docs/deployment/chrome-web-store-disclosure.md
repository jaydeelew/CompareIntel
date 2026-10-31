# Chrome Web Store privacy-practices answers

Copy these answers into the Chrome Web Store **Privacy practices** tab. They match
[`EXTENSION.md`](EXTENSION.md) and the public policy at
[https://compareintel.com/privacy](https://compareintel.com/privacy)
(same page as `/privacy-policy`).

Verified against the extension and backend code. Do not tick extra data types
without re-checking the code.

## Single purpose

Compare AI model responses side by side: the user sends one prompt, optionally with selected text or the current page as context, to several AI models through their CompareIntel account and sees the answers in Chrome's side panel.

## Privacy policy URL

`https://compareintel.com/privacy`

## Data types collected

Tick only the types below. Leave the rest unticked.

| Dashboard type | Tick? | What the code actually collects |
|----------------|-------|----------------------------------|
| Authentication information | **Yes** | Access token in `chrome.storage.session`; refresh token in `chrome.storage.local`. Sent as Bearer auth to `https://compareintel.com`. |
| Website content | **Yes** | Visible page text, the current selection, and that tab's title and URL — only when the user submits with page context on (current tab and/or pinned tabs). Built into the prompt and sent to the CompareIntel backend. |
| User activity | **Yes** | Comparison requests (prompt and selected models) and a hashed browser fingerprint used for rate limits and credit balance. No browsing-history log. |
| Personally identifiable information | No (not as a separate extension collection) | Email is collected by the CompareIntel **website** account. The extension reuses that account via tokens. |
| Web history | **No** | The extension does not record sites the user visits. A URL is sent only as part of page context the user chose to include. |
| Health / financial / location / personal communications | **No** | Not collected by the extension. |

### How those types are used

- **Authentication information:** keep the user signed in to their CompareIntel account and call the API.
- **Website content:** include the page (or selection) in the prompt so the chosen models can answer about it.
- **User activity:** run the comparison and enforce rate limits / show remaining credits.

The CompareIntel backend forwards the prompt (and any included page text) to third-party AI model providers **through OpenRouter**. That is required to return answers. The extension has no analytics or tracking SDK, no ads, and does not execute remote code (it calls the CompareIntel API and displays returned text).

## Certifications (tick all three)

1. **Not sold.** I do not sell or transfer user data to third parties, outside of the approved use cases (here: sending the prompt and optional page context to AI providers via OpenRouter so the comparison can run).
2. **Not used for unrelated purposes.** I do not use or transfer user data for purposes that are unrelated to this item's single purpose.
3. **Not used for creditworthiness.** I do not use or transfer user data to determine creditworthiness or for lending purposes.

## Permission justifications

These match the production Chrome permissions in [`EXTENSION.md`](EXTENSION.md#permissions).

| Permission | Justification |
|------------|----------------|
| `sidePanel` | Show the CompareIntel comparison UI beside the current page. |
| `storage` | Remember sign-in tokens and the user's extension settings. |
| `scripting` | Read visible page text and the current selection when the user asks for page context. |
| `activeTab` | Limit that read to the tab the user invoked CompareIntel on. |
| Host: `https://compareintel.com/*` | Talk to the CompareIntel API and sign the user in on compareintel.com. |

**Not requested:** `tabs`, `<all_urls>` content scripts, optional all-http host permissions.

## Remote code

No. The extension does not execute remotely hosted JavaScript. It sends HTTPS requests to `https://compareintel.com` and renders the text that comes back.

## Notes for Jack

- Deploy the frontend so `https://compareintel.com/privacy` is live (alias of `/privacy-policy`) before submitting the store listing.
- Account deletion: `DELETE /api/auth/delete-account` exists, and the FAQ says Settings can delete the account, but Settings only has **Delete all comparison history**. Users are told to email `support@compareintel.com`. Add an in-app delete-account control if you want that FAQ to be accurate.
- The brief said the extension stores "auth tokens and nothing else." The code also stores panel/font preferences, the page-context intro flag, and recent comparisons in `chrome.storage.local`. The policy and this table describe that.
