import { Provider } from "@/generated/prisma/client";
import { ProviderAdapter, ProviderFetchResult } from "./types";

/**
 * Microsoft 365 Copilot usage surfaces through Microsoft Graph (Entra ID Bearer
 * tokens), not a single static "Copilot API key". Discovery probes Graph with the
 * pasted token; this adapter validates the token and reserves a path for future
 * report-based sync (Copilot usage reports, interaction history, etc.).
 */
export const microsoftCopilotAdapter: ProviderAdapter = {
  provider: Provider.microsoft_copilot,

  async testConnection(apiKey: string): Promise<boolean> {
    const token = apiKey.trim();
    if (!token) return false;
    try {
      const res = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async fetchUsage(_apiKey: string, _startDate: Date, _endDate: Date): Promise<ProviderFetchResult> {
    // TODO: normalize Graph Copilot usage reports into UsageRecord rows.
    return { records: [] };
  },
};
