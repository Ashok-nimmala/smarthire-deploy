export type Session = {
  session_token: string;
  user_id: string;
  role: string;
  name: string;
  email: string;
  org_id?: string;
  organization_name?: string;
};

export type ApiErrorShape = {
  code?: string;
  message?: string;
};

export type DashboardData = {
  profile: {
    user_id: string;
    name: string;
    email: string;
  };
  counts: {
    assigned_total: number;
    pending_decisions: number;
    accepted: number;
    rejected: number;
  };
  pending_decisions: any[];
  recently_decided: any[];
  generated_at?: string;
};

export type ApplicationsData = {
  count: number;
  applications: any[];
};
