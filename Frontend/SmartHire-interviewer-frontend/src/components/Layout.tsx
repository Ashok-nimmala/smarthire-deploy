import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearSession, getSession } from "../api";

export default function Layout() {
  const navigate = useNavigate();
  const current = getSession();

  function logout() {
    clearSession();
    navigate("/interviewer/login", { replace: true });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div className="brand">SmartHire</div>
          <span style={{ fontSize: "12px", background: "#e0f2fe", color: "#0369a1", padding: "2px 8px", borderRadius: "4px", fontWeight: 600 }}>Interviewer Portal</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div className="topbar-right">
            <span>{current?.name || "Interviewer"}</span>
            <button className="link-button" onClick={logout}>Sign out</button>
          </div>
        </div>
      </header>

      <div className="body-shell">
        <aside className="sidebar">
          <div className="sidebar-title">Interviewer Portal</div>
          <nav>
            <NavLink to="/interviewer/dashboard">Dashboard</NavLink>
            <NavLink to="/interviewer/applications">Applications</NavLink>
            <NavLink to="/interviewer/profile">Profile</NavLink>
          </nav>
        </aside>

        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
