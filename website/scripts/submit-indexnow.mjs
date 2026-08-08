import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(here, '..');
const siteUrl = 'https://docflowlocal.com';
const host = 'docflowlocal.com';
const key = '393eedac11f37df862e931238f00bae8';
const keyLocation = `${siteUrl}/${key}.txt`;
const endpoint = 'https://api.indexnow.org/indexnow';

const sitemap = await readFile(join(siteRoot, 'dist', 'sitemap.xml'), 'utf8');
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);

if (!urlList.length) {
  throw new Error('The generated sitemap does not contain any URLs.');
}
if (urlList.some(url => !url.startsWith(`${siteUrl}/`))) {
  throw new Error('The generated sitemap contains a URL outside docflowlocal.com.');
}

const payload = { host, key, keyLocation, urlList };
if (process.argv.includes('--dry-run')) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(0);
}

const response = await fetch(endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(payload)
});

if (response.status !== 200 && response.status !== 202) {
  const message = (await response.text()).slice(0, 500);
  throw new Error(`IndexNow rejected the submission with HTTP ${response.status}${message ? `: ${message}` : ''}`);
}

process.stdout.write(`IndexNow accepted ${urlList.length} URLs with HTTP ${response.status}.\n`);
