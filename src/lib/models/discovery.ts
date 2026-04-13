import { decrypt } from "@/lib/encryption";

export interface DiscoveredModel {
  provider: string;
  modelId: string;
  displayName: string;
  owned_by?: string;
}

let cache: { models: DiscoveredModel[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function isCacheValid(): boolean {
  return cache !== null && Date.now() - cache.fetchedAt < CACHE_TTL_MS;
}

export function clearModelCache() {
  cache = null;
}

async function fetchOpenAIModels(apiKey: string): Promise<DiscoveredModel[]> {
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data ?? [])
      .filter((m: { id: string }) =>
        /^(gpt-|o[134]-|chatgpt-)/.test(m.id) && !m.id.includes("realtime") && !m.id.includes("audio")
      )
      .map((m: { id: string; owned_by?: string }) => ({
        provider: "openai",
        modelId: m.id,
        displayName: m.id,
        owned_by: m.owned_by,
      }));
  } catch {
    return [];
  }
}

async function fetchAnthropicModels(apiKey: string): Promise<DiscoveredModel[]> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data ?? []).map((m: { id: string; display_name?: string }) => ({
      provider: "anthropic",
      modelId: m.id,
      displayName: m.display_name || m.id,
    }));
  } catch {
    return [];
  }
}

async function fetchGeminiModels(apiKey: string): Promise<DiscoveredModel[]> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.models ?? [])
      .filter((m: { name: string; supportedGenerationMethods?: string[] }) =>
        m.supportedGenerationMethods?.includes("generateContent")
      )
      .map((m: { name: string; displayName?: string }) => ({
        provider: "gemini",
        modelId: m.name.replace("models/", ""),
        displayName: m.displayName || m.name.replace("models/", ""),
      }));
  } catch {
    return [];
  }
}

export async function discoverModels(
  credentials: Array<{ provider: string; encryptedApiKey: string }>
): Promise<DiscoveredModel[]> {
  if (isCacheValid()) return cache!.models;

  const promises: Promise<DiscoveredModel[]>[] = [];

  for (const cred of credentials) {
    const apiKey = decrypt(cred.encryptedApiKey);
    switch (cred.provider) {
      case "openai":
        promises.push(fetchOpenAIModels(apiKey));
        break;
      case "anthropic":
        promises.push(fetchAnthropicModels(apiKey));
        break;
      case "gemini":
        promises.push(fetchGeminiModels(apiKey));
        break;
    }
  }

  const results = await Promise.allSettled(promises);
  const models: DiscoveredModel[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      models.push(...result.value);
    }
  }

  models.sort((a, b) => a.provider.localeCompare(b.provider) || a.modelId.localeCompare(b.modelId));

  cache = { models, fetchedAt: Date.now() };
  return models;
}
