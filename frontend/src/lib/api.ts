// API calls go to the same origin — Next.js rewrites /api/* to the backend.
// This keeps cookies same-origin so refresh tokens survive page reloads.
const BASE = "";

export class ApiError extends Error {
  constructor(public status: number, public body: Record<string, unknown>) {
    super(body.detail as string ?? `API error ${status}`);
  }
}

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> ?? {}),
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (res.status === 204) return undefined as T;

  const body = await res.json();

  if (!res.ok) throw new ApiError(res.status, body);

  return body as T;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface UserPublic {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
}

export interface TeamPublic {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  my_role: string | null;
}

export interface MemberPublic {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  role: string;
  joined_at: string;
}

export interface InvitePublic {
  id: string;
  team_id: string;
  invited_email: string;
  role: string;
  token: string;
  invited_by_email: string | null;
  created_at: string;
  expires_at: string;
}

export interface InviteInfo {
  team_name: string;
  team_slug: string;
  invited_email: string;
  role: string;
  invited_by_email: string | null;
  expires_at: string;
  expired: boolean;
  already_accepted: boolean;
}

export interface RegistrationTokenPublic {
  id: string;
  team_id: string;
  label: string;
  token: string;
  created_by_email: string | null;
  max_uses: number | null;
  use_count: number;
  allowed_kinds: string[] | null;
  expires_at: string | null;
  is_active: boolean;
  is_usable: boolean;
  created_at: string;
}

export interface NodePublic {
  id: string;
  team_id: string;
  kind: string;
  name: string;
  hostname: string | null;
  ip: string | null;
  url: string | null;
  tags: string[];
  meta: Record<string, unknown>;
  notes: string | null;
  last_seen_at: string | null;
  last_seen_source: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublicSettings {
  registration_enabled: boolean;
}

export const api = {
  auth: {
    publicSettings() {
      return request<PublicSettings>("/api/auth/public-settings");
    },
    register(data: { email?: string; password: string; full_name?: string; team_name?: string; invite_token?: string; website?: string; cf_turnstile_token?: string }) {
      return request<TokenResponse>("/api/auth/register", { method: "POST", body: JSON.stringify(data) });
    },
    login(data: { email: string; password: string; website?: string; cf_turnstile_token?: string }) {
      return request<TokenResponse>("/api/auth/login", { method: "POST", body: JSON.stringify(data) });
    },
    refresh() {
      return request<TokenResponse>("/api/auth/refresh", { method: "POST" });
    },
    logout() {
      return request<{ message: string }>("/api/auth/logout", { method: "POST" });
    },
    me() {
      return request<UserPublic>("/api/auth/me");
    },
    updateProfile(data: { full_name?: string; email?: string; current_password?: string; new_password?: string }) {
      return request<UserPublic>("/api/auth/me", { method: "PATCH", body: JSON.stringify(data) });
    },
  },
  teams: {
    list() {
      return request<TeamPublic[]>("/api/teams");
    },
    create(data: { name: string; slug: string }) {
      return request<TeamPublic>("/api/teams", { method: "POST", body: JSON.stringify(data) });
    },
  },
  members: {
    list(teamId: string) {
      return request<MemberPublic[]>(`/api/teams/${teamId}/members`);
    },
    updateRole(teamId: string, membershipId: string, role: string) {
      return request<MemberPublic>(`/api/teams/${teamId}/members/${membershipId}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
    },
    remove(teamId: string, membershipId: string) {
      return request<void>(`/api/teams/${teamId}/members/${membershipId}`, { method: "DELETE" });
    },
  },
  invites: {
    list(teamId: string) {
      return request<InvitePublic[]>(`/api/teams/${teamId}/invites`);
    },
    create(teamId: string, data: { email: string; role: string }) {
      return request<InvitePublic>(`/api/teams/${teamId}/invites`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    revoke(teamId: string, inviteId: string) {
      return request<void>(`/api/teams/${teamId}/invites/${inviteId}`, { method: "DELETE" });
    },
    getInfo(token: string) {
      return request<InviteInfo>(`/api/invites/${token}`);
    },
    accept(token: string) {
      return request<{ message: string; team_id: string; role: string }>(`/api/invites/${token}/accept`, {
        method: "POST",
      });
    },
  },
  registrationTokens: {
    list(teamId: string) {
      return request<RegistrationTokenPublic[]>(`/api/teams/${teamId}/registration-tokens`);
    },
    create(teamId: string, data: { label: string; max_uses?: number | null; allowed_kinds?: string[] | null; expires_in_days?: number | null }) {
      return request<RegistrationTokenPublic>(`/api/teams/${teamId}/registration-tokens`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    revoke(teamId: string, tokenId: string) {
      return request<void>(`/api/teams/${teamId}/registration-tokens/${tokenId}`, { method: "DELETE" });
    },
  },
  nodes: {
    count(teamId: string) {
      return request<{ count: number }>(`/api/teams/${teamId}/nodes/count`);
    },
    list(teamId: string, params?: { q?: string; limit?: number; offset?: number }) {
      const qs = new URLSearchParams();
      if (params?.q) qs.set("q", params.q);
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.offset) qs.set("offset", String(params.offset));
      const q = qs.toString();
      return request<NodePublic[]>(`/api/teams/${teamId}/nodes${q ? `?${q}` : ""}`);
    },
    get(teamId: string, nodeId: string) {
      return request<NodePublic>(`/api/teams/${teamId}/nodes/${nodeId}`);
    },
    create(teamId: string, data: Partial<NodePublic>) {
      return request<NodePublic>(`/api/teams/${teamId}/nodes`, { method: "POST", body: JSON.stringify(data) });
    },
    update(teamId: string, nodeId: string, data: Partial<NodePublic>) {
      return request<NodePublic>(`/api/teams/${teamId}/nodes/${nodeId}`, { method: "PATCH", body: JSON.stringify(data) });
    },
    delete(teamId: string, nodeId: string) {
      return request<void>(`/api/teams/${teamId}/nodes/${nodeId}`, { method: "DELETE" });
    },
    bulkDelete(teamId: string, nodeIds: string[]) {
      return request<{ affected: number }>(`/api/teams/${teamId}/nodes/bulk-delete`, {
        method: "POST",
        body: JSON.stringify({ node_ids: nodeIds }),
      });
    },
    bulkTag(teamId: string, nodeIds: string[], add?: string[], remove?: string[]) {
      return request<{ affected: number }>(`/api/teams/${teamId}/nodes/bulk-tag`, {
        method: "POST",
        body: JSON.stringify({ node_ids: nodeIds, add: add ?? [], remove: remove ?? [] }),
      });
    },
  },
};
