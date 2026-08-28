import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const siteRoot = resolve(here, '..');
const dist = join(siteRoot, 'dist');
const siteUrl = 'https://docflowlocal.com';
const indexNowKey = '393eedac11f37df862e931238f00bae8';
const errors = [];
const buildSource = await readFile(join(siteRoot, 'scripts', 'build.mjs'), 'utf8');
const analyticsSource = await readFile(join(siteRoot, 'src', 'analytics.js'), 'utf8');

if (!buildSource.includes("const assetRevision = '") || !buildSource.includes('Cache-Control: public, max-age=0, must-revalidate')) {
  errors.push('assets: mutable CSS and JavaScript require cache revisioning and revalidation');
}
if (!analyticsSource.includes("const GA_MEASUREMENT_ID = 'G-77MP7J9XFT'")) errors.push('analytics: unexpected GA4 measurement ID');

if (!buildSource.includes("macos: 'download_mac_installer'")) errors.push('analytics: missing macOS installer event contract');
if (!buildSource.includes("windows: 'download_windows_installer'")) errors.push('analytics: missing Windows installer event contract');
for (const marker of ["'supporter_cta_click'", "'supporter_amount_select'", "'supporter_checkout_start'"]) {
  if (!buildSource.includes(marker)) errors.push(`analytics: missing supporter event contract ${marker}`);
}
for (const marker of ["'download_mac_installer'", "'download_windows_installer'", 'file_name:', 'file_extension:', 'link_url:', 'link_domain:']) {
  if (!analyticsSource.includes(marker)) errors.push(`analytics: missing installer handler marker ${marker}`);
}
for (const marker of ['docflow-analytics-consent-v1', 'allow_google_signals: false', 'allow_ad_personalization_signals: false']) {
  if (!analyticsSource.includes(marker)) errors.push(`analytics: missing consent or data-minimization marker ${marker}`);
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

const htmlFiles = (await walk(dist))
  .filter(file => file.endsWith(`${sep}index.html`))
  .sort();
const canonicalUrls = new Set();
const titles = new Map();
const descriptions = new Map();

function pagePath(file) {
  const directory = relative(dist, file).split(sep).slice(0, -1).join('/');
  return directory ? `/${directory}/` : '/';
}

function match(html, pattern) {
  return html.match(pattern)?.[1]?.trim() || '';
}

function duplicate(map, value, file, label) {
  if (!value) return;
  if (map.has(value)) errors.push(`${file}: duplicate ${label} also used by ${map.get(value)}`);
  else map.set(value, file);
}

for (const file of htmlFiles) {
  const html = await readFile(file, 'utf8');
  const displayPath = relative(dist, file);
  const path = pagePath(file);
  const expectedCanonical = `${siteUrl}${path}`;
  const title = match(html, /<title>([^<]+)<\/title>/i);
  const description = match(html, /<meta name="description" content="([^"]+)"/i);
  const canonical = match(html, /<link rel="canonical" href="([^"]+)"/i);
  const h1Count = (html.match(/<h1(?:\s|>)/gi) || []).length;

  if (!title) errors.push(`${displayPath}: missing title`);
  if (!description) errors.push(`${displayPath}: missing meta description`);
  if (canonical !== expectedCanonical) errors.push(`${displayPath}: canonical ${canonical || '(missing)'} does not match ${expectedCanonical}`);
  if (!html.includes('name="robots" content="index,follow,max-image-preview:large')) errors.push(`${displayPath}: missing indexable robots directives`);
  if (h1Count !== 1) errors.push(`${displayPath}: expected one H1, found ${h1Count}`);
  if (!html.includes('hreflang="en"') || !html.includes('hreflang="zh-CN"') || !html.includes('hreflang="x-default"')) errors.push(`${displayPath}: incomplete hreflang set`);
  if (!html.includes('property="og:image" content="https://docflowlocal.com/assets/docflow-local-og.png"')) errors.push(`${displayPath}: missing absolute og:image`);
  if (!html.includes('name="twitter:card" content="summary_large_image"')) errors.push(`${displayPath}: missing large Twitter card`);
  if (!html.includes('CODE_SIGNING_POLICY.md')) errors.push(`${displayPath}: missing code signing policy link`);
  if (!html.includes('data-analytics-consent') || !html.includes('data-analytics-accept') || !html.includes('data-analytics-decline')) {
    errors.push(`${displayPath}: missing optional analytics consent controls`);
  }
  if (!html.includes('data-analytics-settings')) errors.push(`${displayPath}: missing persistent analytics settings control`);
  if (!html.includes('/assets/analytics.js?v=') || !html.includes('/assets/site.js?v=') || !html.includes('/assets/styles.css?v=')) {
    errors.push(`${displayPath}: mutable site assets are missing a cache revision`);
  }
  if (html.includes('src="https://www.googletagmanager.com/gtag/js')) {
    errors.push(`${displayPath}: Google Analytics must not load before explicit consent`);
  }

  const buttonLinks = [...html.matchAll(/<a class="button [^"]*"[^>]*>/g)].map(result => result[0]);
  for (const [index, link] of buttonLinks.entries()) {
    for (const attribute of ['data-analytics', 'data-cta-id', 'data-cta-location', 'data-page-type', 'data-locale', 'data-destination']) {
      if (!link.includes(`${attribute}="`)) errors.push(`${displayPath}: button CTA ${index + 1} missing ${attribute}`);
    }
  }

  if (html.includes('>Join beta') || html.includes('>申请内测')) errors.push(`${displayPath}: stale generic beta CTA remains`);
  if ((path === '/' || path === '/zh/') && !html.includes(path === '/' ? 'Download Community free' : '免费下载 Community')) {
    errors.push(`${displayPath}: homepage missing Community download CTA`);
  }
  if (path === '/download/' || path === '/zh/download/') {
    for (const marker of ['quickstart-list', 'download_starter_trade', 'download_starter_engineering', 'download_starter_hr', 'download_starter_compliance']) {
      if (!html.includes(marker)) errors.push(`${displayPath}: download onboarding missing ${marker}`);
    }
    const macInstaller = buttonLinks.find(link => link.includes('data-analytics="download_mac_installer"'));
    if (!macInstaller) {
      errors.push(`${displayPath}: missing macOS installer download event`);
    } else {
      for (const attribute of ['data-cta-id="download_macos_pkg"', 'data-destination="github_release_asset"', 'data-platform="macos"', 'data-asset-type="pkg"', 'data-release-version="']) {
        if (!macInstaller.includes(attribute)) errors.push(`${displayPath}: macOS installer event missing ${attribute}`);
      }
    }

    const windowsInstaller = buttonLinks.find(link => link.includes('data-analytics="download_windows_installer"'));
    if (windowsInstaller) {
      for (const attribute of ['data-cta-id="download_windows_installer"', 'data-destination="github_release_asset"', 'data-platform="windows"', 'data-asset-type="exe"', 'data-release-version="']) {
        if (!windowsInstaller.includes(attribute)) errors.push(`${displayPath}: Windows installer event missing ${attribute}`);
      }
    } else {
      const windowsBeta = buttonLinks.find(link => link.includes('data-cta-id="download_windows_beta"'));
      if (!windowsBeta || !windowsBeta.includes('data-analytics="beta_request"') || !windowsBeta.includes('data-platform="windows"')) {
        errors.push(`${displayPath}: unsigned Windows state must retain the Windows beta event`);
      }
    }
    if (!html.includes('Free code signing provided by SignPath.io, certificate by SignPath Foundation.')) {
      errors.push(`${displayPath}: missing SignPath Foundation attribution`);
    }
    if (!html.includes('data-analytics="supporter_cta_click"') || !html.includes('data-destination="support_page"')) {
      errors.push(`${displayPath}: missing optional supporter entry point`);
    }
    const suggestedSupportPath = path === '/zh/download/' ? '/zh/support/?amount=199' : '/support/?amount=29';
    if (!html.includes(`href="${suggestedSupportPath}"`)) {
      errors.push(`${displayPath}: supporter entry point must preselect the localized suggested amount`);
    }
  }

  if (path === '/support/' || path === '/zh/support/') {
    if (!html.includes('data-cta-id="support_community_download"') || !html.includes('data-destination="download_page"')) {
      errors.push(`${displayPath}: support page must retain an independent free download CTA`);
    }
    if ((html.match(/data-analytics="supporter_amount_select"/g) || []).length !== 3) {
      errors.push(`${displayPath}: expected three one-time support amount selectors`);
    }
    const liveCheckout = html.includes('data-checkout-status="live"');
    if (liveCheckout) {
      if (!html.includes('data-analytics="supporter_checkout_start"') || html.includes('data-checkout-status="coming_soon"')) {
        errors.push(`${displayPath}: configured payment flow must use only verified live checkout actions`);
      }
    } else {
      if (!html.includes('data-analytics="supporter_cta_click"') || !html.includes('data-checkout-status="coming_soon"')) {
        errors.push(`${displayPath}: unconfigured payment flow must use the transparent supporter email event`);
      }
      if (html.includes('data-analytics="supporter_checkout_start"')) {
        errors.push(`${displayPath}: checkout start must not be emitted before a verified payment URL is configured`);
      }
    }
  }

  const schemaBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
  if (schemaBlocks.length !== 1) {
    errors.push(`${displayPath}: expected one JSON-LD block, found ${schemaBlocks.length}`);
  } else {
    try {
      const schema = JSON.parse(schemaBlocks[0][1]);
      const types = (schema['@graph'] || []).flatMap(node => Array.isArray(node['@type']) ? node['@type'] : [node['@type']]);
      for (const type of ['Organization', 'WebSite', 'SoftwareApplication', 'WebPage']) {
        if (!types.includes(type)) errors.push(`${displayPath}: schema missing ${type}`);
      }
      if (path !== '/' && path !== '/zh/' && !types.includes('BreadcrumbList')) errors.push(`${displayPath}: schema missing BreadcrumbList`);
      if (html.includes('class="faq-item"') && !types.includes('FAQPage')) errors.push(`${displayPath}: visible FAQ missing FAQPage schema`);
      if ((path.includes('/guides/') || path.includes('/benchmarks/')) && path !== '/guides/' && path !== '/zh/guides/' && !types.includes('TechArticle')) errors.push(`${displayPath}: guide schema missing TechArticle`);
    } catch (error) {
      errors.push(`${displayPath}: invalid JSON-LD (${error.message})`);
    }
  }

  duplicate(titles, title, displayPath, 'title');
  duplicate(descriptions, description, displayPath, 'description');
  canonicalUrls.add(canonical);

  const internalLinks = [...html.matchAll(/href="(\/[^"]*)"/g)].map(result => result[1]);
  for (const href of internalLinks) {
    const clean = href.split('#')[0].split('?')[0];
    if (!clean) continue;
    const target = clean.endsWith('/')
      ? join(dist, clean.replace(/^\//, ''), 'index.html')
      : join(dist, clean.replace(/^\//, ''));
    try {
      await stat(target);
    } catch {
      errors.push(`${displayPath}: broken internal link ${href}`);
    }
  }
}

const sitemap = await readFile(join(dist, 'sitemap.xml'), 'utf8');
const sitemapUrls = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(result => result[1]));
if (sitemapUrls.size !== htmlFiles.length) errors.push(`sitemap: expected ${htmlFiles.length} URLs, found ${sitemapUrls.size}`);
for (const canonical of canonicalUrls) {
  if (!sitemapUrls.has(canonical)) errors.push(`sitemap: missing ${canonical}`);
}
if ((sitemap.match(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g) || []).length !== htmlFiles.length) errors.push('sitemap: every URL must have a valid lastmod');

const robots = await readFile(join(dist, 'robots.txt'), 'utf8');
if (!robots.includes(`Sitemap: ${siteUrl}/sitemap.xml`)) errors.push('robots.txt: missing absolute sitemap URL');
if (!robots.includes('Content-Signal: search=yes, ai-input=yes, ai-train=no, use=reference')) errors.push('robots.txt: missing AI search content signal');
for (const agent of ['OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'Claude-SearchBot', 'Claude-User', 'Googlebot', 'Bingbot']) {
  if (!robots.includes(`User-agent: ${agent}\nAllow: /`)) errors.push(`robots.txt: ${agent} is not explicitly allowed`);
}
for (const agent of ['GPTBot', 'ClaudeBot', 'Google-Extended']) {
  if (!robots.includes(`User-agent: ${agent}\nDisallow: /`)) errors.push(`robots.txt: ${agent} training crawler is not blocked`);
}

const indexNowVerification = await readFile(join(dist, `${indexNowKey}.txt`), 'utf8');
if (indexNowVerification.trim() !== indexNowKey) errors.push('IndexNow: verification key file is invalid');

const llms = await readFile(join(dist, 'llms.txt'), 'utf8');
if (!llms.includes('# DocFlow Local') || !llms.includes(`${siteUrl}/guides/`)) errors.push('llms.txt: missing product or guide index');

const notFound = await readFile(join(dist, '404.html'), 'utf8');
if (!notFound.includes('name="robots" content="noindex,follow"')) errors.push('404.html: missing noindex,follow');

const ogImage = await readFile(join(dist, 'assets', 'docflow-local-og.png'));
if (ogImage.readUInt32BE(16) !== 1200 || ogImage.readUInt32BE(20) !== 630) errors.push('social image: expected 1200×630 PNG');

if (errors.length) {
  process.stderr.write(`SEO validation failed:\n- ${errors.join('\n- ')}\n`);
  process.exit(1);
}

process.stdout.write(`SEO validation passed for ${htmlFiles.length} localized pages.\n`);
