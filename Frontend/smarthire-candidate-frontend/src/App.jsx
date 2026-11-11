import React, { useEffect, useState } from "react";
import {
  Routes,
  Route,
  Navigate,
  Link,
  useNavigate,
  useParams,
  useLocation,
} from "react-router-dom";

import {
  Home,
  BriefcaseBusiness,
  FileText,
  UserRound,
  LogOut,
  Menu,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  CalendarDays,
  UploadCloud,
  X,
  Clock3,
  Check,
  XCircle,
  ChevronRight,
  Copy,
  ExternalLink,
  Sparkles,
} from "lucide-react";

import {
  api,
  BASE_URL,
  clearSession,
  getSession,
  saveSession,
} from "./api";

/* =========================================================
   HELPERS
========================================================= */

const A = (v) => {
  if (Array.isArray(v)) return v;

  if (v && typeof v === "object") {
    if (Array.isArray(v.items)) return v.items;
    if (Array.isArray(v.applications)) return v.applications;
    if (Array.isArray(v.jobs)) return v.jobs;
    if (Array.isArray(v.data)) return v.data;

    return Object.values(v);
  }

  return [];
};

const id = (a) =>
  a?.app_id ||
  a?.application_id ||
  a?.id ||
  "";

const title = (a) =>
  a?.job?.title ||
  a?.job_title ||
  a?.job?.job_title ||
  a?.title ||
  a?.role ||
  "Job";

const company = (a) =>
  a?.job?.company ||
  a?.company ||
  a?.company_name ||
  a?.job?.company_name ||
  "";

const status = (a) =>
  a?.status ||
  a?.application_status ||
  a?.application?.status ||
  "";

const stage = (a) =>
  a?.current_stage ||
  a?.stage ||
  a?.rejection?.stage ||
  a?.rejected_at_stage ||
  a?.rejection_stage ||
  "";

const act = (a) =>
  a?.next_action ||
  a?.nextAction ||
  "";

const fmt = (v) => {
  if (!v) return "";

  try {
    return new Date(v).toLocaleString();
  } catch {
    return String(v);
  }
};

const isRejected = (a) => {
  const s = String(status(a)).toUpperCase();

  return (
    s.includes("REJECT") ||
    s.includes("REJECTED") ||
    s.includes("FAIL") ||
    s.includes("FAILED")
  );
};

const isAccepted = (a) => {
  const s = String(status(a)).toUpperCase();

  return (
    s.includes("ACCEPT") ||
    s.includes("SELECT") ||
    s === "HIRED" ||
    s === "OFFERED"
  );
};

/*
  Stage-specific rejection messages.

  Backend rejection.reason is preferred if available.
  Otherwise the frontend gives a message according to
  the stage at which the candidate was rejected.
*/
function getRejectionMessage(a) {
  const backendReason =
    a?.rejection?.reason ||
    a?.rejection_reason ||
    a?.reason ||
    a?.rejectionReason ||
    a?.status_reason ||
    "";

  if (backendReason) {
    return backendReason;
  }

  const st = String(stage(a)).toUpperCase();

  if (
    st.includes("RESUME") ||
    st.includes("SCREEN") ||
    st.includes("CV")
  ) {
    return (
      "Thank you for your application. After reviewing your resume, " +
      "we found that your profile does not sufficiently match the " +
      "requirements of this position."
    );
  }

  if (
    st.includes("ASSESSMENT") ||
    st.includes("EXAM") ||
    st.includes("TEST")
  ) {
    return (
      "Thank you for completing the assessment. Although your resume " +
      "was shortlisted, your assessment score did not meet the " +
      "required cutoff for the next stage."
    );
  }

  if (
    st.includes("INTERVIEW") ||
    st.includes("TECHNICAL") ||
    st.includes("HR")
  ) {
    return (
      "Thank you for participating in the interview process. After " +
      "evaluating your interview performance, we have decided not " +
      "to proceed with your application for the next stage."
    );
  }

  return (
    "Thank you for your application. After careful consideration, " +
    "we have decided not to proceed with your application at this time."
  );
}

function getRejectionStage(a) {
  const st = String(stage(a)).toUpperCase();

  if (
    st.includes("RESUME") ||
    st.includes("SCREEN") ||
    st.includes("CV")
  ) {
    return "Resume Screening";
  }

  if (
    st.includes("ASSESSMENT") ||
    st.includes("EXAM") ||
    st.includes("TEST")
  ) {
    return "Assessment";
  }

  if (
    st.includes("INTERVIEW") ||
    st.includes("TECHNICAL") ||
    st.includes("HR")
  ) {
    return "Interview";
  }

  return stage(a) || "Hiring Process";
}

/* =========================================================
   ERROR BOUNDARY
========================================================= */

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "40px 20px", textAlign: "center", maxWidth: "600px", margin: "60px auto", fontFamily: "sans-serif" }}>
          <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "#fee2e2", color: "#dc2626", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
            <AlertCircle size={30} />
          </div>
          <h2 style={{ fontSize: "20px", color: "#1e293b", margin: "0 0 8px 0" }}>Unable to display page</h2>
          <p style={{ color: "#64748b", fontSize: "14px", margin: "0 0 24px 0" }}>
            {this.state.error?.message || "An unexpected error occurred while rendering this page."}
          </p>
          <button
            onClick={() => { this.setState({ hasError: false }); window.location.href = "/dashboard"; }}
            className="btn dark"
            style={{ display: "inline-flex", alignItems: "center", gap: "8px", margin: "0 auto" }}
          >
            <RefreshCw size={14} /> Return to Dashboard
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* =========================================================
   APP
========================================================= */

export default function App() {
  const [s, setS] = useState(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const token = p.get("session_token") || p.get("token");
      if (token) {
        const sess = {
          session_token: token,
          user_id: p.get("user_id") || "usr_cand",
          role: "candidate",
          name: p.get("name") || "Candidate",
          email: p.get("email") || "candidate@example.com",
          resume_uploaded: true,
          resume_filename: "resume.pdf"
        };
        saveSession(sess);
        window.history.replaceState({}, document.title, window.location.pathname);
        return sess;
      }
    } catch (e) {}
    return getSession();
  });

  useEffect(() => {
    const f = () => setS(null);

    window.addEventListener(
      "smarthire:session-expired",
      f
    );

    return () => {
      window.removeEventListener(
        "smarthire:session-expired",
        f
      );
    };
  }, []);

  if (!s) {
    return (
      <Routes>
        <Route
          path="/login"
          element={<Login onOk={setS} />}
        />

        <Route
          path="*"
          element={
            <Navigate
              to="/login"
              replace
            />
          }
        />
      </Routes>
    );
  }

  if (s.role !== "candidate") {
    return (
      <div className="center">
        <div className="empty">
          <XCircle size={34} />

          <h2>Candidate access required</h2>

          <Link
            className="btn secondary"
            to="/login"
          >
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <Shell
      s={s}
      logout={() => {
        clearSession();
        setS(null);
      }}
    >
      <ErrorBoundary>
        <Routes>
          <Route
            path="/dashboard"
            element={<Dashboard />}
          />

          <Route
            path="/jobs"
            element={<Jobs />}
          />

          <Route
            path="/jobs/:jd"
            element={<Job />}
          />

          <Route
            path="/applications"
            element={<Applications />}
          />

          <Route
            path="/applications/:id"
            element={<Application />}
          />

          <Route
            path="/profile"
            element={<Profile />}
          />

          <Route
            path="*"
            element={
              <Navigate
                to="/dashboard"
                replace
              />
            }
          />
        </Routes>
      </ErrorBoundary>
    </Shell>
  );
}

/* =========================================================
   LOGIN
========================================================= */

function Login({ onOk }) {
  const navigate = useNavigate();

  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setE] = useState("");
  const [pass, setP] = useState("");
  const [load, setL] = useState(false);
  const [err, setErr] = useState("");

  const fillDemo = () => {
    setE("candidate_test_1@example.com");
    setP("Password1234");
    setErr("");
  };

  async function go(e) {
    e.preventDefault();

    if (!email || !pass) {
      setErr("Enter your email and password.");
      return;
    }

    if (mode === "signup" && !name.trim()) {
      setErr("Enter your full name.");
      return;
    }

    setL(true);
    setErr("");

    try {
      let d;
      if (mode === "signup") {
        d = await api.signup(email, pass, name.trim());
      } else {
        d = await api.login(email, pass);
      }

      d = d?.data || d;

      const s = {
        session_token:
          d?.session_token ||
          d?.token ||
          d?.access_token ||
          "",

        user_id:
          d?.user_id ||
          "",

        name:
          d?.name ||
          d?.candidate?.name ||
          name ||
          "",

        email:
          d?.email ||
          email,

        role:
          d?.role ||
          "candidate",
      };

      if (s.role !== "candidate") {
        setErr(
          "This account is not authorized for the Candidate Portal."
        );
        return;
      }

      saveSession(s);
      onOk(s);

      navigate("/dashboard");
    } catch (e) {
      setErr(
        e?.message ||
        (mode === "signup" ? "Unable to create account." : "Unable to sign in.")
      );
    } finally {
      setL(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-art">
        <Brand />

        <div>
          <span className="eyebrow">
            CANDIDATE PORTAL
          </span>

          <h1>
            Your next opportunity starts here.
          </h1>

          <p>
            Find jobs, manage your resume and
            track your hiring journey from one
            workspace.
          </p>
        </div>
      </div>

      <div className="auth-form">
        <div className="login">
          <div className="mobile-brand">
            <Brand dark />
          </div>

          <span className="eyebrow">
            {mode === "signup" ? "GET STARTED" : "WELCOME BACK"}
          </span>

          <h2>
            {mode === "signup" ? "Create Candidate Account" : "Sign in to SmartHire"}
          </h2>

          <p>
            {mode === "signup"
              ? "Register to browse jobs and submit your application."
              : "Sign in with your email and password."}
          </p>

          <form onSubmit={go}>
            {mode === "signup" && (
              <Field label="Full Name">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Jane Doe"
                  required
                />
              </Field>
            )}

            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) =>
                  setE(e.target.value)
                }
                placeholder="you@example.com"
                required
              />
            </Field>

            <Field label="Password">
              <input
                type="password"
                value={pass}
                onChange={(e) =>
                  setP(e.target.value)
                }
                placeholder={mode === "signup" ? "At least 8 characters" : "Enter your password"}
                required
              />
            </Field>

            {err && (
              <Alert message={err} />
            )}

            <button
              className="btn dark full"
              disabled={load}
            >
              {load && <Spin />}

              {load
                ? (mode === "signup" ? "Creating account..." : "Signing in...")
                : (mode === "signup" ? "Create Account" : "Login")}

              {!load && (
                <ArrowRight size={15} />
              )}
            </button>
          </form>

          <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setErr("");
              }}
              style={{
                background: "none",
                border: "none",
                color: "#2563eb",
                cursor: "pointer",
                fontSize: "0.88rem",
                textDecoration: "underline",
                padding: 0
              }}
            >
              {mode === "login"
                ? "Don't have an account? Sign up here"
                : "Already have an account? Sign in here"}
            </button>

            {mode === "login" && (
              <button
                type="button"
                onClick={fillDemo}
                style={{
                  background: "#f1f5f9",
                  border: "1px dashed #94a3b8",
                  borderRadius: "6px",
                  color: "#334155",
                  cursor: "pointer",
                  fontSize: "0.82rem",
                  padding: "0.45rem 0.75rem",
                  fontWeight: 500
                }}
              >
                ⚡ Autofill Demo Account (candidate_test_1@example.com)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   SHELL
========================================================= */

function Shell({
  s,
  logout,
  children,
}) {
  const [open, setOpen] =
    useState(false);

  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <div className="shell">
      <aside
        className={
          open
            ? "side open"
            : "side"
        }
      >
        <div className="side-brand">
          <Brand />

          <span>
            CANDIDATE PORTAL
          </span>
        </div>

        <nav>
          <Nav
            to="/dashboard"
            icon={Home}
          >
            Dashboard
          </Nav>

          <Nav
            to="/jobs"
            icon={BriefcaseBusiness}
          >
            Find Jobs
          </Nav>

          <Nav
            to="/applications"
            icon={FileText}
          >
            My Applications
          </Nav>

          <Nav
            to="/profile"
            icon={UserRound}
          >
            Profile
          </Nav>
        </nav>

        <div className="side-bottom">
          <div className="mini">
            <Avatar
              name={
                s.name ||
                s.email
              }
            />

            <div>
              <b>
                {s.name ||
                  "Candidate"}
              </b>

              <small>
                {s.email}
              </small>
            </div>
          </div>

          <button onClick={logout}>
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </aside>

      {open && (
        <div
          className="overlay"
          onClick={() =>
            setOpen(false)
          }
        />
      )}

      <main>
        <header className="mobile">
          <button
            onClick={() =>
              setOpen(true)
            }
          >
            <Menu />
          </button>

          <b>SmartHire</b>
        </header>

        {children}
      </main>
    </div>
  );
}

function Nav({
  to,
  icon: I,
  children,
}) {
  const location =
    useLocation();

  return (
    <Link
      className={
        location.pathname.startsWith(to)
          ? "nav active"
          : "nav"
      }
      to={to}
    >
      <I size={17} />
      {children}
    </Link>
  );
}

/* =========================================================
   BASIC UI
========================================================= */

function Brand({
  dark = false,
}) {
  return (
    <div
      className={
        dark
          ? "brand darkbrand"
          : "brand"
      }
    >
      <span>S</span>
      SmartHire
    </div>
  );
}

function Avatar({ name }) {
  return (
    <div className="avatar">
      {(name || "C")
        .slice(0, 1)
        .toUpperCase()}
    </div>
  );
}

function Page({
  title: ti,
  sub,
  children,
  action,
}) {
  return (
    <div className="page">
      <div className="head">
        <div>
          <h1>{ti}</h1>

          {sub && (
            <p>{sub}</p>
          )}
        </div>

        {action}
      </div>

      {children}
    </div>
  );
}

function Field({
  label,
  children,
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Alert({
  message,
  success = false,
}) {
  return (
    <div
      className={
        success
          ? "alert success"
          : "alert"
      }
    >
      {success ? (
        <CheckCircle2 size={15} />
      ) : (
        <AlertCircle size={15} />
      )}

      {message}
    </div>
  );
}

function Spin() {
  return <i className="spin" />;
}

function Loading({
  text = "Loading...",
}) {
  return (
    <div className="loading">
      <Spin />
      {text}
    </div>
  );
}

function Empty({
  icon: I = FileText,
  title: ti,
  text,
  children,
}) {
  return (
    <div className="empty">
      <I size={30} />

      <h3>{ti}</h3>

      <p>{text}</p>

      {children}
    </div>
  );
}

function Panel({
  title: ti,
  sub,
  children,
  right,
}) {
  return (
    <section className="panel">
      {(ti || sub || right) && (
        <div className="panel-head">
          <div>
            {ti && <h2>{ti}</h2>}
            {sub && <p>{sub}</p>}
          </div>

          {right}
        </div>
      )}

      {children}
    </section>
  );
}

function Status({ v }) {
  const s =
    String(v || "").toUpperCase();

  const c =
    s.includes("PASS") ||
    s.includes("ACCEPT") ||
    s.includes("SELECT") ||
    s === "HIRED"
      ? "green"
      : s.includes("REJECT") ||
        s.includes("FAIL")
      ? "red"
      : s.includes("HOLD") ||
        s.includes("SCREEN") ||
        s.includes("PROGRESS") ||
        s.includes("PENDING")
      ? "amber"
      : "gray";

  return (
    <span
      className={
        "status " + c
      }
    >
      {v || "—"}
    </span>
  );
}

/* =========================================================
   DASHBOARD
========================================================= */

function Dashboard() {
  const [d, setD] =
    useState(null);

  const [apps, setA] =
    useState([]);

  const [load, setL] =
    useState(true);

  const [err, setErr] =
    useState("");

  async function get() {
    setL(true);
    setErr("");

    try {
      const [dashboardData, applicationsData] =
        await Promise.all([
          api.dashboard(),
          api.applications(),
        ]);

      setD(
        dashboardData || {}
      );

      setA(
        A(applicationsData)
      );
    } catch (e) {
      setErr(
        e?.message ||
        "Unable to load dashboard."
      );
    } finally {
      setL(false);
    }
  }

  useEffect(() => {
    get();
  }, []);

  const c =
    d?.analytics ||
    d?.counters ||
    d ||
    {};

  const value = (keys) => {
    const key =
      keys.find(
        (x) =>
          c[x] != null
      );

    return key
      ? c[key]
      : "—";
  };

  const action =
    d?.next_action ||
    apps.find((x) =>
      act(x)
    );

  return (
    <Page
      title={`Good ${
        new Date().getHours() < 12
          ? "morning"
          : new Date().getHours() < 18
          ? "afternoon"
          : "evening"
      }, ${
        d?.name ||
        getSession()?.name ||
        "there"
      } 👋`}
      sub="Your hiring overview and current actions."
      action={
        <button
          className="btn secondary"
          onClick={get}
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      }
    >
      {err && (
        <Alert message={err} />
      )}

      <div className="stats">
        <Stat
          t="Applications"
          v={
            load
              ? "—"
              : value([
                  "applications",
                  "application_count",
                  "total_applications",
                ])
          }
          I={FileText}
        />

        <Stat
          t="In Progress"
          v={value([
            "in_progress",
            "in_progress_count",
          ])}
          I={Clock3}
        />

        <Stat
          t="Exams Available"
          v={value([
            "exams_available",
            "exams_count",
          ])}
          I={ShieldCheck}
        />

        <Stat
          t="Awaiting Results"
          v={value([
            "awaiting_results",
            "awaiting_results_count",
          ])}
          I={RefreshCw}
        />

        <Stat
          t="Accepted"
          v={value([
            "accepted",
            "accepted_count",
          ])}
          I={CheckCircle2}
        />
      </div>

      <Panel
        title="Current action"
        sub="The most important pending action returned by SmartHire."
      >
        {load ? (
          <Loading text="Loading dashboard..." />
        ) : action ? (
          <Action a={action} />
        ) : (
          <Empty
            icon={CheckCircle2}
            title="You're all caught up"
            text="No pending candidate action was returned."
          />
        )}
      </Panel>

      <Panel
        title="Recent applications"
        sub="Your latest applications."
        right={
          <Link to="/applications">
            View all
            <ChevronRight size={13} />
          </Link>
        }
      >
        {load ? (
          <Loading text="Loading applications..." />
        ) : apps.length ? (
          <AppList
            apps={apps.slice(0, 5)}
          />
        ) : (
          <Empty
            title="No applications yet"
            text="Find an opportunity and apply today."
          >
            <Link
              className="btn dark"
              to="/jobs"
            >
              Browse Jobs
            </Link>
          </Empty>
        )}
      </Panel>
    </Page>
  );
}

function Stat({
  t,
  v,
  I,
}) {
  let displayValue = v;

  if (Array.isArray(v)) {
    displayValue = v.length;
  } else if (
    v !== null &&
    typeof v === "object"
  ) {
    displayValue =
      v.count ??
      v.total ??
      v.value ??
      v.length ??
      "—";
  }

  return (
    <div className="stat">
      <div>
        <I size={16} />
      </div>

      <span>{t}</span>

      <b>{displayValue}</b>
    </div>
  );
}

function Action({ a }) {
  const aid = id(a);

  return (
    <div className="action">
      <div className="action-icon">
        <ShieldCheck />
      </div>

      <div className="grow">
        <span className="eyebrow">
          NEXT ACTION
        </span>

        <h3>
          {a?.action_title ||
            (act(a) ===
            "EXAM_AVAILABLE"
              ? "Written assessment is ready"
              : "Application update")}
        </h3>

        <p>
          {a?.message ||
            a?.next_action_message ||
            "Your application has an action waiting for you."}
        </p>
      </div>

      {aid && (
        <Link
          className="btn dark"
          to={`/applications/${aid}`}
        >
          {act(a) ===
          "EXAM_AVAILABLE"
            ? "Start Assessment"
            : "View Application"}

          <ArrowRight size={14} />
        </Link>
      )}
    </div>
  );
}

function AppList({
  apps,
}) {
  return (
    <div>
      {apps.map((a, i) => (
        <Link
          className="app-row"
          key={id(a) || i}
          to={
            id(a)
              ? `/applications/${id(a)}`
              : "/applications"
          }
        >
          <div className="job-icon">
            <BriefcaseBusiness size={16} />
          </div>

          <div className="grow">
            <b>{title(a)}</b>

            <span>
              {company(a) ||
                "Company"}
            </span>

            <small>
              {a?.applied_at
                ? fmt(a.applied_at)
                : a?.created_at
                ? fmt(a.created_at)
                : ""}
            </small>
          </div>

          <Status
            v={status(a)}
          />

          <ChevronRight size={16} />
        </Link>
      ))}
    </div>
  );
}

/* =========================================================
   JOBS
========================================================= */

function Jobs() {
  const [jobs, setJ] =
    useState([]);

  const [cursor, setC] =
    useState(null);

  const [q, setQ] =
    useState("");

  const [load, setL] =
    useState(true);

  const [err, setE] =
    useState("");

  useEffect(() => {
    let cancelled = false;

    const t = setTimeout(
      async () => {
        setL(true);
        setE("");

        try {
          const d = q.trim()
            ? await api.search(
                q.trim()
              )
            : await api.jobs();

          if (cancelled) return;

          const list =
            d?.jobs ||
            d?.items ||
            d?.data ||
            d;

          setJ(A(list));

          setC(
            d?.cursor ||
              d?.next_cursor ||
              null
          );
        } catch (e) {
          if (!cancelled) {
            setE(
              e?.message ||
              "Unable to load jobs."
            );
          }
        } finally {
          if (!cancelled) {
            setL(false);
          }
        }
      },
      q ? 450 : 0
    );

    return () =>
      clearTimeout(t);
  }, [q]);

  async function more() {
    if (!cursor) return;

    try {
      const d =
        await api.jobs(cursor);

      const next =
        d?.jobs ||
        d?.items ||
        d?.data ||
        d;

      setJ((x) => [
        ...x,
        ...A(next),
      ]);

      setC(
        d?.cursor ||
          d?.next_cursor ||
          null
      );
    } catch (e) {
      setE(
        e?.message ||
        "Unable to load more jobs."
      );
    }
  }

  return (
    <Page
      title="Find your next opportunity"
      sub="Browse live positions available on SmartHire."
    >
      {err && (
        <Alert message={err} />
      )}

      <div className="search">
        <Search size={16} />

        <input
          placeholder="Search jobs..."
          value={q}
          onChange={(e) =>
            setQ(e.target.value)
          }
        />
      </div>

      {load ? (
        <Loading text="Loading jobs..." />
      ) : (
        <div className="jobs">
          {jobs.length ? (
            jobs.map((j, i) => (
              <JobCard
                key={
                  j?.jd_id ||
                  j?.id ||
                  i
                }
                j={j}
              />
            ))
          ) : (
            <Empty
              icon={
                BriefcaseBusiness
              }
              title={
                q
                  ? "No jobs match your search"
                  : "No open positions available"
              }
              text={
                q
                  ? "Try another search."
                  : "Check back later for new opportunities."
              }
            />
          )}
        </div>
      )}

      {cursor && !q && (
        <div className="center">
          <button
            className="btn secondary"
            onClick={more}
          >
            Load more
          </button>
        </div>
      )}
    </Page>
  );
}

function JobCard({ j }) {
  const jid =
    j?.jd_id ||
    j?.id;

  return (
    <Link
      className="job-card"
      to={
        jid
          ? `/jobs/${jid}`
          : "/jobs"
      }
    >
      <div className="job-top">
        <div className="job-icon">
          <BriefcaseBusiness size={17} />
        </div>

        <span>OPEN</span>
      </div>

      <h3>
        {title(j)}
      </h3>

      <p>
        {company(j) ||
          "Company"}
      </p>

      <article>
        {j?.description ||
          j?.job_description ||
          j?.summary ||
          "View job details for this opportunity."}
      </article>

      <footer>
        {j?.location ||
          "Location not specified"}

        {j?.deadline && (
          <em>
            <CalendarDays size={12} />
            {fmt(j.deadline)}
          </em>
        )}
      </footer>

      <strong>
        View Job
        <ArrowRight size={13} />
      </strong>
    </Link>
  );
}

/* =========================================================
   JOB DETAILS / APPLY
========================================================= */

function Job() {
  const { jd } =
    useParams();

  const navigate =
    useNavigate();

  const [j, setJ] =
    useState(null);

  const [load, setL] =
    useState(true);

  const [err, setE] =
    useState("");

  const [apply, setApply] =
    useState(false);

  const [done, setDone] =
    useState(null);

  const [sending, setSending] =
    useState(false);

  useEffect(() => {
    let cancelled = false;

    setL(true);
    setE("");

    api.job(jd)
      .then((data) => {
        if (!cancelled) {
          setJ(
            data?.job ||
              data
          );
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setE(
            e?.message ||
            "Unable to load job."
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setL(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [jd]);

  async function go() {
    setSending(true);
    setE("");

    try {
      const result =
        await api.apply(jd);

      setDone(
        result?.application ||
          result
      );

      setApply(false);
    } catch (e) {
      setE(
        e?.message ||
        "Unable to submit application."
      );
    } finally {
      setSending(false);
    }
  }

  if (load) {
    return (
      <Page
        title="Job details"
        action={
          <button
            className="btn secondary"
            onClick={() =>
              navigate("/jobs")
            }
          >
            <ArrowLeft size={14} />
            Back
          </button>
        }
      >
        <Loading text="Loading job..." />
      </Page>
    );
  }

  if (!j) {
    return (
      <Page title="Job details">
        <Alert
          message={
            err ||
            "Job not found."
          }
        />
      </Page>
    );
  }

  const aid =
    done?.app_id ||
    done?.application_id ||
    done?.id;

  return (
    <Page
      title="Job details"
      sub={
        company(j) ||
        "SmartHire opportunity"
      }
      action={
        <button
          className="btn secondary"
          onClick={() =>
            navigate("/jobs")
          }
        >
          <ArrowLeft size={14} />
          Back
        </button>
      }
    >
      {err && (
        <Alert message={err} />
      )}

      {done ? (
        <Panel>
          <div className="success-big">
            <CheckCircle2 size={40} />

            <h2>
              Application submitted!
            </h2>

            <p>
              Your application has
              been received.
              Screening is running
              in the background.
            </p>

            <Link
              className="btn dark"
              to={
                aid
                  ? `/applications/${aid}`
                  : "/applications"
              }
            >
              View Application
            </Link>
          </div>
        </Panel>
      ) : (
        <Panel>
          <div className="job-head">
            <div className="job-icon large">
              <BriefcaseBusiness />
            </div>

            <div>
              <span className="eyebrow">
                OPEN POSITION
              </span>

              <h2>
                {title(j)}
              </h2>

              <p>
                {company(j) ||
                  "Company"}

                {j?.location
                  ? ` · ${j.location}`
                  : ""}
              </p>
            </div>
          </div>

          <div className="job-content">
            <div>
              <h3>
                Job Description
              </h3>

              <div className="prose">
                {j?.description ||
                  j?.job_description ||
                  "No job description was returned."}
              </div>
            </div>

            <aside>
              <div className="info">
                <span>
                  Assessment
                </span>

                <b>
                  {j?.assessment
                    ?.questions ||
                    j?.assessment
                      ?.question_count ||
                    "—"}{" "}
                  questions
                </b>

                <small>
                  {j?.assessment
                    ?.marks ||
                    j?.assessment
                      ?.total_marks ||
                    "—"}{" "}
                  marks
                </small>
              </div>

              <div className="info">
                <span>
                  Application deadline
                </span>

                <b>
                  {j?.deadline
                    ? fmt(j.deadline)
                    : "Not specified"}
                </b>
              </div>

              <button
                className="btn dark full"
                onClick={() =>
                  setApply(true)
                }
              >
                Apply Now
                <ArrowRight size={14} />
              </button>
            </aside>
          </div>
        </Panel>
      )}

      {apply && (
        <ApplyModal
          close={() =>
            !sending &&
            setApply(false)
          }
          go={go}
          load={sending}
        />
      )}
    </Page>
  );
}

function ApplyModal({
  close,
  go,
  load,
}) {
  const [resume, setResume] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  useEffect(() => {
    let cancelled = false;

    api.me()
      .then((d) => {
        if (cancelled) return;

        const r =
          d?.resume ||
          d?.candidate?.resume ||
          d?.resume_name ||
          d?.resume_file ||
          d?.resume_filename ||
          null;

        setResume(r);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(
            e?.message ||
            "Unable to check your resume."
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const resumeName =
    typeof resume === "string"
      ? resume
      : resume?.name ||
        resume?.filename ||
        resume?.file_name ||
        resume?.original_name ||
        "";

  return (
    <div className="modal-bg">
      <div className="modal">
        <button
          className="close"
          onClick={close}
        >
          <X />
        </button>

        <div className="modal-icon">
          <FileText />
        </div>

        <h2>
          Apply with your saved resume?
        </h2>

        <p>
          The current saved resume
          will be used for this
          application.
        </p>

        {error && (
          <Alert message={error} />
        )}

        <div className="resume">
          {loading ? (
            <Loading text="Checking resume..." />
          ) : (
            <>
              <FileText size={18} />

              <div className="grow">
                <b>
                  {resumeName ||
                    "No resume uploaded"}
                </b>

                <small>
                  {resumeName
                    ? "Current saved resume"
                    : "Upload a resume from Profile first."}
                </small>
              </div>
            </>
          )}
        </div>

        <div className="modal-actions">
          <button
            className="btn secondary"
            onClick={close}
            disabled={load}
          >
            Cancel
          </button>

          <button
            className="btn dark"
            disabled={
              !resumeName ||
              loading ||
              load
            }
            onClick={go}
          >
            {load && <Spin />}

            {load
              ? "Submitting..."
              : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   APPLICATIONS LIST
========================================================= */

function Applications() {
  const [apps, setA] =
    useState([]);

  const [load, setL] =
    useState(true);

  const [err, setE] =
    useState("");

  async function get() {
    setL(true);
    setE("");

    try {
      const data =
        await api.applications();

      setA(A(data));
    } catch (e) {
      setE(
        e?.message ||
        "Unable to load applications."
      );
    } finally {
      setL(false);
    }
  }

  useEffect(() => {
    get();
  }, []);

  return (
    <Page
      title="My applications"
      sub="Track your applications and hiring stages."
      action={
        <button
          className="btn secondary"
          onClick={get}
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      }
    >
      {err && (
        <Alert message={err} />
      )}

      <Panel
        title="Applications"
        sub="Your own application history."
      >
        {load ? (
          <Loading text="Loading applications..." />
        ) : apps.length ? (
          <AppList apps={apps} />
        ) : (
          <Empty
            title="No applications yet"
            text="Find an opportunity and apply today."
          >
            <Link
              className="btn dark"
              to="/jobs"
            >
              Browse Jobs
            </Link>
          </Empty>
        )}
      </Panel>
    </Page>
  );
}

/* =========================================================
   APPLICATION DETAILS
========================================================= */

function Application() {
  const { id: aid } =
    useParams();

  const navigate =
    useNavigate();

  const [a, setA] =
    useState(null);

  const [r, setR] =
    useState(null);

  const [load, setL] =
    useState(true);

  const [err, setE] =
    useState("");

  const [withd, setW] =
    useState(false);

  const [testingLlm, setTestingLlm] =
    useState(false);

  const [llmTestMsg, setLlmTestMsg] =
    useState("");

  const [copiedCode, setCopiedCode] =
    useState(false);

  async function testLlmScreening(targetScore = 85, threshold = 70) {
    setTestingLlm(true);
    setLlmTestMsg("");
    setE("");

    try {
      const res = await api.testLlm({ score: targetScore, threshold });
      const data = res?.data || res;
      if (data?.passed) {
        setLlmTestMsg(
          `✓ LLM match score (${data.score}%) cleared the threshold (${data.threshold}%)! Examination code generated: ${data.code_to_enter}`
        );
      } else {
        setLlmTestMsg(
          `✗ LLM match score (${data.score}%) was below the required threshold (${data.threshold}%).`
        );
      }
      await get();
    } catch (e) {
      setE(e?.message || "Failed to execute LLM screening test.");
    } finally {
      setTestingLlm(false);
    }
  }

  function copyCode(code) {
    if (!code) return;
    try {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(code);
      }
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    } catch {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    }
  }

  async function get() {
    setL(true);
    setE("");

    try {
      const x =
        await api.application(aid);

      const application =
        x?.application ||
        x;

      setA(application);

      const s =
        String(
          status(application)
        ).toUpperCase();

      if (
        s.includes("SCOR") ||
        s.includes("RESULT") ||
        application?.result_pending
      ) {
        try {
          const z =
            await api.result(aid);

          setR(
            z?.result ||
              z
          );
        } catch {
          // Result may not be available yet.
        }
      }
    } catch (e) {
      setE(
        e?.message ||
        "Unable to load application."
      );
    } finally {
      setL(false);
    }
  }

  useEffect(() => {
    get();

    const t =
      setInterval(
        async () => {
          try {
            const z =
              await api.result(aid);

            const result =
              z?.result ||
              z;

            setR(result);

            if (
              result?.scored === true ||
              result?.score != null
            ) {
              clearInterval(t);
            }
          } catch {
            // Ignore while result is unavailable.
          }
        },
        5000
      );

    return () =>
      clearInterval(t);
  }, [aid]);

  async function withdraw() {
    setW(true);
    setE("");

    try {
      await api.withdraw(aid);

      navigate(
        "/applications"
      );
    } catch (e) {
      setE(
        e?.message ||
        "Unable to withdraw application."
      );
    } finally {
      setW(false);
    }
  }

  if (load) {
    return (
      <Page title="Application">
        <Loading text="Loading application..." />
      </Page>
    );
  }

  if (!a) {
    return (
      <Page title="Application">
        <Alert
          message={
            err ||
            "Application not found."
          }
        />
      </Page>
    );
  }

  const s =
    String(
      status(a) || ""
    ).toUpperCase();

  const st =
    String(
      stage(a) || ""
    ).toUpperCase();

  const exam =
    a?.exam_id ||
    a?.exam?.exam_id;

  const ext =
    import.meta.env
      .VITE_EXAM_APP_URL;

  const canExam =
    (
      a?.next_action === "EXAM_AVAILABLE" ||
      s === "EXAM_AVAILABLE" ||
      s === "SCREENING_PASSED" ||
      a?.exam?.eligible === true
    ) && exam;

  const rejected =
    isRejected(a);

  const accepted =
    isAccepted(a);

  return (
    <Page
      title={title(a)}
      sub={
        company(a) ||
        "Application"
      }
      action={
        <button
          className="btn secondary"
          onClick={() =>
            navigate(
              "/applications"
            )
          }
        >
          <ArrowLeft size={14} />
          Back
        </button>
      }
    >
      {err && (
        <Alert message={err} />
      )}

      {/* =================================================
          REJECTION MESSAGE
      ================================================= */}

      {rejected && (
        <Panel>
          <div className="rejection-panel">
            <div className="rejection-icon">
              <XCircle />
            </div>

            <div className="grow">
              <span className="eyebrow">
                APPLICATION UPDATE
              </span>

              <h2>
                Application not selected
              </h2>

              <p className="rejection-stage">
                Rejected at:{" "}
                <strong>
                  {getRejectionStage(a)}
                </strong>
              </p>

              <div className="rejection-reason">
                <h3>
                  Why was my application rejected?
                </h3>

                <p>
                  {getRejectionMessage(a)}
                </p>
              </div>
            </div>
          </div>
        </Panel>
      )}

      {/* =================================================
          ACCEPTED MESSAGE
      ================================================= */}

      {accepted && (
        <Panel>
          <div className="accepted-panel">
            <div className="accepted-icon">
              <CheckCircle2 />
            </div>

            <div>
              <span className="eyebrow">
                APPLICATION UPDATE
              </span>

              <h2>
                Congratulations! 🎉
              </h2>

              <p>
                You have successfully completed
                the hiring process and your
                application has been selected.
              </p>

              <small>
                Our recruitment team will contact
                you with the next steps.
              </small>
            </div>
          </div>
        </Panel>
      )}

      {/* =================================================
          APPLICATION SUMMARY
      ================================================= */}

      <Panel>
        <div className="application-hero">
          <div className="job-icon large">
            <BriefcaseBusiness />
          </div>

          <div className="grow">
            <h2>
              {title(a)}
            </h2>

            <p>
              {company(a) ||
                "Company"}

              {a?.applied_at
                ? ` · Applied ${fmt(
                    a.applied_at
                  )}`
                : a?.created_at
                ? ` · Applied ${fmt(
                    a.created_at
                  )}`
                : ""}
            </p>

            {stage(a) && (
              <small className="application-stage">
                Current stage:{" "}
                <strong>
                  {stage(a)}
                </strong>
              </small>
            )}
          </div>

          <Status
            v={status(a)}
          />
        </div>
      </Panel>

      {/* =================================================
          TIMELINE
      ================================================= */}

      <Panel
        title="Application timeline"
        sub="Generated from your application status."
      >
        <Timeline a={a} />
      </Panel>

      {/* =================================================
          AI RESUME SCREENING (LLM EVALUATION)
      ================================================= */}

      <Panel
        title="AI Resume Screening (LLM Evaluation)"
        sub="LLM evaluates your resume against the Job Description and screening threshold."
      >
        <div className="llm-screening-card">
          {llmTestMsg && (
            <div style={{ marginBottom: "16px" }}>
              <Alert message={llmTestMsg} />
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <span className={`llm-score-badge ${canExam || (a?.screening?.score || 85) >= (a?.screening?.threshold || 70) ? "passed" : "failed"}`}>
                <Sparkles size={15} />
                Match Score: {a?.screening?.score ?? (canExam ? 85 : 50)}% (Threshold: {a?.screening?.threshold ?? 70}%)
              </span>

              {canExam || (a?.screening?.score || 85) >= (a?.screening?.threshold || 70) ? (
                <span className="tag" style={{ background: "#ecfdf5", color: "#047857", borderColor: "#a7f3d0" }}>
                  <Check size={12} style={{ marginRight: "4px" }} />
                  Threshold Cleared
                </span>
              ) : (
                <span className="tag" style={{ background: "#fff1f2", color: "#be123c", borderColor: "#fecdd3" }}>
                  Below Threshold
                </span>
              )}
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                className="btn secondary"
                disabled={testingLlm}
                onClick={() => testLlmScreening(85, a?.screening?.threshold || 70)}
                style={{ fontSize: "12px" }}
              >
                <Sparkles size={13} />
                {testingLlm ? "Testing LLMs..." : "Test LLMs (Score: 85%)"}
              </button>

              <button
                className="btn secondary"
                disabled={testingLlm}
                onClick={() => testLlmScreening(50, a?.screening?.threshold || 70)}
                style={{ fontSize: "12px", color: "#64748b" }}
              >
                Test Below Threshold (50%)
              </button>
            </div>
          </div>

          <p style={{ fontSize: "13px", color: "#475569", lineHeight: "1.6", margin: "0 0 12px" }}>
            {a?.screening?.summary || "Candidate exhibits strong Python backend engineering experience matching job description requirements."}
          </p>

          <div style={{ marginTop: "12px" }}>
            <strong style={{ fontSize: "12px", color: "#334155", display: "block", marginBottom: "6px" }}>
              Evidenced Skills:
            </strong>
            <div className="skills-tags">
              {(a?.screening?.matched_skills && a.screening.matched_skills.length > 0
                ? a.screening.matched_skills
                : ["Python", "FastAPI", "REST APIs", "AWS DynamoDB", "Databases"]
              ).map((sk) => (
                <span key={sk} className="skill-tag">
                  ✓ {sk}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      {/* =================================================
          EXAMINATION & PROCTORED EXAM CODE
      ================================================= */}

      {canExam && !rejected && (
        <Panel
          title="Examination & Proctoring Access"
          sub="Your resume met the threshold. Use the examination code below to enter the proctored exam."
        >
          <div className="exam-ready" style={{ flexDirection: "column", alignItems: "stretch", padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div className="modal-icon">
                <ShieldCheck />
              </div>

              <div className="grow">
                <span className="eyebrow">
                  WRITTEN ASSESSMENT AUTHORIZED
                </span>

                <h2 style={{ fontSize: "17px", margin: "4px 0" }}>
                  Your assessment is ready.
                </h2>

                <p style={{ fontSize: "12px", color: "#64748b", margin: 0 }}>
                  The assessment is conducted within the isolated proctored examination environment.
                </p>
              </div>
            </div>

            {/* Exam Code Box */}
            <div className="exam-code-container">
              <div>
                <small style={{ color: "#94a3b8", display: "block", fontSize: "11px", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Code to enter proctored exam (Exam ID)
                </small>
                <span className="exam-code-text">{exam}</span>
              </div>

              <button
                className="btn secondary"
                onClick={() => copyCode(exam)}
                style={{ background: "#1e293b", color: "#f8fafc", border: "1px solid #334155", display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                {copiedCode ? <Check size={14} color="#34d399" /> : <Copy size={14} />}
                {copiedCode ? "Copied!" : "Copy Code"}
              </button>
            </div>

            {/* Instructions */}
            <div style={{ background: "#f8fafc", padding: "14px 18px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              <strong style={{ fontSize: "13px", color: "#1e293b", display: "block", marginBottom: "8px" }}>
                How to Enter the Proctored Exam:
              </strong>
              <ol className="exam-steps-list" style={{ margin: 0, paddingLeft: "18px" }}>
                <li>Copy your <strong>Exam Code</strong> above (or it will auto-populate upon launching).</li>
                <li>Click <strong>Enter Proctored Exam</strong> below to navigate to the secure examination portal.</li>
                <li>Verify your email and enter your candidate account password to start the assessment.</li>
                <li>Ensure your webcam is active; proctoring monitors tab switches and window focus during testing.</li>
              </ol>
            </div>

            <div style={{ marginTop: "18px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <a
                className="btn dark"
                href={`${(ext || (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "http://localhost:5176" : `${window.location.origin}/proctored-exam`)).replace(/\/+$/, '')}/?exam_id=${encodeURIComponent(exam)}&email=${encodeURIComponent(a?.candidate_email || "candidate_test_1@example.com")}&api_base=${encodeURIComponent(BASE_URL)}`}
                target="_blank"
                rel="noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 22px", fontSize: "13px" }}
              >
                <ShieldCheck size={16} />
                Enter Proctored Exam
                <ExternalLink size={14} />
              </a>

              <a
                className="btn secondary"
                href={`${BASE_URL.replace(/\/+$/, '')}/proctored-exam/?exam_id=${encodeURIComponent(exam)}&email=${encodeURIComponent(a?.candidate_email || "candidate_test_1@example.com")}&api_base=${encodeURIComponent(BASE_URL)}`}
                target="_blank"
                rel="noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px" }}
              >
                Direct Proxy Exam Link
                <ExternalLink size={12} />
              </a>
            </div>
          </div>
        </Panel>
      )}

      {/* =================================================
          ASSESSMENT RESULT
      ================================================= */}

      {r && !rejected && (
        <Panel
          title="Assessment result"
          sub="Candidate-safe result only."
        >
          {r?.scored === true ||
          r?.score != null ||
          r?.percentage != null ? (
            <div className="result">
              <div>
                <span>
                  Score
                </span>

                <b>
                  {r?.score ??
                    r?.percentage ??
                    "—"}
                  %
                </b>
              </div>

              <div>
                <span>
                  Correct
                </span>

                <b>
                  {r?.correct ??
                    "—"}

                  {r?.total_questions
                    ? ` / ${r.total_questions}`
                    : ""}
                </b>
              </div>

              <div>
                <span>
                  Result
                </span>

                <Status
                  v={
                    r?.result ||
                    r?.status
                  }
                />
              </div>
            </div>
          ) : (
            <Loading text="Your answers are being evaluated..." />
          )}
        </Panel>
      )}

      {/* =================================================
          TECHNICAL INTERVIEW ROUND
      ================================================= */}

      {(st.includes("INTERVIEW") || /INTERVIEW/.test(s) || a?.interview?.pending) && !rejected && !accepted && (
        <Panel
          title="Technical Interview Round"
          sub="Application has qualified and progressed to the interview stage."
        >
          <div style={{ display: "flex", gap: "16px", alignItems: "flex-start", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "18px", borderRadius: "10px" }}>
            <div style={{ background: "#16a34a", color: "white", padding: "12px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <UserRound size={26} />
            </div>
            <div>
              <h3 style={{ margin: "0 0 6px 0", color: "#15803d", fontSize: "16px", fontWeight: "700" }}>
                Assigned to Lead Technical Interviewer
              </h3>
              <p style={{ margin: "0 0 10px 0", color: "#166534", fontSize: "13px", lineHeight: "1.5" }}>
                Congratulations! You successfully cleared the written proctored assessment. Your profile, resume, and technical answers have been assigned to <strong>{a?.interview?.interviewer || "Lead Technical Interviewer"}</strong> for final evaluation and hiring review.
              </p>
              <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "white", border: "1px solid #86efac", padding: "6px 14px", borderRadius: "6px", fontSize: "12px", color: "#15803d", fontWeight: "600" }}>
                <Clock3 size={15} /> Status: Interview Assigned & Pending Decision
              </div>
            </div>
          </div>
        </Panel>
      )}

      {/* =================================================
          WITHDRAW
      ================================================= */}

      {!rejected &&
        !accepted &&
        (
          a?.can_withdraw === true ||
          a?.eligibility
            ?.can_withdraw === true
        ) && (
          <Panel>
            <div className="withdraw">
              <div>
                <h3>
                  Withdraw application
                </h3>

                <p>
                  This action may not be
                  reversible.
                </p>
              </div>

              <button
                className="btn reject"
                disabled={withd}
                onClick={withdraw}
              >
                {withd
                  ? "Withdrawing..."
                  : "Withdraw Application"}
              </button>
            </div>
          </Panel>
        )}
    </Page>
  );
}

/* =========================================================
   TIMELINE
========================================================= */

function Timeline({ a }) {
  const s =
    String(
      status(a) || ""
    ).toUpperCase();

  const st =
    String(
      stage(a) || ""
    ).toUpperCase();

  const rejected =
    isRejected(a);

  const accepted =
    isAccepted(a);

  const resumePassed =
    /SCREENING_PASSED|RESUME_PASSED|SCREENED|ASSESSMENT|EXAM|INTERVIEW|ACCEPT|SELECT|HIRED/.test(
      s + " " + st
    );

  const assessmentPassed =
    /ASSESSMENT_PASSED|EXAM_PASSED|INTERVIEW|ACCEPT|SELECT|HIRED/.test(
      s + " " + st
    );

  const interviewPassed =
    /INTERVIEW_PASSED|ACCEPT|SELECT|HIRED/.test(
      s + " " + st
    );

  const steps = [
    [
      "Application Submitted",
      true,
    ],

    [
      "Resume Screening",
      true,
    ],

    [
      "Screening Passed",
      resumePassed,
    ],

    [
      "Written Assessment",
      assessmentPassed,
    ],

    [
      "Interview",
      interviewPassed ||
        /INTERVIEW_PASSED|INTERVIEW_COMPLETED/.test(s),
    ],

    [
      "Final Decision",
      rejected ||
        accepted ||
        /ACCEPT|REJECT|SELECT|HIRED/.test(
          s
        ),
    ],
  ];

  return (
    <div className="timeline">
      {steps.map(
        ([name, done], i) => {
          const isCurrent =
            !done &&
            i > 0 &&
            steps[i - 1]?.[1];

          return (
            <div
              className={
                done
                  ? "tl done"
                  : isCurrent
                  ? "tl current"
                  : "tl"
              }
              key={name}
            >
              <div>
                {done && (
                  <Check size={12} />
                )}
              </div>

              <b>{name}</b>

              {rejected &&
                name ===
                  getRejectionStage(a) && (
                  <span className="timeline-rejected">
                    Rejected
                  </span>
                )}
            </div>
          );
        }
      )}
    </div>
  );
}

/* =========================================================
   PROFILE
========================================================= */

function Profile() {
  const [d, setD] =
    useState(null);

  const [name, setN] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [uploading, setUploading] =
    useState(false);

  const [msg, setM] =
    useState("");

  const [err, setE] =
    useState("");

  async function get() {
    setLoading(true);
    setE("");

    try {
      const x =
        await api.me();

      const data =
        x?.candidate ||
        x;

      setD(data);

      setN(
        data?.name ||
        data?.full_name ||
        data?.candidate?.name ||
        getSession()?.name ||
        ""
      );
    } catch (e) {
      setE(
        e?.message ||
        "Unable to load profile."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    get();
  }, []);

  async function save() {
    if (!name.trim()) {
      setE(
        "Please enter your full name."
      );
      return;
    }

    setSaving(true);
    setM("");
    setE("");

    try {
      await api.updateProfile({
        name: name.trim(),
      });

      setM(
        "Profile updated successfully."
      );

      await get();

      const session =
        getSession();

      if (session) {
        saveSession({
          ...session,
          name: name.trim(),
        });
      }
    } catch (e) {
      setE(
        e?.message ||
        "Unable to update profile."
      );
    } finally {
      setSaving(false);
    }
  }

  async function upload(e) {
    const f =
      e.target.files?.[0];

    e.target.value = "";

    if (!f) return;

    if (
      f.type !==
      "application/pdf"
    ) {
      setE(
        "Resume must be a PDF."
      );
      return;
    }

    if (
      f.size >
      5 * 1024 * 1024
    ) {
      setE(
        "Resume must be 5 MB or smaller."
      );
      return;
    }

    setUploading(true);
    setM("");
    setE("");

    try {
      await api.uploadResume(f);

      setM(
        "Resume uploaded successfully."
      );

      await get();
    } catch (e) {
      setE(
        e?.message ||
        "Unable to upload resume."
      );
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <Page title="Profile">
        <Loading text="Loading profile..." />
      </Page>
    );
  }

  const r =
    d?.resume ||
    d?.resume_name ||
    d?.resume_file ||
    d?.resume_filename ||
    d?.resume?.name ||
    null;

  const resumeName =
    typeof r === "string"
      ? r
      : r?.name ||
        r?.filename ||
        r?.file_name ||
        r?.original_name ||
        "";

  return (
    <Page
      title="Profile"
      sub="Manage your candidate information and resume."
    >
      {err && (
        <Alert message={err} />
      )}

      {msg && (
        <Alert
          success
          message={msg}
        />
      )}

      <div className="two">
        <Panel
          title="Candidate details"
          sub="Candidate-owned information only."
        >
          <div className="form">
            <Field label="Full Name">
              <input
                value={name}
                onChange={(e) =>
                  setN(e.target.value)
                }
                placeholder="Enter your full name"
              />
            </Field>

            <Field label="Email">
              <input
                value={
                  d?.email ||
                  getSession()
                    ?.email ||
                  ""
                }
                disabled
              />
            </Field>

            <button
              className="btn dark"
              onClick={save}
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : "Save Changes"}
            </button>
          </div>
        </Panel>

        <Panel
          title="Resume"
          sub="PDF only · Maximum 5 MB"
        >
          <div className="resume-box">
            {resumeName ? (
              <div className="resume-file">
                <FileText />

                <div className="grow">
                  <b>
                    {resumeName}
                  </b>

                  <small>
                    Current saved resume
                  </small>
                </div>

                <label
                  className={
                    uploading
                      ? "btn secondary disabled"
                      : "btn secondary"
                  }
                >
                  {uploading
                    ? "Uploading..."
                    : "Replace Resume"}

                  <input
                    hidden
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={upload}
                    disabled={uploading}
                  />
                </label>
              </div>
            ) : (
              <div className="upload">
                <UploadCloud size={30} />

                <h3>
                  Resume required
                </h3>

                <p>
                  Upload your resume before
                  applying.
                </p>

                <label
                  className={
                    uploading
                      ? "btn secondary"
                      : "btn dark"
                  }
                >
                  {uploading
                    ? "Uploading..."
                    : "Choose PDF"}

                  <input
                    hidden
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={upload}
                    disabled={uploading}
                  />
                </label>
              </div>
            )}
          </div>
        </Panel>
      </div>
    </Page>
  );
}