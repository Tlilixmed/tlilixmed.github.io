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

    function send(batch) {
      var body = JSON.stringify({ events: batch });
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

    // contract used by contact-form.js for form_submit
    window.gisTrack = track;

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

      // case studies — "Read case study" buttons carry data-target="case-<slug>"
      var cs = el.closest(".case-open");
      if (cs) {
        track("case_study_open", (cs.getAttribute("data-target") || "").replace(/^case-/, "") || null);
        return;
      }

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
