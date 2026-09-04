/* ============================================================
   INTERACTIVE MAP VIEWER — v2 (additive file, js/script.js untouched)
   ------------------------------------------------------------
   WHAT'S NEW IN v2
   · GROUPED PROJECTS — a project (e.g. "Tungsten Open Ground")
     bundles SEVERAL GeoJSON sub-layers that render under ONE
     item on the map, in the legend and in the project list.
     Expandable legend rows give per-layer visibility toggles.
   · BASE MAP SWITCHER — OSM, Esri Imagery, Imagery + labels,
     Esri Topographic, OpenTopoMap, Carto Dark, or none.
     Free/keyless, switchable at run time, choice remembered.
   · ATTRIBUTE VIEWER — clicking a feature shows a compact
     attribute table in the popup; "All attributes" opens a
     QGIS-style identify side panel with the full table.
   · Everything else from v1 kept: category filters, project
     list, legend, reset, bilingual EN/FR, graceful fallbacks.
   · Data model: window.MAP_PROJECTS (js/map-projects.js)

   PERFORMANCE NOTES (no visual/behaviour change)
   · The whole map stack (Leaflet CSS + JS + GeoJSON layers) now boots on
     demand, when the map block approaches the viewport — visitors who
     never scroll to #maps download none of it, and the page renders and
     becomes interactive sooner for everyone else.
   · UI rebuilds are coalesced to one per animation frame while the
     GeoJSON layers arrive; the loading-veil logic uses a simple settle
     counter instead of a polling interval.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- tiny i18n for dynamically built strings ---------- */
  var I18N = {
    en: {
      all: 'All',
      feature: 'feature',
      features: 'features',
      layer: 'layer',
      layers: 'layers',
      unavailable: 'data unavailable',
      failTitle: 'Map layers unavailable',
      failMsg: 'The GeoJSON layers could not be loaded. If you opened this page as a local file (double-click), serve it over HTTP — see MAP-GUIDE-v2.md.',
      basemap: 'Base map',
      bmNone: 'None',
      attributes: 'Attributes',
      allAttrs: 'All attributes',
      close: 'Close',
      zoomTo: 'Zoom to feature',
      geometry: 'Geometry',
      coords: 'Coordinates',
      source: 'Source file',
      noProps: 'No attributes on this feature.',
      yes: 'Yes',
      no: 'No',
      layerHidden: 'hidden'
    },
    fr: {
      all: 'Tout',
      feature: 'entité',
      features: 'entités',
      layer: 'couche',
      layers: 'couches',
      unavailable: 'données indisponibles',
      failTitle: 'Couches indisponibles',
      failMsg: "Impossible de charger les couches GeoJSON. Si cette page est ouverte en fichier local, servez-la en HTTP — voir MAP-GUIDE-v2.md.",
      basemap: 'Fond de carte',
      bmNone: 'Aucun',
      attributes: 'Attributs',
      allAttrs: 'Tous les attributs',
      close: 'Fermer',
      zoomTo: 'Zoom sur l’entité',
      geometry: 'Géométrie',
      coords: 'Coordonnées',
      source: 'Fichier source',
      noProps: 'Aucun attribut sur cette entité.',
      yes: 'Oui',
      no: 'Non',
      layerHidden: 'masquée'
    }
  };

  var PALETTE = ['#1654F0', '#19C9EB', '#8B7CF6', '#14B8A6', '#F0B429', '#F26D6D'];
  var DEFAULT_VIEW = [34.4, 9.6];   // Tunisia overview
  var FALLBACK_ZOOM = 7;
  var MAX_FIT_ZOOM = 14;
  var POPUP_MAX_ROWS = 7;
  var BM_STORAGE_KEY = 'imap-basemap-v2';

  /* Free, keyless, GitHub-Pages-safe base maps. `soft` layers get the
     theme's calming CSS filter; imagery/dark styles bypass it.        */
  var BASEMAPS = [
    {
      id: 'osm',
      label: { en: 'OpenStreetMap', fr: 'OpenStreetMap' },
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      maxNativeZoom: 19, soft: true, swatch: '#d7dee6'
    },
    {
      id: 'esri-sat',
      label: { en: 'Satellite (Esri)', fr: 'Satellite (Esri)' },
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics',
      maxNativeZoom: 19, soft: false, swatch: '#2c4a33'
    },
    {
      id: 'esri-hybrid',
      label: { en: 'Satellite + labels', fr: 'Satellite + toponymes' },
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ref: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics',
      maxNativeZoom: 19, soft: false, swatch: '#4a6b52'
    },
    {
      id: 'esri-topo',
      label: { en: 'Topographic (Esri)', fr: 'Topographique (Esri)' },
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri — Esri, DeLorme, NAVTEQ',
      maxNativeZoom: 19, soft: true, swatch: '#e9e4d2'
    },
    {
      id: 'opentopo',
      label: { en: 'Terrain (OpenTopoMap)', fr: 'Relief (OpenTopoMap)' },
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      subdomains: 'abc',
      attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>, SRTM | Style: &copy; <a href="https://www.opentopomap.org" target="_blank" rel="noopener">OpenTopoMap</a> (CC-BY-SA)',
      maxNativeZoom: 17, soft: true, swatch: '#e7e0c9'
    },
    {
      id: 'carto-dark',
      label: { en: 'Dark (Carto)', fr: 'Sombre (Carto)' },
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      subdomains: 'abcd',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
      maxNativeZoom: 19, soft: false, swatch: '#26282b'
    },
    {
      id: 'none',
      label: { en: 'None', fr: 'Aucun' },
      none: true, swatch: '#e9eff9'
    }
  ];

  var state = {
    lang: 'en',
    filter: 'all',
    selectedId: null,
    groups: [],
    loaded: false,
    allFailed: false,
    bmId: 'osm',
    bmLayers: [],
    expanded: {},
    panelCtx: null,
    highlight: null
  };

  /* ---------- helpers ---------- */
  function t(key) { return (I18N[state.lang] && I18N[state.lang][key]) || I18N.en[key]; }

  // #langToggle shows the language you would switch TO — page shows the opposite
  function detectLang() {
    var elx = document.querySelector('#langToggle .lang-text');
    return (elx && elx.textContent.trim() === 'EN') ? 'fr' : 'en';
  }

  function cfgText(cfg, field) {
    var v = cfg && cfg[field];
    if (!v) return '';
    if (typeof v === 'string') return v;
    return v[state.lang] || v.en || '';
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  /* ---------- color engine: shades of the group color ---------- */
  function hexToRgb(hex) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }

  function hslToHex(h, s, l) {
    function f(n) {
      var k = (n + h / 30) % 12;
      var a = s * Math.min(l, 1 - l);
      var v = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
      return Math.round(255 * v).toString(16).padStart(2, '0');
    }
    return '#' + f(0) + f(8) + f(4);
  }

  // N readable shades of one hue, from darker to lighter
  function shades(baseHex, n) {
    if (n <= 1) return [baseHex];
    var rgb = hexToRgb(baseHex);
    var hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    var out = [];
    for (var i = 0; i < n; i++) {
      var l = clamp(0.30 + (0.26 * i / (n - 1)), 0.26, 0.62);
      out.push(hslToHex(hsl[0], clamp(Math.max(hsl[1], 0.55), 0.35, 0.95), l));
    }
    return out;
  }

  /* ---------- attribute formatting ---------- */
  function fmtKey(k) {
    var s = String(k).replace(/_/g, ' ').trim();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function fmtVal(v) {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'boolean') return v ? t('yes') : t('no');
    if (typeof v === 'object') { try { return JSON.stringify(v); } catch (e) { return String(v); } }
    var s = String(v);
    return s.length > 90 ? s.slice(0, 87) + '…' : s;
  }

  // FULLY AUTOMATIC — attributes are read straight from the GeoJSON file
  // at click time: the identifying key (id / name / *_id …) is auto-detected
  // and shown first, every other attribute follows in the file's own order.
  // `fields` in the manifest stays OPTIONAL (pure ordering override only).
  function orderedProps(lcfg, props) {
    var out = [], seen = {};
    var all = props || {};
    var keys = Object.keys(all);
    if (lcfg && lcfg.fields && lcfg.fields.length) {          // optional manual order
      lcfg.fields.forEach(function (k) {
        if (Object.prototype.hasOwnProperty.call(all, k) && !seen[k]) { out.push([k, all[k]]); seen[k] = true; }
      });
    }
    var nameKey = autoNameKey(all);                            // auto: id/name first
    if (nameKey && !seen[nameKey]) { out.push([nameKey, all[nameKey]]); seen[nameKey] = true; }
    keys.forEach(function (k) { if (!seen[k]) { out.push([k, all[k]]); seen[k] = true; } });
    return out;
  }

  var NAME_KEYS = ['name', 'Name', 'NAME', 'title', 'hole_id', 'sample_id', 'zone_id',
    'license_id', 'route_id', 'block_id', 'parcel_id', 'id'];

  // AUTO-DETECTION — finds the best "feature name" key in ANY GeoJSON:
  // exact common keys first, then generic patterns (*_id, *_name, …)
  // discovered from the file itself. No manual configuration needed.
  function autoNameKey(props) {
    props = props || {};
    var keys = Object.keys(props);
    var i, k;
    for (i = 0; i < NAME_KEYS.length; i++) {
      var v0 = props[NAME_KEYS[i]];
      if (v0 !== undefined && v0 !== '' && v0 !== null) return NAME_KEYS[i];
    }
    var patterns = [/_id$/i, /(^|_)name$/i, /(^|_)title$/i, /(^|_)code$/i,
                    /(^|_)type$/i, /(^|_)label$/i, /(^|_)number$/i, /(^|_)ref$/i];
    for (var p = 0; p < patterns.length; p++) {
      for (i = 0; i < keys.length; i++) {
        k = keys[i];
        if (patterns[p].test(k) && props[k] !== '' && props[k] !== null &&
            typeof props[k] !== 'object') return k;
      }
    }
    return null;
  }

  function featureName(lcfg, props) {
    props = props || {};
    var k = autoNameKey(props);
    if (k) return String(props[k]);
    var keys = Object.keys(props);
    for (var j = 0; j < keys.length; j++) {
      var v = props[keys[j]];
      if (typeof v === 'string' && v.length <= 60) return v;
    }
    return '';
  }

  function attrTable(rows, skipKeys, limit) {
    var tbl = el('table', 'imap-attr-table');
    var tbody = el('tbody');
    var shown = 0;
    rows.forEach(function (pair) {
      if (limit && shown >= limit) return;
      if (skipKeys && skipKeys.indexOf(pair[0]) !== -1) return;
      var tr = el('tr');
      tr.appendChild(el('th', null, fmtKey(pair[0])));
      tr.appendChild(el('td', null, fmtVal(pair[1])));
      tbody.appendChild(tr);
      shown++;
    });
    if (!shown) return null;
    tbl.appendChild(tbody);
    return tbl;
  }

  /* ---------- init ----------
     PERFORMANCE: Leaflet CSS + JS are no longer hard-coded in <head>.
     The map boots on demand — when .imap-block nears the viewport — and
     loadLeaflet() injects the library, its stylesheet and a tile-host
     preconnect at that moment. Visitors who never scroll to the map never
     download it; everyone else gets the exact same map, with the same
     loading veil while the GeoJSON layers arrive. */
  var LEAFLET_CSS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.css';
  var LEAFLET_JS  = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.js';
  var leafletRequested = false;

  function loadLeaflet(done) {
    if (window.L) { done(); return; }                    // already present (defensive)
    if (leafletRequested) return;                        // inject only once
    leafletRequested = true;

    // warm up the default tile host while leaflet.min.js is downloading
    var pre = document.createElement('link');
    pre.rel = 'preconnect';
    pre.href = 'https://tile.openstreetmap.org';
    document.head.appendChild(pre);

    if (!document.querySelector('link[data-leaflet-css]')) {
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = LEAFLET_CSS;
      css.setAttribute('data-leaflet-css', '');
      document.head.appendChild(css);
    }

    var js = document.createElement('script');
    js.src = LEAFLET_JS;
    js.async = true;
    js.onload = function () { done(); };
    js.onerror = function () { done(new Error('Leaflet failed to load from CDN.')); };
    document.head.appendChild(js);
  }

  function bootMap(mount) {
    state.lang = detectLang();

    if (typeof window.MAP_PROJECTS !== 'object' || !Array.isArray(window.MAP_PROJECTS)) {
      showFallback(mount, 'Leaflet');                     // manifest missing / CDN blocked
      return;
    }

    loadLeaflet(function (err) {
      if (err || !window.L) {
        if (err && err.message) console.warn('[portfolio map]', err.message);
        showFallback(mount, 'Leaflet');
        return;
      }
      startMap(mount);
    });
  }

  function startMap(mount) {
    state.lang = detectLang();                           // re-read in case it changed while loading

    var L = window.L;

    var map = L.map(mount, {
      scrollWheelZoom: false,        // don't hijack page scroll
      zoomControl: true,
      attributionControl: true,
      minZoom: 3,
      maxZoom: 19,
      worldCopyJump: true
    }).setView(DEFAULT_VIEW, FALLBACK_ZOOM);

    // enable wheel-zoom only while the map has focus / pointer
    map.on('focus', function () { map.scrollWheelZoom.enable(); });
    map.on('blur', function () { map.scrollWheelZoom.disable(); });
    mount.addEventListener('mouseleave', function () { map.scrollWheelZoom.disable(); });

    L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);

    // layout settle (fonts/images can shift the container after init)
    setTimeout(function () { map.invalidateSize(); }, 350);
    window.addEventListener('load', function () { map.invalidateSize(); });

    mount._leaflet_map = map;

    buildBasemapUI(map);
    buildGroups(map);
    wireStaticUI(map);

    document.getElementById('langToggle').addEventListener('click', function () {
      // run after toggleLanguage() has flipped the indicator
      setTimeout(function () { state.lang = detectLang(); rerenderUI(); }, 0);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeAttrPanel();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var mount = document.getElementById('imapMap');
    if (!mount) return;                                  // block removed → do nothing

    if (!('IntersectionObserver' in window)) { bootMap(mount); return; }

    var trigger = (mount.closest && mount.closest('.imap-block')) || mount;
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          io.disconnect();
          bootMap(mount);
          return;
        }
      }
    }, { rootMargin: '600px 0px' });                     // start loading just before it is seen
    io.observe(trigger);
  });

  /* ---------- base map switcher ---------- */
  function storedBasemap() {
    try {
      var v = window.localStorage.getItem(BM_STORAGE_KEY);
      if (v && BASEMAPS.some(function (b) { return b.id === v; })) return v;
    } catch (e) { /* private mode */ }
    return 'osm';
  }

  function buildBasemapUI(map) {
    var frame = document.getElementById('imapMap').parentElement;  // .imap-frame
    if (!frame) return;

    state.bmId = storedBasemap();

    var btn = el('button', 'imap-bm-btn');
    btn.type = 'button';
    btn.setAttribute('aria-label', t('basemap'));
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M12 2 2 7l10 5 10-5-10-5z"></path><path d="m2 12 10 5 10-5"></path><path d="m2 17 10 5 10-5"></path></svg>';

    var panel = el('div', 'imap-bm-panel');
    panel.id = 'imapBmPanel';

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      panel.classList.toggle('open');
      btn.classList.toggle('active', panel.classList.contains('open'));
    });
    document.addEventListener('click', function (e) {
      if (!panel.contains(e.target) && e.target !== btn) {
        panel.classList.remove('open');
        btn.classList.remove('active');
      }
    });

    frame.appendChild(panel);
    frame.appendChild(btn);

    state._bm = { btn: btn, panel: panel };
    applyBasemap(map, state.bmId, false);
  }

  function applyBasemap(map, id, announce) {
    var L = window.L;
    var bm = BASEMAPS.filter(function (b) { return b.id === id; })[0] || BASEMAPS[0];
    state.bmId = bm.id;

    state.bmLayers.forEach(function (lyr) { if (map.hasLayer(lyr)) map.removeLayer(lyr); });
    state.bmLayers = [];

    if (!bm.none) {
      var main = L.tileLayer(bm.url, {
        maxZoom: 19,
        maxNativeZoom: bm.maxNativeZoom || 19,
        attribution: bm.attribution,
        subdomains: bm.subdomains || 'abc'
      }).addTo(map);
      state.bmLayers.push(main);
      if (bm.ref) {
        var ref = L.tileLayer(bm.ref, { maxZoom: 19, maxNativeZoom: 19, opacity: 0.95 });
        ref.addTo(map);
        state.bmLayers.push(ref);
      }
    }

    // calm street styles toward the azure theme; keep imagery/dark vivid
    map.getContainer().classList.toggle('imap-soft', !!bm.soft);

    try { window.localStorage.setItem(BM_STORAGE_KEY, bm.id); } catch (e) { /* private mode */ }
    if (announce !== false) renderBasemapPanel();
  }

  function renderBasemapPanel() {
    if (!state._bm) return;
    var panel = state._bm.panel;
    panel.innerHTML = '';

    panel.appendChild(el('span', 'imap-bm-title', t('basemap')));

    BASEMAPS.forEach(function (bm) {
      var item = el('button', 'imap-bm-item' + (state.bmId === bm.id ? ' active' : ''));
      item.type = 'button';

      var sw = el('span', 'imap-bm-swatch');
      sw.style.background = bm.swatch;
      item.appendChild(sw);

      var label = bm.none ? t('bmNone') : cfgText(bm, 'label');
      item.appendChild(el('span', 'imap-bm-name', label));

      if (state.bmId === bm.id) {
        var dot = el('span', 'imap-bm-dot');
        item.appendChild(dot);
      }

      item.addEventListener('click', function () {
        applyBasemap(document.getElementById('imapMap')._leaflet_map, bm.id, true);
        panel.classList.remove('open');
        state._bm.btn.classList.remove('active');
      });
      panel.appendChild(item);
    });
  }

  /* ---------- project groups (fetch + render) ---------- */
  var totalRequestsExpected = 0;
  var settledRequests = 0;

  // PERF: the loading veil hides as soon as every fetch has settled —
  // a simple counter replaces the old 120 ms polling interval.
  function settleRequest() {
    settledRequests++;
    if (settledRequests >= totalRequestsExpected) finishLoading();
  }

  function normalizeGroup(cfg) {
    var raw = (cfg.layers && cfg.layers.length) ? cfg.layers
      : (cfg.file ? [{ file: cfg.file, label: cfg.title, color: cfg.color, visible: true }] : []);
    return raw;
  }

  function buildGroups(map) {
    var categoryColor = {};
    var nextColor = 0;
    var totalRequests = 0;

    window.MAP_PROJECTS.forEach(function (cfg) {
      if (!categoryColor[cfg.category]) {
        categoryColor[cfg.category] = cfg.color || PALETTE[nextColor % PALETTE.length];
        nextColor++;
      }
      var rawLayers = normalizeGroup(cfg);
      var group = {
        cfg: cfg,
        color: cfg.color || categoryColor[cfg.category],
        visible: cfg.visible !== false,
        layers: [],
        bounds: null,
        count: 0,
        failed: 0,
        total: rawLayers.length
      };
      var pool = shades(group.color, rawLayers.length);

      rawLayers.forEach(function (lcfg, i) {
        group.layers.push({
          cfg: lcfg,
          color: lcfg.color || pool[i] || group.color,
          layer: null,
          bounds: null,
          count: 0,
          failed: false,
          visible: lcfg.visible !== false
        });
      });

      state.groups.push(group);
      state.expanded[group.cfg.id] = cfg.collapsed === false;

      group.layers.forEach(function (l) { fetchLayer(map, group, l); totalRequests++; });
    });

    // hide the loading veil once every request has settled (see settleRequest)
    totalRequestsExpected = totalRequests;
    settledRequests = 0;
    if (!totalRequests) finishLoading();
  }

  function layerStyle(l) {
    return {
      color: l.color,
      weight: (l.cfg.weight != null) ? l.cfg.weight : 2,
      opacity: 0.9,
      dashArray: l.cfg.dash || null,
      fillColor: l.color,
      fillOpacity: (l.cfg.fillOpacity != null) ? l.cfg.fillOpacity : 0.18
    };
  }

  function fetchLayer(map, group, l) {
    fetch(l.cfg.file)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status + ' — ' + l.cfg.file);
        return res.json();
      })
      .then(function (geojson) {
        var L = window.L;
        var layer = L.geoJSON(geojson, {
          style: function () { return layerStyle(l); },
          pointToLayer: function (feat, latlng) {
            return L.circleMarker(latlng, {
              radius: (l.cfg.radius != null) ? l.cfg.radius : 6.5,
              color: l.color, weight: 2,
              fillColor: l.color, fillOpacity: 0.7
            });
          },
          onEachFeature: function (feat, lyr) {
            lyr.bindPopup(function () { return buildPopup(group, l, feat); }, { maxWidth: 320 });
            lyr.on('mouseover', function () {
              lyr.setStyle({ weight: (layerStyle(l).weight || 2) + 2, fillOpacity: 0.3 });
              if (lyr.bringToFront) lyr.bringToFront();
            });
            lyr.on('mouseout', function () { if (l.layer) l.layer.resetStyle(lyr); });
          }
        });
        l.layer = layer;
        try { l.bounds = layer.getBounds(); } catch (e) { l.bounds = null; }
        l.count = layer.getLayers().length;
        group.count += l.count;

        if (groupEffective(group) && l.visible) layer.addTo(map);
        rerenderUI();
        settleRequest();
      })
      .catch(function (err) {
        l.failed = true;
        group.failed++;
        console.warn('[portfolio map]', err.message);
        rerenderUI();
        settleRequest();
      });
  }

  function finishLoading() {
    state.loaded = true;
    var veil = document.getElementById('imapLoading');
    if (veil) veil.classList.add('done');

    var mount = document.getElementById('imapMap');
    var map = mount && mount._leaflet_map;
    var anyOk = state.groups.some(function (g) {
      return g.layers.some(function (l) { return !l.failed; });
    });
    if (state.groups.length && !anyOk) {
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
    box.appendChild(el('strong', null, t('failTitle')));
    box.appendChild(el('p', null, t('failMsg')));
    frame.appendChild(box);
    var veil = document.getElementById('imapLoading');
    if (veil) veil.classList.add('done');
    if (kind === 'Leaflet') console.warn('[portfolio map] Leaflet failed to load from CDN.');
  }

  /* ---------- popups ---------- */
  function buildPopup(group, l, feat) {
    var cfg = group.cfg;
    var props = (feat && feat.properties) || {};

    var box = el('div', 'imap-popup');
    box.style.borderLeft = '3px solid ' + l.color;

    var meta = el('span', 'imap-popup-cat', cfg.category + ' · ' + (cfg.year || ''));
    meta.style.color = group.color;
    box.appendChild(meta);

    box.appendChild(el('strong', 'imap-popup-title', cfgText(cfg, 'title')));

    box.appendChild(el('span', 'imap-popup-layer', cfgText(l.cfg, 'label') || cfgText(cfg, 'title')));

    var nameKey = featureNameKey(l.cfg, props);
    var name = featureName(l.cfg, props);
    if (name) box.appendChild(el('span', 'imap-popup-name', name));

    var rows = orderedProps(l.cfg, props);
    var tbl = attrTable(rows, nameKey ? [nameKey] : null, POPUP_MAX_ROWS);
    if (tbl) box.appendChild(tbl);

    if (rows.length > (tbl ? POPUP_MAX_ROWS : 0) || rows.length === 0) {
      if (rows.length === 0) box.appendChild(el('span', 'imap-popup-noprops', t('noProps')));
    }
    if (rows.length) {
      var more = el('button', 'imap-popup-more', t('allAttrs') + ' →');
      more.type = 'button';
      more.addEventListener('click', function () { openAttrPanel(group, l, feat); });
      box.appendChild(more);
    }

    return box;
  }

  function featureNameKey(lcfg, props) {
    props = props || {};
    if (lcfg && lcfg.fields && lcfg.fields.length && props[lcfg.fields[0]] !== undefined) return lcfg.fields[0];
    return autoNameKey(props);
  }

  /* ---------- QGIS-style attribute panel ---------- */
  function openAttrPanel(group, l, feat) {
    var map = document.getElementById('imapMap')._leaflet_map;
    if (!map) return;

    setHighlight(group, l, feat);

    var geom = feat && feat.geometry ? feat.geometry : null;
    var props = (feat && feat.properties) || {};
    var rows = orderedProps(l.cfg, props);

    var panel = document.getElementById('imapAttr');
    if (!panel) return;
    panel.innerHTML = '';
    panel.hidden = false;

    var head = el('div', 'imap-attr-head');
    var htxt = el('div', 'imap-attr-headtxt');
    var kick = el('span', 'imap-attr-kicker', cfgText(group.cfg, 'category') + ' · ' + (group.cfg.year || ''));
    kick.style.color = group.color;
    htxt.appendChild(kick);
    var fname = featureName(l.cfg, props);
    htxt.appendChild(el('strong', 'imap-attr-title', fname || cfgText(l.cfg, 'label') || t('attributes')));
    htxt.appendChild(el('span', 'imap-attr-layer',
      (cfgText(l.cfg, 'label') || '—') + ' · ' + cfgText(group.cfg, 'title')));
    head.appendChild(htxt);

    var close = el('button', 'imap-attr-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', t('close'));
    close.addEventListener('click', closeAttrPanel);
    head.appendChild(close);
    panel.appendChild(head);

    var actions = el('div', 'imap-attr-actions');
    if (map && l.layer) {
      var zoom = el('button', 'imap-attr-zoom', '⌖ ' + t('zoomTo'));
      zoom.type = 'button';
      zoom.addEventListener('click', function () { zoomToFeature(map, l, feat); });
      actions.appendChild(zoom);
    }
    panel.appendChild(actions);

    var scroll = el('div', 'imap-attr-body');
    if (rows.length) {
      var tbl = attrTable(rows, null, 0);
      if (tbl) scroll.appendChild(tbl);
    } else {
      scroll.appendChild(el('p', 'imap-attr-empty', t('noProps')));
    }

    if (geom) {
      var dl = el('div', 'imap-attr-geom');
      dl.appendChild(el('span', null, t('geometry') + ': ' + String(geom.type || '—')));
      var c = firstCoord(geom);
      if (c) dl.appendChild(el('span', null, t('coords') + ': ' + c[1].toFixed(5) + ', ' + c[0].toFixed(5)));
      scroll.appendChild(dl);
    }
    scroll.appendChild(el('div', 'imap-attr-file', t('source') + ': ' + l.cfg.file));
    panel.appendChild(scroll);

    state.panelCtx = { group: group, layer: l, feat: feat };
  }

  function closeAttrPanel() {
    var panel = document.getElementById('imapAttr');
    if (panel) { panel.hidden = true; panel.innerHTML = ''; }
    clearHighlight();
    state.panelCtx = null;
  }

  function setHighlight(group, l, feat) {
    clearHighlight();
    if (!l || !l.layer) return;
    l.layer.setStyle({ weight: (layerStyle(l).weight || 2) + 3, opacity: 1, fillOpacity: 0.32 });
    state.highlight = l;
  }

  function clearHighlight() {
    if (state.highlight && state.highlight.layer) {
      try { state.highlight.layer.resetStyle(); } catch (e) { /* not on map */ }
    }
    state.highlight = null;
  }

  function zoomToFeature(map, l, feat) {
    if (!feat || !feat.geometry) return;
    var latlng = null;
    if (feat.geometry.type === 'Point') {
      latlng = [feat.geometry.coordinates[1], feat.geometry.coordinates[0]];
    } else if (l.layer) {
      l.layer.eachLayer(function (lyr) {
        if (!latlng && lyr.feature === feat && lyr.getBounds) {
          var b = lyr.getBounds();
          latlng = [[b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]];
        }
      });
    }
    if (!latlng) return;
    if (latlng.length === 2 && typeof latlng[0] === 'number') {
      map.flyTo(latlng, Math.max(map.getZoom(), 15), { duration: 0.7 });
    } else {
      map.flyToBounds(latlng, { padding: [40, 40], maxZoom: MAX_FIT_ZOOM, duration: 0.7 });
    }
  }

  function firstCoord(geom) {
    function dig(g) {
      if (g.type === 'Point') return g.coordinates;
      if (g.type === 'MultiPoint' || g.type === 'LineString') return g.coordinates[0];
      if (g.type === 'MultiLineString' || g.type === 'Polygon') return g.coordinates[0][0];
      if (g.type === 'MultiPolygon') return g.coordinates[0][0][0];
      return null;
    }
    var c = geom.coordinates;
    if (geom.type === 'GeometryCollection') return null;
    return dig(geom) || null;
  }

  /* ---------- static UI (reset button) ---------- */
  function wireStaticUI(map) {
    var reset = document.getElementById('imapReset');
    if (reset) {
      reset.addEventListener('click', function () { fitVisible(map); });
    }
  }

  /* ---------- visibility engine ---------- */
  function groupFilterVisible(g) {
    return state.filter === 'all' || g.cfg.category === state.filter;
  }

  function groupEffective(group) {
    return group.visible && groupFilterVisible(group);
  }

  function syncGroupOnMap(map, group) {
    var eff = groupEffective(group);
    group.layers.forEach(function (l) {
      if (!l.layer) return;
      var shouldShow = eff && l.visible && !l.failed;
      if (shouldShow && !map.hasLayer(l.layer)) l.layer.addTo(map);
      else if (!shouldShow && map.hasLayer(l.layer)) map.removeLayer(l.layer);
    });
  }

  function toggleGroup(group) {
    group.visible = !group.visible;
    var map = document.getElementById('imapMap')._leaflet_map;
    if (map) syncGroupOnMap(map, group);
    rerenderUI();
  }

  function toggleLayer(group, l) {
    l.visible = !l.visible;
    if (l.visible && !group.visible) group.visible = true;  // pulling a layer in revives the group
    var map = document.getElementById('imapMap')._leaflet_map;
    if (map) syncGroupOnMap(map, group);
    rerenderUI();
  }

  function applyFilter() {
    var map = document.getElementById('imapMap')._leaflet_map;
    if (map) state.groups.forEach(function (g) { syncGroupOnMap(map, g); });
    fitVisible(map);
  }

  /* ---------- viewport ---------- */
  function cloneBounds(b) {
    return window.L.latLngBounds(b.getSouthWest(), b.getNorthEast());
  }

  function groupBounds(g) {
    var b = null;
    g.layers.forEach(function (l) {
      if (!l.bounds || l.failed) return;
      b = b ? b.extend(cloneBounds(l.bounds)) : cloneBounds(l.bounds);
    });
    return b;
  }

  function fitVisible(map) {
    if (!map) {
      var mount = document.getElementById('imapMap');
      map = mount && mount._leaflet_map;
    }
    if (!map) return;
    var b = null;
    state.groups.forEach(function (g) {
      if (!groupEffective(g)) return;
      var shown = false;
      g.layers.forEach(function (l) {
        if (!l.bounds || l.failed || !l.visible) return;
        b = b ? b.extend(cloneBounds(l.bounds)) : cloneBounds(l.bounds);
        shown = true;
      });
      if (!shown) {
        var gb = groupBounds(g);
        if (gb) b = b ? b.extend(gb) : gb;
      }
    });
    if (b) {
      map.fitBounds(b, { padding: [30, 30], maxZoom: MAX_FIT_ZOOM });
    } else {
      map.setView(DEFAULT_VIEW, FALLBACK_ZOOM);
    }
  }

  function selectGroup(g) {
    state.selectedId = g.cfg.id;
    rerenderUI();

    var map = document.getElementById('imapMap')._leaflet_map;
    if (!map) return;

    state.groups.forEach(function (other) {
      other.layers.forEach(function (l) {
        if (l.layer) try { l.layer.resetStyle(); } catch (e) { /* not on map */ }
      });
    });
    g.layers.forEach(function (l) {
      if (l.layer) l.layer.setStyle({ weight: (layerStyle(l).weight || 2) + 2, opacity: 1, fillOpacity: 0.3 });
    });

    var b = groupBounds(g);
    if (b) map.flyToBounds(b, { padding: [36, 36], maxZoom: MAX_FIT_ZOOM, duration: 0.8 });
  }

  /* ---------- dynamic UI ---------- */
  function categories() {
    var seen = [];
    state.groups.forEach(function (g) {
      if (g.cfg.category && seen.indexOf(g.cfg.category) === -1) seen.push(g.cfg.category);
    });
    return seen;
  }

  // PERF: coalesce bursts of rerenders (one per animation frame) while the
  // GeoJSON layers arrive — the end state on screen is identical.
  var rerenderQueued = false;

  function rerenderUI() {
    if (rerenderQueued) return;
    rerenderQueued = true;
    requestAnimationFrame(function () {
      rerenderQueued = false;
      renderFilters();
      renderList();
      renderLegend();
      renderBasemapPanel();

      if (state.panelCtx) {         // keep the panel content in sync with language
        openAttrPanel(state.panelCtx.group, state.panelCtx.layer, state.panelCtx.feat);
      }

      var reset = document.getElementById('imapReset');
      if (reset) {
        reset.title = state.lang === 'fr'
          ? (reset.getAttribute('data-fr-title') || 'Afficher tous les projets')
          : (reset.getAttribute('data-en-title') || 'Show all projects');
      }
    });
  }

  function renderFilters() {
    var wrap = document.getElementById('imapFilters');
    if (!wrap) return;
    wrap.innerHTML = '';

    var cats = categories();
    var chips = [{ key: 'all', label: t('all'), count: state.groups.length }]
      .concat(cats.map(function (c) {
        return {
          key: c,
          label: c,
          count: state.groups.filter(function (g) { return g.cfg.category === c; }).length
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

  function renderList() {
    var list = document.getElementById('imapList');
    if (!list) return;
    list.innerHTML = '';

    state.groups.forEach(function (g) {
      var visible = groupFilterVisible(g);
      var failedBits = g.layers.filter(function (l) { return l.failed; }).length;
      var loaded = g.layers.filter(function (l) { return l.layer; }).length;
      var settled = loaded + failedBits;

      var card = el('button', 'imap-card' + (visible ? '' : ' hidden') +
        (state.selectedId === g.cfg.id ? ' active' : '') +
        (settled === g.layers.length && failedBits === g.layers.length ? ' failed' : ''));
      card.type = 'button';
      card.style.setProperty('--imap-color', g.color);

      var head = el('span', 'imap-card-head');
      head.appendChild(el('span', 'imap-dot'));
      head.appendChild(el('strong', 'imap-card-title', cfgText(g.cfg, 'title')));
      card.appendChild(head);

      var nLayers = g.layers.length;
      var metaBits = [g.cfg.category, g.cfg.year,
        nLayers + ' ' + (nLayers === 1 ? t('layer') : t('layers'))];
      if (g.count) metaBits.push(g.count + ' ' + (g.count === 1 ? t('feature') : t('features')));
      if (failedBits) metaBits.push(failedBits + ' ' + t('unavailable'));
      card.appendChild(el('span', 'imap-card-meta', metaBits.filter(Boolean).join(' · ')));

      card.appendChild(el('span', 'imap-card-desc', cfgText(g.cfg, 'desc')));

      if (nLayers > 1) {
        var wrapL = el('span', 'imap-card-layers');
        g.layers.slice(0, 4).forEach(function (l) {
          var row = el('span', 'imap-card-layer' + (l.failed ? ' failed' : ''));
          var dot = el('span', 'imap-dot');
          dot.style.background = l.color;
          row.appendChild(dot);
          row.appendChild(el('span', 'imap-card-layer-label',
            cfgText(l.cfg, 'label') || l.cfg.file));
          wrapL.appendChild(row);
        });
        if (nLayers > 4) wrapL.appendChild(el('span', 'imap-card-layer more', '+' + (nLayers - 4)));
        card.appendChild(wrapL);
      }

      card.addEventListener('click', function () { selectGroup(g); });
      list.appendChild(card);
    });
  }

  function renderLegend() {
    var legend = document.getElementById('imapLegend');
    if (!legend) return;
    legend.innerHTML = '';

    state.groups.forEach(function (g) {
      var visible = groupFilterVisible(g);
      if (!visible) return;

      var box = el('div', 'imap-lg-group' + (g.visible ? '' : ' off'));
      var expanded = !!state.expanded[g.cfg.id] && g.layers.length > 1;

      var head = el('div', 'imap-lg-head');
      head.title = g.visible ? '' : (cfgText(g.cfg, 'title') + ' (' + t('layerHidden') + ')');

      var eye = el('button', 'imap-lg-eye' + (g.visible ? '' : ' off'));
      eye.type = 'button';
      eye.setAttribute('aria-label', 'toggle ' + cfgText(g.cfg, 'title'));
      eye.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"></path>' +
        '<circle cx="12" cy="12" r="3"></circle></svg>';
      eye.addEventListener('click', function (e) { e.stopPropagation(); toggleGroup(g); });
      head.appendChild(eye);

      var dot = el('span', 'imap-dot');
      dot.style.background = g.color;
      head.appendChild(dot);

      head.appendChild(el('span', 'imap-lg-title', cfgText(g.cfg, 'title')));

      var nOn = g.layers.filter(function (l) { return l.visible && !l.failed; }).length;
      head.appendChild(el('span', 'imap-lg-count',
        nOn + '/' + g.layers.length));

      if (g.layers.length > 1) {
        var chev = el('span', 'imap-lg-chevron' + (expanded ? ' open' : ''));
        head.appendChild(chev);
      }

      head.addEventListener('click', function () {
        if (g.layers.length <= 1) { toggleGroup(g); return; }
        state.expanded[g.cfg.id] = !state.expanded[g.cfg.id];
        renderLegend();
      });
      box.appendChild(head);

      if (expanded) {
        var wrapL = el('div', 'imap-lg-layers');
        g.layers.forEach(function (l) {
          var row = el('button', 'imap-lg-layer' + (l.visible ? '' : ' off') + (l.failed ? ' failed' : ''));
          row.type = 'button';

          var chk = el('span', 'imap-lg-check' + (l.visible && !l.failed ? ' on' : ''));
          chk.style.setProperty('--imap-color', l.color);
          row.appendChild(chk);

          row.appendChild(el('span', 'imap-lg-layer-label',
            cfgText(l.cfg, 'label') || l.cfg.file));

          if (l.failed) row.appendChild(el('span', 'imap-lg-failed', t('unavailable')));
          else row.appendChild(el('span', 'imap-lg-count', String(l.count)));

          row.addEventListener('click', function () {
            if (l.failed) return;
            toggleLayer(g, l);
          });
          wrapL.appendChild(row);
        });
        box.appendChild(wrapL);
      }

      legend.appendChild(box);
    });
  }
})();
