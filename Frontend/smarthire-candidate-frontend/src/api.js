export const BASE_URL =
  (typeof window !== "undefined" && (new URLSearchParams(window.location.search).get("api_base") || window.SMARTHIRE_API_BASE || localStorage.getItem("smarthire_api_base"))) ||
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:8000";

const REMOTE_LAMBDA_URL =
  "https://r6j6keh5jn7ne2oykddo7k5vpi0rhdjx.lambda-url.ap-south-1.on.aws";

export class ApiError extends Error {
  constructor(message, status, code, data) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export const getSession = () => {
  try {
    return JSON.parse(
      localStorage.getItem("smarthire_candidate_session") || "null"
    );
  } catch {
    return null;
  }
};

export const saveSession = (s) =>
  localStorage.setItem(
    "smarthire_candidate_session",
    JSON.stringify(s)
  );

export const clearSession = () =>
  localStorage.removeItem("smarthire_candidate_session");

async function request(
  path,
  {
    method = "GET",
    query,
    body,
    headers = {},
    signal,
  } = {}
) {
  const s = getSession();

  const u = new URL(BASE_URL + path);

  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v != null && v !== "") {
        u.searchParams.set(k, v);
      }
    });
  }

  const h = {
    Accept: "application/json",
    ...headers,
  };

  if (s?.session_token) {
    h.Authorization = `Bearer ${s.session_token}`;
  }

  let r;

  try {
    r = await fetch(u, {
      method,
      headers: h,
      body,
      signal,
    });
    if (!r.ok && path.startsWith("/public/")) {
      const remoteUrl = new URL(REMOTE_LAMBDA_URL + path);
      if (query) {
        Object.entries(query).forEach(([k, v]) => {
          if (v != null && v !== "") {
            remoteUrl.searchParams.set(k, v);
          }
        });
      }
      const remoteResp = await fetch(remoteUrl, { method, headers: h, body, signal });
      if (remoteResp.ok) {
        r = remoteResp;
      }
    }
  } catch (e) {
    if (e.name === "AbortError") {
      throw e;
    }

    if (path.startsWith("/public/")) {
      try {
        const remoteUrl = new URL(REMOTE_LAMBDA_URL + path);
        if (query) {
          Object.entries(query).forEach(([k, v]) => {
            if (v != null && v !== "") {
              remoteUrl.searchParams.set(k, v);
            }
          });
        }
        r = await fetch(remoteUrl, { method, headers: h, body, signal });
      } catch {
        throw new ApiError(
          "Unable to reach SmartHire.",
          0,
          "NETWORK_ERROR"
        );
      }
    } else {
      throw new ApiError(
        "Unable to reach SmartHire.",
        0,
        "NETWORK_ERROR"
      );
    }
  }

  let p;

  const t = await r.text();

  try {
    p = t ? JSON.parse(t) : null;
  } catch {
    p = t;
  }

  if (r.status === 401) {
    if (path === "/auth/login" || path.startsWith("/auth/signup")) {
      const m =
        p?.error?.message ||
        p?.message ||
        "Incorrect email or password.";

      throw new ApiError(
        m,
        401,
        "NOT_AUTHENTICATED",
        p
      );
    }

    clearSession();

    window.dispatchEvent(
      new Event("smarthire:session-expired")
    );

    const m =
      p?.error?.message ||
      p?.message ||
      "Your session has expired.";

    throw new ApiError(
      m,
      401,
      "NOT_AUTHENTICATED",
      p
    );
  }

  if (!r.ok || p?.success === false) {
    const m =
      p?.error?.message ||
      p?.message ||
      (r.status === 429
        ? "Too many requests. Please try again."
        : r.status >= 500
        ? "Service temporarily unavailable. Please try again."
        : `Request failed (${r.status})`);

    throw new ApiError(
      m,
      r.status,
      p?.error?.code,
      p
    );
  }

  return p?.data !== undefined ? p.data : p;
}

export const api = {
  login: (email, password) =>
    request("/auth/login", {
      query: {
        email,
        password,
      },
    }),

  signup: (email, password, name) =>
    request("/auth/signup/candidate", {
      query: {
        email,
        password,
        name,
      },
    }),

  dashboard: (s) =>
    request("/candidate/dashboard", {
      signal: s,
    }),

  me: (s) =>
    request("/candidate/me", {
      signal: s,
    }),

  updateProfile: (body) =>
    request("/candidate/me/update", {
      query: {
        name: body?.name || "",
      },
    }),

  /*
   * IMPORTANT:
   * Backend expects multipart field name: "file"
   *
   * DO NOT manually set Content-Type here.
   * Browser will automatically create:
   * multipart/form-data; boundary=...
   */
  uploadResume: (file) => {
    const form = new FormData();

    form.append("file", file);

    return request("/candidate/me/resume", {
      method: "POST",
      body: form,
    });
  },

  jobs: (cursor, s) =>
    request("/public/jobs", {
      query: {
        cursor,
      },
      signal: s,
    }),

  search: (q) =>
    request("/public/search", {
      query: {
        q,
      },
    }),

  job: (id, s) =>
    request(`/public/jobs/${encodeURIComponent(id)}`, {
      signal: s,
    }),

  apply: (id, s) =>
    request(`/candidate/apply/${encodeURIComponent(id)}`, {
      method: "GET",
      signal: s,
    }),

  applications: (s) =>
    request("/candidate/me/applications", {
      signal: s,
    }),

  application: (id, s) =>
    request(
      `/candidate/me/applications/${encodeURIComponent(id)}`,
      {
        signal: s,
      }
    ),

  result: (id, s) =>
    request(
      `/candidate/me/applications/${encodeURIComponent(id)}`,
      {
        signal: s,
      }
    ),

  withdraw: (id, s) =>
    request(
      `/candidate/me/applications/${encodeURIComponent(id)}`,
      {
        signal: s,
      }
    ),

  testLlm: (params) =>
    request("/candidate/test-llm", {
      query: params,
    }),
};