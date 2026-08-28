# DocFlow Local website

The commercial website is a dependency-light static build deployed with Cloudflare Workers Static Assets.

```bash
npm ci
npm run build
npm run dev
```

Production deployment:

```bash
npm run deploy:dry
npm run deploy
npm run indexnow
```

The English site is served from `/`; Simplified Chinese pages are served from `/zh/`. Every indexable page includes canonical and `hreflang` metadata, while `sitemap.xml`, AI-search-aware `robots.txt`, `llms.txt`, the IndexNow verification file, security headers, and a custom 404 page are generated during the build.

`npm run indexnow:dry` prints the exact IndexNow payload without sending it. Run `npm run indexnow` only after the generated site and verification key file are live.

After a visitor explicitly accepts optional analytics, GA4 records an `ai_referral_landing` event for recognized visits from ChatGPT, Perplexity, Claude, Copilot, and Gemini. Before consent—or when Do Not Track is enabled—the Google tag is not loaded and events are not sent. The footer keeps a persistent analytics-settings control. Download, beta, source, pricing, and primary navigation CTAs carry a common event context (`cta_id`, `cta_location`, `page_type`, `locale`, and destination metadata). Installer downloads use `download_mac_installer` and `download_windows_installer`; they also include `file_name`, `file_extension`, `link_url`, and `link_domain`. The macOS event remains active for reporting continuity. The Windows event is enabled only after a signed installer URL is attached to a public release.

Community downloads remain free and independent from the optional one-time supporter flow at `/support/` and `/zh/support/`. The suggested amount is US$29 / ¥199, with US$9 / US$99 and ¥69 / ¥699 alternatives. A valid `?amount=` query preselects a localized tier (`9`, `29`, or `99` for English; `69`, `199`, or `699` for Chinese); unsupported values safely leave the suggested tier selected. Until verified payment URLs are added to `supporterCheckoutUrls` in `scripts/build.mjs`, the supporter action explicitly opens a prefilled support email and does not take payment. Checkout configuration is fail-closed: every localized tier must be enabled together, URLs must use an allowlisted HTTPS payment host, and credentials or URL fragments are rejected. Add a new provider host to `scripts/supporter-checkout.mjs` only after verification. With analytics consent, GA4 records `supporter_amount_select` and `supporter_cta_click` during the email-intent state; `supporter_checkout_start` is used only when a verified checkout URL is configured.

No website form collects personal data in the initial release. Community download CTAs lead to signed releases. Until a signed Windows installer is public, the Windows card continues to emit `beta_request` for its project-email link and is never counted as an installer download.
