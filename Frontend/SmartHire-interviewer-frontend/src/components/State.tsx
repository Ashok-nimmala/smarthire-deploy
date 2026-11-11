export function Loading({ text }: { text: string }) {
  return <div className="state-card">{text}</div>;
}

export function Empty({ text }: { text: string }) {
  return <div className="state-card">{text}</div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state-card error-state">
      <strong>Something went wrong</strong>
      <p>{message}</p>
      {onRetry && <button className="secondary-button" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function StatusBadge({ value }: { value?: string }) {
  const raw = value || "Unknown";
  const cls = raw.includes("ACCEPT") ? "accepted" : raw.includes("REJECT") ? "rejected" : raw.includes("PENDING") ? "pending" : raw.includes("FLAG") ? "flagged" : "";
  return <span className={`status-badge ${cls}`}>{raw.replaceAll("_", " ")}</span>;
}

export function Score({ value }: { value: any }) {
  return <strong>{value === null || value === undefined || value === "" ? "—" : value}</strong>;
}
