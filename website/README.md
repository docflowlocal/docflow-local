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
```

The English site is served from `/`; Simplified Chinese pages are served from `/zh/`. Every indexable page includes canonical and `hreflang` metadata, while `sitemap.xml`, `robots.txt`, security headers, and a custom 404 page are generated during the build.

No website form collects personal data in the initial release. Sales and beta CTAs use project email addresses until a reviewed CRM or newsletter processor is configured.
