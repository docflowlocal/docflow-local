const EXPECTED_TIERS = Object.freeze({
  en: Object.freeze(['9', '29', '99']),
  zh: Object.freeze(['69', '199', '699'])
});

const EXACT_HOSTS = new Set([
  'buy.stripe.com',
  'checkout.stripe.com',
  'checkout.paddle.com',
  'pay.paddle.io'
]);

function trustedCheckoutHost(hostname) {
  const host = hostname.toLowerCase();
  return EXACT_HOSTS.has(host)
    || (host.endsWith('.lemonsqueezy.com') && host !== '.lemonsqueezy.com');
}

export function verifiedSupporterCheckoutUrl(value) {
  if (value === '') return '';
  if (typeof value !== 'string' || value.length > 2048) {
    throw new TypeError('Supporter checkout URL must be an empty string or a bounded HTTPS URL');
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch (_error) {
    throw new TypeError('Supporter checkout URL is invalid');
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.username
    || parsed.password
    || parsed.hash
    || !trustedCheckoutHost(parsed.hostname)
  ) {
    throw new TypeError('Supporter checkout URL must use an approved HTTPS payment host without credentials or fragments');
  }
  return parsed.href;
}

export function validateSupporterCheckoutUrls(configuration) {
  if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) {
    throw new TypeError('Supporter checkout configuration must be an object');
  }
  const normalized = {};
  let liveCount = 0;
  let totalCount = 0;

  for (const [locale, tiers] of Object.entries(EXPECTED_TIERS)) {
    const source = configuration[locale];
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      throw new TypeError(`Supporter checkout configuration is missing ${locale}`);
    }
    const actualKeys = Object.keys(source).sort();
    const expectedKeys = [...tiers].sort();
    if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
      throw new TypeError(`Supporter checkout configuration has unexpected ${locale} tiers`);
    }
    normalized[locale] = {};
    for (const tier of tiers) {
      const url = verifiedSupporterCheckoutUrl(source[tier]);
      normalized[locale][tier] = url;
      totalCount += 1;
      if (url) liveCount += 1;
    }
    Object.freeze(normalized[locale]);
  }

  if (liveCount !== 0 && liveCount !== totalCount) {
    throw new TypeError('Supporter checkout URLs must be enabled atomically for every localized tier');
  }
  return Object.freeze(normalized);
}
