import type { ApiErrorShape, Session } from "./types";

const isLocalHost = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

const BASE_URL =
  (typeof window !== "undefined" && (new URLSearchParams(window.location.search).get("api_base") || (window as any).SMARTHIRE_API_BASE || localStorage.getItem("smarthire_api_base"))) ||
  import.meta.env.VITE_SMARTHIRE_API_BASE ||
  import.meta.env.VITE_API_BASE_URL ||
  (isLocalHost ? "http://localhost:8000" : "https://smarthire-deploy-api.onrender.com");

export class SmartHireApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 0) {
    super(message);
    this.name = "SmartHireApiError";
    this.code = code;
    this.status = status;
  }
}

function session(): Session | null {
  try {
    const p = new URLSearchParams(window.location.search);
    const token = p.get("session_token") || p.get("token");
    if (token) {
      const sess: Session = {
        session_token: token,
        user_id: p.get("user_id") || "usr_interviewer_1",
        role: "interviewer",
        name: p.get("name") || "Lead Technical Interviewer",
        email: p.get("email") || "interviewer@example.com",
        org_id: "org_bnp",
        organization_name: "BNP Paribas"
      };
      saveSession(sess);
      window.history.replaceState({}, document.title, window.location.pathname);
      return sess;
    }
  } catch {}
  const raw = sessionStorage.getItem("smarthire_interviewer_session");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    sessionStorage.removeItem("smarthire_interviewer_session");
    return null;
  }
}

export function saveSession(value: Session) {
  sessionStorage.setItem("smarthire_interviewer_session", JSON.stringify(value));
}

export function getSession(): Session | null {
  return session();
}

export function clearSession() {
  sessionStorage.removeItem("smarthire_interviewer_session");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const current = session();
  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");

  if (current?.session_token) {
    headers.set("Authorization", `Bearer ${current.session_token}`);
  }
  if (current?.user_id) {
    headers.set("X-Interviewer-Id", current.user_id);
  }
  if (current?.email) {
    headers.set("X-Interviewer-Email", current.email);
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers
  });

  let body: any = null;
  try {
    body = await response.json();
  } catch {
    throw new SmartHireApiError("INVALID_RESPONSE", "The server returned an invalid response.", response.status);
  }

  if (response.status === 401) {
    clearSession();
  }

  if (!response.ok || body?.success === false) {
    const err: ApiErrorShape = body?.error || {};
    throw new SmartHireApiError(
      err.code || `HTTP_${response.status}`,
      err.message || "The request could not be completed.",
      response.status
    );
  }

  if (body?.success !== true) {
    throw new SmartHireApiError("INVALID_RESPONSE", "The server response did not contain the expected success envelope.", response.status);
  }

  return body.data as T;
}

export async function login(email: string, password: string): Promise<Session> {
  const params = new URLSearchParams({ email, password });
  const data = await request<any>(`/auth/login?${params.toString()}`, { method: "GET" });

  if (data.role !== "interviewer") {
    throw new SmartHireApiError("FORBIDDEN", "This account is not an interviewer account.", 403);
  }

  const value: Session = {
    session_token: data.session_token,
    user_id: data.user_id,
    role: data.role,
    name: data.name,
    email: data.email,
    org_id: data.org_id,
    organization_name: data.organization_name
  };

  saveSession(value);
  return value;
}

export const api = {
  dashboard: () => request<any>("/interviewer/dashboard"),
  applications: () => request<any>("/interviewer/applications"),
  application: (id: string) => request<any>(`/interviewer/applications/${encodeURIComponent(id)}`),
  notes: (id: string) => request<any>(`/interviewer/applications/${encodeURIComponent(id)}/notes`),
  addNote: (id: string, note: string) =>
    request<any>(`/interviewer/applications/${encodeURIComponent(id)}/notes/add?${new URLSearchParams({ note })}`),
  decision: (id: string, decision: "ACCEPTED" | "FINAL_REJECTED", note: string) =>
    request<any>(
      `/interviewer/applications/${encodeURIComponent(id)}/decision?${new URLSearchParams({
        decision,
        note
      })}`
    )
};
