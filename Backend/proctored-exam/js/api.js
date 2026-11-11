/*
 * Single API client for the SmartHire exam backend.
 * All network access, BASE_URL, Authorization and error parsing live here.
 * The password is only ever passed into examLogin() and is never stored or logged.
 */
(function () {
  "use strict";

  var BASE_URL = window.ExamConfig.BASE_URL;

  var KEYS = {
    examId: "sh_exam_id",
    token: "sh_exam_token",
    drafts: "sh_exam_answers"
  };

  /* ---------- sessionStorage helpers (never the password) ---------- */
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function ssDel(k) { try { sessionStorage.removeItem(k); } catch (e) { /* ignore */ } }

  var session = {
    save: function (examId, token) { ssSet(KEYS.examId, examId); ssSet(KEYS.token, token); },
    examId: function () { return ssGet(KEYS.examId); },
    token: function () { return ssGet(KEYS.token); },
    hasSession: function () { return !!(ssGet(KEYS.examId) && ssGet(KEYS.token)); },
    clear: function () { ssDel(KEYS.examId); ssDel(KEYS.token); ssDel(KEYS.drafts); },
    loadDrafts: function () {
      try {
        var o = JSON.parse(ssGet(KEYS.drafts) || "{}");
        return (o && typeof o === "object") ? o : {};
      } catch (e) { return {}; }
    },
    saveDrafts: function (obj) { ssSet(KEYS.drafts, JSON.stringify(obj)); },
    clearDrafts: function () { ssDel(KEYS.drafts); }
  };

  /* ---------- Error type ---------- */
  function ApiError(status, code, message) {
    this.name = "ApiError";
    this.status = status;   // HTTP status (0 = network failure)
    this.code = code;       // error.code from the backend envelope
    this.message = message;
  }
  ApiError.prototype = Object.create(Error.prototype);
  ApiError.prototype.constructor = ApiError;

  // Effective numeric status: HTTP status first, then a numeric error.code
  function statusOf(err) {
    if (err && err.status) return err.status;
    var n = Number(err && err.code);
    return isNaN(n) ? 0 : n;
  }

  /* ---------- Core request ---------- */
  function request(path, opts) {
    opts = opts || {};
    var method = opts.method || "GET";
    var auth = opts.auth !== false;

    var url = new URL(BASE_URL + path);
    if (opts.params) {
      Object.keys(opts.params).forEach(function (k) {
        var v = opts.params[k];
        if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
      });
    }

    var headers = { "Accept": "application/json" };
    if (auth) {
      var token = session.token();
      if (!token) {
        return Promise.reject(new ApiError(401, "NO_SESSION", "Your examination session has expired."));
      }
      headers["Authorization"] = "Bearer " + token;   // exam session token only
    }

    var init = {
      method: method,
      headers: headers,
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer"
    };
    if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(opts.body);
    }

    return fetch(url.toString(), init).then(
      function (res) {
        return res.json().catch(function () { return null; }).then(function (json) {
          var failed = !res.ok || (json && json.success === false);
          if (failed) {
            var e = (json && json.error) || {};
            throw new ApiError(
              res.status,
              e.code !== undefined ? e.code : null,
              e.message || ("Request failed (" + res.status + ").")
            );
          }
          if (json && Object.prototype.hasOwnProperty.call(json, "data")) return json.data;
          return json;
        });
      },
      function () {
        throw new ApiError(0, "NETWORK", "Unable to reach the server. Check your connection.");
      }
    );
  }

  function enc(s) { return encodeURIComponent(s); }

  /* ---------- Endpoints ---------- */

  // GET /exam/login?exam_id&email&password  (no Authorization)
  function examLogin(examId, email, password) {
    return request("/exam/login", {
      auth: false,
      params: { exam_id: examId, email: email, password: password }
    });
  }

  // GET /exam/{exam_id}
  function getExam(examId) {
    return request("/exam/" + enc(examId));
  }

  // GET /exam/{exam_id}/start   (starts or resumes; state-changing — call only from a user action)
  function startExam(examId) {
    return request("/exam/" + enc(examId) + "/start");
  }

  // GET /exam/{exam_id}/proctor/event   (NOT idempotent — never retried by callers)
  function sendProctorEvent(examId, ev) {
    return request("/exam/" + enc(examId) + "/proctor/event", {
      params: {
        event_type: ev.event_type,
        timestamp: ev.timestamp,
        duration: ev.duration,
        details: ev.details
      }
    });
  }

  // GET /exam/{exam_id}/submit?answers=<json>  — or POST when the paper is too large for a URL
  function submitExam(examId, answers) {
    var path = "/exam/" + enc(examId) + "/submit";
    var json = JSON.stringify(answers);
    if (encodeURIComponent(json).length > window.ExamConfig.MAX_SUBMIT_URL_PARAM_CHARS) {
      return request(path, { method: "POST", body: { answers: answers } });
    }
    return request(path, { params: { answers: json } });
  }

  // GET /exam/{exam_id}/result
  function getResult(examId) {
    return request("/exam/" + enc(examId) + "/result");
  }

  window.ExamApi = {
    ApiError: ApiError,
    statusOf: statusOf,
    session: session,
    examLogin: examLogin,
    getExam: getExam,
    startExam: startExam,
    sendProctorEvent: sendProctorEvent,
    submitExam: submitExam,
    getResult: getResult
  };
})();
