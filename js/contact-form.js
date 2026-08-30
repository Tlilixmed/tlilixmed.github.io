/* ============================================================
   QUOTE FORM — additive helper (js/script.js untouched)
   - Composes a pre-filled email (mailto:) on submit: no backend,
     nothing stored, works on any static host.
   - Keeps bilingual placeholders in sync with the site language
     by reading the existing #langToggle indicator state.
   ============================================================ */
document.addEventListener('DOMContentLoaded', function () {
  var form = document.getElementById('quoteForm');
  if (!form) return;

  // --- Submit: build mailto from form values ---
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var data = new FormData(form);
    var name = (data.get('name') || '').toString().trim();
    var email = (data.get('email') || '').toString().trim();
    var type = (data.get('type') || 'GIS services').toString();
    var message = (data.get('message') || '').toString().trim();

    var subject = encodeURIComponent('Quote request — ' + type + ' (' + name + ')');
    var body = encodeURIComponent(
      'Name: ' + name + '\n' +
      'Email: ' + email + '\n' +
      'Service: ' + type + '\n\n' +
      message + '\n'
    );

    window.location.href =
      'mailto:tlilixmed@gmail.com?subject=' + subject + '&body=' + body;
  });

  // --- Placeholder i18n (complements toggleLanguage in script.js) ---
  function syncPlaceholders() {
    var indicator = document.querySelector('#langToggle .lang-text');
    if (!indicator) return;
    // lang-text shows the language you would switch TO; page shows the opposite
    var current = indicator.textContent.trim() === 'FR' ? 'en' : 'fr';
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
