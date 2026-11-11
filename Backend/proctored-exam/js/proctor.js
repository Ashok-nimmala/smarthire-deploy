/*
 * Browser-side proctoring signals. These are signals, not security boundaries.
 * The backend records events, applies penalties and owns the integrity score.
 *
 * Not implemented on purpose: no_face / multiple_faces. Those need a real camera +
 * vision pipeline, and the API has no video upload, so they are never fabricated.
 *
 * Proctor events are NOT idempotent: a failed/timed-out send is dropped, never retried.
 */
(function () {
  "use strict";

  var cfg = window.ExamConfig;

  var active = false;
  var examId = null;
  var handlers = { onScore: null, onRecorded: null, onExpired: null };

  var queue = [];
  var pumping = false;
  var lastSentByType = {};
  var MAX_QUEUE = 20;

  // Per-type cooldown (ms) so a burst of the same signal becomes one event.
  var COOLDOWN = {
    copy: 2000,
    paste: 2000,
    right_click: 2000,
    tab_switch: 1000,
    fullscreen_exit: 1000,
    devtools_open: 5000,
    network_drop: 1000
  };

  var wasHidden = false;
  var wasFullscreen = false;
  var offlineSince = null;
  var devtoolsOpen = false;
  var devtoolsTimer = null;

  /* ---------- Queue ---------- */
  function enqueue(type, extra) {
    if (!active) return;
    var now = Date.now();
    var cd = COOLDOWN[type] || 1000;
    if (lastSentByType[type] && now - lastSentByType[type] < cd) return;
    lastSentByType[type] = now;
    if (queue.length >= MAX_QUEUE) return;

    var ev = { event_type: type, timestamp: new Date().toISOString() };
    if (extra && extra.duration !== undefined) ev.duration = extra.duration;
    if (extra && extra.details) ev.details = extra.details;
    queue.push(ev);
    pump();
  }

  function pump() {
    if (pumping) return;
    pumping = true;
    (function next() {
      var ev = queue.shift();
      if (!ev || !active) {
        queue = [];
        pumping = false;
        return;
      }
      window.ExamApi.sendProctorEvent(examId, ev).then(
        function (data) {
          if (data && data.integrity_score !== undefined && handlers.onScore) handlers.onScore(data.integrity_score);
          if (handlers.onRecorded) handlers.onRecorded(ev.event_type);
        },
        function (err) {
          // No retry. 401 ends the session; anything else (incl. 429) is dropped.
          if (window.ExamApi.statusOf(err) === 401 && handlers.onExpired) handlers.onExpired();
        }
      ).then(function () {
        setTimeout(next, cfg.PROCTOR_MIN_GAP_MS);
      });
    })();
  }

  /* ---------- Listeners ---------- */
  function onVisibility() {
    var hidden = document.visibilityState === "hidden";
    if (hidden && !wasHidden) enqueue("tab_switch");
    wasHidden = hidden;
  }

  function onCopy() { enqueue("copy"); }
  function onPaste() { enqueue("paste"); }       // reported, not blocked
  function onContextMenu() { enqueue("right_click"); }  // reported, not blocked

  function onFullscreenChange() {
    var fs = !!document.fullscreenElement;
    if (wasFullscreen && !fs) enqueue("fullscreen_exit");
    wasFullscreen = fs;
  }

  function onOffline() {
    if (offlineSince === null) offlineSince = Date.now();
  }
  function onOnline() {
    if (offlineSince !== null) {
      var secs = Math.round((Date.now() - offlineSince) / 1000);
      offlineSince = null;
      // Can only be sent once the connection is back.
      enqueue("network_drop", { duration: secs });
    }
  }

  // Lightweight heuristic only: docked DevTools shrink the inner window relative to the outer one.
  function checkDevtools() {
    var wDiff = window.outerWidth - window.innerWidth;
    var hDiff = window.outerHeight - window.innerHeight;
    var open = wDiff > 160 || hDiff > 320;
    if (open && !devtoolsOpen) enqueue("devtools_open", { details: "window-size-heuristic" });
    devtoolsOpen = open;
  }

  /* ---------- Public ---------- */
  function start(opts) {
    if (active) return;
    examId = opts.examId;
    handlers.onScore = opts.onScore || null;
    handlers.onRecorded = opts.onRecorded || null;
    handlers.onExpired = opts.onExpired || null;

    queue = [];
    lastSentByType = {};
    wasHidden = document.visibilityState === "hidden";
    wasFullscreen = !!document.fullscreenElement;
    offlineSince = navigator.onLine === false ? Date.now() : null;
    devtoolsOpen = false;
    active = true;

    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    devtoolsTimer = setInterval(checkDevtools, 2000);
  }

  function stop() {
    if (!active) return;
    active = false;
    queue = [];
    document.removeEventListener("visibilitychange", onVisibility);
    document.removeEventListener("copy", onCopy);
    document.removeEventListener("paste", onPaste);
    document.removeEventListener("contextmenu", onContextMenu);
    document.removeEventListener("fullscreenchange", onFullscreenChange);
    window.removeEventListener("offline", onOffline);
    window.removeEventListener("online", onOnline);
    if (devtoolsTimer) { clearInterval(devtoolsTimer); devtoolsTimer = null; }
  }

  window.Proctor = { start: start, stop: stop };
})();
