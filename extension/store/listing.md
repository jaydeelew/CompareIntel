# Chrome Web Store listing

Draft copy and asset notes for the CompareIntel Chrome extension. Do not publish or submit this listing until Jack reviews it.

## Name

CompareIntel: Compare AI Models Side by Side

## Short description

Send one prompt to multiple AI models and compare their answers side by side in a side panel, with optional page context.

## Detailed description

Stop switching tabs between AI chatbots. CompareIntel opens in Chrome's side panel and sends one prompt to several AI models at once, then shows their answers side by side so you can see which one gets it right.

What you can do:

- Ask once and compare answers from several models together.
- Optionally add the text you've selected or the current page as context. The page is only read when you click submit, never in the background.
- Keep browsing while you compare, because the panel stays open next to the page.
- Sign in with your CompareIntel account and use the same models and plan you have on compareintel.com.

Good for:

- Fact-checking an answer against a second or third model
- Comparing writing, summaries or code from different models
- Picking the best model for a task before you commit to it

Privacy: the extension only reads page content when you submit a prompt that includes it, and then sends it with your prompt to CompareIntel to get the answers. Nothing is read in the background. See the CompareIntel privacy policy for details.

Made by an independent developer. Website: https://compareintel.com

## Category

Productivity > Tools.

## Privacy policy

https://compareintel.com/privacy

## Screenshots

Jack should review the generated 1280×800 PNGs in `screenshots/` and may replace them with captures from a live account.

The Playwright script loads the built extension unpacked, drives the real side panel UI (opened as `sidepanel.html` in a tab, because Chrome's side panel chrome is not reliably capturable), stubs only CompareIntel API traffic, and composes each frame with a caption band.

| File | Caption |
|------|---------|
| `screenshots/01-hero.png` | One prompt. Several AI models. Side by side. |
| `screenshots/02-page-context.png` | Use the selected text or the whole page as context, read only when you submit. |
| `screenshots/03-model-picker.png` | Pick the models you want to compare. |
| `screenshots/04-code-comparison.png` | See which model gets it right. |

Answers in these shots are realistic but clearly marked as sample data. They are not live model output.

## Promo tiles

Generated from the SVG sources in this folder (`npm run store:promo` in `extension/`).

| File | Size | Source |
|------|------|--------|
| `small-promo-440x280.png` | 440×280 | `promo-small.svg` |
| `marquee-1400x560.png` | 1400×560 | `promo-marquee.svg` |

## Regenerating assets

From `extension/`:

```bash
npm run store:promo
npm run build
npm run store:screenshots
```
