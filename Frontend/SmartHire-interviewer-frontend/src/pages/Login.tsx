import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { login, SmartHireApiError } from "../api";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("interviewer@example.com");
  const [password, setPassword] = useState("password123");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    try {
      await login(email, password);
      const destination = (location.state as any)?.from || "/interviewer/dashboard";
      navigate(destination, { replace: true });
    } catch (err: any) {
      setError(err instanceof SmartHireApiError ? err.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="brand large">SmartHire</div>
        <h1>Interviewer Sign in</h1>
        <p className="muted">Sign in with the interviewer account created by the Admin.</p>

        {error && <div className="alert">{error}</div>}

        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </label>

        <label>
          Password
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
        </label>

        <button className="primary-button full" disabled={busy}>
          {busy ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
