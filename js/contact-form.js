/* ============================================================
   QUOTE FORM — real submission flow (Lead inbox, migration 003)
   ------------------------------------------------------------
   - POSTs to the Worker endpoint /api/leads, which stores the
     lead in D1 (additive helper — js/script.js untouched)
   - success: inline confirmation, no redirect
   - failure: inline error + pre-filled mailto: fallback link,
     so the visitor can still reach me if the API is down
   - funnel: form_view is tracked by analytics.js when the form
     scrolls into view; form_submit is tracked here on success
   - keeps bilingual placeholders + messages in sync with the
     site language by reading the existing #langToggle state
   ============================================================ */
document.addEventListener('DOMContentLoaded', function () {
  var form = document.getElementById('quoteForm');
  if (!form) return;

  var btn = form.querySelector('.quote-submit');
  var note = form.querySelector('.contact-note');

  function track(type, detail) {
    if (window.gisTrack) window.gisTrack(type, detail);
  }

  // --- funnel: attempts are deduped within a short window because a valid
  // --- submission fires BOTH the button click and the submit event
  var attemptMark = 0;
  function beginAttempt() {
    var now = Date.now();
    if (now - attemptMark < 400) return;   // same initiation, already counted
    attemptMark = now;
    track('form_attempt');
  }
  // button click AND Enter-key implicit submission both fire "click"
  if (btn) btn.addEventListener('click', beginAttempt);
  // browser constraint validation blocks "submit" and fires "invalid"
  // per field (does not bubble) — capture it here, one report per attempt
  var invalidSentAt = 0;
  form.addEventListener('invalid', function (e) {
    beginAttempt();
    var now = Date.now();
    if (now - invalidSentAt < 400) return;
    invalidSentAt = now;
    track('form_invalid', (e.target && e.target.name) || null);
  }, true);
  // visitor bails out to their mail client from the error state
  form.addEventListener('click', function (e) {
    if (e.target && e.target.closest && e.target.closest('.qf-mailto')) {
      if (window.gisTrackNow) window.gisTrackNow('form_fallback_click');
      else track('form_fallback_click');
    }
  }, true);

  // --- inline status line (built here; index.html stays structural) ---
  var status = document.createElement('div');
  status.className = 'qf-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.hidden = true;
  form.insertBefore(status, note || null);

  var REASON_LABELS = {
    full_time: { en: 'Full-time GIS role', fr: 'Poste SIG à temps plein' },
    freelance: { en: 'Freelance / contract project', fr: 'Mission freelance / contrat' },
    spatial_automation: { en: 'Spatial analysis, cartography or automation', fr: 'Analyse spatiale, cartographie ou automatisation' },
    other: { en: 'Other / not sure yet', fr: 'Autre / pas encore sûr' }
  };

  function lang() {
    var indicator = document.querySelector('#langToggle .lang-text');
    // lang-text shows the language you would switch TO; page shows the opposite
    return indicator && indicator.textContent.trim() === 'FR' ? 'en' : 'fr';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function show(kind, html) {
    status.className = 'qf-status ' + kind;
    status.innerHTML = html;
    status.hidden = false;
  }

  // pre-filled email — same composition as the old mailto: flow
  function mailtoFallback(name, email, reason, message) {
    var label = (REASON_LABELS[reason] || REASON_LABELS.other)[lang()];
    var subject = encodeURIComponent('Inquiry — ' + label + ' (' + name + ')');
    var body = encodeURIComponent(
      'Name: ' + name + '\n' +
      'Email: ' + email + '\n' +
      'Service: ' + label + '\n\n' +
      message + '\n'
    );
    return 'mailto:tlilixmed@gmail.com?subject=' + subject + '&body=' + body;
  }

  // --- Submit: POST to the Worker, inline feedback, mailto fallback ---
  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var data = new FormData(form);
    var name = (data.get('name') || '').toString().trim();
    var email = (data.get('email') || '').toString().trim();
    var reason = (data.get('type') || '').toString();
    var message = (data.get('message') || '').toString().trim();
    var honeypot = (data.get('company') || '').toString();
    var L = lang();

    if (btn) {
      btn.disabled = true;
      btn.dataset.label = btn.textContent;
      btn.textContent = L === 'fr' ? 'Envoi…' : 'Sending…';
    }

    fetch('/api/leads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: name,
        email: email,
        reason: reason,
        message: message,
        referrer: document.referrer || '',
        company: honeypot
      })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
        return j;
      });
    }).then(function () {
      track('form_submit');
      form.reset();
      show('ok', L === 'fr'
        ? '<strong>Message bien reçu — merci !</strong> Je réponds en général sous 24 heures.'
        : '<strong>Message received — thank you!</strong> I usually reply within 24 hours.');
    }).catch(function (err) {
      track('form_error', String(err && err.message || err).slice(0, 120));
      var fb = mailtoFallback(name, email, reason, message);
      show('err', (L === 'fr'
        ? '<strong>L’envoi a échoué.</strong> Utilisez plutôt ce lien e-mail pré-rempli :'
        : '<strong>Sending failed.</strong> Use this pre-filled e-mail link instead:')
        + ' <a class="qf-mailto" href="' + fb + '">tlilixmed@gmail.com</a>'
        + '<span class="qf-err-detail">' + esc(err.message) + '</span>');
    }).finally(function () {
      if (btn) {
        btn.disabled = false;
        btn.textContent = btn.dataset.label || (L === 'fr' ? 'Envoyer le message' : 'Send message');
        delete btn.dataset.label;
      }
    });
  });

  // --- Placeholder i18n (complements toggleLanguage in script.js) ---
  function syncPlaceholders() {
    var current = lang();
    form.querySelectorAll('[data-en-placeholder]').forEach(function (el) {
      var v = el.getAttribute('data-' + current + '-placeholder');
      if (v) el.placeholder = v;
    });
  }

  syncPlaceholders();
  var langToggle = document.getElementById('langToggle');
  if (langToggle) langToggle.addEventListener('click', function () {
    // run after toggleLanguage has swapped the indicator
    setTimeout(syncPlaceholders, 0);
  });
});
