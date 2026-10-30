# Directory and launch-site checklist

**Status:** drafts and a checklist only. Do not submit, pay, email, or contact anyone until Jack approves that specific row.

Issue #40: flag fees; **do not buy paid listings** unless Jack explicitly says otherwise. Paid rows stay in the table so they are not rediscovered later by accident.

Costs below are only filled when verified from the site's own pages (checked 2026-10-30). If a fee was not on the official page, the Cost cell says to re-check at submit time rather than guessing.

After Jack actually submits something, change that row's **Status** from `not submitted`. Do not pre-mark.

---

## Reusable copy

Use these as starting text. Shorten further if a form has a tighter limit. Do not add user counts, rankings, or prices that are not in the repo.

### Short description (≤160 characters)

```
CompareIntel: send one prompt to many AI and image models and compare answers side by side. Free daily credits, no signup required.
```

Character count: 131.

### Long description (~100 words)

```
CompareIntel is a web app for comparing AI language and image models on the same prompt. Pick models, type once, and read the answers side by side as they stream in — writing, code, math, or generated images. Solo developer Jack Lewis built it: React/Vite frontend, FastAPI backend, models via OpenRouter. Try it without an account (daily credits, up to three models per run). A free account doubles daily credits. Paid plans add monthly credit pools, more models per comparison, and optional metered overage. Credits follow underlying API cost. Finished comparisons can be shared as a public permalink.
```

Word count: 98.

**TODO(Jack):** if a form asks for pricing, confirm live Stripe against `TIER_PRICING` (`docs/internal/PRICING_SHEET.md` and `backend/app/config/constants.py`): Starter $9, Starter+ $19, Pro $39, Pro+ $79 per month; overage $0.013 per credit when enabled. Anonymous: 50 credits/day, 3 models. Free account: 100 credits/day, 3 models.

### Tags

`AI comparison`, `LLM`, `image generation`, `side-by-side`, `ChatGPT`, `Claude`, `Gemini`, `OpenRouter`, `developer tools`, `productivity`, `generative AI`, `model evaluation`

### Links to use (live only)

- Homepage: https://compareintel.com/
- Models index: https://compareintel.com/models
- Example model pages: https://compareintel.com/models/claude-opus-5 , https://compareintel.com/models/gpt-5-5
- **TODO(Jack):** shareable comparison permalink — format `https://compareintel.com/c/{10-char-slug}` from PR #111. Paste a real one; do not invent the slug.

---

## Checklist

| Site | Submission page | Cost | Requirements | Suggested category | Status |
|------|-----------------|------|--------------|--------------------|--------|
| Product Hunt | [producthunt.com/posts/new](https://www.producthunt.com/posts/new) (login; or Submit → New Product). Guide: [producthunt.com/launch](https://www.producthunt.com/launch) | **Free** (PH: “100% free to use”) | Personal maker account (not a company/brand account). New accounts wait ~1 week to post, or subscribe to the PH newsletter for earlier access. Live URL, name only (no tagline in the name), tagline, 2+ gallery images (1270×760), topics, pricing tag, first maker comment. Do not ask for upvotes. Schedule 12:01 AM Pacific for a full day. | Topics: Artificial Intelligence, Productivity, Developer Tools. Pricing tag: paid with a free plan (confirm live billing). | not submitted |
| Futurepedia | Paid packages: [futurepedia.io/verified](https://www.futurepedia.io/verified). Update form (if already listed): [futurepedia.io/update-a-tool](https://www.futurepedia.io/update-a-tool). Old `/submit-tool` returned **404** from this environment on 2026-10-30 | **Paid** — official Verified listing **$497** one-time (refund if editorial denial). No free public submit found | Editorial review; AI tools only; no NSFW; live product (not waitlist-only). Skip unless Jack approves spend | AI productivity / model comparison (form categories TBD at checkout) | not submitted |
| There's An AI For That | [theresanaiforthat.com/submit/](https://theresanaiforthat.com/submit/) | **Paid** — official page: **$49** one-time “Low traffic” review fee; **$437** “everything you need” package. FAQ: monthly **free** pick via their X thread (Jack would post on X; still requires his approval) | Manual review (~1–2 days). Refund if unpublished. Skip paid unless Jack approves | AI productivity / comparison | not submitted |
| Toolify | [toolify.ai/submit](https://www.toolify.ai/submit) | **Paid** — submit-page FAQ exists but the amount did not render in a static fetch. Toolify's own news page states **$99** to submit a tool; **re-check the FAQ on the form** before paying. Skip unless Jack approves | Live tool URL, description, category. Listing claimed “within 48 hours” on their submit page | AI, productivity, image generator (secondary) | not submitted |
| AlternativeTo | Signed-in **Suggest new application** ([FAQ](https://alternativeto.net/faq/)); form route [alternativeto.net/manage-item/](https://alternativeto.net/manage-item/) (login required). Do not use dead `/manage/add-app/` URLs | **Free** to submit (official FAQ). Optional **paid priority review** — fee shown at checkout, amount not listed on the FAQ; skip the paid queue unless Jack approves | Verified email. Fill platforms, license, descriptions, tags. Review backlog; paying only jumps the queue, not approval. License: **Freemium** (free daily credits, paid pools). Suggest alternatives to ChatGPT, Claude, Gemini, Poe, LM Arena if those pages exist | Web apps, AI, productivity | not submitted |
| BetaList | [betalist.com/submit](https://betalist.com/submit) | **Paid only** (official FAQ: no free option). Plan prices are shown at the end of the form, not as a public price list. Skip unless Jack approves | Founder/authorized submitter. Own domain (no vercel.app etc.). Pre-launch or recently launched. Refund if not selected | Artificial Intelligence | not submitted |
| SaaSHub | [saashub.com/services/submit/](https://www.saashub.com/services/submit/) (product listing). Note: [saashub.com/submit](https://www.saashub.com/submit) is a different “submit to other directories” marketing page | **Free** (page describes a free submit + approval queue). Domain-email verification raises priority | Live English product on its own domain. Add categories **and competitors** (queue drops without competitors). No agencies, waitlists, unreleased products, or free subdomains | AI, developer tools, productivity. Competitors: ChatGPT, Claude, Gemini, Poe, LMSYS Arena if listed | not submitted |
| Hacker News (Show HN) | [news.ycombinator.com/submit](https://news.ycombinator.com/submit) — copy in [show-hn.md](./show-hn.md) | **Free** | HN account. Title starts with `Show HN`. Thing people can try without a landing-page-only pitch. Maker stays to discuss. No upvote begging. See [showhn.html](https://news.ycombinator.com/showhn.html) | n/a (Show HN) | not submitted |
| Future Tools | [futuretools.io/submit-a-tool](https://www.futuretools.io/submit-a-tool) | **Free** to submit (FAQ: the site stays free for people who submit tools). Paid featured/sponsor slots are separate and labeled | No account. Human review; inclusion not guaranteed; wait ≥1 week before resubmitting. Must be a live tool (not waitlist, not a GPT Store listing, not another directory) | Productivity / research (form categories) | not submitted |
| r/SideProject | [reddit.com/r/SideProject/submit](https://www.reddit.com/r/SideProject/submit) | **Free** | Sharing a project is the point. Title like `[CompareIntel] - compare AI models side by side`. Story + screenshot, not a bare link. Ask for specific feedback. Stay to reply. Re-read the live rules before posting (wiki was disabled when fetched). Full Reddit drafts are a later #40 slice | n/a | not submitted |
| r/artificial | [reddit.com/r/artificial/submit](https://www.reddit.com/r/artificial/submit) | **Free** | **1/10 rule:** self-promo ≤10% of the account's posts+comments; comments on your own promo do not count. Participate first. Re-read current rules before posting. Later #40 slice | n/a | not submitted |
| r/MachineLearning | [reddit.com/r/MachineLearning/submit](https://www.reddit.com/r/MachineLearning/submit) | **Free** | Self-promo of paid products is restricted. Prefer the recurring **[D] Self-Promotion Thread**; disclose pricing; no SEO campaigns (permaban). A top-level launch post is likely the wrong fit. Later #40 slice | n/a | not submitted |
| G2 (category fix, not a new listing) | Listing (already live, claimed): [g2.com/products/compareintel](https://www.g2.com/products/compareintel). Change category: my.G2 → Your G2 Profile → Manage Categories, or [G2 Support category change](https://support.g2.com/s/contact-support-category-change). New-profile form is only if a product is missing: [sell.g2.com/create-a-profile](https://sell.g2.com/create-a-profile) | **Free** to list/claim a basic profile. Paid G2 “upgrade your plan” branding is optional — skip unless Jack approves | **Do not create a second product.** Profile is already claimed (`Claimed` on the product page, 0 reviews). It appears under **Prompt Management Tools**, whose inclusion rules are a prompt library, versioning, A/B tests, and ML-workflow integration — CompareIntel does not do those. Request a move to **Generative AI** ([g2.com/categories/generative-ai](https://www.g2.com/categories/generative-ai)); fallback **Emerging AI Software**. Jack (claimed vendor) must file this from my.G2 | Requested: Generative AI. Remove: Prompt Management Tools | not submitted |

`www.saashub.com/submit` is easy to confuse with the product form. Use `/services/submit/` for the listing.

---

## G2 category fix (detail)

**Current:** CompareIntel is on G2 at https://www.g2.com/products/compareintel (claimed, 0 reviews). It showed up on G2's Prompt Management Tools category page.

**Why that category is wrong:** G2's own Prompt Management inclusion criteria (prompt library, testing/debugging, ML-workflow integration, usage analytics of prompts) describe PromptLayer / Agenta-style tools, not a side-by-side model comparison app.

**Ask G2 for:** primary category **Generative AI**. Optional extra only if they insist on a second: **Emerging AI Software**. Do not add AI Chatbots or Large Language Models — those are for the model vendors themselves.

**Who files it:** Jack, from the claimed my.G2 account. Agents must not open a support ticket.

---

## Jack TODOs

- [ ] Confirm live Stripe prices before any form that asks for them.
- [ ] Paste a real `/c/{slug}` permalink into reusable copy when you have one.
- [ ] Product Hunt: gallery screenshots (repo already has `frontend/public/brand/screenshot-desktop.png` and mobile variants — confirm they are the ones you want).
- [ ] Skip every **Paid** row unless you decide otherwise.
- [ ] G2: category change from the claimed vendor account; do not create a duplicate product.
- [ ] After each real submission, set that row's Status and date.
