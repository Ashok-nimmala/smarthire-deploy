import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter, Routes, Route, Navigate, Link, NavLink, useNavigate,
  useLocation, useParams
} from "react-router-dom";
import {
  LayoutDashboard, BriefcaseBusiness, UsersRound, LogOut, Plus, Search,
  ChevronRight, ArrowLeft, Check, Trash2, Eye, Pencil, Send, UserPlus,
  FileText, Clock3, BarChart3, CircleAlert, RefreshCw, Menu, X, ShieldCheck,
  Mail, CalendarDays, ListChecks, ExternalLink, LoaderCircle, ScrollText, ChevronDown,
  Activity, Database, FileSearch
} from "lucide-react";
import "./styles.css";

const isLocalHost = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

const API_BASE =
  (typeof window !== "undefined" && (new URLSearchParams(window.location.search).get("api_base") || window.SMARTHIRE_API_BASE || localStorage.getItem("smarthire_api_base"))) ||
  import.meta.env.VITE_API_BASE_URL ||
  (isLocalHost ? "http://localhost:8000" : "https://smarthire-deploy-api.onrender.com");

const SESSION_KEY = "smarthire_admin_session";

const AUDIT_DISCOVERY_KEY = "smarthire_audit_discovery";

// Store only real entity IDs returned by successful backend actions.
// This is discovery metadata, not an audit record. Audit events themselves
// are always fetched from GET /admin/audit/{entity_id}.
function rememberAuditEntity(entityType, entityId, orgId = loadSession()?.orgId) {
  if (!entityType || !entityId) return;
  try {
    const current = JSON.parse(localStorage.getItem(AUDIT_DISCOVERY_KEY) || "[]");
    const next = current.filter(x => !(x.orgId === orgId && x.entityType === entityType && String(x.entityId) === String(entityId)));
    next.unshift({ orgId: orgId || null, entityType, entityId: String(entityId), touchedAt: Date.now() });
    localStorage.setItem(AUDIT_DISCOVERY_KEY, JSON.stringify(next.slice(0, 200)));
  } catch {}
}

function rememberedAuditEntities(orgId) {
  try {
    const current = JSON.parse(localStorage.getItem(AUDIT_DISCOVERY_KEY) || "[]");
    return current.filter(x => (!orgId || x.orgId === orgId) && x.entityType && x.entityId);
  } catch { return []; }
}

function loadSession() {
  try {
    const p = new URLSearchParams(window.location.search);
    const token = p.get("session_token") || p.get("token");
    if (token) {
      const sess = {
        sessionToken: token,
        userId: p.get("user_id") || "usr_admin_1",
        orgId: "org_bnp",
        name: p.get("name") || "System Administrator",
        email: p.get("email") || "admin@bnp.com"
      };
      saveSession(sess);
      window.history.replaceState({}, document.title, window.location.pathname);
      return sess;
    }
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  }
  catch { return null; }
}
function saveSession(data) { localStorage.setItem(SESSION_KEY, JSON.stringify(data)); }
function clearSession() { localStorage.removeItem(SESSION_KEY); }

async function apiRequest(path, { auth = false, params, signal } = {}) {
  const url = new URL(path, API_BASE);
  if (params) Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  });

  const headers = { Accept: "application/json" };
  const session = loadSession();
  if (auth && session?.sessionToken) headers.Authorization = `Bearer ${session.sessionToken}`;

  let response;
  try {
    response = await fetch(url, { method: "GET", headers, signal });
  } catch (e) {
    throw new Error("Network error. Check the API URL and CORS configuration.");
  }

  let body = null;
  try { body = await response.json(); } catch {}

  if ((response.status === 401 || body?.error?.code === "NOT_AUTHENTICATED") && path !== "/auth/login") {
    clearSession();
    window.location.href = "/login";
    throw new Error("Your session has expired. Please sign in again.");
  }
  if (!response.ok || body?.success === false) {
    throw new Error(body?.error?.message || body?.message || `Request failed (${response.status})`);
  }
  return body?.data ?? body;
}

async function apiAction(path, params, auth = true) {
  return apiRequest(path, { auth, params });
}

const AuthContext = createContext(null);
function AuthProvider({ children }) {
  const [session, setSession] = useState(loadSession);
  const login = (data) => {
    const next = {
      sessionToken: data.session_token,
      orgId: data.org_id,
      role: data.role
    };
    saveSession(next); setSession(next);
  };
  const logout = () => { clearSession(); setSession(null); };
  const value = useMemo(() => ({ session, login, logout }), [session]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
function useAuth() { return useContext(AuthContext); }

function ProtectedRoute({ children }) {
  const { session } = useAuth();
  if (!session?.sessionToken || session.role !== "admin") return <Navigate to="/login" replace />;
  return children;
}

function Shell({ children }) {
  const { logout, session } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const nav = [
    ["/admin/dashboard", "Dashboard", LayoutDashboard],
    ["/admin/jobs", "Jobs", BriefcaseBusiness],
    ["/admin/interviewers", "Interviewers", UsersRound],
    ["/admin/audit", "Audit Logs", ScrollText],
  ];
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">S</div>
          <div><strong>SmartHire</strong><span>Admin Portal</span></div>
          <button className="icon-btn mobile-close" onClick={() => setMobileOpen(false)}><X size={18}/></button>
        </div>
        <nav className="nav-list">
          {nav.map(([to, label, Icon]) => (
            <NavLink key={to} to={to} onClick={() => setMobileOpen(false)}
              className={({isActive}) => `nav-item ${isActive ? "active" : ""}`}>
              <Icon size={19}/><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="org-mini"><div className="avatar">A</div><div><b>Admin</b><span>{session?.orgId || "Organization"}</span></div></div>
          <button className="nav-item logout-btn" onClick={logout}><LogOut size={18}/><span>Sign out</span></button>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <button className="icon-btn mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={21}/></button>
          <div className="topbar-title">Admin workspace</div>
          <div className="topbar-right" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span className="secure"><ShieldCheck size={16}/> Secure session</span>
          </div>
        </header>
        <main className="page">{children}</main>
      </div>
      {mobileOpen && <div className="mobile-overlay" onClick={() => setMobileOpen(false)} />}
    </div>
  );
}

function PageHeader({ eyebrow, title, description, action }) {
  return <div className="page-header">
    <div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description && <p>{description}</p>}</div>
    {action}
  </div>;
}
function Spinner({ text = "Loading..." }) { return <div className="center-state"><LoaderCircle className="spin" size={22}/><span>{text}</span></div>; }
function ErrorState({ message, retry }) { return <div className="error-state"><CircleAlert size={21}/><div><b>Unable to load</b><p>{message}</p>{retry && <button className="btn btn-secondary btn-small" onClick={retry}><RefreshCw size={15}/> Try again</button>}</div></div>; }
function Empty({ icon: Icon = FileText, title, text, action }) { return <div className="empty-state"><div className="empty-icon"><Icon size={24}/></div><h3>{title}</h3><p>{text}</p>{action}</div>; }
function Toast({ message, type = "success", onClose }) {
  if (!message) return null;
  return <div className={`toast ${type}`}><span>{type === "success" ? <Check size={17}/> : <CircleAlert size={17}/>}</span><div>{message}</div><button onClick={onClose}>×</button></div>;
}
function StatusBadge({ status }) {
  const s = String(status || "UNKNOWN").toLowerCase();
  return <span className={`status status-${s.replace(/\s+/g,"-")}`}><i />{status || "Unknown"}</span>;
}
function Score({ value }) { return <strong className="score">{value ?? "—"}</strong>; }

function Login() {
  const { session, login } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ email: "admin@bnp.com", password: "password123" });
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => { if (session?.role === "admin") nav("/admin/dashboard", {replace:true}); }, [session]);
  const submit = async e => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const data = await apiRequest("/auth/login", { params: form });
      if (data.role !== "admin") throw new Error("This account does not have admin access.");
      login(data); nav("/admin/dashboard");
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return <AuthLayout title="Welcome back" subtitle="Sign in to manage jobs, interviewers and applicants.">
    <form onSubmit={submit} className="auth-form">
      <Field label="Email" type="email" value={form.email} onChange={v=>setForm({...form,email:v})} placeholder="admin@company.com" required />
      <Field label="Password" type="password" value={form.password} onChange={v=>setForm({...form,password:v})} placeholder="Enter your password" required />
      {error && <InlineError text={error}/>}
      <button className="btn btn-primary btn-full" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={17}/> Signing in...</> : "Sign in"}</button>
    </form>
    <div className="auth-footer">New organization? <Link to="/signup">Create admin account</Link></div>
  </AuthLayout>;
}

function Signup() {
  const { session, login } = useAuth(); const nav = useNavigate();
  const [form,setForm] = useState({organization_name:"",name:"",email:"",password:""});
  const [busy,setBusy]=useState(false); const [error,setError]=useState("");
  useEffect(()=>{ if(session?.role==="admin") nav("/admin/dashboard",{replace:true}); },[session]);
  const submit=async e=>{
    e.preventDefault(); setBusy(true); setError("");
    try { const data=await apiRequest("/auth/signup/admin",{params:form}); if(data.role!=="admin") throw new Error("The account was not created with admin access."); login(data); nav("/admin/dashboard"); }
    catch(e){setError(e.message)} finally{setBusy(false)}
  };
  return <AuthLayout title="Create your admin account" subtitle="Set up the organization workspace for your hiring team.">
    <form onSubmit={submit} className="auth-form">
      <Field label="Organization name" value={form.organization_name} onChange={v=>setForm({...form,organization_name:v})} placeholder="Acme Technologies" required />
      <Field label="Your name" value={form.name} onChange={v=>setForm({...form,name:v})} placeholder="John Doe" required />
      <Field label="Work email" type="email" value={form.email} onChange={v=>setForm({...form,email:v})} placeholder="admin@company.com" required />
      <Field label="Password" type="password" value={form.password} onChange={v=>setForm({...form,password:v})} placeholder="Create a password" required />
      {error && <InlineError text={error}/>}
      <button className="btn btn-primary btn-full" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={17}/> Creating...</> : "Create account"}</button>
    </form>
    <div className="auth-footer">Already have an account? <Link to="/login">Sign in</Link></div>
  </AuthLayout>;
}
function AuthLayout({title,subtitle,children}) {
  return <div className="auth-page"><div className="auth-visual"><div className="auth-brand"><div className="brand-mark">S</div><strong>SmartHire</strong></div><div className="visual-copy"><span className="pill">Hiring workspace</span><h1>Make every hiring decision easier to manage.</h1><p>Keep jobs, interviewers and candidate evidence in one focused workspace.</p></div><div className="visual-footer">SmartHire Admin Portal</div></div>
    <div className="auth-panel"><div className="auth-box"><div className="auth-heading"><h2>{title}</h2><p>{subtitle}</p></div>{children}</div></div></div>;
}
function InlineError({text}) { return <div className="inline-error"><CircleAlert size={16}/>{text}</div>; }
function Field({label,type="text",value,onChange,placeholder,required,help}) {
  return <label className="field"><span>{label}{required && <em>*</em>}</span><input type={type} value={value ?? ""} onChange={e=>onChange(e.target.value)} placeholder={placeholder} required={required}/>{help&&<small>{help}</small>}</label>;
}
function TextArea({label,value,onChange,placeholder,required,help,rows=5}) {
  return <label className="field"><span>{label}{required && <em>*</em>}</span><textarea rows={rows} value={value ?? ""} onChange={e=>onChange(e.target.value)} placeholder={placeholder} required={required}/>{help&&<small>{help}</small>}</label>;
}


function normalizeAuditEvents(data) {
  if (Array.isArray(data)) return data;
  return data?.events || data?.items || data?.audit || data?.audit_events || [];
}

function auditActionLabel(action) {
  return String(action || "Unknown action")
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function auditActor(event) {
  const actorId = event?.actor_id;
  const meta = event?.metadata && typeof event.metadata === "object" ? event.metadata : {};
  const actorType = meta.actor_type || meta.actor_role || meta.actor_type_label || meta.actor?.type;
  const normalizedActorId = String(actorId || "").toLowerCase();
  if (normalizedActorId === "system") return { type: "SYSTEM", value: "System" };
  if (actorType) return { type: String(actorType).toUpperCase(), value: String(actorId || "—") };
  if (["admin", "interviewer", "candidate"].includes(normalizedActorId)) return { type: normalizedActorId.toUpperCase(), value: String(actorId) };
  return { type: "ACTOR", value: String(actorId || "—") };
}

function formatDateTime(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString(undefined, {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

function formatMetadataValue(value) {
  if (value === null) return "null";
  if (value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function AuditEvent({ event, entityType }) {
  const actor = auditActor(event);
  const hasMetadata = event?.metadata !== undefined && event?.metadata !== null;
  const hasTransition = event?.from_state !== undefined || event?.to_state !== undefined;
  return (
    <article className="audit-event">
      <div className="audit-event-marker"><Activity size={15}/></div>
      <div className="audit-event-body">
        <div className="audit-event-head">
          <div>
            <div className="audit-action">{auditActionLabel(event?.action)}</div>
            <div className="audit-time">{formatDateTime(event?.ts_event)}</div>
          </div>
        </div>
        <div className="audit-actor"><span>Actor</span><b>{actor.value}</b></div>
        <div className="audit-entity"><span>{entityType || "Entity"}</span><b>{event?.entity_id || event?.__entityId || "—"}</b>{(entityType === "Application" && (event?.entity_id || event?.__entityId)) && <Link to={`/admin/applications/${event.entity_id || event.__entityId}`}>Open application <ChevronRight size={13}/></Link>}</div>
        {hasTransition && (
          <div className="audit-transition">
            <span>{event?.from_state ?? "—"}</span>
            <ChevronRight size={16}/>
            <strong>{event?.to_state ?? "—"}</strong>
          </div>
        )}
        {hasMetadata && (
          <details className="audit-metadata">
            <summary><Database size={14}/> Metadata</summary>
            {event?.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata) ? (
              <div className="metadata-grid">
                {Object.entries(event.metadata).map(([key, value]) => (
                  <div key={key}><span>{key}</span><b>{formatMetadataValue(value)}</b></div>
                ))}
              </div>
            ) : <pre className="json-view">{formatMetadataValue(event.metadata)}</pre>}
          </details>
        )}
      </div>
    </article>
  );
}

function AuditTimeline({ entityId, title = "Audit Timeline", compact = false }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    if (!entityId) { setEvents([]); setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const data = await apiRequest(`/admin/audit/${encodeURIComponent(entityId)}`, {
        auth: true, params: { limit: 500 }
      });
      setEvents(normalizeAuditEvents(data));
    } catch (e) {
      setError(e.message);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [entityId]);

  return (
    <div className={`card audit-card ${compact ? "audit-card-compact" : ""}`}>
      <SectionTitle
        title={title}
        action={<span className="count-pill">{loading ? "…" : events.length}</span>}
      />
      {loading ? <Spinner text="Loading audit history..." /> :
       error ? <ErrorState message={error} retry={load}/> :
       events.length ? (
         <div className="audit-timeline">
           {[...events].sort((a,b) => new Date(b?.ts_event || 0) - new Date(a?.ts_event || 0))
             .map((event, i) => <AuditEvent key={`${event?.ts_event||"event"}-${event?.action||i}-${i}`} event={event}/>)}
         </div>
       ) : (
         <Empty icon={FileSearch} title="No audit events returned"
           text="The audit API did not return any history for this entity." />
       )}
    </div>
  );
}

function auditEntityIdFromActivity(activity) {
  const entityType = String(activity?.entity_type || activity?.entity || "").toLowerCase();
  const id = activity?.entity_id;
  const entityLabels = { organization: "Organization", job: "Job", question: "Question", application: "Application", user: "User" };
  if (id && entityLabels[entityType]) return { entityId: String(id), entityType: entityLabels[entityType] };
  const appId = activity?.app_id || activity?.application_id;
  if (appId) return { entityId: String(appId), entityType: "Application" };
  const jobId = activity?.jd_id || activity?.job_id;
  if (jobId) return { entityId: String(jobId), entityType: "Job" };
  const questionId = activity?.question_id;
  if (questionId) return { entityId: String(questionId), entityType: "Question" };
  const userId = activity?.user_id;
  if (userId) return { entityId: String(userId), entityType: "User" };
  return null;
}

function dashboardAuditEntities(data, orgId) {
  const found = new Map();
  const add = (entityId, entityType) => {
    if (!entityId) return;
    const key = `${entityType}:${entityId}`;
    if (!found.has(key)) found.set(key, { entityId: String(entityId), entityType });
  };

  // Organization history can be loaded automatically from the authenticated admin session.
  if (orgId) add(orgId, "Organization");

  const activities = dashboardActivities(data);
  activities.forEach(activity => {
    const entity = auditEntityIdFromActivity(activity);
    if (entity) add(entity.entityId, entity.entityType);
  });

  // The dashboard job/application summaries may contain IDs even when recent_activity is absent.
  const jobs = data?.jobs || data?.job_summaries || data?.job_summary || [];
  if (Array.isArray(jobs)) jobs.forEach(job => add(job?.jd_id || job?.job_id || job?.id, "Job"));

  const apps = data?.applications_list || data?.application_list || data?.recent_applications || (Array.isArray(data?.applications) ? data.applications : []);
  if (Array.isArray(apps)) apps.forEach(app => add(app?.app_id || app?.application_id || app?.id, "Application"));

  // Successful admin actions can return a brand-new entity ID that is not yet
  // present in the dashboard response. Remember that real ID so the next audit
  // refresh can ask the backend for its actual audit history.
  rememberedAuditEntities(orgId).forEach(item => add(item.entityId, item.entityType));

  return [...found.values()].slice(0, 200);
}

function AuditPage() {
  const { session } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("All");

  const load = async () => {
    setLoading(true); setError("");
    try {
      // Discover real entity IDs from existing admin read APIs, then ask the
      // audit endpoint for the server's actual history. No frontend audit records
      // are created or inferred.
      const [dashboardResult, jobsResult, interviewersResult] = await Promise.allSettled([
        apiRequest("/admin/dashboard", { auth: true }),
        apiRequest("/admin/jds", { auth: true, params: { limit: 100 } }),
        apiRequest("/admin/interviewers", { auth: true })
      ]);
      if (dashboardResult.status === "rejected") throw dashboardResult.reason;
      const dashboard = dashboardResult.value;
      const entities = dashboardAuditEntities(dashboard, session?.orgId);

      const jobsData = jobsResult.status === "fulfilled" ? jobsResult.value : [];
      const jobs = Array.isArray(jobsData)
        ? jobsData
        : (jobsData?.items || jobsData?.jobs || []);
      jobs.forEach(job => {
        const id = job?.jd_id || job?.job_id || job?.id;
        if (id) rememberAuditEntity("Job", id, session?.orgId);
      });

      const interviewersData = interviewersResult.status === "fulfilled" ? interviewersResult.value : [];
      const interviewers = Array.isArray(interviewersData)
        ? interviewersData
        : (interviewersData?.items || interviewersData?.interviewers || []);
      interviewers.forEach(interviewer => {
        const id = interviewer?.user_id || interviewer?.id;
        if (id) rememberAuditEntity("User", id, session?.orgId);
      });

      const discovered = [
        ...entities,
        ...jobs.map(job => ({
          entityId: job?.jd_id || job?.job_id || job?.id,
          entityType: "Job"
        })),
        ...interviewers.map(interviewer => ({
          entityId: interviewer?.user_id || interviewer?.id,
          entityType: "User"
        }))
      ].filter(item => item.entityId);
      const entityMap = new Map();
      discovered.forEach(item => entityMap.set(`${item.entityType}:${item.entityId}`, item));
      const auditEntities = [...entityMap.values()].slice(0, 500);
      const results = await Promise.all(auditEntities.map(async entity => {
        try {
          const data = await apiRequest(`/admin/audit/${encodeURIComponent(entity.entityId)}`, {
            auth: true, params: { limit: 500 }
          });
          return normalizeAuditEvents(data).map(event => ({
            ...event,
            __entityType: event?.entity_type || entity.entityType,
            __entityId: event?.entity_id || entity.entityId
          }));
        } catch {
          // One inaccessible/expired entity history must not hide the rest of the audit feed.
          return [];
        }
      }));
      const merged = results.flat();
      const unique = new Map();
      merged.forEach(event => {
        const key = `${event?.entity_id || event?.__entityId}:${event?.ts_event || ""}:${event?.action || ""}:${event?.actor_id || ""}`;
        if (!unique.has(key)) unique.set(key, event);
      });
      setEvents([...unique.values()].sort((a, b) => new Date(b?.ts_event || 0) - new Date(a?.ts_event || 0)));
    } catch (e) {
      setError(e.message);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [session?.orgId]);

  const entityTypes = ["All", ...new Set(events.map(e => e.__entityType).filter(Boolean))];
  const visible = events.filter(event => {
    const entityOk = filter === "All" || event.__entityType === filter;
    return entityOk;
  });

  return <>
    <PageHeader eyebrow="Audit" title="Audit Logs"
      description="Read-only hiring activity loaded automatically from real jobs, interviewers, applications and organization data. No entity ID entry is required." 
      action={<button className="btn btn-secondary" onClick={load} disabled={loading}><RefreshCw size={15} className={loading ? "spin" : ""}/> Refresh</button>} />

    <div className="card audit-feed-header">
      <div>
        <h3>Organization activity</h3>
        <p>The backend remains the source of truth. Only events returned by <code>/admin/audit/{'{entity_id}'}</code> are displayed.</p>
      </div>
      <div className="audit-feed-count"><b>{loading ? "…" : visible.length}</b><span>events</span></div>
    </div>

    {!loading && !error && events.length > 0 && <div className="audit-filters">
      <label className="audit-filter">Entity <select value={filter} onChange={e=>setFilter(e.target.value)}>{entityTypes.map(type=><option key={type}>{type}</option>)}</select></label>
    </div>}

    <div className="card audit-card audit-auto-card">
      {loading ? <Spinner text="Loading recent audit history..." /> :
       error ? <ErrorState message={error} retry={load}/> :
       visible.length ? <div className="audit-timeline">
         {visible.map((event, i) => <AuditEvent key={`${event?.__entityType}-${event?.entity_id || event?.__entityId}-${event?.ts_event || i}-${event?.action || i}`} event={event} entityType={event.__entityType} />)}
       </div> :
       <Empty icon={FileSearch} title="No audit activity available"
         text="The existing dashboard did not expose entity IDs with audit history, or the audit API returned no events. No audit records were fabricated." />}
    </div>
  </>;
}

function dashboardActivities(data) {
  const candidates = [
    data?.recent_activity, data?.recent_activities, data?.recentActivity,
    data?.recent_audit, data?.recent_audit_events, data?.activity, data?.audit
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
    if (candidate?.items && Array.isArray(candidate.items)) return candidate.items;
    if (candidate?.events && Array.isArray(candidate.events)) return candidate.events;
  }
  return [];
}

function activityTarget(activity) {
  const appId = activity?.app_id || activity?.application_id ||
    (String(activity?.entity_type || "").toLowerCase() === "application" ? activity?.entity_id : null);
  if (appId) return `/admin/applications/${appId}`;
  const jobId = activity?.jd_id || activity?.job_id ||
    (String(activity?.entity_type || "").toLowerCase() === "job" ? activity?.entity_id : null);
  if (jobId) return `/admin/jobs/${jobId}`;
  return null;
}

function Dashboard() {
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const load=async()=>{setLoading(true);setError("");try{setData(await apiRequest("/admin/dashboard",{auth:true}))}catch(e){setError(e.message)}finally{setLoading(false)}};
  useEffect(()=>{load()},[]);
  if(loading)return <Spinner text="Loading dashboard..." />;
  if(error)return <ErrorState message={error} retry={load}/>;
  const stats = data?.stats || data?.totals || data?.summary || data || {};
  const jobs = data?.jobs || data?.job_summaries || data?.job_summary || [];
  const applications = data?.applications || data?.application_status || {};
  const statValue=(...keys)=>{
    for(const k of keys) {
      if(stats && stats[k]!==undefined && stats[k]!==null) return stats[k];
      if(data && data[k]!==undefined && data[k]!==null) return data[k];
    }
    return 0;
  };
  return <><PageHeader eyebrow="Overview" title="Dashboard" description="A clear view of your hiring workspace." />
    <div className="stats-grid">
      <StatCard icon={BriefcaseBusiness} label="Total Jobs" value={statValue("total_jobs","jobs")} />
      <StatCard icon={Send} label="Live Jobs" value={statValue("live_jobs","active_jobs","published_jobs")} />
      <StatCard icon={UsersRound} label="Total Applications" value={statValue("total_applications","applications")} />
      <StatCard icon={UserPlus} label="Interviewers" value={statValue("interviewers","total_interviewers")} />
    </div>
    <div className="section-heading"><div><h2>Job summary</h2><p>Current jobs and application activity.</p></div><Link className="btn btn-secondary btn-small" to="/admin/jobs">View all jobs <ChevronRight size={15}/></Link></div>
    <div className="card table-card">{jobs.length ? <JobSummaryTable jobs={jobs}/> : <Empty icon={BriefcaseBusiness} title="No job summary yet" text="Create your first job to start building the pipeline." action={<Link className="btn btn-primary btn-small" to="/admin/jobs/create"><Plus size={15}/> Create job</Link>}/>}</div>
    {dashboardActivities(data).length>0 && <div className="card recent-activity-card">
      <SectionTitle title="Recent Activity" action={<Link className="btn btn-secondary btn-small" to="/admin/audit">Audit Logs <ChevronRight size={14}/></Link>}/>
      <div className="recent-activity-list">
        {dashboardActivities(data).slice(0,10).map((activity,i)=>{
          const target=activityTarget(activity);
          const row=<><time>{formatDateTime(activity?.ts_event||activity?.timestamp||activity?.created_at)}</time><div><b>{auditActionLabel(activity?.action||activity?.event||activity?.type)}</b>{activity?.actor_id&&<span>Actor: {String(activity.actor_id).toLowerCase()==="system" ? "System" : activity.actor_id}</span>}</div><ChevronRight size={15}/></>;
          return target ? <Link className="recent-activity-row" to={target} key={i}>{row}</Link> : <div className="recent-activity-row" key={i}>{row}</div>;
        })}
      </div>
    </div>}
    {Object.keys(applications).length>0 && <div className="card application-summary"><h3>Application status</h3><div className="mini-stats">{Object.entries(applications).map(([k,v])=><div key={k}><span>{k.replace(/_/g," ")}</span><b>{v}</b></div>)}</div></div>}
  </>;
}
function StatCard({icon:Icon,label,value}) { return <div className="card stat-card"><div className="stat-icon"><Icon size={20}/></div><div><span>{label}</span><b>{value ?? 0}</b></div></div>; }
function JobSummaryTable({jobs}) {
 return <table><thead><tr><th>Job</th><th>Status</th><th>Interviewer</th><th>Applications</th><th>Questions</th><th>Expiry</th></tr></thead><tbody>{jobs.map((j,i)=><tr key={j.jd_id||j.id||i}><td><Link className="table-link" to={`/admin/jobs/${j.jd_id||j.id}`}>{j.title||j.job_title||"Untitled job"}</Link></td><td><StatusBadge status={j.status}/></td><td>{j.interviewer_name||j.interviewer||"—"}</td><td>{j.application_count??j.applications??0}</td><td>{j.question_count??j.questions??0}</td><td>{formatDate(j.expiry)}</td></tr>)}</tbody></table>
}

function Jobs() {
 const [jobs,setJobs]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[search,setSearch]=useState("");
 const load=async()=>{setLoading(true);setError("");try{const d=await apiRequest("/admin/jds",{auth:true,params:{limit:100}});const rows=Array.isArray(d)?d:(d?.items||d?.jobs||[]);setJobs(rows);rows.forEach(j=>rememberAuditEntity("Job", j?.jd_id||j?.job_id||j?.id));}catch(e){setError(e.message)}finally{setLoading(false)}};
 useEffect(()=>{load()},[]);
 const filtered=jobs.filter(j=>(j.title||j.job_title||"").toLowerCase().includes(search.toLowerCase()));
 return <><PageHeader eyebrow="Workspace" title="Jobs" description="Create, configure and monitor your hiring jobs." action={<Link className="btn btn-primary" to="/admin/jobs/create"><Plus size={17}/> Create job</Link>}/>
 <div className="toolbar"><div className="search"><Search size={17}/><input placeholder="Search jobs..." value={search} onChange={e=>setSearch(e.target.value)}/></div><button className="btn btn-secondary" onClick={load}><RefreshCw size={16}/> Refresh</button></div>
 {loading?<Spinner text="Loading jobs..."/>:error?<ErrorState message={error} retry={load}/>:<div className="card table-card">{filtered.length?<table><thead><tr><th>Job</th><th>Status</th><th>Interviewer</th><th>Questions</th><th>Applications</th><th>Expiry</th><th></th></tr></thead><tbody>{filtered.map((j,i)=><tr key={j.jd_id||j.id||i}><td><div className="primary-cell"><div className="row-icon"><BriefcaseBusiness size={16}/></div><div><Link className="table-link" to={`/admin/jobs/${j.jd_id||j.id}`}>{j.title||j.job_title||"Untitled job"}</Link><small>{j.created_at?`Created ${formatDate(j.created_at)}`:""}</small></div></div></td><td><StatusBadge status={j.status}/></td><td>{j.interviewer_name||j.interviewer||"—"}</td><td>{j.question_count??j.questions??0}</td><td>{j.application_count??j.applications??0}</td><td>{formatDate(j.expiry)}</td><td><Link className="icon-link" title="Open" to={`/admin/jobs/${j.jd_id||j.id}`}><ChevronRight size={18}/></Link></td></tr>)}</tbody></table>:<Empty icon={BriefcaseBusiness} title="No jobs found" text={search?"Try another search.":"Create your first job to get started."} action={!search&&<Link className="btn btn-primary btn-small" to="/admin/jobs/create"><Plus size={15}/> Create job</Link>}/>}</div>}
 </>;
}

function CreateJob() {
 const nav=useNavigate(); const [step,setStep]=useState(1); const [form,setForm]=useState({title:"",description:"",interviewer_id:"",screening_threshold:"",exam_threshold:"",expiry:""});
 const [interviewers,setInterviewers]=useState([]),[questions,setQuestions]=useState([]),[jdId,setJdId]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[toast,setToast]=useState("");
 useEffect(()=>{apiRequest("/admin/interviewers",{auth:true}).then(d=>setInterviewers(Array.isArray(d)?d:(d?.items||d?.interviewers||[]))).catch(e=>setError(e.message))},[]);
 const update=(k,v)=>setForm({...form,[k]:v});
 const createDraft=async()=>{setBusy(true);setError("");try{const d=await apiAction("/admin/jds/create",form);const id=d?.jd_id||d?.job_id||d?.job?.jd_id||d?.job?.job_id||d?.job?.id||d?.id; if(!id)throw new Error("The API did not return a job ID.");rememberAuditEntity("Job", id);setJdId(id);setStep(4);setToast("Draft created successfully.");}catch(e){setError(e.message)}finally{setBusy(false)}};
 const [q,setQ]=useState({question:"",reference_answer:"",marks:"10"});
 const addQuestion=async()=>{if(!jdId)return;setBusy(true);setError("");try{const d=await apiAction(`/admin/jds/${jdId}/questions/create`,q);const questionId=d?.question_id||d?.question?.question_id||d?.question?.id||d?.id; if(questionId) rememberAuditEntity("Question", questionId); setQuestions([...questions,{...q, ...(questionId ? {question_id:questionId} : {})}]);setQ({question:"",reference_answer:"",marks:"10"});setToast("Question added.");}catch(e){setError(e.message)}finally{setBusy(false)}};
 const publish=async()=>{setBusy(true);setError("");try{await apiAction(`/admin/jds/${jdId}/publish`);setToast("Job published.");nav(`/admin/jobs/${jdId}`)}catch(e){setError(e.message)}finally{setBusy(false)}};
 return <><PageHeader eyebrow="Jobs / Create" title="Create a job" description="Set up the role, assign an interviewer, add questions and publish when ready." action={<Link className="btn btn-secondary" to="/admin/jobs"><ArrowLeft size={16}/> Back to jobs</Link>}/>
 <div className="steps">{["Job information","Interviewer","Thresholds","Questions","Publish"].map((x,i)=>{const n=i+1;return <div className={`step ${step===n?"current":step>n?"done":""}`} key={x}><span>{step>n?<Check size={14}/>:n}</span><label>{x}</label></div>})}</div>
 <div className="card form-card">
 {step===1&&<><FormTitle title="Job information" text="Start with the role details candidates will see."/><TextArea label="Job title" rows={2} value={form.title} onChange={v=>update("title",v)} placeholder="Java Backend Developer" required/><TextArea label="Job description" value={form.description} onChange={v=>update("description",v)} placeholder="Describe the role, responsibilities and requirements." required/><div className="form-actions"><button className="btn btn-primary" onClick={()=>setStep(2)} disabled={!form.title||!form.description}>Continue <ChevronRight size={16}/></button></div></>}
 {step===2&&<><FormTitle title="Select interviewer" text="Choose an interviewer from your organization."/><label className="field"><span>Interviewer<em>*</em></span><select value={form.interviewer_id} onChange={e=>update("interviewer_id",e.target.value)}><option value="">Select interviewer</option>{interviewers.map((x,i)=><option key={x.user_id||x.id||i} value={x.user_id||x.id}>{x.name} — {x.email}</option>)}</select></label><div className="form-actions"><button className="btn btn-secondary" onClick={()=>setStep(1)}><ArrowLeft size={16}/> Back</button><button className="btn btn-primary" onClick={()=>setStep(3)} disabled={!form.interviewer_id}>Continue <ChevronRight size={16}/></button></div></>}
 {step===3&&<><FormTitle title="Thresholds & expiry" text="These values are sent to the backend when the draft is created."/><div className="form-grid-3"><Field label="Screening threshold" type="number" value={form.screening_threshold} onChange={v=>update("screening_threshold",v)} placeholder="70"/><Field label="Exam threshold" type="number" value={form.exam_threshold} onChange={v=>update("exam_threshold",v)} placeholder="70"/><Field label="Expiry" type="datetime-local" value={form.expiry} onChange={v=>update("expiry",v)}/></div><div className="info-box"><Clock3 size={17}/><span>The job is created as a <b>DRAFT</b>. You will add questions before publishing.</span></div><div className="form-actions"><button className="btn btn-secondary" onClick={()=>setStep(2)}><ArrowLeft size={16}/> Back</button><button className="btn btn-primary" onClick={createDraft} disabled={busy}>{busy?<><LoaderCircle className="spin" size={16}/> Creating...</>:<>Create draft <ChevronRight size={16}/></>}</button></div></>}
 {step===4&&<><FormTitle title={`Questions ${jdId?`for ${jdId}`:""}`} text="Add free-text questions and reference answers. Candidates never see reference answers."/><div className="question-form"><TextArea label="Question" rows={3} value={q.question} onChange={v=>setQ({...q,question:v})} placeholder="Explain dependency injection in Spring Boot." required/><TextArea label="Reference answer" rows={4} value={q.reference_answer} onChange={v=>setQ({...q,reference_answer:v})} placeholder="A strong reference answer used by the backend for evaluation." required/><Field label="Marks" type="number" value={q.marks} onChange={v=>setQ({...q,marks:v})} placeholder="10" required/><button className="btn btn-secondary" onClick={addQuestion} disabled={busy||!q.question||!q.reference_answer}>{busy?<LoaderCircle className="spin" size={16}/>:<Plus size={16}/>} Add question</button></div><div className="added-questions">{questions.map((x,i)=><div className="question-row" key={i}><span className="question-number">{i+1}</span><div><b>{x.question}</b><small>{x.marks} marks</small></div><Check size={18}/></div>)}</div><div className="form-actions"><button className="btn btn-secondary" onClick={()=>setStep(3)}><ArrowLeft size={16}/> Back</button><button className="btn btn-primary" onClick={()=>setStep(5)} disabled={!questions.length}>Review & publish <ChevronRight size={16}/></button></div></>}
 {step===5&&<><FormTitle title="Review & publish" text="Check the setup before making the job live."/><div className="review-grid"><Review label="Job title" value={form.title}/><Review label="Interviewer" value={interviewers.find(x=>(x.user_id||x.id)===form.interviewer_id)?.name||form.interviewer_id}/><Review label="Questions" value={`${questions.length} added`}/><Review label="Screening threshold" value={form.screening_threshold||"—"}/><Review label="Exam threshold" value={form.exam_threshold||"—"}/><Review label="Expiry" value={form.expiry?formatDate(form.expiry):"—"}/></div><div className="publish-callout"><div className="publish-icon"><Send size={19}/></div><div><b>Ready to publish?</b><p>Publishing makes the job LIVE. The backend will validate the job before publishing.</p></div></div><div className="form-actions"><button className="btn btn-secondary" onClick={()=>setStep(4)}><ArrowLeft size={16}/> Back</button><button className="btn btn-primary" onClick={publish} disabled={busy}>{busy?<><LoaderCircle className="spin" size={16}/> Publishing...</>:<><Send size={16}/> Publish job</>}</button></div></>}
 {error&&<InlineError text={error}/>}
 </div><Toast message={toast} onClose={()=>setToast("")}/>
 </>;
}
function FormTitle({title,text}){return <div className="form-title"><h2>{title}</h2><p>{text}</p></div>}
function Review({label,value}){return <div className="review-item"><span>{label}</span><b>{value}</b></div>}

function Interviewers() {
 const [items,setItems]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[show,setShow]=useState(false),[form,setForm]=useState({name:"",email:"",password:""}),[busy,setBusy]=useState(false),[toast,setToast]=useState("");
 const load=async()=>{setLoading(true);setError("");try{const d=await apiRequest("/admin/interviewers",{auth:true});const rows=Array.isArray(d)?d:(d?.items||d?.interviewers||[]);setItems(rows);rows.forEach(x=>rememberAuditEntity("User", x?.user_id||x?.id));}catch(e){setError(e.message)}finally{setLoading(false)}};
 useEffect(()=>{load()},[]);
 const add=async e=>{e.preventDefault();setBusy(true);setError("");try{const d=await apiAction("/admin/interviewers/create",form);const userId=d?.user_id||d?.interviewer_id||d?.user?.user_id||d?.user?.id||d?.interviewer?.user_id||d?.interviewer?.id||d?.id; if(userId) rememberAuditEntity("User", userId);setForm({name:"",email:"",password:""});setShow(false);setToast("Interviewer created.");load()}catch(e){setError(e.message)}finally{setBusy(false)}};
 const remove=async id=>{if(!confirm("Remove this interviewer? The backend may reject the action if the interviewer is assigned to jobs."))return;setError("");try{rememberAuditEntity("User", id);await apiAction(`/admin/interviewers/${id}/delete`);setToast("Interviewer removed.");load()}catch(e){setError(e.message)}};
 return <><PageHeader eyebrow="People" title="Interviewers" description="Manage interviewers in your organization." action={<button className="btn btn-primary" onClick={()=>setShow(true)}><UserPlus size={17}/> Add interviewer</button>}/>
 {show&&<div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><h2>Add interviewer</h2><p>Create an interviewer account in this organization.</p></div><button className="icon-btn" onClick={()=>setShow(false)}><X size={18}/></button></div><form onSubmit={add}><Field label="Name" value={form.name} onChange={v=>setForm({...form,name:v})} placeholder="Arjun Rao" required/><Field label="Email" type="email" value={form.email} onChange={v=>setForm({...form,email:v})} placeholder="interviewer@company.com" required/><Field label="Temporary password" type="password" value={form.password} onChange={v=>setForm({...form,password:v})} placeholder="Password123!" required/>{error&&<InlineError text={error}/>}<div className="form-actions"><button type="button" className="btn btn-secondary" onClick={()=>setShow(false)}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy?<LoaderCircle className="spin" size={16}/>:<UserPlus size={16}/>} Create interviewer</button></div></form></div></div>}
 {loading?<Spinner text="Loading interviewers..."/>:error&&!show?<ErrorState message={error} retry={load}/>:<div className="card table-card">{items.length?<table><thead><tr><th>Name</th><th>Email</th><th>Created at</th><th></th></tr></thead><tbody>{items.map((x,i)=><tr key={x.user_id||x.id||i}><td><div className="primary-cell"><div className="avatar small">{(x.name||"I")[0]}</div><b>{x.name||"—"}</b></div></td><td>{x.email||"—"}</td><td>{formatDate(x.created_at)}</td><td><button className="icon-link danger" title="Remove" onClick={()=>remove(x.user_id||x.id)}><Trash2 size={17}/></button></td></tr>)}</tbody></table>:<Empty icon={UsersRound} title="No interviewers yet" text="Add an interviewer to assign them to jobs." action={<button className="btn btn-primary btn-small" onClick={()=>setShow(true)}><UserPlus size={15}/> Add interviewer</button>}/>}</div>}
 <Toast message={toast} onClose={()=>setToast("")}/>
 </>;
}

function JobDetail() {
 const {jdId}=useParams(); const nav=useNavigate();
 const [job,setJob]=useState(null),[questions,setQuestions]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[toast,setToast]=useState("");
 const load=async()=>{setLoading(true);setError("");try{const [j,q]=await Promise.all([apiRequest(`/admin/jds/${jdId}`,{auth:true}),apiRequest(`/admin/jds/${jdId}/questions`,{auth:true})]);setJob(j);setQuestions(Array.isArray(q)?q:(q?.items||q?.questions||[]))}catch(e){setError(e.message)}finally{setLoading(false)}};
 useEffect(()=>{load()},[jdId]);
 const action=async endpoint=>{setError("");try{await apiAction(`/admin/jds/${jdId}/${endpoint}`);setToast(`${endpoint[0].toUpperCase()+endpoint.slice(1)} completed.`);load()}catch(e){setError(e.message)}};
 if(loading)return <Spinner text="Loading job..." />; if(error&&!job)return <ErrorState message={error} retry={load}/>;
 return <><PageHeader eyebrow="Jobs / Detail" title={job?.title||job?.job_title||"Job"} description="Review the role configuration, questions and applicants." action={<button className="btn btn-secondary" onClick={()=>nav("/admin/jobs")}><ArrowLeft size={16}/> Jobs</button>}/>
 <div className="detail-top card"><div><StatusBadge status={job?.status}/><h2>{job?.title||job?.job_title}</h2><p>{job?.description||"No description provided."}</p></div><div className="detail-actions">{String(job?.status||"").toUpperCase()==="DRAFT"&&<button className="btn btn-primary" onClick={()=>action("publish")}><Send size={16}/> Publish</button>}{String(job?.status||"").toUpperCase()==="LIVE"&&<button className="btn btn-secondary" onClick={()=>action("unpublish")}>Unpublish</button>}<Link className="btn btn-secondary" to={`/admin/jobs/${jdId}/applications`}><UsersRound size={16}/> Applicants</Link></div></div>
 {error&&<InlineError text={error}/>}
 <div className="two-col"><div className="card"><SectionTitle title="Job details"/><div className="facts"><Fact label="Interviewer" value={job?.interviewer_name||job?.interviewer||"—"}/><Fact label="Screening threshold" value={job?.screening_threshold??"—"}/><Fact label="Exam threshold" value={job?.exam_threshold??"—"}/><Fact label="Expiry" value={formatDate(job?.expiry)}/><Fact label="Questions" value={questions.length}/><Fact label="Applications" value={job?.application_count??job?.applications??0}/></div></div>
 <div className="card"><SectionTitle title="Questions" action={<span className="count-pill">{questions.length}</span>}/>{questions.length?<div className="question-list">{questions.map((q,i)=><div className="admin-question" key={q.question_id||q.id||i}><div className="question-meta"><span>Q{i+1}</span><b>{q.marks??q.mark??"—"} marks</b></div><p>{q.question||q.text}</p>{q.reference_answer&&<details><summary>Reference answer</summary><p>{q.reference_answer}</p></details>}</div>)}</div>:<Empty icon={ListChecks} title="No questions" text="Add questions during job creation before publishing."/>}</div></div>
 <div className="card applicant-cta"><div><h3>Applications</h3><p>Open the applicant list to review candidates and scores for this job.</p></div><Link className="btn btn-primary" to={`/admin/jobs/${jdId}/applications`}>View applicants <ChevronRight size={16}/></Link></div>
 <Toast message={toast} onClose={()=>setToast("")}/>
 </>;
}
function SectionTitle({title,action}){return <div className="section-title"><h3>{title}</h3>{action}</div>}
function Fact({label,value}){return <div className="fact"><span>{label}</span><b>{value||"—"}</b></div>}

function Applications() {
 const {jdId}=useParams(); const [items,setItems]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[sort,setSort]=useState("combined_score");
 const load=async()=>{setLoading(true);setError("");try{const d=await apiRequest(`/admin/jds/${jdId}/applications`,{auth:true,params:{sort_by:sort,order:"desc"}});setItems(Array.isArray(d)?d:(d?.items||d?.applications||[]))}catch(e){setError(e.message)}finally{setLoading(false)}};
 useEffect(()=>{load()},[jdId,sort]);
 if(loading)return <Spinner text="Loading applicants..." />; if(error)return <ErrorState message={error} retry={load}/>;
 return <><PageHeader eyebrow="Jobs / Applicants" title="Applicants" description="Review candidate applications and their pipeline scores." action={<Link className="btn btn-secondary" to={`/admin/jobs/${jdId}`}><ArrowLeft size={16}/> Job details</Link>}/>
 <div className="toolbar"><label className="sort-select">Sort by <select value={sort} onChange={e=>setSort(e.target.value)}><option value="combined_score">Combined score</option><option value="resume_score">Resume score</option><option value="exam_score">Exam score</option><option value="integrity_score">Integrity score</option><option value="created_at">Created at</option><option value="updated_at">Updated at</option></select></label><button className="btn btn-secondary" onClick={load}><RefreshCw size={16}/> Refresh</button></div>
 <div className="card table-card">{items.length?<table><thead><tr><th>Candidate</th><th>Status</th><th>Resume</th><th>Exam</th><th>Integrity</th><th>Combined</th><th>Applied</th><th></th></tr></thead><tbody>{items.map((a,i)=><tr key={a.app_id||a.id||i}><td><Link className="table-link" to={`/admin/applications/${a.app_id||a.id}`}><div className="candidate-cell"><div className="avatar small">{(a.candidate_name||"C")[0]}</div><div><b>{a.candidate_name||"—"}</b><small>{a.candidate_email||""}</small></div></div></Link></td><td><StatusBadge status={a.status}/></td><td><Score value={a.resume_score}/></td><td><Score value={a.exam_score}/></td><td><Score value={a.integrity_score}/></td><td><Score value={a.combined_score}/></td><td>{formatDate(a.applied_at)}</td><td><Link className="icon-link" to={`/admin/applications/${a.app_id||a.id}`}><Eye size={17}/></Link></td></tr>)}</tbody></table>:<Empty icon={UsersRound} title="No applicants yet" text="Applications will appear here when candidates apply to this job."/>}</div>
 </>;
}

function ApplicationDetail() {
 const {appId}=useParams(); const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const load=async()=>{setLoading(true);setError("");try{setData(await apiRequest(`/admin/applications/${appId}`,{auth:true}))}catch(e){setError(e.message)}finally{setLoading(false)}};
 useEffect(()=>{load()},[appId]);
 if(loading)return <Spinner text="Loading candidate..." />; if(error)return <ErrorState message={error} retry={load}/>;
 const d=data||{}; const c=d.application||d.candidate||d;
 const answers=d.answers||d.question_answers||[];
 return <><PageHeader eyebrow="Applications / Candidate" title={c.candidate_name||c.name||"Candidate"} description={c.candidate_email||c.email||"Application evidence and scoring"} action={<button className="btn btn-secondary" onClick={()=>window.history.back()}><ArrowLeft size={16}/> Back</button>}/>
 <div className="candidate-head card"><div className="candidate-profile"><div className="avatar large">{(c.candidate_name||c.name||"C")[0]}</div><div><h2>{c.candidate_name||c.name||"Candidate"}</h2><p><Mail size={14}/> {c.candidate_email||c.email||"—"}</p><p><CalendarDays size={14}/> Applied {formatDate(c.applied_at||c.created_at)}</p></div></div><StatusBadge status={c.status}/></div>
 <div className="score-grid"><ScoreCard label="Resume Score" value={c.resume_score}/><ScoreCard label="Exam Score" value={c.exam_score}/><ScoreCard label="Integrity Score" value={c.integrity_score}/><ScoreCard label="Combined Score" value={c.combined_score}/></div>
 <div className="two-col"><div className="card"><SectionTitle title="Resume" /><div className="resume-box"><FileText size={27}/><div><b>Candidate resume</b><p>Use the temporary resume URL supplied by the backend.</p>{c.resume_url?<a className="btn btn-secondary btn-small" href={c.resume_url} target="_blank" rel="noreferrer">View resume <ExternalLink size={14}/></a>:<span className="muted">No resume URL returned.</span>}</div></div></div>
 <div className="card"><SectionTitle title="Screening" /><div className="evidence">{renderEvidence(d.screening_result||d.screening||c.screening_result)}</div></div></div>
 <div className="card answers-card"><SectionTitle title="Answers" action={<span className="count-pill">{answers.length}</span>}/>{answers.length?<div className="answer-list">{answers.map((a,i)=><div className="answer-item" key={i}><div className="answer-label">Question {i+1}</div><h4>{a.question||a.text}</h4><div className="answer-grid"><div><span>Candidate answer</span><p>{a.candidate_answer||a.answer||"—"}</p></div><div><span>Reference answer</span><p>{a.reference_answer||"—"}</p></div></div>{a.ai_feedback&&<div className="feedback"><b>AI feedback</b><p>{a.ai_feedback}</p></div>}{a.score!==undefined&&<div className="answer-score">Score <b>{a.score}</b></div>}</div>)}</div>:<Empty icon={ListChecks} title="No answers returned" text="The backend did not provide question answers for this application."/>} </div>
 <AuditTimeline entityId={appId} />
 {d.proctoring_events&&<div className="card"><SectionTitle title="Proctoring information"/><pre className="json-view">{JSON.stringify(d.proctoring_events,null,2)}</pre></div>}
 </>;
}
function ScoreCard({label,value}){return <div className="card score-card"><span>{label}</span><b>{value??"—"}</b></div>}
function renderEvidence(value){if(!value)return <span className="muted">No screening information returned.</span>;if(typeof value==="string")return <p>{value}</p>;return <pre className="json-view">{JSON.stringify(value,null,2)}</pre>}

function App() {
 return <Routes>
   <Route path="/login" element={<Login/>}/><Route path="/signup" element={<Signup/>}/>
   <Route path="/admin/*" element={<ProtectedRoute><Shell><Routes>
      <Route path="dashboard" element={<Dashboard/>}/>
      <Route path="jobs" element={<Jobs/>}/>
      <Route path="jobs/create" element={<CreateJob/>}/>
      <Route path="jobs/:jdId" element={<JobDetail/>}/>
      <Route path="jobs/:jdId/applications" element={<Applications/>}/>
      <Route path="applications/:appId" element={<ApplicationDetail/>}/>
      <Route path="interviewers" element={<Interviewers/>}/>
      <Route path="audit" element={<AuditPage/>}/>
      <Route path="*" element={<Navigate to="/admin/dashboard" replace/>}/>
   </Routes></Shell></ProtectedRoute>}/>
   <Route path="/" element={<Navigate to="/admin/dashboard" replace/>}/>
   <Route path="*" element={<Navigate to="/admin/dashboard" replace/>}/>
 </Routes>;
}
function formatDate(v){if(!v)return "—";const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString(undefined,{day:"2-digit",month:"short",year:"numeric"});}
createRoot(document.getElementById("root")).render(<BrowserRouter basename={import.meta.env.BASE_URL}><AuthProvider><App/></AuthProvider></BrowserRouter>);
