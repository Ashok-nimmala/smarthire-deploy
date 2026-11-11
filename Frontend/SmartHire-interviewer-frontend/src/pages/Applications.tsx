import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, SmartHireApiError } from "../api";
import { Empty, ErrorState, Loading, Score, StatusBadge } from "../components/State";

export default function Applications() {
  const [data, setData] = useState<any>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("ALL");

  const load = useCallback(async () => {
    setState("loading");
    try {
      setData(await api.applications());
      setState("ready");
    } catch (err: any) {
      setError(err instanceof SmartHireApiError ? err.message : "Unable to load applications.");
      setState("error");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const items = useMemo(() => {
    const all = data?.applications || [];
    if (filter === "ALL") return all;
    return all.filter((item: any) => item.status === filter || item.decision === filter);
  }, [data, filter]);

  if (state === "loading") return <Loading text="Loading applications..." />;
  if (state === "error") return <ErrorState message={error} onRetry={load} />;

  return (
    <div>
      <div className="page-heading row-between">
        <div>
          <p className="eyebrow">Assigned Candidates</p>
          <h1>Applications</h1>
          <p className="muted">Only applications assigned to this interviewer are returned by the backend.</p>
        </div>
        <button className="secondary-button" onClick={load}>Refresh</button>
      </div>

      <div className="toolbar">
        <label className="compact-label">
          Filter
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="ALL">All</option>
            <option value="INTERVIEW_PENDING">Interview Pending</option>
            <option value="ACCEPTED">Accepted</option>
            <option value="FINAL_REJECTED">Rejected</option>
          </select>
        </label>
      </div>

      {items.length === 0 ? (
        <Empty text="No applications found." />
      ) : (
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
                  <th>Decision</th>
                  <th>Flag</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: any) => (
                  <tr key={item.app_id}>
                    <td>{item.candidate_name || "—"}</td>
                    <td>{item.job_title || "—"}</td>
                    <td><StatusBadge value={item.status} /></td>
                    <td><Score value={item.resume_score} /></td>
                    <td><Score value={item.exam_score} /></td>
                    <td><Score value={item.integrity_score} /></td>
                    <td><Score value={item.combined_score} /></td>
                    <td><StatusBadge value={item.decision} /></td>
                    <td>{item.auto_flagged ? <span className="flag-text">Flagged</span> : "No"}</td>
                    <td><Link className="table-link" to={`/interviewer/applications/${item.app_id}`}>Review</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
