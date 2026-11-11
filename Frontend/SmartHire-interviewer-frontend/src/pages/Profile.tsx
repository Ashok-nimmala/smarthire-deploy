import { getSession } from "../api";

export default function Profile() {
  const session = getSession();

  return (
    <div>
      <div className="page-heading">
        <p className="eyebrow">Account</p>
        <h1>Profile</h1>
        <p className="muted">Basic interviewer identity from the current session.</p>
      </div>

      <div className="content-card profile-card">
        <Info label="User ID" value={session?.user_id} />
        <Info label="Name" value={session?.name} />
        <Info label="Email" value={session?.email} />
        <Info label="Role" value={session?.role} />
        <Info label="Organization" value={session?.organization_name} />
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return <div className="info-row"><span>{label}</span><strong>{value || "—"}</strong></div>;
}
