window.dataLayer = window.dataLayer || [];

function gtag() {
  window.dataLayer.push(arguments);
}

gtag('js', new Date());
gtag('config', 'G-77MP7J9XFT');

function track(eventName, parameters = {}) {
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
    page_path: window.location.pathname
  });
}

const installerDownloadEvents = new Set([
  'download_mac_installer',
  'download_windows_installer'
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
  const link = event.target.closest('a');
  if (!link) return;

  const analyticsEvent = link.dataset.analytics;
  if (analyticsEvent) {
    const clickContext = clickParameters(link);
    const parameters = installerDownloadEvents.has(analyticsEvent)
      ? installerDownloadParameters(link, clickContext)
      : clickContext;
    track(analyticsEvent, parameters);
    if (link.dataset.ctaId && analyticsEvent !== 'cta_click') {
      track('cta_click', { ...parameters, source_event: analyticsEvent });
    }
    return;
  }

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
