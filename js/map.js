/* ============================================================
   INTERACTIVE MAP VIEWER — additive file (js/script.js untouched)
   ------------------------------------------------------------
   · Leaflet + CARTO light basemap, neumorphism-styled via CSS
   · Layers come from window.MAP_PROJECTS (js/map-projects.js)
     → each entry fetches one GeoJSON file (relative path,
       safe for GitHub Pages project URLs & custom domains)
   · UI: category filters, project list, legend, reset button
   · Bilingual: syncs with the existing #langToggle mechanism
     (same detection pattern as js/contact-form.js)
   · Defensive: CDN offline / fetch 404 → graceful fallback
   ============================================================ */
(function () {
  'use strict';

  /* ---------- tiny i18n for dynamically built strings ---------- */
  var I18N = {
    en: {
      all: 'All',
      feature: 'feature',
      features: 'features',
      unavailable: 'data unavailable',
      failTitle: 'Map layers unavailable',
      failMsg: 'The GeoJSON layers could not be loaded. If you opened this page as a local file (double-click), serve it over HTTP — see MAP-GUIDE.md.'
    },
    fr: {
      all: 'Tout',
      feature: 'entité',
      features: 'entités',
      unavailable: 'données indisponibles',
      failTitle: 'Couches indisponibles',
      failMsg: 'Impossible de charger les couches GeoJSON. Si cette page est ouverte en fichier local, servez-la en HTTP — voir MAP-GUIDE.md.'
    }
  };

  var PALETTE = ['#1654F0', '#19C9EB', '#8B7CF6', '#14B8A6', '#F0B429', '#F26D6D'];
  var DEFAULT_VIEW = [34.4, 9.6];   // Tunisia overview
  var FALLBACK_ZOOM = 7;
  var MAX_FIT_ZOOM = 14;

  var state = {
    lang: 'en',
    filter: 'all',
    selectedId: null,
    projects: [],
    loaded: false,
    allFailed: false
  };

  /* ---------- helpers ---------- */
  function t(key) { return (I18N[state.lang] && I18N[state.lang][key]) || I18N.en[key]; }

  // #langToggle shows the language you would switch TO — page shows the opposite
  function detectLang() {
    var el = document.querySelector('#langToggle .lang-text');
    return (el && el.textContent.trim() === 'EN') ? 'fr' : 'en';
  }

  function cfgText(cfg, field) {
    var v = cfg[field];
    if (!v) return '';
    return v[state.lang] || v.en || '';
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /* ---------- init ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    var mount = document.getElementById('imapMap');
    if (!mount) return;                                  // block removed → do nothing
    state.lang = detectLang();

    var L = window.L;
    if (!L || typeof window.MAP_PROJECTS !== 'object' || !Array.isArray(window.MAP_PROJECTS)) {
      showFallback(mount, 'Leaflet');                     // CDN blocked / offline
      return;
    }

    var map = L.map(mount, {
      scrollWheelZoom: false,        // don't hijack page scroll
      zoomControl: true,
      attributionControl: true,
      minZoom: 3,
      maxZoom: 19,
      worldCopyJump: true
    }).setView(DEFAULT_VIEW, FALLBACK_ZOOM);

    // OpenStreetMap standard tiles: free, no API key, GitHub-Pages safe.
    // (CARTO Positron now watermarks keyless requests — see MAP-GUIDE.md §7)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    }).addTo(map);

    // enable wheel-zoom only while the map has focus / pointer
    map.on('focus', function () { map.scrollWheelZoom.enable(); });
    map.on('blur', function () { map.scrollWheelZoom.disable(); });
    mount.addEventListener('mouseleave', function () { map.scrollWheelZoom.disable(); });

    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);

    // layout settle (fonts/images can shift the container after init)
    setTimeout(function () { map.invalidateSize(); }, 350);
    window.addEventListener('load', function () { map.invalidateSize(); });

    buildProjects(map);
    wireStaticUI(map);

    document.getElementById('langToggle').addEventListener('click', function () {
      // run after toggleLanguage() has flipped the indicator
      setTimeout(function () { state.lang = detectLang(); rerenderUI(); }, 0);
    });
  });

  /* ---------- project layers ---------- */
  function buildProjects(map) {
    var categoryColor = {};
    var nextColor = 0;

    window.MAP_PROJECTS.forEach(function (cfg) {
      if (cfg.visible === false) return;
      if (!categoryColor[cfg.category]) {
        categoryColor[cfg.category] = cfg.color || PALETTE[nextColor % PALETTE.length];
        nextColor++;
      }
      var project = {
        cfg: cfg,
        color: categoryColor[cfg.category],
        layer: null,
        bounds: null,
        count: 0,
        failed: false
      };
      state.projects.push(project);

      fetch(cfg.file)
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status + ' — ' + cfg.file);
          return res.json();
        })
        .then(function (geojson) {
          var layer = L.geoJSON(geojson, {
            style: function () {
              return { color: project.color, weight: 2, opacity: 0.9, fillColor: project.color, fillOpacity: 0.16 };
            },
            pointToLayer: function (feat, latlng) {
              return L.circleMarker(latlng, {
                radius: 7, color: project.color, weight: 2,
                fillColor: project.color, fillOpacity: 0.65
              });
            },
            onEachFeature: function (feat, lyr) {
              lyr.bindPopup(function () { return buildPopup(project, feat); });
              lyr.on('mouseover', function () {
                lyr.setStyle({ weight: 4, fillOpacity: 0.3 });
                if (lyr.bringToFront) lyr.bringToFront();
              });
              lyr.on('mouseout', function () { project.layer.resetStyle(lyr); });
            }
          });
          project.layer = layer;
          try { project.bounds = layer.getBounds(); } catch (e) { project.bounds = null; }
          project.count = layer.getLayers().length;
          if (state.filter === 'all' || state.filter === cfg.category) layer.addTo(map);
          rerenderUI();
        })
        .catch(function (err) {
          project.failed = true;
          console.warn('[portfolio map]', err.message);
          rerenderUI();
        });
    });

    // hide the loading veil once every request has settled
    var total = state.projects.length;
    var check = setInterval(function () {
      var settled = state.projects.filter(function (p) { return p.layer || p.failed; }).length;
      if (settled >= total) {
        clearInterval(check);
        finishLoading();
      }
    }, 120);
  }

  function finishLoading() {
    state.loaded = true;
    var veil = document.getElementById('imapLoading');
    if (veil) veil.classList.add('done');

    var mount = document.getElementById('imapMap');
    var map = mount && mount._leaflet_map;
    if (state.projects.length && state.projects.every(function (p) { return p.failed; })) {
      state.allFailed = true;
      showFallback(mount, 'fetch');
    } else {
      fitVisible(map);
    }
    rerenderUI();
  }

  function showFallback(mount, kind) {
    var frame = mount && mount.parentElement;
    if (!frame) return;
    var box = el('div', 'imap-error');
    var title = el('strong', null, t('failTitle'));
    var msg = el('p', null, t('failMsg'));
    box.appendChild(title);
    box.appendChild(msg);
    frame.appendChild(box);
    var veil = document.getElementById('imapLoading');
    if (veil) veil.classList.add('done');
    if (kind === 'Leaflet') console.warn('[portfolio map] Leaflet failed to load from CDN.');
  }

  /* ---------- popup ---------- */
  function buildPopup(project, feat) {
    var cfg = project.cfg;
    var props = (feat && feat.properties) || {};

    var box = el('div', 'imap-popup');
    box.style.borderLeft = '3px solid ' + project.color;

    var meta = el('span', 'imap-popup-cat', cfg.category + ' · ' + (cfg.year || ''));
    meta.style.color = project.color;
    box.appendChild(meta);

    box.appendChild(el('strong', 'imap-popup-title', cfgText(cfg, 'title')));

    var name = props['name_' + state.lang] || props.name;
    if (name) box.appendChild(el('span', 'imap-popup-name', String(name)));

    var note = props['note_' + state.lang] || props.note;
    if (note) box.appendChild(el('span', 'imap-popup-note', String(note)));

    var desc = cfgText(cfg, 'desc');
    if (desc) box.appendChild(el('p', 'imap-popup-desc', desc));

    return box;
  }

  /* ---------- static UI (reset button) ---------- */
  function wireStaticUI(map) {
    document.getElementById('imapMap')._leaflet_map = map;

    var reset = document.getElementById('imapReset');
    if (reset) {
      reset.addEventListener('click', function () { fitVisible(map); });
    }
  }

  /* ---------- viewport ---------- */
  function fitVisible(map) {
    if (!map) {
      var mount = document.getElementById('imapMap');
      map = mount && mount._leaflet_map;
    }
    if (!map) return;
    var b = null;
    state.projects.forEach(function (p) {
      if (!p.bounds || p.failed) return;
      if (state.filter !== 'all' && p.cfg.category !== state.filter) return;
      // clone on first hit — extend() mutates, and we must never
      // grow a project's own stored bounds (it would corrupt
      // later "fly to this project" calls)
      b = b ? b.extend(p.bounds)
            : window.L.latLngBounds(p.bounds.getSouthWest(), p.bounds.getNorthEast());
    });
    if (b) {
      map.fitBounds(b, { padding: [30, 30], maxZoom: MAX_FIT_ZOOM });
    } else {
      map.setView(DEFAULT_VIEW, FALLBACK_ZOOM);
    }
  }

  /* ---------- dynamic UI ---------- */
  function categories() {
    var seen = [];
    state.projects.forEach(function (p) {
      if (p.cfg.category && seen.indexOf(p.cfg.category) === -1) seen.push(p.cfg.category);
    });
    return seen;
  }

  function rerenderUI() {
    renderFilters();
    renderList();
    renderLegend();
    var reset = document.getElementById('imapReset');
    if (reset) {
      var title = state.lang === 'fr'
        ? (reset.getAttribute('data-fr-title') || 'Afficher tous les projets')
        : (reset.getAttribute('data-en-title') || 'Show all projects');
      reset.title = title;
    }
  }

  function renderFilters() {
    var wrap = document.getElementById('imapFilters');
    if (!wrap) return;
    wrap.innerHTML = '';

    var cats = categories();
    var chips = [{ key: 'all', label: t('all'), count: state.projects.length }]
      .concat(cats.map(function (c) {
        return {
          key: c,
          label: c,
          count: state.projects.filter(function (p) { return p.cfg.category === c; }).length
        };
      }));

    chips.forEach(function (chip) {
      var btn = el('button', 'imap-chip' + (state.filter === chip.key ? ' active' : ''));
      btn.type = 'button';
      btn.appendChild(el('span', 'imap-chip-label', chip.label));
      btn.appendChild(el('span', 'imap-chip-count', String(chip.count)));
      btn.addEventListener('click', function () {
        state.filter = chip.key;
        state.selectedId = null;
        applyFilter();
        rerenderUI();
      });
      wrap.appendChild(btn);
    });
  }

  function applyFilter() {
    var map = document.getElementById('imapMap')._leaflet_map;
    state.projects.forEach(function (p) {
      if (!p.layer) return;
      var visible = state.filter === 'all' || p.cfg.category === state.filter;
      if (visible) { if (!map.hasLayer(p.layer)) p.layer.addTo(map); }
      else if (map.hasLayer(p.layer)) map.removeLayer(p.layer);
    });
    fitVisible(map);
  }

  function renderList() {
    var list = document.getElementById('imapList');
    if (!list) return;
    list.innerHTML = '';

    state.projects.forEach(function (p) {
      var visible = state.filter === 'all' || p.cfg.category === state.filter;
      var card = el('button', 'imap-card' + (visible ? '' : ' hidden') +
        (state.selectedId === p.cfg.id ? ' active' : '') + (p.failed ? ' failed' : ''));
      card.type = 'button';
      card.style.setProperty('--imap-color', p.color);

      var head = el('span', 'imap-card-head');
      head.appendChild(el('span', 'imap-dot'));
      head.appendChild(el('strong', 'imap-card-title', cfgText(p.cfg, 'title')));
      card.appendChild(head);

      var metaBits = [p.cfg.category, p.cfg.year];
      if (p.failed) metaBits.push(t('unavailable'));
      else if (p.count) metaBits.push(p.count + ' ' + (p.count === 1 ? t('feature') : t('features')));
      card.appendChild(el('span', 'imap-card-meta', metaBits.filter(Boolean).join(' · ')));

      card.appendChild(el('span', 'imap-card-desc', cfgText(p.cfg, 'desc')));

      card.addEventListener('click', function () {
        selectProject(p);
      });
      list.appendChild(card);
    });
  }

  function selectProject(p) {
    state.selectedId = p.cfg.id;
    rerenderUI();

    var map = document.getElementById('imapMap')._leaflet_map;
    if (!map || !p.layer) return;

    // un-highlight previous selection
    state.projects.forEach(function (other) {
      if (other.layer && other !== p) other.layer.resetStyle();
    });
    p.layer.setStyle({ weight: 4, fillOpacity: 0.28, opacity: 1 });

    if (p.bounds) {
      map.flyToBounds(p.bounds, { padding: [36, 36], maxZoom: MAX_FIT_ZOOM, duration: 0.8 });
    }
  }

  function renderLegend() {
    var legend = document.getElementById('imapLegend');
    if (!legend) return;
    legend.innerHTML = '';
    categories().forEach(function (cat) {
      var project = state.projects.filter(function (p) { return p.cfg.category === cat; })[0];
      if (!project) return;
      var row = el('span', 'imap-legend-row');
      var dot = el('span', 'imap-dot');
      dot.style.background = project.color;
      row.appendChild(dot);
      row.appendChild(document.createTextNode(cat));
      legend.appendChild(row);
    });
  }
})();
