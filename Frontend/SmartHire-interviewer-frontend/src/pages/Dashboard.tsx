import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, SmartHireApiError } from "../api";
import { Empty, ErrorState, Loading, Score, StatusBadge } from "../components/State";

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const result = await api.dashboard();
      setData(result);
      setState("ready");
    } catch (err: any) {
      setError(err instanceof SmartHireApiError ? err.message : "Unable to load dashboard.");
      setState("error");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (state === "loading") return <Loading text="Loading dashboard..." />;
  if (state === "error") return <ErrorState message={error} onRetry={load} />;

  const counts = data?.counts || {};
  const pending = data?.pending_decisions || [];
  const recent = data?.recently_decided || [];
  const assignedJobs = data?.assigned_jobs || data?.jobs || [];

  return (
    <div>
      <div className="page-heading row-between">
        <div>
          <p className="eyebrow">Interviewer Dashboard</p>
          <h1>Good morning, {data?.profile?.name || "Interviewer"}</h1>
        </div>
        <button className="secondary-button" onClick={load}>Refresh</button>
      </div>

      <div className="stats-grid">
        <Stat title="Assigned JDs" value={counts.assigned_jobs ?? assignedJobs.length} />
        <Stat title="Candidates" value={counts.assigned_total} />
        <Stat title="Pending Decisions" value={counts.pending_decisions} />
        <Stat title="Accepted" value={counts.accepted} />
        <Stat title="Rejected" value={counts.rejected} />
      </div>

      <section className="section">
        <div className="section-heading"><h2>Assigned Job Descriptions (JDs)</h2></div>
        {assignedJobs.length === 0 ? (
          <Empty text="No job descriptions currently assigned to you." />
        ) : (
          <div className="table-card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Job Title</th>
                    <th>Screening Threshold</th>
                    <th>Exam Threshold</th>
                    <th>Candidates</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {assignedJobs.map((j: any) => (
                    <tr key={j.jd_id}>
                      <td><strong>{j.title}</strong></td>
                      <td>{j.screening_threshold}%</td>
                      <td>{j.exam_threshold}%</td>
                      <td>{j.application_count ?? 0} applied</td>
                      <td><span className="status-badge status-accepted">{j.status || "LIVE"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-heading"><h2>Pending Decisions</h2></div>
        {pending.length === 0 ? (
          <Empty text="No pending decisions." />
        ) : (
          <ApplicationTable items={pending} />
        )}
      </section>

      <section className="section">
        <div className="section-heading"><h2>Recently Decided</h2></div>
        {recent.length === 0 ? (
          <Empty text="No recently decided applications." />
        ) : (
          <ApplicationTable items={recent} recent />
        )}
      </section>
    </div>
  );
}

function Stat({ title, value }: { title: string; value: any }) {
  return <div className="stat-card"><span>{title}</span><strong>{value ?? 0}</strong></div>;
}

function ApplicationTable({ items, recent = false }: { items: any[]; recent?: boolean }) {
  return (
    <div className="table-card">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Candidate</th>
              <th>Job</th>
              <th>Status</th>
              <th>Resume</th>
              <th>Exam</th>
              <th>Integrity</th>
              <th>Combined</th>
              <th>{recent ? "Decision" : "Flag"}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.app_id}>
                <td>{item.candidate_name || "—"}</td>
                <td>{item.job_title || "—"}</td>
                <td><StatusBadge value={item.status} /></td>
                <td><Score value={item.resume_score} /></td>
                <td><Score value={item.exam_score} /></td>
                <td><Score value={item.integrity_score} /></td>
                <td><Score value={item.combined_score} /></td>
                <td>{recent ? <StatusBadge value={item.decision} /> : (item.auto_flagged ? <span className="flag-text">Flagged</span> : "No")}</td>
                <td><Link className="table-link" to={`/interviewer/applications/${item.app_id}`}>Review</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
