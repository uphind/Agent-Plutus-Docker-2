import { Provider } from "@/generated/prisma/client";
import { ProviderAdapter, ProviderFetchResult } from "./types";

/**
 * Gemini API (Google AI Studio) integration.
 *
 * Google AI Studio does NOT provide a programmatic usage/analytics API.
 * Usage can only be viewed at https://aistudio.google.com/usage
 * or via Google Cloud Billing BigQuery export.
 *
 * This adapter validates the API key by making a lightweight
 * models.list call to the Gemini API, confirming the key is valid.
 *
 * Future: If Google adds a usage analytics API, integrate it here.
 * Alternative: Use Google Cloud Billing BigQuery export for cost data.
 */

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export const geminiAdapter: ProviderAdapter = {
  provider: Provider.gemini,

  async testConnection(apiKey: string): Promise<boolean> {
    try {
      const res = await fetch(`${GEMINI_API_BASE}/models?key=${apiKey}`);
      return res.ok;
    } catch {
      return false;
    }
  },

  async fetchUsage(
    _apiKey: string,
    _startDate: Date,
    _endDate: Date
  ): Promise<ProviderFetchResult> {
    return { records: [] };
  },
};
