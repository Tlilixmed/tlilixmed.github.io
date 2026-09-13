/* ============================================================
   ENGAGEMENT ANALYTICS — first-party, cookie-less, additive
   ------------------------------------------------------------
   - anonymous session id kept in sessionStorage (closing the tab
     ends the session; no cookie, nothing persistent)
   - batches tiny JSON POSTs to /api/events (Worker -> D1)
   - tracked: page_view, cv_download (EN/FR), case_study_open,
     form_view, form_submit (via contact-form.js), map_cta_click
   - no fingerprinting, no third-party scripts, no raw IPs
   - everything fails silent: analytics must never break the site
   Contract for other scripts:
   - window.gisTrack(type, detail)  (contact-form.js)
   ============================================================ */
(function () {
  "use strict";
  try {
    var SESSION_KEY = "gis_sid";

    // --- anonymous short-lived session id (sessionStorage) ---
    var sid = "";
    try {
      sid = sessionStorage.getItem(SESSION_KEY) || "";
      if (!sid) {
        sid = (window.crypto && crypto.randomUUID)
          ? crypto.randomUUID()
          : "s-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
        try { sessionStorage.setItem(SESSION_KEY, sid); } catch (e) { /* private mode */ }
      }
    } catch (e) {
      sid = "s-" + Date.now().toString(36); // storage blocked: ephemeral id, nothing stored
    }

    // --- batching queue ---
    var queue = [];
    var timer = null;

    function track(type, detail) {
      try {
        queue.push({
          type: type,
          detail: detail || null,
          session_id: sid,
          referrer: document.referrer || null,
        });
        if (queue.length >= 5) { flush(); return; }
        if (!timer) timer = setTimeout(flush, 2500);
      } catch (e) {}
    }

    // contract used by other scripts:
    //   gisTrack(type, detail)      — batched (normal case)
    //   gisTrackNow(type, detail)   — tracked + flushed immediately
    //                                 (fires right before a navigation,
    //                                 e.g. the form's mailto fallback)
    window.gisTrack = track;
    window.gisTrackNow = function (type, detail) { track(type, detail); flush(); };

    // --- development-only rejection logging -------------------------------
    // On localhost the batch goes out via fetch (never sendBeacon) so the
    // Worker's {stored, rejected, reasons} report can be inspected; in
    // production everything stays fail-silent.
    var IS_DEV = /^localhost$|^127\.0\.0\.1$|^0\.0\.0\.0$/.test(location.hostname);

    function send(batch) {
      var body = JSON.stringify({ events: batch });
      if (IS_DEV) {
        fetch("/api/events", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: body,
          keepalive: true,
        }).then(function (r) { return r.json().catch(function () { return null; }); })
          .then(function (j) {
            if (j && (j.rejected || j.reason)) {
              console.warn("[analytics] worker report:", JSON.stringify(j));
            } else if (!j) {
              console.warn("[analytics] /api/events unreachable");
            }
          })
          .catch(function () {});
        return;
      }
      // sendBeacon survives page unload (CV click -> navigation to the PDF)
      if (navigator.sendBeacon) {
        try {
          navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
          return;
        } catch (e) { /* fall through to fetch */ }
      }
      // keepalive lets the request outlive the page as well
      fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body,
        keepalive: true,
      }).catch(function () {});
    }

    function flush() {
      timer = null;
      if (!queue.length) return;
      send(queue.splice(0));
    }

    // --- page view (referrer category is derived server-side) ---
    track("page_view", document.documentElement.lang === "fr" ? "lang:fr" : "lang:en");

    // --- delegated click tracking (capture phase, additive — script.js untouched) ---
    document.addEventListener("click", function (ev) {
      var el = ev.target;
      if (!el || !el.closest) return;

      // CV downloads — EN vs FR read from the live href (script.js swaps it per language)
      var cv = el.closest(".cv-link");
      if (cv) {
        track("cv_download", /_Fr\.pdf/i.test(cv.getAttribute("href") || "") ? "fr" : "en");
        return;
      }

      // case studies + every native <details>: the "toggle" listener below is
      // the single source of truth (openCase() sets .open programmatically,
      // which still fires "toggle"), so clicks are NOT double-counted here

      // maps section CTAs — static map cards + interactive map view toggles
      var mi = el.closest(".map-item");
      if (mi) {
        var h = mi.querySelector("h3");
        track("map_cta_click", h ? h.textContent.trim().slice(0, 80) : "map_card");
        return;
      }
      if (el.closest("#imapView3d")) { track("map_cta_click", "lidar_3d"); return; }
      if (el.closest("#imapView2d")) { track("map_cta_click", "map_2d"); return; }
    }, true);

    // --- native <details> opening (covers .case-open buttons, deep links,
    // --- and plain <summary> clicks — any path that flips .open) ----------
    document.addEventListener("toggle", function (ev) {
      var d = ev.target;
      if (!d || d.tagName !== "DETAILS" || !d.open) return;   // opens only
      if (d.classList.contains("case")) {
        // keep the existing dashboard event type + slug detail
        track("case_study_open", (d.id || "").replace(/^case-/, "") || null);
        return;
      }
      var summary = d.querySelector("summary");
      track("details_open",
        (summary && summary.textContent.trim().slice(0, 80)) || d.id || null);
    }, true);   // "toggle" does not bubble — capture is required

    // --- embedded 3D LiDAR viewer bridge ----------------------------------
    // The Potree page (loaded in #imapLidarFrame) posts {source:"gis-lidar",
    // event, detail}. Validate strictly: same origin, known source marker,
    // whitelisted events — then record as lidar_* events.
    var LIDAR_EVENTS = { loaded: 1, error: 1, mode: 1 };
    window.addEventListener("message", function (ev) {
      if (ev.origin !== location.origin) return;              // same origin only
      var d = ev.data;
      if (!d || d.source !== "gis-lidar" || !LIDAR_EVENTS[d.event]) return;
      track("lidar_" + d.event, d.detail == null ? null : String(d.detail).slice(0, 120));
    });

    // --- contact form funnel: a "view" = the form scrolled into sight ---
    function watchForm() {
      var f = document.getElementById("quoteForm");
      if (!f || f.__formViewWatched) return;
      f.__formViewWatched = true;
      if (!("IntersectionObserver" in window)) { track("form_view"); return; }
      var seen = false;
      var io = new IntersectionObserver(function (entries) {
        if (seen) { io.disconnect(); return; }
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) {
            seen = true;
            io.disconnect();
            track("form_view");
            break;
          }
        }
      }, { threshold: 0.3 });
      io.observe(f);
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", watchForm);
    } else {
      watchForm();
    }

    // --- never lose the tail of a session ---
    window.addEventListener("pagehide", flush);
  } catch (e) { /* analytics must never break the site */ }
})();
