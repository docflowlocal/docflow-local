import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const siteRoot = resolve(here, '..');
const source = await readFile(join(siteRoot, 'src', 'analytics.js'), 'utf8');

function analyticsRuntime() {
  const listeners = new Map();
  const document = {
    referrer: '',
    body: { dataset: { pageType: 'download', locale: 'en' } },
    documentElement: { lang: 'en' },
    addEventListener(name, listener) {
      listeners.set(name, listener);
    }
  };
  const window = {
    dataLayer: [],
    location: {
      href: 'https://docflowlocal.com/download/',
      pathname: '/download/',
      search: ''
    }
  };
  vm.runInNewContext(source, { window, document, URL, URLSearchParams, Date, console });
  return { window, click: listeners.get('click') };
}

function dispatch(runtime, { eventName, href, text, dataset }) {
  const link = {
    href,
    textContent: text,
    dataset: { analytics: eventName, ...dataset },
    classList: { contains: () => false }
  };
  runtime.click({ target: { closest: selector => selector === 'a' ? link : null } });
}

function recordedEvents(runtime) {
  return runtime.window.dataLayer
    .filter(entry => entry[0] === 'event')
    .map(entry => ({ name: entry[1], parameters: entry[2] }));
}

for (const installer of [
  {
    eventName: 'download_mac_installer',
    platform: 'macos',
    assetType: 'pkg',
    href: 'https://github.com/docflowlocal/docflow-desktop/releases/download/v0.6.0/DocFlow-Local-0.6.0-macOS-arm64.pkg',
    fileName: 'DocFlow-Local-0.6.0-macOS-arm64.pkg'
  },
  {
    eventName: 'download_windows_installer',
    platform: 'windows',
    assetType: 'exe',
    href: 'https://github.com/docflowlocal/docflow-desktop/releases/download/v0.6.0/DocFlow-Local-Setup-0.6.0-x64.exe',
    fileName: 'DocFlow-Local-Setup-0.6.0-x64.exe'
  }
]) {
  const runtime = analyticsRuntime();
  dispatch(runtime, {
    eventName: installer.eventName,
    href: installer.href,
    text: 'Download Community',
    dataset: {
      ctaId: `${installer.platform}_installer`,
      ctaLocation: 'download_card',
      pageType: 'download',
      locale: 'en',
      destination: 'github_release_asset',
      platform: installer.platform,
      assetType: installer.assetType,
      releaseVersion: '0.6.0'
    }
  });
  const events = recordedEvents(runtime);
  assert.deepEqual(events.map(event => event.name), [installer.eventName, 'cta_click']);
  const parameters = events[0].parameters;
  assert.equal(parameters.platform, installer.platform);
  assert.equal(parameters.asset_type, installer.assetType);
  assert.equal(parameters.file_name, installer.fileName);
  assert.equal(parameters.file_extension, installer.assetType);
  assert.equal(parameters.link_url, installer.href);
  assert.equal(parameters.link_domain, 'github.com');
  assert.equal(parameters.release_version, '0.6.0');
  assert.equal(events[1].parameters.source_event, installer.eventName);
}

const betaRuntime = analyticsRuntime();
dispatch(betaRuntime, {
  eventName: 'beta_request',
  href: 'mailto:support@willgo.tech?subject=DocFlow%20Local%20Beta',
  text: 'Join Windows beta',
  dataset: {
    ctaId: 'download_windows_beta',
    ctaLocation: 'download_card',
    pageType: 'download',
    locale: 'en',
    destination: 'windows_beta_email',
    platform: 'windows'
  }
});
const betaEvents = recordedEvents(betaRuntime);
assert.deepEqual(betaEvents.map(event => event.name), ['beta_request', 'cta_click']);
assert.equal(betaEvents.some(event => event.name.includes('installer')), false);

console.log('Analytics validation passed for macOS, Windows, and beta CTAs.');
