const GA_MEASUREMENT_ID = 'G-77MP7J9XFT';
const ANALYTICS_CONSENT_KEY = 'docflow-analytics-consent-v1';

window.dataLayer = window.dataLayer || [];
let analyticsEnabled = false;
let analyticsTagRequested = false;

function gtag() {
  window.dataLayer.push(arguments);
}

function savedConsent() {
  try {
    const value = window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch (_error) {
    return null;
  }
}

function doNotTrackEnabled() {
  return navigator.doNotTrack === '1' || window.doNotTrack === '1';
}

function clearAnalyticsCookies() {
  try {
    document.cookie.split(';').forEach(cookie => {
      const name = cookie.split('=')[0]?.trim();
      if (!name?.startsWith('_ga')) return;
      document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
      document.cookie = `${name}=; Max-Age=0; path=/; domain=.docflowlocal.com; SameSite=Lax`;
    });
  } catch (_error) {
    // Cookie cleanup is best effort when browser policy blocks access.
  }
}

function loadGoogleAnalytics() {
  if (analyticsTagRequested || doNotTrackEnabled()) return false;
  analyticsTagRequested = true;
  analyticsEnabled = true;
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
  script.referrerPolicy = 'strict-origin-when-cross-origin';
  document.head.appendChild(script);
  gtag('js', new Date());
  gtag('config', GA_MEASUREMENT_ID, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false
  });
  return true;
}

function setConsent(value) {
  if (value !== 'granted' && value !== 'denied') throw new TypeError('Unsupported analytics consent value');
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, value);
  } catch (_error) {
    // The choice still applies to this page when storage is unavailable.
  }
  if (value === 'granted') return loadGoogleAnalytics();
  analyticsEnabled = false;
  if (analyticsTagRequested) gtag('consent', 'update', { analytics_storage: 'denied' });
  clearAnalyticsCookies();
  return true;
}

window.docflowAnalyticsConsent = Object.freeze({
  get: savedConsent,
  set: setConsent,
  doNotTrack: doNotTrackEnabled,
  isEnabled: () => analyticsEnabled
});

if (savedConsent() === 'granted' && !doNotTrackEnabled()) loadGoogleAnalytics();

function track(eventName, parameters = {}) {
  if (!analyticsEnabled) return;
  gtag('event', eventName, parameters);
}

function compact(parameters) {
  return Object.fromEntries(Object.entries(parameters).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}

function clickParameters(link) {
  return compact({
    cta_id: link.dataset.ctaId,
    cta_location: link.dataset.ctaLocation,
    page_type: link.dataset.pageType || document.body.dataset.pageType,
    locale: link.dataset.locale || document.body.dataset.locale || document.documentElement.lang || 'en',
    destination: link.dataset.destination,
    platform: link.dataset.platform,
    asset_type: link.dataset.assetType,
    release_version: link.dataset.releaseVersion,
    plan: link.dataset.plan,
    industry: link.dataset.industry,
    support_amount: link.dataset.supportAmount,
    currency: link.dataset.currency,
    checkout_status: link.dataset.checkoutStatus,
    page_path: window.location.pathname
  });
}

const installerDownloadEvents = new Set([
  'download_mac_installer',
  'download_windows_installer',
  // Preview downloads share file metadata, not the public-release conversion event.
  'download_windows_preview'
]);

function installerDownloadParameters(link, parameters) {
  try {
    const url = new URL(link.href, window.location.href);
    const encodedName = url.pathname.split('/').filter(Boolean).at(-1) || '';
    let fileName = encodedName;
    try {
      fileName = decodeURIComponent(encodedName);
    } catch (_error) {
      // Keep the encoded public filename when a URL contains invalid escapes.
    }
    const extension = fileName.includes('.') ? fileName.split('.').at(-1).toLowerCase() : '';
    return compact({
      ...parameters,
      link_url: url.href,
      link_domain: url.hostname,
      link_text: link.textContent?.trim(),
      file_name: fileName,
      file_extension: extension
    });
  } catch (_error) {
    return parameters;
  }
}

function aiReferralSource() {
  const campaignSource = new URLSearchParams(window.location.search).get('utm_source')?.toLowerCase() || '';
  const referringHost = (() => {
    try {
      return document.referrer ? new URL(document.referrer).hostname.toLowerCase() : '';
    } catch (_error) {
      return '';
    }
  })();
  const candidate = `${campaignSource} ${referringHost}`;
  const sources = [
    ['chatgpt', ['chatgpt.com', 'openai.com']],
    ['perplexity', ['perplexity.ai']],
    ['claude', ['claude.ai', 'anthropic.com']],
    ['copilot', ['copilot.microsoft.com', 'bing.com']],
    ['gemini', ['gemini.google.com']]
  ];
  return sources.find(([, domains]) => domains.some(domain => candidate.includes(domain)))?.[0] || '';
}

const aiSource = aiReferralSource();
if (aiSource) {
  track('ai_referral_landing', {
    ai_source: aiSource,
    landing_path: window.location.pathname,
    non_interaction: true
  });
}

document.addEventListener('click', event => {
  const trackedElement = event.target.closest('[data-analytics]');
  const analyticsEvent = trackedElement?.dataset.analytics;
  if (analyticsEvent) {
    const clickContext = clickParameters(trackedElement);
    const parameters = installerDownloadEvents.has(analyticsEvent)
      ? installerDownloadParameters(trackedElement, clickContext)
      : clickContext;
    track(analyticsEvent, parameters);
    if (trackedElement.dataset.ctaId && analyticsEvent !== 'cta_click') {
      track('cta_click', { ...parameters, source_event: analyticsEvent });
    }
    return;
  }

  const link = event.target.closest('a');
  if (!link) return;

  if (link.classList.contains('language-link')) {
    track('language_switch', {
      from_language: document.documentElement.lang || 'en',
      to_language: link.hreflang || 'en',
      page_type: document.body.dataset.pageType,
      locale: document.body.dataset.locale || document.documentElement.lang || 'en',
      page_path: window.location.pathname
    });
    return;
  }

  if (link.href.includes('github.com/docflowlocal/')) {
    track('github_source_click', {
      page_type: document.body.dataset.pageType,
      locale: document.body.dataset.locale || document.documentElement.lang || 'en',
      page_path: window.location.pathname
    });
  }
});
