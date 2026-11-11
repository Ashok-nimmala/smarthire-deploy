import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, SmartHireApiError } from "../api";
import { Empty, ErrorState, Loading, Score, StatusBadge } from "../components/State";

export default function ApplicationDetails() {
  const { appId = "" } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [decisionNote, setDecisionNote] = useState("");
  const [confirm, setConfirm] = useState<"ACCEPTED" | "FINAL_REJECTED" | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const [detail, noteData] = await Promise.all([api.application(appId), api.notes(appId)]);
      setData(detail);
      setNotes(noteData?.notes || []);
      setState("ready");
    } catch (err: any) {
      setError(err instanceof SmartHireApiError ? err.message : "Unable to load candidate.");
      setState("error");
    }
  }, [appId]);

  useEffect(() => { load(); }, [load]);

  async function addNote() {
    if (note.trim().length < 1 || note.trim().length > 2000) {
      setError("Note must contain 1–2000 characters.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.addNote(appId, note.trim());
      setNote("");
      const refreshed = await api.notes(appId);
      setNotes(refreshed?.notes || []);
    } catch (err: any) {
      setError(err instanceof SmartHireApiError ? err.message : "Unable to add note.");
    } finally {
      setBusy(false);
    }
  }

  async function makeDecision() {
    if (!confirm) return;
    if (decisionNote.trim().length < 1 || decisionNote.trim().length > 2000) {
      setError("Decision note is required and must contain 1–2000 characters.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      await api.decision(appId, confirm, decisionNote.trim());
      setConfirm(null);
      setDecisionNote("");
      await load();
    } catch (err: any) {
      setError(err instanceof SmartHireApiError ? err.message : "Unable to submit decision.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return <Loading text="Loading candidate..." />;
  if (state === "error") return <ErrorState message={error} onRetry={load} />;

  const a = data?.application || {};
  const c = data?.candidate || {};
  const j = data?.job || {};
  const resume = data?.resume || {};
  const screening = data?.screening_result || {};
  const exam = data?.exam || {};
  const integrity = data?.integrity || {};
  const flags = data?.auto_flags || [];
  const decision = data?.decision || {};

  const answers = exam?.answers || exam?.questions || [];
  const events = integrity?.events || integrity?.proctoring_events || [];

  return (
    <div>
      <div className="page-heading row-between">
        <div>
          <Link className="back-link" to="/interviewer/applications">← Applications</Link>
          <h1>{c.name || c.full_name || "Candidate"}</h1>
          <p className="muted">{j.title || "Job"} · {c.email || "No email"}</p>
        </div>
        <button className="secondary-button" onClick={load}>Refresh</button>
      </div>

      {error && <div className="alert">{error}</div>}

      <section className="detail-grid">
        <Card title="Application Summary">
          <Info label="Candidate" value={c.name || c.full_name} />
          <Info label="Email" value={c.email} />
          <Info label="Job" value={j.title} />
          <Info label="Status" value={<StatusBadge value={a.status || data?.status} />} />
          <ScoreRow label="Resume Score" value={a.resume_score ?? data?.resume_score} />
          <ScoreRow label="Exam Score" value={a.exam_score ?? data?.exam_score} />
          <ScoreRow label="Integrity Score" value={a.integrity_score ?? data?.integrity_score} />
          <ScoreRow label="Combined Score" value={a.combined_score ?? data?.combined_score} />
        </Card>

        <Card title="Job Information">
          <Info label="Job Title" value={j.title} />
          <Info label="Job Description" value={j.description || j.job_description} />
          <Info label="Screening Threshold" value={j.screening_threshold} />
          <Info label="Exam Threshold" value={j.exam_threshold} />
        </Card>
      </section>

      <section className="detail-grid">
        <Card title="Resume">
          {resume.text ? <pre className="resume-text">{resume.text}</pre> : <Empty text="Resume text is not available." />}
          <div className="button-row">
            {resume.download_url && <a className="secondary-button" href={resume.download_url} target="_blank" rel="noreferrer">View Resume</a>}
            {resume.download_url && <a className="secondary-button" href={resume.download_url} download>Download Resume</a>}
          </div>
        </Card>

        <Card title="Screening Result">
          <Info label="Matched Skills" value={joinValue(screening.matched_skills)} />
          <Info label="Missing Skills" value={joinValue(screening.missing_skills)} />
          <Info label="Summary" value={screening.summary} />
          <Info label="Confidence" value={screening.confidence} />
          <Info label="Experience Match" value={screening.experience_match} />
          <Info label="Red Flags" value={joinValue(screening.red_flags)} />
        </Card>
      </section>

      <section className="section">
        <Card title="Exam Review">
          <div className="mini-stats">
            <Info label="Questions Total" value={exam.questions_total} />
            <Info label="Answered" value={exam.answered} />
            <Info label="Unanswered" value={exam.unanswered} />
            <Info label="Marks Awarded" value={exam.marks_awarded} />
            <Info label="Marks Possible" value={exam.marks_possible} />
            <Info label="Score Percent" value={exam.score_percent} />
          </div>
          {answers.length === 0 ? <Empty text="No answer records available." /> : (
            <div className="answer-list">
              {answers.map((item: any, i: number) => (
                <div className="answer-card" key={item.id || i}>
                  <h3>Question {i + 1}</h3>
                  <p><strong>Question:</strong> {item.question}</p>
                  <p><strong>Reference Answer:</strong> {item.reference_answer || item.referenceAnswer || "—"}</p>
                  <p><strong>Candidate Answer:</strong> {item.candidate_answer || item.answer || "—"}</p>
                  <p><strong>Marks:</strong> {item.marks_awarded ?? "—"} / {item.max_marks ?? "—"}</p>
                  <p><strong>AI Feedback:</strong> {item.ai_feedback || item.feedback || "—"}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      <section className="detail-grid">
        <Card title="Integrity / Proctoring">
          <Info label="Integrity Score" value={integrity.score ?? integrity.integrity_score} />
          {events.length === 0 ? <Empty text="No proctoring events available." /> : (
            <ul className="event-list">
              {events.map((event: any, i: number) => (
                <li key={i}><strong>{event.type || event.event || "Event"}</strong><span>{event.at || event.timestamp || ""}</span></li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Auto Flags">
          <Info label="Auto Flagged" value={data?.auto_flagged ?? flags.length > 0 ? "Yes" : "No"} />
          {flags.length === 0 ? <Empty text="No auto flags." /> : (
            <ul className="flag-list">
              {flags.map((flag: any, i: number) => <li key={i}>{typeof flag === "string" ? flag : flag.reason || JSON.stringify(flag)}</li>)}
            </ul>
          )}
        </Card>
      </section>

      <section className="section">
        <Card title="Interviewer Notes">
          {notes.length === 0 ? <Empty text="No notes yet." /> : (
            <div className="notes-list">
              {notes.map((item: any, i: number) => (
                <div className="note-item" key={i}>
                  <div><strong>{item.by || "Interviewer"}</strong><span>{item.at || ""}</span></div>
                  <p>{item.note}</p>
                  {item.action && <small>{item.action}</small>}
                </div>
              ))}
            </div>
          )}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="Add an interviewer note..." />
          <div className="row-between"><small>{note.length}/2000</small><button className="primary-button" disabled={busy} onClick={addNote}>Add Note</button></div>
        </Card>
      </section>

      <section className="decision-panel">
        <div>
          <p className="eyebrow">Final Decision</p>
          <h2>Make the interview decision</h2>
          <p className="muted">A decision note is required. The decision action is sent only after explicit confirmation.</p>
        </div>
        <div className="button-row">
          <button className="accept-button" disabled={busy || a.status !== "INTERVIEW_PENDING"} onClick={() => setConfirm("ACCEPTED")}>Accept Candidate</button>
          <button className="reject-button" disabled={busy || a.status !== "INTERVIEW_PENDING"} onClick={() => setConfirm("FINAL_REJECTED")}>Reject Candidate</button>
        </div>
        {decision?.decision && <p className="muted">Current decision: <StatusBadge value={decision.decision} /></p>}
      </section>

      {confirm && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>{confirm === "ACCEPTED" ? "Accept Candidate" : "Reject Candidate"}</h2>
            <p>Enter the decision note before submitting.</p>
            <textarea value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} maxLength={2000} placeholder="Decision note (required)" />
            <div className="button-row right">
              <button className="secondary-button" onClick={() => setConfirm(null)}>Cancel</button>
              <button className={confirm === "ACCEPTED" ? "accept-button" : "reject-button"} disabled={busy} onClick={makeDecision}>
                {busy ? "Submitting..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="content-card"><h2>{title}</h2>{children}</div>;
}

function Info({ label, value }: { label: string; value: any }) {
  return <div className="info-row"><span>{label}</span><div>{value === null || value === undefined || value === "" ? "—" : value}</div></div>;
}

function ScoreRow({ label, value }: { label: string; value: any }) {
  return <Info label={label} value={<Score value={value} />} />;
}

function joinValue(value: any) {
  if (Array.isArray(value)) return value.join(", ");
  return value;
}
