
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }
  window.addEventListener('pageshow', event => {
    const navEntry = performance.getEntriesByType('navigation')[0];
    const isRefresh = navEntry && navEntry.type === 'reload';
    if (isRefresh || event.persisted) {
      setTimeout(() => window.scrollTo(0, 0), 0);
    }
  });
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', event => {
      const targetId = link.getAttribute('href');
      if (!targetId || targetId === '#') return;
      const target = document.querySelector(targetId);
      if (!target) return;
      event.preventDefault();
      const header = document.querySelector('header');
      const headerOffset = (header && getComputedStyle(header).position === 'sticky' ? header.offsetHeight : 0) + 18;
      const targetTop = target.getBoundingClientRect().top + window.pageYOffset - headerOffset;
      window.scrollTo({ top: Math.max(0, targetTop), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      history.pushState(null, '', targetId);
    });
  });

  // Send telephone clicks before opening the dialer, without blocking calls if Analytics is unavailable.
  document.querySelectorAll('a[href^="tel:"]').forEach(link => {
    link.addEventListener('click', event => {
      if (event.defaultPrevented || typeof window.gtag !== 'function') return;
      const phoneUrl = link.getAttribute('href');
      const modifiedClick = event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;
      let opened = false;
      let fallback;
      const openPhone = () => {
        if (opened || modifiedClick) return;
        opened = true;
        clearTimeout(fallback);
        window.location.href = phoneUrl;
      };
      if (!modifiedClick) {
        event.preventDefault();
        fallback = setTimeout(openPhone, 800);
      }
      try {
        window.gtag('event', 'call_now_click', {
          send_to: 'G-NMW5L7QPZ6',
          event_callback: openPhone,
          event_timeout: 800
        });
      } catch (error) {
        openPhone();
      }
    });
  });

