const API_BASE = "/api/v1";

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body.hint
      ? `${body.error}\n\n${body.hint}`
      : body.error ?? `API error: ${res.status}`;
    throw new Error(msg);
  }

  return res.json();
}

async function apiRaw(path: string) {
  return fetch(`${API_BASE}${path}`);
}

export const api = {
  // Analytics
  getOverview: (days = 30) => apiFetch(`/analytics/overview?days=${days}`),
  getByUser: (days = 30, params?: Record<string, string>) => {
    const qs = new URLSearchParams({ days: String(days), ...params });
    return apiFetch(`/analytics/by-user?${qs}`);
  },
  getByProvider: (days = 30) => apiFetch(`/analytics/by-provider?days=${days}`),
  getByModel: (days = 30, provider?: string) => {
    const qs = new URLSearchParams({ days: String(days) });
    if (provider) qs.set("provider", provider);
    return apiFetch(`/analytics/by-model?${qs}`);
  },
  getTrends: (days = 30, granularity = "daily", provider?: string) => {
    const qs = new URLSearchParams({ days: String(days), granularity });
    if (provider) qs.set("provider", provider);
    return apiFetch(`/analytics/trends?${qs}`);
  },

  // Users
  getUsers: (params?: Record<string, string>) => {
    const qs = new URLSearchParams(params ?? {});
    return apiFetch(`/users?${qs}`);
  },
  updateUserBudget: (id: string, budget: number | null, alertThreshold?: number) =>
    apiFetch(`/users/${id}/budget`, {
      method: "PUT",
      body: JSON.stringify({ monthly_budget: budget, alert_threshold: alertThreshold }),
    }),

  // Suggestions
  getSuggestions: () => apiFetch("/suggestions"),

  // Anomalies
  getAnomalies: () => apiFetch("/analytics/anomalies"),

  // Notifications
  getNotifications: () => apiFetch("/notifications"),
  markNotificationRead: (id: string) =>
    apiFetch(`/notifications/${id}/read`, { method: "PUT" }),
  markAllNotificationsRead: () =>
    apiFetch("/notifications/read-all", { method: "PUT" }),

  // Explorer
  getExplorer: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params);
    return apiFetch(`/analytics/explorer?${qs}`);
  },

  // Department report export
  exportDepartmentReport: async (departmentId: string, month: string, format: "csv" | "pdf") => {
    const res = await apiRaw(`/reports/department-export?departmentId=${departmentId}&month=${month}&format=${format}`);
    if (!res.ok) throw new Error("Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `department-report-${month}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  },

  // Departments
  getDepartments: () => apiFetch("/departments"),
  getDepartment: (id: string) => apiFetch(`/departments/${id}`),
  updateDepartmentBudget: (id: string, budget: number | null, alertThreshold?: number) =>
    apiFetch(`/departments/${id}/budget`, {
      method: "PUT",
      body: JSON.stringify({ monthly_budget: budget, alert_threshold: alertThreshold }),
    }),

  // Teams
  getTeams: (departmentId?: string) => {
    const qs = departmentId ? `?departmentId=${departmentId}` : "";
    return apiFetch(`/teams${qs}`);
  },
  getTeam: (id: string) => apiFetch(`/teams/${id}`),
  updateTeamBudget: (id: string, budget: number | null, alertThreshold?: number) =>
    apiFetch(`/teams/${id}/budget`, {
      method: "PUT",
      body: JSON.stringify({ monthly_budget: budget, alert_threshold: alertThreshold }),
    }),

  // Alerts
  getAlerts: () => apiFetch("/alerts"),

  // Reports
  getCostSummary: () => apiFetch("/reports/cost-summary"),
  exportCsv: async (days = 30) => {
    const res = await apiRaw(`/reports/export?days=${days}`);
    if (!res.ok) throw new Error("Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agent-plutus-usage-${days}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  // Providers
  getProviders: () => apiFetch("/providers"),
  addProvider: (provider: string, apiKeyValue: string, label?: string) =>
    apiFetch("/providers", {
      method: "POST",
      body: JSON.stringify({ provider, api_key: apiKeyValue, label }),
    }),
  deleteProvider: (provider: string) =>
    apiFetch(`/providers?provider=${provider}`, { method: "DELETE" }),

  // Sync
  triggerSync: (provider?: string) =>
    apiFetch("/sync", {
      method: "POST",
      body: JSON.stringify(provider ? { provider } : {}),
    }),
  getSyncLogs: () => apiFetch("/sync"),

  // Settings
  getSettings: () => apiFetch("/settings"),
  updateSettings: (settings: { sync_interval_hours?: number }) =>
    apiFetch("/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    }),
};
