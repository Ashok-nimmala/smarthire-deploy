/*
 * Exam page controller.
 * States: LOADING -> OVERVIEW -> STARTING -> IN_PROGRESS -> (SUBMIT_CONFIRM) -> SUBMITTING -> result.html
 *         ERROR from anywhere.
 *
 * /start, /submit and /proctor/event are state-changing GETs: they are only called from a
 * user action (Start/Resume button, Submit confirm) or a detected browser event — never on page load.
 */
(function () {
  "use strict";

  var api = window.ExamApi;

  function $(id) { return document.getElementById(id); }

  var VIEWS = {
    LOADING: "view-loading",
    ERROR: "view-error",
    OVERVIEW: "view-overview",
    STARTING: "view-starting",
    IN_PROGRESS: "view-exam",
    SUBMIT_CONFIRM: "view-exam",
    SUBMITTING: "view-submitting"
  };

  var state = "LOADING";
  var examId = api.session.examId();
  var overview = null;
  var questions = [];
  var answers = {};        // { question_id: "answer text" }
  var current = 0;
  var submitting = false;  // duplicate-submission guard
  var timerHandle = null;
  var deadline = null;     // ms epoch, only if the backend supplied timing
  var draftTimer = null;
  var toastTimer = null;

  /* ---------- State / view ---------- */
  function setState(next) {
    state = next;
    var show = VIEWS[next];
    Object.keys(VIEWS).forEach(function (k) {
      var el = $(VIEWS[k]);
      if (el) el.hidden = (VIEWS[k] !== show);
    });
    $("confirm-modal").hidden = (next !== "SUBMIT_CONFIRM");
    $("exam-meta").hidden = !(next === "IN_PROGRESS" || next === "SUBMIT_CONFIRM");
    $("brand-sub").textContent = (next === "IN_PROGRESS" || next === "SUBMIT_CONFIRM") && overview
      ? overview.job_title || "Proctored Assessment"
      : "Proctored Assessment";
  }

  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 3500);
  }

  function showError(msg, backToLogin) {
    stopTimer();
    window.Proctor.stop();
    exitFullscreen();
    $("error-message").textContent = msg;
    $("error-back").hidden = !backToLogin;
    setState("ERROR");
  }

  function expireSession() {
    submitting = true; // block any further submission attempts
    api.session.clear();
    showError("Your examination session has expired.", true);
  }

  /* Handle an API error; returns true if it was fatal (401 / already submitted). */
  function handleFatal(err) {
    var status = api.statusOf(err);
    if (status === 401) { expireSession(); return true; }
    return false;
  }

  /* ---------- Fullscreen ---------- */
  function requestFullscreen() {
    var el = document.documentElement;
    try {
      var p = el.requestFullscreen && el.requestFullscreen();
      if (p && p.catch) p.catch(function () { /* user/browser refused */ });
    } catch (e) { /* ignore */ }
  }
  function exitFullscreen() {
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        var p = document.exitFullscreen();
        if (p && p.catch) p.catch(function () {});
      }
    } catch (e) { /* ignore */ }
  }
  function updateFsBanner() {
    var inExam = state === "IN_PROGRESS" || state === "SUBMIT_CONFIRM";
    $("fs-banner").hidden = !inExam || !!document.fullscreenElement;
  }

  /* ---------- Overview ---------- */
  function humanStatus(s) {
    if (!s) return "—";
    return String(s).toLowerCase().replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function renderOverview(d) {
    $("ov-title").textContent = d.job_title || "Examination";
    $("ov-org").textContent = d.organization || "";
    $("ov-candidate").textContent = d.candidate_name || "—";
    $("ov-questions").textContent = d.question_count !== undefined ? d.question_count : "—";
    $("ov-marks").textContent = d.total_marks !== undefined ? d.total_marks : "—";
    $("ov-integrity").textContent = d.integrity_score !== undefined ? d.integrity_score : "—";

    var resumable = d.started && !d.submitted;
    $("ov-status").textContent = d.can_start === false && !resumable
      ? humanStatus(d.status)
      : (resumable ? "In Progress" : "Ready to Start");

    var btn = $("start-btn");
    btn.textContent = resumable ? "Resume Examination" : "Start Examination";

    var alertEl = $("ov-alert");
    if (d.can_start === false && !resumable) {
      btn.disabled = true;
      alertEl.textContent = d.message || ("This examination cannot be started right now (" + humanStatus(d.status) + ").");
      alertEl.hidden = false;
    } else {
      btn.disabled = false;
      alertEl.hidden = true;
    }
    if (d.integrity_score !== undefined) setIntegrity(d.integrity_score);
  }

  /* ---------- Integrity (value always comes from backend) ---------- */
  function setIntegrity(v) {
    $("integrity").textContent = v;
  }

  /* ---------- Timer (only when the backend supplies timing) ---------- */
  function computeDeadline(d) {
    var now = Date.now();
    function num(x) { x = Number(x); return isFinite(x) ? x : null; }

    var remaining = num(d.time_remaining_seconds !== undefined ? d.time_remaining_seconds : d.remaining_seconds);
    if (remaining !== null) return now + remaining * 1000;

    var abs = d.expires_at || d.ends_at || d.deadline || d.end_time;
    if (abs) { var t = Date.parse(abs); if (!isNaN(t)) return t; }

    var durSec = num(d.duration_seconds !== undefined ? d.duration_seconds : d.time_limit_seconds);
    var durMin = num(d.duration_minutes !== undefined ? d.duration_minutes : d.time_limit_minutes);
    var dur = durSec !== null ? durSec : (durMin !== null ? durMin * 60 : null);
    if (dur !== null) {
      var startedAt = d.started_at ? Date.parse(d.started_at) : NaN;
      return (isNaN(startedAt) ? now : startedAt) + dur * 1000;
    }
    return null; // backend gave no timing: do not invent one
  }

  function fmt(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    var mm = (m < 10 ? "0" : "") + m, ss = (sec < 10 ? "0" : "") + sec;
    return h > 0 ? h + ":" + mm + ":" + ss : mm + ":" + ss;
  }

  function startTimer() {
    stopTimer();
    if (deadline === null) { $("timer-item").hidden = true; return; }
    $("timer-item").hidden = false;
    tick();
    timerHandle = setInterval(tick, 1000);
  }
  function stopTimer() {
    if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
  }
  function tick() {
    var left = deadline - Date.now();
    var el = $("timer");
    el.textContent = fmt(left);
    el.classList.toggle("warn", left <= 5 * 60 * 1000 && left > 60 * 1000);
    el.classList.toggle("danger", left <= 60 * 1000);
    if (left <= 0) {
      stopTimer();
      if (state === "IN_PROGRESS" || state === "SUBMIT_CONFIRM") doSubmit();
    }
  }

  /* ---------- Questions ---------- */
  function isAnswered(q) {
    return (answers[q.question_id] || "").trim().length > 0;
  }

  function saveDraftSoon() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(function () { api.session.saveDrafts(answers); }, 400);
  }

  function renderQuestion() {
    var q = questions[current];
    if (!q) return;
    $("q-position").textContent = "Question " + (current + 1) + " of " + questions.length;
    $("q-marks").textContent = q.marks + (Number(q.marks) === 1 ? " Mark" : " Marks");
    $("q-text").textContent = q.question;
    $("answer").value = answers[q.question_id] || "";
    $("prev-btn").disabled = current === 0;
    $("next-btn").disabled = current === questions.length - 1;
    renderNav();
  }

  function renderNav() {
    var nav = $("q-nav");
    nav.innerHTML = "";
    var answered = 0;
    questions.forEach(function (q, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "q-pill" + (isAnswered(q) ? " answered" : "") + (i === current ? " current" : "");
      b.textContent = String(q.order !== undefined ? q.order : i + 1);
      b.setAttribute("aria-label", "Question " + (i + 1) + (isAnswered(q) ? " (answered)" : ""));
      b.addEventListener("click", function () { if (!submitting) goTo(i); });
      nav.appendChild(b);
      if (isAnswered(q)) answered++;
    });
    $("answered-count").textContent = answered + " of " + questions.length + " answered";
  }

  function goTo(i) {
    if (i < 0 || i >= questions.length) return;
    current = i;
    renderQuestion();
  }

  function setControlsDisabled(dis) {
    ["answer", "prev-btn", "next-btn", "submit-btn"].forEach(function (id) { $(id).disabled = dis; });
    Array.prototype.forEach.call($("q-nav").children, function (b) { b.disabled = dis; });
  }

  /* ---------- Start / resume (user action only) ---------- */
  function onStart() {
    if (state !== "OVERVIEW") return;
    setState("STARTING");
    requestFullscreen(); // must run inside the click gesture

    api.startExam(examId).then(
      function (data) {
        var list = (data && data.questions) || [];
        questions = list.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });

        if (!questions.length) {
          showError("No questions were returned for this examination.", false);
          return;
        }

        // Restore drafts (only for question_ids the backend sent)
        var drafts = api.session.loadDrafts();
        answers = {};
        questions.forEach(function (q) {
          answers[q.question_id] = typeof drafts[q.question_id] === "string" ? drafts[q.question_id] : "";
        });

        if (data.job_title && overview) overview.job_title = data.job_title;
        if (data.integrity_score !== undefined) setIntegrity(data.integrity_score);

        deadline = computeDeadline(data);
        current = 0;
        setState("IN_PROGRESS");
        renderQuestion();
        setControlsDisabled(false);
        updateFsBanner();
        startTimer();
        beginProctoring();
        protectNavigation();
        $("answer").focus();
      },
      function (err) {
        if (handleFatal(err)) return;
        exitFullscreen();
        if (api.statusOf(err) === 409) { window.location.replace("result.html"); return; }
        // Back to the overview with the backend's message; user can press Start again.
        setState("OVERVIEW");
        $("ov-alert").textContent = err.message || "Could not start the examination.";
        $("ov-alert").hidden = false;
      }
    );
  }

  function beginProctoring() {
    window.Proctor.start({
      examId: examId,
      onScore: setIntegrity,
      onRecorded: function () { toast("⚠ Proctoring event recorded"); },
      onExpired: expireSession
    });
  }

  /* ---------- Submit ---------- */
  function openConfirm() {
    if (submitting || state !== "IN_PROGRESS") return;
    setState("SUBMIT_CONFIRM");
  }
  function cancelConfirm() {
    if (state === "SUBMIT_CONFIRM") setState("IN_PROGRESS");
  }

  function buildPayload() {
    // Every question gets a row; unanswered => "".
    return questions.map(function (q) {
      return { question_id: q.question_id, answer: answers[q.question_id] || "" };
    });
  }

  function doSubmit() {
    if (submitting) return;
    submitting = true;

    setState("SUBMITTING");
    setControlsDisabled(true);
    stopTimer();
    window.Proctor.stop();
    unprotectNavigation();

    api.submitExam(examId, buildPayload()).then(
      function () { finishSubmitted(); },
      function (err) {
        var status = api.statusOf(err);
        if (status === 401) { expireSession(); return; }
        if (status === 409) { finishSubmitted(); return; } // already submitted: backend no-op
        // Submission failed: let the candidate try again (deliberately manual, no auto-retry).
        submitting = false;
        setState("IN_PROGRESS");
        setControlsDisabled(false);
        updateFsBanner();
        beginProctoring();
        protectNavigation();
        if (deadline !== null && deadline - Date.now() > 0) startTimer();
        toast("Submission failed: " + (err.message || "please try again."));
      }
    );
  }

  function finishSubmitted() {
    api.session.clearDrafts();
    exitFullscreen();
    window.location.replace("result.html");
  }

  /* ---------- Navigation protection ---------- */
  function onBeforeUnload(e) {
    if (state === "IN_PROGRESS" || state === "SUBMIT_CONFIRM") {
      var msg = "Your examination is currently in progress.\nLeaving this page may affect your examination.";
      e.preventDefault();
      e.returnValue = msg;
      return msg;
    }
  }
  function onPopState() {
    if (state === "IN_PROGRESS" || state === "SUBMIT_CONFIRM") {
      history.pushState(null, "", location.href);
    }
  }
  function protectNavigation() {
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("popstate", onPopState);
    try { history.pushState(null, "", location.href); } catch (e) { /* ignore */ }
  }
  function unprotectNavigation() {
    window.removeEventListener("beforeunload", onBeforeUnload);
    window.removeEventListener("popstate", onPopState);
  }

  /* ---------- Wiring ---------- */
  function wire() {
    $("start-btn").addEventListener("click", onStart);
    $("prev-btn").addEventListener("click", function () { if (!submitting) goTo(current - 1); });
    $("next-btn").addEventListener("click", function () { if (!submitting) goTo(current + 1); });
    $("submit-btn").addEventListener("click", openConfirm);
    $("confirm-cancel").addEventListener("click", cancelConfirm);
    $("confirm-submit").addEventListener("click", doSubmit);
    $("fs-btn").addEventListener("click", requestFullscreen);
    document.addEventListener("fullscreenchange", updateFsBanner);

    $("answer").addEventListener("input", function (e) {
      if (submitting) return;
      var q = questions[current];
      if (!q) return;
      answers[q.question_id] = e.target.value;
      saveDraftSoon();
      renderNav();
    });
  }

  /* ---------- Init ---------- */
  function init() {
    wire();

    if (!api.session.hasSession()) {
      window.location.replace("index.html");
      return;
    }

    api.getExam(examId).then(
      function (d) {
        overview = d || {};
        if (overview.submitted) { window.location.replace("result.html"); return; }
        renderOverview(overview);
        setState("OVERVIEW");
      },
      function (err) {
        if (handleFatal(err)) return;
        showError(err.message || "Unable to load the examination.", true);
      }
    );
  }

  init();
})();
