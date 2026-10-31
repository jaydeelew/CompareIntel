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

Tick the types below.

| Dashboard type | Tick? | What the code actually collects |
|----------------|-------|----------------------------------|
| Personally identifiable information | **Yes** | Account email, returned when the extension calls `fetchCurrentUser` (`GET /auth/me`). |
| Location | **Yes** | Client IP address is stored on each comparison usage log (`usage_logs.ip_address`). |
| Website content | **Yes** | Visible page text, the current selection, and that tab's title and URL — only when the user submits with page context on (current tab and/or pinned tabs). Built into the prompt and sent to the CompareIntel backend. If the user is signed in, that prompt (including any included page text) and the model answers are saved to conversation history until the user deletes them. |
| Authentication information | **Yes** | Access token in `chrome.storage.session`; refresh token in `chrome.storage.local`. Sent as Bearer auth to `https://compareintel.com`. |
| User activity | **Yes** | Comparison requests (prompt and selected models) and a hashed browser fingerprint used for rate limits and credit balance. The fingerprint is a SHA-256 hash of user agent, language, screen size, timezone, and a canvas drawing, stored in `usage_logs` with IP, user ID, and usage metadata. |
| Web history | **No** | The extension does not record sites the user visits. A URL is sent only as part of page context the user chose to include. |
| Health / financial / personal communications | **No** | Not collected by the extension. Website payments go through Stripe and are covered by the site privacy policy, not this tick. |

### How those types are used

- **Personally identifiable information:** identify the signed-in CompareIntel account in the side panel.
- **Location:** the IP is logged with the comparison for rate limits, abuse prevention, and usage records.
- **Website content:** include the page (or selection) in the prompt so the chosen models can answer about it; store it in conversation history when the user is signed in.
- **Authentication information:** keep the user signed in to their CompareIntel account and call the API.
- **User activity:** run the comparison and enforce rate limits / show remaining credits.

The CompareIntel backend forwards the prompt (and any included page text) to third-party AI model providers **through OpenRouter**. That is required to return answers. The extension has no analytics or tracking SDK and no ads. The CompareIntel **website** uses Sentry, including Session Replay. The extension does not execute remote code (it calls the CompareIntel API and displays returned text).

## Certifications (tick all three)

1. **Not sold.** User data is not sold. It is transferred only to service providers as needed to provide the extension's single purpose: the prompt and any page context the user chooses to include are sent through OpenRouter to the AI models the user selected so they can generate the requested comparison.
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
- Account deletion: `DELETE /api/auth/delete-account` exists, but Settings only has **Delete all comparison history**. The privacy policy and FAQ now tell users to email `support@compareintel.com`. Add an in-app delete-account control if you want self-serve deletion.
- **TODO:** `cleanup_old_usage_logs` in `backend/app/data_retention.py` is only reachable from the admin `POST /api/admin/maintenance/cleanup-usage-logs` endpoint. Docs suggest a cron job, but nothing in the repo schedules it. Do not claim 90-day retention until this runs automatically. Schedule it if you want usage logs (fingerprint, IP, user ID, usage metadata) deleted on a fixed cadence.
