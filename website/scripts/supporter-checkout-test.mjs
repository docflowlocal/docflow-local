import assert from 'node:assert/strict';
import {
  validateSupporterCheckoutUrls,
  verifiedSupporterCheckoutUrl
} from './supporter-checkout.mjs';

const disabled = {
  en: { 9: '', 29: '', 99: '' },
  zh: { 69: '', 199: '', 699: '' }
};
assert.equal(validateSupporterCheckoutUrls(disabled).en[29], '');

const live = {
  en: {
    9: 'https://buy.stripe.com/live-example-9',
    29: 'https://buy.stripe.com/live-example-29',
    99: 'https://buy.stripe.com/live-example-99'
  },
  zh: {
    69: 'https://buy.stripe.com/live-example-69',
    199: 'https://buy.stripe.com/live-example-199',
    699: 'https://buy.stripe.com/live-example-699?locale=zh'
  }
};
assert.equal(validateSupporterCheckoutUrls(live).en[9], live.en[9]);

for (const invalid of [
  'http://buy.stripe.com/example',
  'https://user:password@buy.stripe.com/example',
  'https://evil.example/checkout',
  'https://buy.stripe.com.evil.example/checkout',
  'https://checkout.stripe.com/example',
  'https://checkout.paddle.com/example',
  'https://docflowlocal.lemonsqueezy.com/buy/example',
  'https://buy.stripe.com/',
  'https://buy.stripe.com/test_example',
  'https://buy.stripe.com/%74est_example',
  'https://buy.stripe.com/example#fragment'
]) {
  assert.throws(() => verifiedSupporterCheckoutUrl(invalid));
}

const partial = structuredClone(disabled);
partial.en[29] = 'https://buy.stripe.com/example-29';
assert.throws(() => validateSupporterCheckoutUrls(partial), /atomically/);

const extraTier = structuredClone(disabled);
extraTier.en[199] = '';
assert.throws(() => validateSupporterCheckoutUrls(extraTier), /unexpected/);

console.log('Supporter checkout URL validation passed.');
