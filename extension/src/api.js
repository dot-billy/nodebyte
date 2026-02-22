const STORAGE_KEYS = {
  apiUrl: "nodebyte_api_url",
  accessToken: "nodebyte_access_token",
  refreshToken: "nodebyte_refresh_token",
  teamId: "nodebyte_team_id",
  teamName: "nodebyte_team_name",
  email: "nodebyte_email",
};

async function getSettings() {
  const data = await chrome.storage.local.get(Object.values(STORAGE_KEYS));
  return {
    apiUrl: data[STORAGE_KEYS.apiUrl] || "http://localhost:8000",
    accessToken: data[STORAGE_KEYS.accessToken] || null,
    refreshToken: data[STORAGE_KEYS.refreshToken] || null,
    teamId: data[STORAGE_KEYS.teamId] || null,
    teamName: data[STORAGE_KEYS.teamName] || null,
    email: data[STORAGE_KEYS.email] || null,
  };
}

async function saveTokens(accessToken, refreshToken) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.accessToken]: accessToken,
    [STORAGE_KEYS.refreshToken]: refreshToken,
  });
}

async function clearAuth() {
  await chrome.storage.local.remove([
    STORAGE_KEYS.accessToken,
    STORAGE_KEYS.refreshToken,
    STORAGE_KEYS.teamId,
    STORAGE_KEYS.teamName,
    STORAGE_KEYS.email,
  ]);
}

async function request(path, options = {}) {
  const settings = await getSettings();
  const url = `${settings.apiUrl}${path}`;
  const headers = { "Content-Type": "application/json", ...options.headers };

  if (settings.accessToken) {
    headers["Authorization"] = `Bearer ${settings.accessToken}`;
  }

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401 && !options._retried) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return request(path, { ...options, _retried: true });
    }
    throw new Error("Session expired. Please log in again.");
  }

  if (res.status === 204) return null;
  const body = await res.json();
  if (!res.ok) throw new Error(body.detail || `Error ${res.status}`);
  return body;
}

async function tryRefresh() {
  const settings = await getSettings();
  if (!settings.refreshToken) return false;

  try {
    const res = await fetch(`${settings.apiUrl}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: settings.refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    await saveTokens(data.access_token, data.refresh_token || settings.refreshToken);
    return true;
  } catch {
    return false;
  }
}

const api = {
  async login(email, password) {
    const settings = await getSettings();
    const res = await fetch(`${settings.apiUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.detail || "Login failed");

    await saveTokens(body.access_token, body.refresh_token || null);
    await chrome.storage.local.set({ [STORAGE_KEYS.email]: email });
    return body;
  },

  async logout() {
    try { await request("/api/auth/logout", { method: "POST" }); } catch {}
    await clearAuth();
  },

  async me() {
    return request("/api/auth/me");
  },

  async listTeams() {
    return request("/api/teams");
  },

  async selectTeam(teamId, teamName) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.teamId]: teamId,
      [STORAGE_KEYS.teamName]: teamName,
    });
    try {
      chrome.runtime.sendMessage({ type: "SYNC_BOOKMARKS" });
    } catch {}
  },

  async listNodes(teamId, params = {}) {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    qs.set("limit", String(params.limit || 200));
    if (params.offset) qs.set("offset", String(params.offset));
    const q = qs.toString();
    return request(`/api/teams/${teamId}/nodes${q ? `?${q}` : ""}`);
  },

  async createNode(data) {
    const settings = await getSettings();
    if (!settings.teamId) throw new Error("No team selected.");
    const node = await request(`/api/teams/${settings.teamId}/nodes`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    try {
      chrome.runtime.sendMessage({ type: "SYNC_BOOKMARKS" });
    } catch {}
    return node;
  },
};
