import { Provider } from "@/generated/prisma/client";
import { ProviderAdapter, ProviderFetchResult } from "./types";

export interface N8nCredentialPayload {
  v: 1;
  baseUrl: string;
  apiKey: string;
}

export function parseN8nCredential(raw: string): N8nCredentialPayload | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const j = JSON.parse(s) as Partial<N8nCredentialPayload>;
    if (j.v !== 1 || typeof j.baseUrl !== "string" || typeof j.apiKey !== "string") return null;
    const baseUrl = j.baseUrl.replace(/\/+$/, "");
    if (!baseUrl || !j.apiKey.trim()) return null;
    return { v: 1, baseUrl, apiKey: j.apiKey.trim() };
  } catch {
    return null;
  }
}

export const n8nAdapter: ProviderAdapter = {
  provider: Provider.n8n,

  async testConnection(apiKey: string): Promise<boolean> {
    const parsed = parseN8nCredential(apiKey);
    if (!parsed) return false;
    try {
      const res = await fetch(`${parsed.baseUrl}/api/v1/workflows?limit=1`, {
        headers: {
          "X-N8N-API-KEY": parsed.apiKey,
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
