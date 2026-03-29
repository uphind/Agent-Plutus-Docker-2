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

export interface ProviderAdapter {
  provider: Provider;
  fetchUsage(apiKey: string, startDate: Date, endDate: Date): Promise<ProviderFetchResult>;
  testConnection(apiKey: string): Promise<boolean>;
}
