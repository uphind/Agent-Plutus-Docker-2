import { Provider } from "@/generated/prisma/client";
import { ProviderAdapter, ProviderFetchResult } from "./types";

const LOVABLE_ME = "https://api.lovable.dev/v1/me";

export const lovableAdapter: ProviderAdapter = {
  provider: Provider.lovable,

  async testConnection(apiKey: string): Promise<boolean> {
    const token = apiKey.trim();
    if (!token) return false;
    try {
      const res = await fetch(LOVABLE_ME, {
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
    return { records: [] };
  },
};
