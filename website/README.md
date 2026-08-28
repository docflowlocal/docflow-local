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

GA4 records an `ai_referral_landing` event for recognized visits from ChatGPT, Perplexity, Claude, Copilot, and Gemini. Download, beta, source, pricing, and primary navigation CTAs carry a common event context (`cta_id`, `cta_location`, `page_type`, `locale`, and destination metadata). Installer downloads use `download_mac_installer` and `download_windows_installer`; they also include `file_name`, `file_extension`, `link_url`, and `link_domain`. The macOS event remains active for reporting continuity. The Windows event is enabled only after a signed installer URL is attached to a public release.

No website form collects personal data in the initial release. Community download CTAs lead to signed releases. Until a signed Windows installer is public, the Windows card continues to emit `beta_request` for its project-email link and is never counted as an installer download.
