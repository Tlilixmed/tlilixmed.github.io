/* ============================================================
   GIS PORTFOLIO — editorial redesign (js/script.js)
   Behaviors:
   - language toggle (data-en/data-fr) + CV link language sync
   - mobile navigation
   - sticky header shadow
   - scroll reveal (with no-JS / failsafe guarantees)
   - case-study panels (cards + experience links + hash deep links)
   - shared lightbox (map gallery + case-study evidence)
   Contracts kept for other scripts:
   - #langToggle .lang-text / .lang-flag   (map.js, contact-form.js)
   - #quoteForm data-en-placeholder        (contact-form.js)
   - window.openMapModal / closeMapModal   (inline onclick in HTML)
   ============================================================ */

/* ---------- language toggle ---------- */
let currentLanguage = 'en';

function syncCVLinks() {
  var href = currentLanguage === 'fr'
    ? 'assets/Tlili_Mohamed_CV_Fr.pdf'
    : 'assets/Tlili_Mohamed_CV_En.pdf';
  document.querySelectorAll('.cv-link').forEach(function (a) { a.setAttribute('href', href); });
}

function toggleLanguage() {
  currentLanguage = currentLanguage === 'en' ? 'fr' : 'en';
  document.querySelectorAll('[data-en][data-fr]').forEach(function (el) {
    var text = el.getAttribute('data-' + currentLanguage);
    if (text) el.textContent = text;
  });
  // title attributes (map reset button)
  document.querySelectorAll('[data-en-title][data-fr-title]').forEach(function (el) {
    var t = el.getAttribute('data-' + currentLanguage + '-title');
    if (t) el.setAttribute('title', t);
  });
  document.documentElement.setAttribute('lang', currentLanguage);
  syncCVLinks();

  var langToggle = document.getElementById('langToggle');
  if (!langToggle) return;
  var langFlag = langToggle.querySelector('.lang-flag');
  var langText = langToggle.querySelector('.lang-text');
  if (currentLanguage === 'fr') { langFlag.textContent = '🇺🇸'; langText.textContent = 'EN'; }
  else { langFlag.textContent = '🇫🇷'; langText.textContent = 'FR'; }
}

/* ---------- smooth scroll (anchor links) ---------- */
document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
  anchor.addEventListener('click', function (e) {
    var id = this.getAttribute('href');
    if (id === '#') return;
    var target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(null, '', id);
  });
});

/* ---------- sticky header shadow ---------- */
var headerEl = null, headerTicking = false;
window.addEventListener('scroll', function () {
  if (headerTicking) return;
  headerTicking = true;
  requestAnimationFrame(function () {
    headerTicking = false;
    if (!headerEl) headerEl = document.querySelector('.site-header');
    if (!headerEl) return;
    if (window.scrollY > 8) headerEl.classList.add('scrolled');
    else headerEl.classList.remove('scrolled');
  });
}, { passive: true });

/* ---------- mobile navigation ---------- */
document.addEventListener('DOMContentLoaded', function () {
  var navToggle = document.getElementById('navToggle');
  var navLinks = document.querySelector('.nav-links');
  var navOverlay = document.getElementById('navOverlay');
  if (navToggle && navLinks && navOverlay) {
    function toggleMenu() {
      var open = navLinks.classList.toggle('active');
      navToggle.classList.toggle('active', open);
      navOverlay.classList.toggle('active', open);
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.classList.toggle('menu-open', open);
    }
    function closeMenu() {
      navLinks.classList.remove('active');
      navToggle.classList.remove('active');
      navOverlay.classList.remove('active');
      navToggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('menu-open');
    }
    navToggle.addEventListener('click', toggleMenu);
    navOverlay.addEventListener('click', closeMenu);
    navLinks.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', closeMenu);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && navLinks.classList.contains('active')) closeMenu();
    });
  }
});

/* ---------- scroll reveal (failsafe: content must NEVER stay hidden) ---------- */
var observerOptions = { threshold: 0.05, rootMargin: '0px 0px -30px 0px' };
var observer = new IntersectionObserver(function (entries) {
  entries.forEach(function (entry) {
    if (entry.isIntersecting) entry.target.classList.add('animate-in');
  });
}, observerOptions);

function forceRevealAll() {
  document.querySelectorAll(
    'section, .section-head, .work-card, .cap-card, .xp-item, .map-item, .metric'
  ).forEach(function (el) { el.classList.add('animate-in'); });
}
window.addEventListener('load', function () { setTimeout(forceRevealAll, 2500); });
setTimeout(forceRevealAll, 4000); // in case the window 'load' event stalls

document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll(
    'section, .section-head, .work-card, .cap-card, .xp-item, .map-item, .metric'
  ).forEach(function (el) { observer.observe(el); });
});

/* ---------- case-study panels ---------- */
function openCase(id, scroll) {
  var panel = document.getElementById(id);
  if (!panel) return;
  if (panel.tagName !== 'DETAILS') return;
  panel.open = true;
  if (scroll !== false) {
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.case-open').forEach(function (btn) {
    btn.addEventListener('click', function () {
      openCase(btn.getAttribute('data-target'), true);
    });
  });
  // deep links: /#case-lidar opens + scrolls to the panel
  function openFromHash() {
    var hash = window.location.hash;
    if (hash && hash.length > 1) {
      var el = document.getElementById(hash.slice(1));
      if (el && el.classList.contains('case')) openCase(el.id, true);
    }
  }
  openFromHash();
  window.addEventListener('hashchange', openFromHash);
});

/* ---------- lightbox (map gallery + case evidence) ---------- */
function openMapModal(imgSrc, title, desc) {
  var modal = document.getElementById('mapModal');
  var modalImg = document.getElementById('modalMapImg');
  var modalTitle = document.getElementById('modalMapTitle');
  var modalDesc = document.getElementById('modalMapDesc');
  if (!modal) return;
  modalImg.src = imgSrc;
  modalImg.alt = title || 'Full-size view';
  modalTitle.textContent = title || '';
  modalDesc.textContent = desc || '';
  modal.style.display = 'flex';
  setTimeout(function () { modal.classList.add('show'); }, 10);
  document.body.style.overflow = 'hidden';
  var closeBtn = modal.querySelector('.gallery-modal-close');
  if (closeBtn) closeBtn.focus();
}

function closeMapModal() {
  var modal = document.getElementById('mapModal');
  if (!modal) return;
  modal.classList.remove('show');
  setTimeout(function () { modal.style.display = 'none'; }, 200);
  document.body.style.overflow = 'auto';
}

document.addEventListener('keydown', function (e) {
  var modal = document.getElementById('mapModal');
  if (modal && e.key === 'Escape' && modal.classList.contains('show')) closeMapModal();
});

/* ---------- keyboard access for clickable figures / map cards ----------
   The inline onclick handles the mouse; here we make the same targets
   focusable and operable with Enter / Space, and expose a spoken label. */
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.case-media figure[onclick], .map-item[onclick]').forEach(function (el) {
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
    var img = el.querySelector('img');
    var label = (img && img.alt) || (el.textContent || '').trim().slice(0, 120);
    if (label && !el.getAttribute('aria-label')) el.setAttribute('aria-label', label);
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
    });
  });
});
