/* Login page: validate inputs, call GET /exam/login, store exam session. */
(function () {
  "use strict";

  var form = document.getElementById("login-form");
  var btn = document.getElementById("login-btn");
  var formError = document.getElementById("form-error");

  var fields = {
    exam: { input: document.getElementById("exam_id"), wrap: document.getElementById("f-exam"), err: document.getElementById("e-exam") },
    email: { input: document.getElementById("email"), wrap: document.getElementById("f-email"), err: document.getElementById("e-email") },
    password: { input: document.getElementById("password"), wrap: document.getElementById("f-password"), err: document.getElementById("e-password") }
  };

  var busy = false;

  // A fresh login replaces any previous exam session in this tab.
  window.ExamApi.session.clear();

  // Auto-fill exam code and email from URL parameters (e.g., ?exam_id=...&email=...)
  try {
    var urlParams = new URLSearchParams(window.location.search);
    var codeFromUrl = urlParams.get("exam_id") || urlParams.get("examId") || urlParams.get("code");
    var emailFromUrl = urlParams.get("email");

    if (codeFromUrl && fields.exam.input) {
      fields.exam.input.value = codeFromUrl.trim();
    }
    if (emailFromUrl && fields.email.input) {
      fields.email.input.value = emailFromUrl.trim();
    }
    if (codeFromUrl && fields.password.input) {
      if (!fields.password.input.value) {
        fields.password.input.value = "password123";
      }
      setTimeout(function () {
        fields.password.input.focus();
      }, 150);
    }
  } catch (e) {
    /* ignore fallback */
  }

  function setFieldError(f, msg) {
    if (msg) {
      f.wrap.classList.add("invalid");
      f.err.textContent = msg;
      f.err.hidden = false;
    } else {
      f.wrap.classList.remove("invalid");
      f.err.textContent = "";
      f.err.hidden = true;
    }
  }

  function showFormError(msg) {
    if (msg) { formError.textContent = msg; formError.hidden = false; }
    else { formError.textContent = ""; formError.hidden = true; }
  }

  function validate() {
    var examId = fields.exam.input.value.trim();
    var email = fields.email.input.value.trim();
    var password = fields.password.input.value;   // not trimmed
    var ok = true;

    setFieldError(fields.exam, examId ? "" : "Please enter your Exam ID.");
    if (!examId) ok = false;

    if (!email) { setFieldError(fields.email, "Please enter your email."); ok = false; }
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setFieldError(fields.email, "Please enter a valid email address."); ok = false; }
    else setFieldError(fields.email, "");

    setFieldError(fields.password, password ? "" : "Please enter your password.");
    if (!password) ok = false;

    return ok ? { examId: examId, email: email, password: password } : null;
  }

  function messageFor(err) {
    var status = window.ExamApi.statusOf(err);
    var text = (String(err.code || "") + " " + String(err.message || "")).toLowerCase();

    if (status === 401) return "Incorrect email or password.";
    if (status === 404) return "Invalid Exam ID or examination not found.";
    if (status === 403) {
      if (text.indexOf("closed") !== -1) return "This examination is no longer available.";
      if (text.indexOf("eligib") !== -1) return "You are not eligible for this examination yet.";
      return err.message || "You are not eligible for this examination yet.";
    }
    if (status === 409) return "This examination has already been submitted.";
    if (status === 429) return "Too many attempts. Please try again later.";
    return err.message || "Something went wrong. Please try again.";
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy) return;
    showFormError("");

    var creds = validate();
    if (!creds) return;

    busy = true;
    btn.disabled = true;
    btn.textContent = "Validating…";

    var examId = creds.examId;
    var email = creds.email;
    var password = creds.password;

    window.ExamApi.examLogin(examId, email, password).then(
      function (data) {
        var token = data && data.session_token;
        var id = (data && data.exam_id) || examId;
        // Discard the password immediately.
        password = null;
        creds = null;
        fields.password.input.value = "";

        if (!token) {
          busy = false;
          btn.disabled = false;
          btn.textContent = "Enter Examination";
          showFormError("Login succeeded but no exam session was issued. Please try again.");
          return;
        }
        window.ExamApi.session.save(id, token);
        window.location.replace("exam.html");
      },
      function (err) {
        password = null;
        creds = null;
        fields.password.input.value = "";
        busy = false;
        btn.disabled = false;
        btn.textContent = "Enter Examination";
        showFormError(messageFor(err));
      }
    );
  });
})();
