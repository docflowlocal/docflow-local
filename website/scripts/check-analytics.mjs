import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const siteRoot = resolve(here, '..');
const source = await readFile(join(siteRoot, 'src', 'analytics.js'), 'utf8');

function analyticsRuntime(consent = 'granted', doNotTrack = '0') {
  const listeners = new Map();
  const scripts = [];
  const storage = new Map(consent ? [['docflow-analytics-consent-v1', consent]] : []);
  const document = {
    referrer: '',
    cookie: '',
    body: { dataset: { pageType: 'download', locale: 'en' } },
    documentElement: { lang: 'en' },
    head: { appendChild(element) { scripts.push(element); } },
    createElement(tagName) { return { tagName }; },
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
    },
    localStorage: {
      getItem(key) { return storage.get(key) ?? null; },
      setItem(key, value) { storage.set(key, value); }
    }
  };
  const navigator = { doNotTrack };
  vm.runInNewContext(source, { window, document, navigator, URL, URLSearchParams, Date, Object, TypeError, console, encodeURIComponent });
  return { window, click: listeners.get('click'), scripts };
}

function dispatch(runtime, { eventName, href = '', text, dataset, isLink = true }) {
  const element = {
    href,
    textContent: text,
    dataset: { analytics: eventName, ...dataset },
    classList: { contains: () => false }
  };
  runtime.click({ target: { closest: selector => {
    if (selector === '[data-analytics]') return element;
    if (selector === 'a' && isLink) return element;
    return null;
  } } });
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

const amountRuntime = analyticsRuntime();
dispatch(amountRuntime, {
  eventName: 'supporter_amount_select',
  text: 'US$29',
  isLink: false,
  dataset: {
    pageType: 'support',
    locale: 'en',
    supportAmount: '29',
    currency: 'USD',
    checkoutStatus: 'coming_soon'
  }
});
const amountEvents = recordedEvents(amountRuntime);
assert.deepEqual(amountEvents.map(event => event.name), ['supporter_amount_select']);
assert.equal(amountEvents[0].parameters.support_amount, '29');
assert.equal(amountEvents[0].parameters.currency, 'USD');
assert.equal(amountEvents[0].parameters.checkout_status, 'coming_soon');

const supporterRuntime = analyticsRuntime();
dispatch(supporterRuntime, {
  eventName: 'supporter_cta_click',
  href: 'mailto:support@willgo.tech?subject=DocFlow%20Local',
  text: 'Register US$29 support interest',
  dataset: {
    ctaId: 'support_supporter_action',
    ctaLocation: 'supporter_card',
    pageType: 'support',
    locale: 'en',
    destination: 'supporter_email',
    supportAmount: '29',
    currency: 'USD',
    checkoutStatus: 'coming_soon'
  }
});
const supporterEvents = recordedEvents(supporterRuntime);
assert.deepEqual(supporterEvents.map(event => event.name), ['supporter_cta_click', 'cta_click']);
assert.equal(supporterEvents[0].parameters.destination, 'supporter_email');
assert.equal(supporterEvents[0].parameters.support_amount, '29');
assert.equal(supporterEvents[0].parameters.currency, 'USD');
assert.equal(supporterEvents.some(event => event.name === 'supporter_checkout_start'), false);

const deniedRuntime = analyticsRuntime('denied');
dispatch(deniedRuntime, {
  eventName: 'supporter_amount_select',
  text: 'US$29',
  isLink: false,
  dataset: { supportAmount: '29', currency: 'USD' }
});
assert.equal(recordedEvents(deniedRuntime).length, 0);
assert.equal(deniedRuntime.scripts.length, 0);
assert.equal(deniedRuntime.window.docflowAnalyticsConsent.isEnabled(), false);

const dntRuntime = analyticsRuntime('granted', '1');
assert.equal(dntRuntime.scripts.length, 0);
assert.equal(dntRuntime.window.docflowAnalyticsConsent.isEnabled(), false);

console.log('Consent-gated analytics validation passed for installer, beta, and optional supporter CTAs.');
