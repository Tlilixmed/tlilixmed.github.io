/* ============================================================
   DUAL MAP — synchronized side-by-side comparison (v1)
   ------------------------------------------------------------
   Two Leaflet maps that share pan/zoom, a draggable divider,
   independent layer + basemap pickers and a mirrored cursor.

   Data source: /api/manifest (Worker) with silent fallback to
   the static js/map-projects.js manifest — same contract as
   js/map.js. Loads Leaflet only if js/map.js has not already.

   This file is self-contained: it injects its own CSS and does
   not modify style.css. Add #cmpBlock markup + this script tag.
   ============================================================ */
(function () {
  "use strict";

  var LEAFLET_CSS = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.css';
  var LEAFLET_JS  = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.min.js';
  var DEFAULT_VIEW = [34.4, 9.6];                    // Tunisia overview (matches map.js)
  var FALLBACK_ZOOM = 7;

  var BASEMAPS = [
    { id: 'osm', label: { en: 'OpenStreetMap', fr: 'OpenStreetMap' },
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
      maxNativeZoom: 19, soft: true },
    { id: 'esri-sat', label: { en: 'Satellite (Esri)', fr: 'Satellite (Esri)' },
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics',
      maxNativeZoom: 19, soft: false },
    { id: 'esri-topo', label: { en: 'Topographic (Esri)', fr: 'Topographique (Esri)' },
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri — Esri, DeLorme, NAVTEQ',
      maxNativeZoom: 19, soft: true },
    { id: 'esri-gray', label: { en: 'Light gray (Esri)', fr: 'Gris clair (Esri)' },
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri — Esri, DeLorme, NAVTEQ',
      maxNativeZoom: 16, soft: true },
  ];

  var CSS = [
    '.cmp-block{margin:2.2rem auto 0;max-width:1240px;}',
    '.cmp-shell{max-width:1240px;margin:0 auto;display:flex;flex-direction:column;gap:1rem;}',
    '.cmp-toolbar{display:flex;flex-wrap:wrap;gap:.7rem;align-items:center;justify-content:space-between;',
      'background:var(--bg);border-radius:var(--radius-card);box-shadow:var(--neu-raised-sm);padding:.9rem 1.1rem;}',
    '.cmp-side{display:flex;gap:.5rem;align-items:center;min-width:0;}',
    '.cmp-tag{flex:0 0 auto;width:28px;height:28px;border-radius:9px;display:flex;align-items:center;justify-content:center;',
      'font-weight:700;font-size:.82rem;color:#fff;background:linear-gradient(135deg,var(--accent),var(--accent-2));',
      'box-shadow:0 2px 6px rgba(22,84,240,.35);}',
    '.cmp-side:last-of-type .cmp-tag{background:linear-gradient(135deg,#e2590b,#f5a623);box-shadow:0 2px 6px rgba(226,89,11,.35);}',
    '.cmp-select{max-width:230px;padding:.42rem 2rem .42rem .8rem;border:none;border-radius:var(--radius-pill);',
      'background:var(--bg-deep);color:var(--ink);font:inherit;font-size:.86rem;cursor:pointer;',
      'box-shadow:var(--neu-inset-sm);-webkit-appearance:none;appearance:none;}',
    '.cmp-select.cmp-base{max-width:150px;}',
    '.cmp-btn{flex:0 0 auto;padding:.42rem 1rem;border:none;border-radius:var(--radius-pill);cursor:pointer;',
      'font:inherit;font-size:.84rem;font-weight:600;color:var(--accent);background:var(--bg);',
      'box-shadow:var(--neu-raised-sm);transition:box-shadow .15s ease,color .15s ease;}',
    '.cmp-btn:hover{color:var(--accent-2);}',
    '.cmp-btn:active{box-shadow:var(--neu-inset-sm);}',
    '.cmp-frame{--cmp-split:50%;--cmp-split-n:0.5;position:relative;display:flex;background:var(--bg);border-radius:var(--radius-card);',
      'box-shadow:var(--neu-inset);padding:12px;height:560px;}',
    '.cmp-pane{position:relative;flex:0 0 var(--cmp-split);min-width:0;}',
    '.cmp-pane.cmp-b{flex:1 1 auto;}',
    '.cmp-map{position:absolute;inset:0;border-radius:18px;background:#E9EFF9;overflow:hidden;',
      'box-shadow:0 0 0 1px rgba(159,178,211,.35);z-index:1;}',
    '.cmp-map.imap-soft .leaflet-tile{filter:saturate(.55) contrast(.94) brightness(1.03);}',
    '.cmp-divider{position:absolute;top:12px;bottom:12px;z-index:6;cursor:col-resize;',
      'left:calc(12px + (100% - 24px) * var(--cmp-split-n));width:0;}',
    '.cmp-divider::before{content:"";position:absolute;top:0;bottom:0;left:-3px;width:6px;border-radius:99px;',
      'background:linear-gradient(180deg,rgba(22,84,240,.85),rgba(25,201,235,.85));',
      'box-shadow:0 0 0 2px rgba(246,250,255,.9),0 2px 10px rgba(61,74,102,.35);}',
    '.cmp-divider::after{content:"\u2039\u203A";position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);',
      'width:30px;height:30px;border-radius:50%;background:#fff;color:var(--accent);font-size:15px;line-height:30px;',
      'text-align:center;font-weight:700;box-shadow:0 2px 8px rgba(61,74,102,.35);pointer-events:none;}',
    '.cmp-frame.cmp-drag .cmp-map{pointer-events:none;}',
    '@media (max-width:760px){',
      '.cmp-frame{flex-direction:column;height:820px;}',
      '.cmp-divider{cursor:row-resize;top:calc(12px + (100% - 24px) * var(--cmp-split-n));left:12px;right:12px;bottom:auto;height:0;width:auto;}',
      '.cmp-divider::before{left:0;right:0;top:-3px;height:6px;width:auto;}',
      '.cmp-select{max-width:150px;font-size:.8rem;}.cmp-select.cmp-base{max-width:118px;}',
    '}'
  ].join('\n');

  /* ---------- state ---------- */
  var state = {
    lang: 'en',
    projects: [],              // flattened manifest
    cache: {},                 // file url -> Promise<geojson>
    panes: {},                 // 'a' | 'b'
    syncing: false,
    split: 50,
    booted: false
  };

  function detectLang() {
    return ((document.documentElement.getAttribute('lang') || 'en').toLowerCase().indexOf('fr') === 0) ? 'fr' : 'en';
  }
  function t(obj, fallback) {
    if (obj && typeof obj === 'object') return obj[state.lang] || obj.en || fallback || '';
    return fallback || '';
  }

  /* ---------- manifest (same contract as js/map.js) ---------- */
  function loadManifest(done) {
    if (window.MAP_PROJECTS && window.MAP_PROJECTS.length) { done(window.MAP_PROJECTS); return; }
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = ctrl && setTimeout(function () { ctrl.abort(); }, 4000);
    fetch('/api/manifest', ctrl ? { signal: ctrl.signal } : undefined)
      .then(function (r) { if (timer) clearTimeout(timer); return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && Array.isArray(data.projects) && data.projects.length) done(data.projects);
        else done(window.MAP_PROJECTS || []);
      })
      .catch(function () { if (timer) clearTimeout(timer); done(window.MAP_PROJECTS || []); });
  }

  function flatten(cfg) {
    var out = [];
    if (!cfg || cfg.visible === false) return out;
    var layers = (cfg.layers && cfg.layers.length)
      ? cfg.layers
      : (cfg.file ? [{ file: cfg.file, label: cfg.title, color: cfg.color, visible: true }] : []);
    layers.forEach(function (l) {
      if (!l || !l.file || l.visible === false) return;
      out.push({
        project: cfg,
        file: l.file,
        label: l.label || cfg.title,
        color: l.color || cfg.color || '#1654F0',
        weight: (l.weight != null) ? l.weight : 2,
        dash: l.dash || null,
        fillOpacity: (l.fillOpacity != null) ? l.fillOpacity : 0.18,
        radius: (l.radius != null) ? l.radius : 6.5
      });
    });
    return out;
  }

  /* ---------- leaflet loader (shares js/map.js's request) ----------
     Injecting a second Leaflet copy would replace window.L mid-session
     and break instanceof checks across copies (symptom: fitBounds throws
     "Bounds are not valid."). Both modules use the window.__leafletReq
     handshake so exactly one copy is ever loaded. */
  function ensureLeaflet(done) {
    if (window.L) { done(); return; }
    // window-level handshake with js/map.js — exactly ONE copy of Leaflet
    if (!window.__leafletReq) {
      window.__leafletReq = true;
      var css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = LEAFLET_CSS;
      css.setAttribute('data-leaflet-css', '');
      document.head.appendChild(css);
      var js = document.createElement('script');
      js.src = LEAFLET_JS; js.async = true;
      js.setAttribute('data-leaflet-js', '');
      document.head.appendChild(js);
    }
    var tries = 0;
    (function poll() {
      if (window.L) return done();
      if (++tries > 400) return done(new Error('Leaflet load timeout.'));
      setTimeout(poll, 25);
    })();
  }

  /* ---------- data ---------- */
  function getGeoJSON(file) {
    if (!state.cache[file]) {
      state.cache[file] = fetch(file)
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .catch(function (err) { delete state.cache[file]; throw err; });
    }
    return state.cache[file];
  }

  function buildPopup(def, feat) {
    var props = (feat && feat.properties) || {};
    var keys = Object.keys(props).filter(function (k) {
      return props[k] !== null && props[k] !== '' && typeof props[k] !== 'object';
    }).slice(0, 8);
    var rows = keys.map(function (k) {
      return '<tr><th>' + String(k).replace(/[<>&]/g, '') + '</th><td>' +
        String(props[k]).replace(/[<>&]/g, '') + '</td></tr>';
    }).join('');
    return '<div style="font-family:inherit;max-width:260px">' +
      '<b style="color:var(--accent)">' + (t(def.label) || t(def.project.title)) + '</b>' +
      (rows ? '<table style="margin-top:6px;font-size:.8rem;border-collapse:collapse">' + rows + '</table>' : '') +
      '</div>';
  }

  function styleFor(def) {
    return {
      color: def.color, weight: def.weight, opacity: 0.9, dashArray: def.dash,
      fillColor: def.color, fillOpacity: def.fillOpacity
    };
  }

  function setLayer(side, def, done) {
    var pane = state.panes[side];
    if (!def) { if (done) done(); return; }
    getGeoJSON(def.file).then(function (gj) {
      if (pane.layerDef === def.file && pane.leafletLayer) { if (done) done(); return; }
      if (pane.leafletLayer) { pane.map.removeLayer(pane.leafletLayer); pane.leafletLayer = null; }
      var L = window.L;
      var layer = L.geoJSON(gj, {
        style: function () { return styleFor(def); },
        pointToLayer: function (feat, latlng) {
          return L.circleMarker(latlng, {
            radius: def.radius, color: def.color, weight: 2,
            fillColor: def.color, fillOpacity: 0.7
          });
        },
        onEachFeature: function (feat, lyr) {
          lyr.bindPopup(function () { return buildPopup(def, feat); }, { maxWidth: 300 });
        }
      });
      layer.addTo(pane.map);
      pane.leafletLayer = layer;
      pane.layerDef = def.file;
      pane.featureCount = layer.getLayers().length;
      // frame the freshly picked layer so the pane always shows its data
      try {
        var b = layer.getBounds();
        if (b && b.isValid()) pane.map.fitBounds(b, { padding: [24, 24], maxZoom: 15 });
      } catch (e) { /* empty geometry — keep current view */ }
      if (done) done();
    }).catch(function (err) {
      console.warn('[dual map]', err.message, def.file);
      if (done) done(err);
    });
  }

  function setBasemap(side, id) {
    var pane = state.panes[side];
    var bm = BASEMAPS.filter(function (b) { return b.id === id; })[0] || BASEMAPS[0];
    if (pane.basemap) pane.map.removeLayer(pane.basemap);
    var L = window.L;
    pane.basemap = L.tileLayer(bm.url, {
      attribution: bm.attribution, maxNativeZoom: bm.maxNativeZoom, maxZoom: 19,
      subdomains: bm.subdomains || 'abc', updateWhenZooming: false
    });
    pane.basemap.addTo(pane.map);
    pane.basemapId = bm.id;
    var el = pane.map.getContainer();
    el.classList[bm.soft ? 'add' : 'remove']('imap-soft');
  }

  /* ---------- sync ---------- */
  function syncFrom(src, dst) {
    if (state.syncing) return;
    state.syncing = true;
    dst.setView(src.getCenter(), src.getZoom(), { animate: false });
    state.syncing = false;
  }

  function mirrorCursor(src, dst, latlng) {
    var L = window.L;
    if (!latlng) {
      if (state.panes[dst].cursor) { state.panes[dst].map.removeLayer(state.panes[dst].cursor); state.panes[dst].cursor = null; }
      return;
    }
    var style = dst === 'b' ? { color: '#e2590b', fillColor: '#f5a623' } : { color: '#1654F0', fillColor: '#19C9EB' };
    if (state.panes[dst].cursor) {
      state.panes[dst].cursor.setLatLng(latlng);
    } else {
      state.panes[dst].cursor = L.circleMarker(latlng, {
        radius: 6, weight: 2.5, opacity: 0.9, fillOpacity: 0.55,
        interactive: false, color: style.color, fillColor: style.fillColor
      }).addTo(state.panes[dst].map);
    }
  }

  /* ---------- UI ---------- */
  function fillLayerSelect(sel, chosenFile) {
    var cur = chosenFile !== undefined ? chosenFile : sel.value;
    sel.innerHTML = '';
    state.projects.forEach(function (prj) {
      if (prj.layers.length === 1) {
        var l0 = prj.layers[0];
        var o = document.createElement('option');
        o.value = l0.file;
        o.textContent = t(prj.cfg.title) + ' — ' + t(l0.label);
        sel.appendChild(o);
      } else {
        var og = document.createElement('optgroup');
        og.label = t(prj.cfg.title);
        prj.layers.forEach(function (l) {
          var o = document.createElement('option');
          o.value = l.file;
          o.textContent = t(l.label);
          og.appendChild(o);
        });
        sel.appendChild(og);
      }
    });
    if (cur && state.projects.some(function (p) { return p.layers.some(function (l) { return l.file === cur; }); })) {
      sel.value = cur;
    }
  }

  function fillBasemapSelect(sel) {
    sel.innerHTML = '';
    BASEMAPS.forEach(function (bm) {
      var o = document.createElement('option');
      o.value = bm.id;
      o.textContent = t(bm.label);
      sel.appendChild(o);
    });
  }

  function layerByFile(file) {
    for (var i = 0; i < state.projects.length; i++) {
      for (var j = 0; j < state.projects[i].layers.length; j++) {
        if (state.projects[i].layers[j].file === file) return state.projects[i].layers[j];
      }
    }
    return null;
  }

  function applySide(side, layerFile, baseId) {
    var def = layerByFile(layerFile);
    if (def) setLayer(side, def);
    setBasemap(side, baseId);
  }

  function rerenderLanguage() {
    state.lang = detectLang();
    ['a', 'b'].forEach(function (side) {
      var pane = state.panes[side];
      fillLayerSelect(pane.selLayer, pane.layerDef);
      fillBasemapSelect(pane.selBase);
      pane.selBase.value = pane.basemapId;
    });
  }

  /* ---------- divider drag ---------- */
  function wireDivider(frame, divider) {
    var vertical = function () {
      return getComputedStyle(frame).flexDirection === 'column';
    };
    function apply() {
      frame.style.setProperty('--cmp-split', state.split.toFixed(2) + '%');
      frame.style.setProperty('--cmp-split-n', (state.split / 100).toFixed(4));
      requestAnimationFrame(function () {
        ['a', 'b'].forEach(function (s) { if (state.panes[s]) state.panes[s].map.invalidateSize({ animate: false }); });
      });
    }
    divider.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      divider.setPointerCapture && divider.setPointerCapture(e.pointerId);
      frame.classList.add('cmp-drag');
      var rect = frame.getBoundingClientRect();
      var move = function (ev) {
        var p = vertical() ? (ev.clientY - rect.top) : (ev.clientX - rect.left);
        var total = vertical() ? rect.height : rect.width;
        state.split = Math.max(18, Math.min(82, (p / total) * 100));
        apply();
      };
      var up = function () {
        frame.classList.remove('cmp-drag');
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        apply();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    divider.addEventListener('keydown', function (e) {
      var step = e.shiftKey ? 8 : 3;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { state.split = Math.max(18, state.split - step); apply(); e.preventDefault(); }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { state.split = Math.min(82, state.split + step); apply(); e.preventDefault(); }
    });
  }

  /* ---------- boot ---------- */
  function boot(root) {
    if (state.booted) return;
    state.booted = true;
    state.lang = detectLang();

    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    loadManifest(function (projects) {
      state.projects = [];
      (projects || []).forEach(function (cfg) {
        var layers = flatten(cfg);
        if (layers.length) state.projects.push({ cfg: cfg, layers: layers });
      });
      if (!state.projects.length) { root.style.display = 'none'; return; }

      ensureLeaflet(function (err) {
        if (err || !window.L) { root.style.display = 'none'; return; }
        start(root);
      });
    });
  }

  function start(root) {
    var L = window.L;
    var selLayerA = root.querySelector('#cmpLayerA');
    var selLayerB = root.querySelector('#cmpLayerB');
    var selBaseA = root.querySelector('#cmpBaseA');
    var selBaseB = root.querySelector('#cmpBaseB');
    var btnSwap = root.querySelector('#cmpSwap');
    var frame = root.querySelector('#cmpFrame');
    var divider = root.querySelector('#cmpDivider');

    fillLayerSelect(selLayerA);
    fillLayerSelect(selLayerB);
    fillBasemapSelect(selBaseA);
    fillBasemapSelect(selBaseB);

    function makeMap(id) {
      var map = L.map(id, {
        scrollWheelZoom: false, zoomControl: true, attributionControl: true,
        minZoom: 3, maxZoom: 19, worldCopyJump: true, preferCanvas: true
      }).setView(DEFAULT_VIEW, FALLBACK_ZOOM);
      map.on('focus', function () { map.scrollWheelZoom.enable(); });
      map.on('blur', function () { map.scrollWheelZoom.disable(); });
      map.getContainer().addEventListener('mouseleave', function () { map.scrollWheelZoom.disable(); });
      L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);
      return map;
    }

    var mapA = makeMap('cmpMapA');
    var mapB = makeMap('cmpMapB');

    state.panes = {
      a: { map: mapA, basemap: null, basemapId: null, leafletLayer: null, layerDef: null, cursor: null, selLayer: selLayerA, selBase: selBaseA },
      b: { map: mapB, basemap: null, basemapId: null, leafletLayer: null, layerDef: null, cursor: null, selLayer: selLayerB, selBase: selBaseB }
    };

    // sync pan/zoom both ways
    mapA.on('move zoomend', function () { syncFrom(mapA, mapB); });
    mapB.on('move zoomend', function () { syncFrom(mapB, mapA); });

    // mirrored cursor
    var hoverPending = 0, lastHover = null;
    function wireHover(srcSide, dstSide) {
      state.panes[srcSide].map.on('mousemove', function (e) {
        lastHover = [dstSide, e.latlng];
        if (hoverPending) return;
        hoverPending = setTimeout(function () {
          hoverPending = 0;
          if (lastHover) mirrorCursor(lastHover[0] === 'b' ? 'a' : 'b', lastHover[0], lastHover[1]);
        }, 60);
      });
      state.panes[srcSide].map.on('mouseout', function () { mirrorCursor(srcSide, dstSide, null); });
    }
    wireHover('a', 'b');
    wireHover('b', 'a');

    // defaults: first project layer on A, a different project (or layer) on B
    var first = state.projects[0].layers[0];
    var last = state.projects.length > 1
      ? state.projects[state.projects.length - 1].layers[0]
      : (state.projects[0].layers[1] || state.projects[0].layers[0]);
    selLayerA.value = first.file;
    selLayerB.value = last.file;
    selBaseA.value = 'osm';
    selBaseB.value = 'esri-sat';

    applySide('a', selLayerA.value, selBaseA.value);
    applySide('b', selLayerB.value, selBaseB.value);

    selLayerA.addEventListener('change', function () { applySide('a', selLayerA.value, selBaseA.value); });
    selLayerB.addEventListener('change', function () { applySide('b', selLayerB.value, selBaseB.value); });
    selBaseA.addEventListener('change', function () { setBasemap('a', selBaseA.value); });
    selBaseB.addEventListener('change', function () { setBasemap('b', selBaseB.value); });

    btnSwap.addEventListener('click', function () {
      var fA = selLayerA.value, fB = selLayerB.value;
      var bA = selBaseA.value, bB = selBaseB.value;
      selLayerA.value = fB; selLayerB.value = fA;
      selBaseA.value = bB; selBaseB.value = bA;
      applySide('a', fB, bB);
      applySide('b', fA, bA);
    });

    wireDivider(frame, divider);

    // language toggle follows the site switcher
    var langToggle = document.getElementById('langToggle');
    if (langToggle) {
      langToggle.addEventListener('click', function () { setTimeout(rerenderLanguage, 0); });
    }

    // keep sizes honest
    var rT = 0;
    window.addEventListener('resize', function () {
      clearTimeout(rT);
      rT = setTimeout(function () {
        mapA.invalidateSize(); mapB.invalidateSize();
      }, 180);
    });
    setTimeout(function () { mapA.invalidateSize(); mapB.invalidateSize(); }, 350);

    // testability hook (harmless in production)
    window.__cmp = { state: state };
  }

  /* ---------- entry ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    var root = document.getElementById('cmpBlock');
    if (!root) return;                                   // block removed → do nothing

    if (!('IntersectionObserver' in window)) { boot(root); return; }
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) { io.disconnect(); boot(root); return; }
      }
    }, { rootMargin: '800px 0px' });
    io.observe(root);
  });
})();
