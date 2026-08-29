import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const siteRoot = resolve(here, '..');
const source = await readFile(join(siteRoot, 'src', 'site.js'), 'utf8');

function amountButton(amount) {
  const listeners = new Map();
  const classes = new Set(amount === '29' ? ['is-selected'] : []);
  return {
    dataset: {
      supporterAmount: amount,
      supporterHref: `mailto:support@example.com?amount=${amount}`,
      supporterCtaLabel: `Register US$${amount} support interest`,
      supporterEvent: 'supporter_cta_click',
      supporterDestination: 'supporter_email',
      supporterCheckoutStatus: 'coming_soon'
    },
    classList: {
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      },
      contains(name) {
        return classes.has(name);
      }
    },
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    addEventListener(name, listener) {
      listeners.set(name, listener);
    },
    click() {
      listeners.get('click')?.();
    }
  };
}

const buttons = ['9', '29', '99'].map(amountButton);
const cta = { href: '', textContent: '', dataset: {} };
const status = { textContent: '' };
const panel = {
  querySelector(selector) {
    if (selector === '[data-supporter-cta]') return cta;
    if (selector === '[data-supporter-status]') return status;
    return null;
  },
  querySelectorAll(selector) {
    return selector === '[data-supporter-amount]' ? buttons : [];
  }
};
const document = {
  documentElement: { lang: 'en' },
  querySelector() { return null; },
  querySelectorAll(selector) {
    if (selector === '[data-supporter]') return [panel];
    return [];
  }
};
const window = { location: { search: '?amount=99' } };

vm.runInNewContext(source, { window, document, URLSearchParams, Date });

assert.equal(buttons[2].classList.contains('is-selected'), true);
assert.equal(buttons[2].attributes['aria-pressed'], 'true');
assert.equal(buttons[1].classList.contains('is-selected'), false);
assert.equal(cta.dataset.supportAmount, '99');
assert.equal(cta.href, 'mailto:support@example.com?amount=99');

buttons[0].click();
assert.equal(buttons[0].classList.contains('is-selected'), true);
assert.equal(cta.dataset.supportAmount, '9');

buttons[1].dataset.supporterHref = 'https://buy.stripe.com/live-link';
buttons[1].dataset.supporterCtaLabel = 'Support once — US$29';
buttons[1].dataset.supporterEvent = 'supporter_checkout_start';
buttons[1].dataset.supporterDestination = 'supporter_checkout';
buttons[1].dataset.supporterCheckoutStatus = 'live';
buttons[1].click();
assert.equal(cta.href, 'https://buy.stripe.com/live-link');
assert.equal(cta.dataset.analytics, 'supporter_checkout_start');
assert.equal(cta.dataset.checkoutStatus, 'live');
assert.equal(status.textContent, 'The button opens a secure checkout page hosted by Stripe.');

console.log('Site interaction validation passed for supporter tier preselection.');
