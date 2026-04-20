const API_BASE = "/api/v1";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function apiFetch(path: string, options?: RequestInit): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  const text = await res.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {};

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      if (!res.ok) {
        const snippet = text.slice(0, 300).replace(/<[^>]*>/g, "").trim();
        throw new Error(
          `Server error (HTTP ${res.status}). Response was not JSON.${snippet ? `\n\n${snippet}` : ""}`
        );
      }
    }
  }

  if (!res.ok) {
    const msg = body?.hint
      ? `${body.error}\n\n${body.hint}`
      : body?.error ?? `Request failed (HTTP ${res.status})`;
    throw new Error(msg);
  }

  return body;
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

  // AI Recommendations (classifier)
  getRecommendations: (params?: { userId?: string; teamId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.userId) qs.set("userId", params.userId);
    if (params?.teamId) qs.set("teamId", params.teamId);
    const q = qs.toString();
    return apiFetch(`/recommendations${q ? `?${q}` : ""}`);
  },

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
  getExportData: async (filters: {
    days?: number;
    startDate?: string;
    endDate?: string;
    departments?: string[];
    teams?: string[];
    providers?: string[];
  }) => {
    const qs = new URLSearchParams({ format: "json" });
    if (filters.startDate && filters.endDate) {
      qs.set("startDate", filters.startDate);
      qs.set("endDate", filters.endDate);
    } else {
      qs.set("days", String(filters.days ?? 30));
    }
    filters.departments?.forEach((d) => qs.append("department", d));
    filters.teams?.forEach((t) => qs.append("team", t));
    filters.providers?.forEach((p) => qs.append("provider", p));
    return apiFetch(`/reports/export?${qs}`);
  },
  exportFiltered: async (filters: {
    days?: number;
    startDate?: string;
    endDate?: string;
    departments?: string[];
    teams?: string[];
    providers?: string[];
  }) => {
    const qs = new URLSearchParams();
    if (filters.startDate && filters.endDate) {
      qs.set("startDate", filters.startDate);
      qs.set("endDate", filters.endDate);
    } else {
      qs.set("days", String(filters.days ?? 30));
    }
    filters.departments?.forEach((d) => qs.append("department", d));
    filters.teams?.forEach((t) => qs.append("team", t));
    filters.providers?.forEach((p) => qs.append("provider", p));
    const res = await apiRaw(`/reports/export?${qs}`);
    if (!res.ok) throw new Error("Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const label = filters.startDate && filters.endDate
      ? `${filters.startDate}_${filters.endDate}`
      : `${filters.days ?? 30}d`;
    a.download = `agent-plutus-usage-${label}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  // ROI
  getRoi: (days = 30) => apiFetch(`/analytics/roi?days=${days}`),

  // Forecasting
  getForecast: (historyDays = 90, forecastDays = 30, departmentId?: string) =>
    apiFetch(`/analytics/forecast?historyDays=${historyDays}&forecastDays=${forecastDays}${departmentId ? `&departmentId=${departmentId}` : ""}`),

  // Seat Optimization
  getSeatOptimization: (days = 30) => apiFetch(`/analytics/seat-optimization?days=${days}`),

  // Benchmarks
  getBenchmarks: () => apiFetch("/analytics/benchmarks"),

  // Contract Intelligence
  getContractIntel: () => apiFetch("/analytics/contract-intel"),

  // Provider Health
  getProviderHealth: () => apiFetch("/analytics/provider-health"),

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
  updateSettings: (settings: {
    sync_interval_hours?: number;
    dir_sync_interval_hours?: number;
    relink_interval_hours?: number;
  }) =>
    apiFetch("/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    }),

  // Re-link
  triggerRelink: () => apiFetch("/sync/relink", { method: "POST" }),
  getRelinkStats: () => apiFetch("/sync/relink"),

  // Directory sync
  triggerDirectorySync: () => apiFetch("/graph/sync", { method: "POST" }),

  // Provider field mapping
  getProviderFieldMapping: (provider: string) =>
    apiFetch(`/providers/field-mapping?provider=${provider}`),
  saveProviderFieldMapping: (provider: string, mappings: Array<{ sourceField: string; targetField: string }>) =>
    apiFetch("/providers/field-mapping", {
      method: "POST",
      body: JSON.stringify({ provider, mappings }),
    }),
  fetchProviderSample: (provider: string) =>
    apiFetch(`/providers/sample?provider=${provider}`),

  runDiscovery: (input: {
    api_key: string;
    github_org?: string;
    github_enterprise?: string;
    n8n_base_url?: string;
    vertex_project_id?: string;
    vertex_location?: string;
    providers?: string[];
    internal_providers?: string[];
  }) =>
    apiFetch("/providers/discovery", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // AI Tools (server-stored AI key for in-app suggestions)
  getAiToolsConfig: () => apiFetch("/settings/ai-tools"),
  saveAiToolsConfig: (input: { provider: string; model: string; apiKey: string; skipTest?: boolean }) =>
    apiFetch("/settings/ai-tools", {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  deleteAiToolsConfig: () =>
    apiFetch("/settings/ai-tools", { method: "DELETE" }),

  // AI mapping suggestions
  suggestMapping: (input: {
    provider: string;
    apiName: string;
    endpointName: string;
    sourceFields: Array<{ path: string; sample?: unknown }>;
    targetFields: Array<{ key: string; label: string; description?: string; required?: boolean }>;
  }) =>
    apiFetch("/providers/ai-suggest-mapping", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // AI usage tracker
  getAiUsage: (days = 30, source = "chatbot") =>
    apiFetch(`/settings/ai-usage?days=${days}&source=${source}`),

  // Onboarding state
  getOnboardingState: () => apiFetch("/settings/onboarding"),
  setOnboardingState: (completed: boolean) =>
    apiFetch("/settings/onboarding", {
      method: "POST",
      body: JSON.stringify({ completed }),
    }),
};
