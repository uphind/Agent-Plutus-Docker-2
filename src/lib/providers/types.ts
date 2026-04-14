import { Provider } from "@/generated/prisma/client";

export interface NormalizedUsageRecord {
  provider: Provider;
  userRef: string | null;
  model: string | null;
  date: Date;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  requestsCount: number;
  costUsd: number;
  apiKeyId?: string;
  inputAudioTokens?: number;
  outputAudioTokens?: number;
  isBatch?: boolean;
  linesAccepted?: number;
  linesSuggested?: number;
  acceptRate?: number;
  metadata?: Record<string, unknown>;
}

export interface CursorDauRecord {
  date: Date;
  dauCount: number;
}

export interface ProviderFetchResult {
  records: NormalizedUsageRecord[];
  cursorDau?: CursorDauRecord[];
}

/**
 * A flattened snapshot of one raw API result row, keyed by dotted field names.
 * Used by the field mapping UI to show sample values next to each source field.
 */
export type RawSampleRow = Record<string, unknown>;

export interface ProviderSampleResult {
  /** Flat key→value maps from one or more API endpoints */
  rows: RawSampleRow[];
  /** All unique field keys discovered in the sample */
  availableFields: string[];
}

export interface ProviderAdapter {
  provider: Provider;
  fetchUsage(apiKey: string, startDate: Date, endDate: Date): Promise<ProviderFetchResult>;
  testConnection(apiKey: string): Promise<boolean>;
  /**
   * Hit the provider API with a tiny date window (yesterday → now) and return
   * raw, flattened field names plus sample values so the mapping UI can show
   * what the API actually sends back.
   */
  fetchSample?(apiKey: string): Promise<ProviderSampleResult>;
}
