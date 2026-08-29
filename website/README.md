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

Community downloads remain free and independent from the optional one-time supporter flow at `/support/` and `/zh/support/`. The suggested amount is US$29 / ¥199, with US$9 / US$99 and ¥69 / ¥699 alternatives. A valid `?amount=` query preselects a localized tier (`9`, `29`, or `99` for English; `69`, `199`, or `699` for Chinese); unsupported values safely leave the suggested tier selected. Until verified payment URLs are added to `supporterCheckoutUrls` in `scripts/build.mjs`, the supporter action explicitly opens a prefilled support email and does not take payment. Checkout configuration is fail-closed: all six localized tiers must be enabled together, and only live `https://buy.stripe.com/` Payment Links are accepted. Stripe test links, other hosts, credentials, fragments, malformed paths, and partial configurations fail the build. With analytics consent, GA4 records `supporter_amount_select` and `supporter_cta_click` during the email-intent state; `supporter_checkout_start` is used only when a verified live checkout URL is configured.

## Stripe supporter checkout release

Payment Link URLs are public checkout addresses, not secret keys. Never add a Stripe API key, restricted key, webhook secret, customer record, or payment credential to the repository.

### Test before enabling

1. Create and exercise the six fixed-price links in Stripe test mode: USD 9, 29, and 99 for English, then CNY 69, 199, and 699 for Chinese. Confirm the amount, currency, one-time payment mode, quantity of one, product wording, hosted confirmation, and receipt behavior directly in Stripe.
2. Do not paste sandbox links into `scripts/build.mjs`. Production validation intentionally rejects Stripe paths beginning with `/test_`; sandbox checkout should be tested from Stripe's test environment instead of being published by this website.
3. Run the local contract checks before changing production configuration:

   ```bash
   npm ci
   npm run check:site
   ```

### Enable live checkout

1. In Stripe live mode, verify all six reusable Payment Links and their amounts, currencies, descriptions, hosted confirmation, and active status. Do not enable unrelated data collection or payment features without a separate review.
2. Copy only the six live `https://buy.stripe.com/...` URLs into the matching `supporterCheckoutUrls` entries in `scripts/build.mjs`. Populate every entry in one change; a partial configuration is rejected.
3. Validate the generated site and deployment bundle:

   ```bash
   npm run check:seo
   npm run deploy:dry
   ```

4. Review `/support/` and `/zh/support/` locally. Each amount button must select the matching currency and live URL, and no generated file may contain `/test_`.
5. Deploy with `npm run deploy`, then smoke-test all six public buttons in a clean browser without completing a real charge. Confirm that Community downloads still bypass checkout and that the hosted Stripe pages show the intended amount and currency.

The site records only `supporter_checkout_start` before navigation when analytics consent exists. A checkout start is not evidence of a successful payment; payment completion is verified in Stripe.

### Roll back

1. Set all six entries in `supporterCheckoutUrls` back to empty strings in one change. Never leave a mixture of live and empty entries.
2. Run `npm run check:seo` and `npm run deploy:dry`, then deploy. The site will return to the clearly labelled supporter-email flow while Community downloads remain available.
3. If old public URLs must stop accepting direct payments, deactivate the corresponding Payment Links in Stripe live mode after the website rollback. Deactivation is separate from removing links from the site.

No DocFlow-hosted website form collects personal data in the initial release; optional payment details are entered on Stripe's hosted checkout under the disclosure in the repository-level `PRIVACY.md`. Community download CTAs lead to signed releases. Until a signed Windows installer is public, the Windows card continues to emit `beta_request` for its project-email link and is never counted as an installer download.
