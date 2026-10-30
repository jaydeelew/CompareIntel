# Show HN draft (CompareIntel)

**Status:** draft only. Do not post to Hacker News until Jack approves this copy and fills the TODOs below.

Guidelines used: [Show HN](https://news.ycombinator.com/showhn.html) and [HN guidelines](https://news.ycombinator.com/newsguidelines.html). Title is plain, no hype, no exclamation marks. Body is first person as the maker (Jack Lewis). No invented user counts, traffic, or rankings.

**Submit (Jack only):** https://news.ycombinator.com/submit  
**Story URL:** https://compareintel.com/

---

## Title

```
Show HN: CompareIntel – compare AI and image models side by side
```

---

## Body

Copy-paste into the HN text field (or the first comment if the text field is empty). HN does not use Markdown headings; this block is plain text.

```
I built CompareIntel (https://compareintel.com) so I can send one prompt to several AI models at once and read the answers side by side.

I got tired of bouncing between ChatGPT, Claude, Gemini, and image tools when I wanted to know which model was actually better for a given job. CompareIntel is that comparison in one place. It covers writing, code, math, and image generation.

How it works: the site is a React/Vite SPA with a FastAPI backend. Models are called through OpenRouter, so I am not maintaining a separate API key per vendor. Responses stream in as they generate. After a run, you can share an immutable snapshot at a short /c/{slug} URL.

You can try it without signing up. Unregistered use is 50 credits per day and up to 3 models per comparison. A free account is 100 credits per day, still 3 models per run; image generation needs an account. Credits follow underlying API cost (OpenRouter USD, 100 credits per $1), so a cheap model burns less than a frontier one for similar work. Paid plans add a monthly credit pool and raise the models-per-run cap (6 / 6 / 9 / 12). TODO(Jack): confirm live Stripe amounts match the in-repo list prices before posting — Starter $9, Starter+ $19, Pro $39, Pro+ $79 per month; optional overage is $0.013 per credit when enabled. If live billing differs, replace those numbers or drop the dollar amounts.

Limits worth knowing: completion length is capped per request. Free and anonymous traffic also sits behind a global OpenRouter spend cap, so on a busy day you may see "try again later."

Starting points:

https://compareintel.com/
https://compareintel.com/models
https://compareintel.com/models/claude-opus-5
https://compareintel.com/models/gpt-5-5

TODO(Jack): paste a real public comparison permalink here, e.g. https://compareintel.com/c/__________

Happy to answer questions about the stack, the credit model, or what broke along the way.
```

---

## Suggested first comment

Post this after the story is live. Do not ask for upvotes.

```
Maker here — happy to answer questions.

The fastest way to try it is the homepage with no account: pick up to three models, type a prompt, compare. Model catalog is at https://compareintel.com/models (example pages: Claude Opus 5, GPT-5.5).

TODO(Jack): if you have a permalink you like, add: Here is a comparison I shared: https://compareintel.com/c/__________

I am a solo developer. The interesting bits for this crowd are probably the streaming compare UI, cost-based credits on top of OpenRouter, and the public snapshot URLs. Roast the copy, the credit math, or the UX — I will read it.
```

---

## Live URLs used (verified HTTP 200 on 2026-10-30)

| Page | URL |
|------|-----|
| Homepage | https://compareintel.com/ |
| Models index | https://compareintel.com/models |
| Claude Opus 5 | https://compareintel.com/models/claude-opus-5 |
| GPT-5.5 | https://compareintel.com/models/gpt-5-5 |
| Gemini 3.1 Pro Preview | https://compareintel.com/models/gemini-3-1-pro-preview |
| Claude Sonnet 4.6 | https://compareintel.com/models/claude-sonnet-4-6 |
| DeepSeek V4 Flash | https://compareintel.com/models/deepseek-v4-flash |
| Kimi K3 | https://compareintel.com/models/kimi-k3 |
| Grok 4.5 | https://compareintel.com/models/grok-4-5 |
| GPT-5.4 | https://compareintel.com/models/gpt-5-4 |

Do not invent additional `/models/<slug>` links. The list above is the prerendered set on master (`frontend/public/sitemap.xml`).

## Permalink format (from PR #111)

Code in `backend/app/services/share_snapshots.py` (`public_share_url`) and the SPA route `/c/:shareSlug` in `frontend/src/App.tsx`.

Production URL shape:

```
https://compareintel.com/c/{slug}
```

`{slug}` is 10 characters from `[A-Za-z0-9]`. Example (not a live page): `https://compareintel.com/c/AbC12xyZ90`.

A real permalink is only created when someone clicks **Share** on a finished comparison. This draft does not create one.

**TODO(Jack):** run a comparison on production, click Share, and paste the copied URL into the body and first comment above, replacing `https://compareintel.com/c/__________`.

## Sources for claims in this draft

| Claim | Source |
|-------|--------|
| React/Vite SPA + FastAPI, OpenRouter | `README.md`, `AGENTS.md` |
| Anonymous 50 credits/day, free 100/day, 3 models | `backend/app/config/constants.py` (`DAILY_CREDIT_LIMITS`, `ANONYMOUS_MODEL_LIMIT`); live homepage shows unregistered 3-model / 50-credit copy |
| Paid model caps 6 / 6 / 9 / 12 | `MODEL_LIMITS` in the same constants file |
| List prices $9 / $19 / $39 / $79; overage $0.013 | `TIER_PRICING`, `OVERAGE_USD_PER_CREDIT` — **confirm live Stripe** (`docs/internal/PRICING_SHEET.md`; Features page calls these illustrative) |
| Credits = OpenRouter USD × 100 | `CREDITS_PER_DOLLAR`, `docs/features/CREDIT_SYSTEM.md` |
| Image gen requires an account | `docs/features/IMAGE_GENERATION.md` |
| Global spend cap for free/anonymous | `docs/features/RATE_LIMITING.md`, `docs/ops/OPENROUTER_SPEND_CAP.md` |
| Max output tokens default 8192 | `OPENROUTER_MAX_OUTPUT_TOKENS` |

## Jack TODOs before posting

- [ ] Confirm live Stripe / Upgrade-plan prices match `TIER_PRICING`; edit or drop dollar amounts in the body.
- [ ] Paste a real `https://compareintel.com/c/{slug}` permalink (do not invent a slug).
- [ ] Re-read [showhn.html](https://news.ycombinator.com/showhn.html). Stay around to reply. Do not ask friends to upvote.
- [ ] Post only after Jack is satisfied the site is stable (#33, #39, #36 per issue #40).
