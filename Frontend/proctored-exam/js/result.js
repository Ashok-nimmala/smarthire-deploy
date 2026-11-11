/* Result page: poll GET /exam/{id}/result until scored === true. Nothing is calculated here. */
(function () {
  "use strict";

  var api = window.ExamApi;
  function $(id) { return document.getElementById(id); }

  var examId = api.session.examId();
  var timer = null;
  var stopped = false;

  function show(view) {
    ["view-scoring", "view-result", "view-error"].forEach(function (id) { $(id).hidden = (id !== view); });
  }

  function showError(msg) {
    stopped = true;
    clearTimeout(timer);
    $("error-message").textContent = msg;
    show("view-error");
  }

  function renderResult(d) {
    stopped = true;
    clearTimeout(timer);

    $("r-score").textContent = d.score_percent !== undefined && d.score_percent !== null ? d.score_percent + "%" : "—";
    $("r-marks").textContent = (d.marks_awarded !== undefined ? d.marks_awarded : "—") + " / " + (d.marks_possible !== undefined ? d.marks_possible : "—");
    $("r-integrity").textContent = d.integrity_score !== undefined && d.integrity_score !== null ? d.integrity_score : "—";

    var badge = $("r-status");
    if (d.passed === true) { badge.textContent = "Passed"; badge.className = "badge pass"; }
    else if (d.passed === false) { badge.textContent = "Not Passed"; badge.className = "badge fail"; }
    else { badge.textContent = String(d.status || "Complete").replace(/_/g, " "); badge.className = "badge neutral"; }

    if (d.pass_threshold !== undefined && d.pass_threshold !== null) {
      $("r-threshold").textContent = "Pass threshold: " + d.pass_threshold + "%";
      $("r-threshold").hidden = false;
    }
    show("view-result");
  }

  function poll() {
    if (stopped) return;
    api.getResult(examId).then(
      function (d) {
        if (d && d.scored === true) { renderResult(d); return; }
        $("poll-note").hidden = true;
        schedule();
      },
      function (err) {
        var status = api.statusOf(err);
        if (status === 401) {
          api.session.clear();
          showError("Your examination session has expired.");
          return;
        }
        if (status >= 400 && status < 500 && status !== 429) {
          showError(err.message || "Unable to load your result.");
          return;
        }
        // Network hiccup / 429 / 5xx: result is a read, so keep polling.
        $("poll-note").textContent = "Still working… reconnecting.";
        $("poll-note").hidden = false;
        schedule();
      }
    );
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(poll, window.ExamConfig.RESULT_POLL_MS);
  }

  $("close-btn").addEventListener("click", function () {
    api.session.clear();
    window.location.replace("index.html");
  });

  if (!api.session.hasSession()) {
    window.location.replace("index.html");
  } else {
    show("view-scoring");
    poll();
  }
})();
