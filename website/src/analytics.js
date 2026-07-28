window.dataLayer = window.dataLayer || [];

function gtag() {
  window.dataLayer.push(arguments);
}

gtag('js', new Date());
gtag('config', 'G-77MP7J9XFT');

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
  gtag('event', 'ai_referral_landing', {
    ai_source: aiSource,
    landing_path: window.location.pathname,
    non_interaction: true
  });
}
