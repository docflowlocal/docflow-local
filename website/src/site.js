(() => {
  const menu = document.querySelector('[data-menu]');
  const nav = document.querySelector('[data-nav]');
  if (menu && nav) {
    menu.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      menu.setAttribute('aria-expanded', String(open));
    });
  }

  const analyticsConsent = document.querySelector('[data-analytics-consent]');
  const analyticsApi = window.docflowAnalyticsConsent;
  if (analyticsConsent && analyticsApi) {
    const accept = analyticsConsent.querySelector('[data-analytics-accept]');
    const decline = analyticsConsent.querySelector('[data-analytics-decline]');
    const hideConsent = () => { analyticsConsent.hidden = true; };
    const showConsent = () => {
      analyticsConsent.hidden = false;
      (analyticsApi.get() === 'granted' ? decline : accept)?.focus();
    };
    const existingChoice = analyticsApi.get();
    analyticsConsent.hidden = existingChoice !== null || analyticsApi.doNotTrack();
    accept?.addEventListener('click', () => {
      analyticsApi.set('granted');
      hideConsent();
    });
    decline?.addEventListener('click', () => {
      analyticsApi.set('denied');
      hideConsent();
    });
    document.querySelectorAll('[data-analytics-settings]').forEach(link => {
      link.addEventListener('click', event => {
        event.preventDefault();
        showConsent();
      });
    });
  }

  document.querySelectorAll('[data-faq-button]').forEach(button => {
    button.addEventListener('click', () => {
      const item = button.closest('.faq-item');
      const open = item.classList.toggle('is-open');
      button.setAttribute('aria-expanded', String(open));
    });
  });

  const revealItems = document.querySelectorAll('[data-reveal]');
  revealItems.forEach(element => element.classList.add('reveal-pending'));

  const observer = 'IntersectionObserver' in window
    ? new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12 })
    : null;

  revealItems.forEach(element => {
    if (observer) observer.observe(element);
    else element.classList.add('is-visible');
  });

  document.querySelectorAll('[data-supporter]').forEach(panel => {
    const cta = panel.querySelector('[data-supporter-cta]');
    const status = panel.querySelector('[data-supporter-status]');
    const amountButtons = [...panel.querySelectorAll('[data-supporter-amount]')];
    const applySelection = button => {
      amountButtons.forEach(option => {
        const selected = option === button;
        option.classList.toggle('is-selected', selected);
        option.setAttribute('aria-pressed', String(selected));
      });
      if (!cta) return;
      cta.href = button.dataset.supporterHref;
      cta.textContent = button.dataset.supporterCtaLabel;
      cta.dataset.analytics = button.dataset.supporterEvent;
      cta.dataset.destination = button.dataset.supporterDestination;
      cta.dataset.supportAmount = button.dataset.supporterAmount;
      cta.dataset.checkoutStatus = button.dataset.supporterCheckoutStatus;
      if (status) {
        const zh = document.documentElement.lang.startsWith('zh');
        status.textContent = button.dataset.supporterCheckoutStatus === 'live'
          ? (zh ? '点击后将前往安全支付页面。' : 'The button opens the secure checkout page.')
          : (zh ? '安全支付通道正在接入。当前按钮只会打开支持邮件并登记意向，不会收取任何款项。' : 'A secure payment channel is being integrated. The current button only opens a support email draft and does not take payment.');
      }
    };
    amountButtons.forEach(button => button.addEventListener('click', () => applySelection(button)));
    const requestedAmount = new URLSearchParams(window.location.search).get('amount');
    const requestedButton = amountButtons.find(button => button.dataset.supporterAmount === requestedAmount);
    if (requestedButton) applySelection(requestedButton);
  });

  const year = document.querySelector('[data-year]');
  if (year) year.textContent = new Date().getFullYear();
})();
