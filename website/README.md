# DocFlow Local website

The commercial website is a dependency-light static build deployed with Cloudflare Workers Static Assets.

```bash
npm install
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

GA4 records an `ai_referral_landing` event for recognized visits from ChatGPT, Perplexity, Claude, Copilot, and Gemini. The event contains only the normalized AI source and landing-page path.

No website form collects personal data in the initial release. Sales and beta CTAs use project email addresses until a reviewed CRM or newsletter processor is configured.
