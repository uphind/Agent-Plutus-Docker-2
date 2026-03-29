import { Provider } from "@/generated/prisma/client";
import { ProviderAdapter, ProviderFetchResult } from "./types";

/**
 * Vertex AI / Gemini integration stub.
 *
 * Full integration requires:
 * - GCP Service Account JSON key
 * - Cloud Monitoring API for usage metrics
 * - BigQuery billing export for costs
 *
 * For MVP, this stub validates the service account key format
 * and returns placeholder data structure.
 */
export const vertexAdapter: ProviderAdapter = {
  provider: Provider.vertex,

  async testConnection(apiKey: string): Promise<boolean> {
    try {
      const parsed = JSON.parse(apiKey);
      return !!(parsed.project_id && parsed.client_email && parsed.private_key);
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
