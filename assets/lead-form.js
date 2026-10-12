(() => {
  'use strict';
  const config = window.A1_LEAD_FORM;
  if (!config || !config.endpoint) return; // Existing Google Form remains available.
  let endpoint;
  try {
    endpoint = new URL(config.endpoint);
    if (endpoint.origin !== 'https://script.google.com' ||
        !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint.pathname)) return;
  } catch (_) { return; }
  const original = document.querySelector('iframe[src*="docs.google.com/forms/"]');
  if (!original || !window.crypto || !crypto.getRandomValues) return;
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(24)), x => x.toString(16).padStart(2, '0')).join('');
  const attribution = {};
  const campaignKeys = ['utm_source', 'utm_medium', 'utm_campaign'];
  const params = new URLSearchParams(location.search);
  let referrerHost = '';
  try { referrerHost = new URL(document.referrer).hostname; } catch (_) {}
  try {
    const previous = JSON.parse(sessionStorage.getItem('a1_lead_context') || '{}');
    Object.assign(attribution, previous);
  } catch (_) {}
  if (campaignKeys.some(key => params.has(key)) || (referrerHost && referrerHost !== location.hostname)) {
    for (const key of campaignKeys) attribution[key] = (params.get(key) || '').slice(0, 200);
    attribution.referrer_host = referrerHost;
    attribution.landing_path = location.pathname;
  }
  if (!attribution.landing_path) {
    attribution.landing_path = location.pathname;
    attribution.referrer_host = referrerHost;
  }
  try { sessionStorage.setItem('a1_lead_context', JSON.stringify(attribution)); } catch (_) {}
  endpoint.search = '';
  endpoint.searchParams.set('parent_origin', location.origin);
  endpoint.searchParams.set('nonce', nonce);
  for (const key of [...campaignKeys, 'referrer_host', 'landing_path']) {
    endpoint.searchParams.set(key, String(attribution[key] || '').slice(0, 200));
  }
  const frame = document.createElement('iframe');
  frame.title = 'A-1 service request';
  frame.style.cssText = 'width:100%;height:1450px;border:0;display:none';
  frame.referrerPolicy = 'no-referrer';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = 'Loading service request form…';
  original.before(status, frame);
  let trustedSource;
  const counted = new Set();
  function onMessage(event) {
    let origin;
    try { origin = new URL(event.origin); } catch (_) { return; }
    if (origin.protocol !== 'https:' || !origin.hostname.endsWith('.googleusercontent.com')) return;
    const message = event.data;
    if (!message || message.nonce !== nonce || !event.source) return;
    if (message.type === 'a1:ready' && !trustedSource) {
      trustedSource = event.source;
      trustedSource.postMessage({type: 'a1:init', nonce}, event.origin);
      original.style.display = 'none';
      frame.style.display = 'block';
      // Once the new form is available, make the legacy link a secondary option.
      const panel = original.parentElement;
      if (panel) {
        panel.querySelectorAll('a[href^="https://docs.google.com/forms/"]').forEach(link => {
          link.textContent = 'Use the original Google Form';
          link.classList.remove('btn');
        });
        const note = panel.querySelector('.form-note');
        if (note) note.textContent = 'Complete your service request below. No Google account is required.';
      }
      status.textContent = 'Having trouble? The original Google Form is available above.';
      clearTimeout(loadTimeout);
    } else if (message.type === 'a1:saved' && event.source === trustedSource &&
               /^[a-f0-9-]{36}$/i.test(message.requestId || '') && !counted.has(message.requestId)) {
      counted.add(message.requestId);
      frame.style.height = '600px';
      // Only the event name and non-personal form identifier reach Analytics.
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'generate_lead', {
          send_to: config.measurementId, form_id: 'a1_service_request'
        });
      }
    }
  }
  window.addEventListener('message', onMessage);
  const loadTimeout = setTimeout(() => {
    if (trustedSource) return;
    frame.remove();
    status.textContent = 'Please use the request form below or call 469-716-3088.';
    window.removeEventListener('message', onMessage);
  }, 15000);
  frame.src = endpoint.href;
})();

