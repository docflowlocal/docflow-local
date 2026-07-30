window.dataLayer = window.dataLayer || [];

function gtag() {
  window.dataLayer.push(arguments);
}

gtag('js', new Date());
gtag('config', 'G-77MP7J9XFT');

function track(eventName, parameters = {}) {
  gtag('event', eventName, parameters);
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
    track(analyticsEvent, {
      platform: link.dataset.platform || undefined,
      asset_type: link.dataset.assetType || undefined,
      release_version: link.dataset.releaseVersion || undefined,
      page_path: window.location.pathname
    });
    return;
  }

  if (link.classList.contains('language-link')) {
    track('language_switch', {
      from_language: document.documentElement.lang || 'en',
      to_language: link.hreflang || 'en',
      page_path: window.location.pathname
    });
    return;
  }

  if (link.href.includes('github.com/docflowlocal/')) {
    track('github_source_click', {
      page_path: window.location.pathname
    });
  }
});
