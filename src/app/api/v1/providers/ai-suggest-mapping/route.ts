import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";
import { decrypt } from "@/lib/encryption";
import { logAiCall } from "@/lib/ai-usage-log";

/**
 * POST /api/v1/providers/ai-suggest-mapping
 *
 * Asks the configured AI Tools model to map a discovered endpoint's source
 * fields onto the user's internal target fields. Returns suggestions in the
 * shape:
 *
 *   { suggestions: [{ sourceField, targetField, confidence, reasoning }] }
 *
 * Token usage is logged to AiUsageLog with source="mapping" so it shows up
 * alongside chatbot usage in Settings → AI Assistant.
 */

const bodySchema = z.object({
  provider: z.string().min(1),
  apiName: z.string().min(1),
  endpointName: z.string().min(1),
  sourceFields: z
    .array(z.object({ path: z.string(), sample: z.unknown().optional() }))
    .min(1),
  targetFields: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        description: z.string().optional(),
        required: z.boolean().optional(),
      })
    )
    .min(1),
});

export interface MappingSuggestion {
  sourceField: string;
  targetField: string;
  confidence: number;
  reasoning?: string;
}

interface ProviderResponse {
  suggestions: MappingSuggestion[];
  inputTokens: number;
  outputTokens: number;
}

function buildPrompt(
  provider: string,
  apiName: string,
  endpointName: string,
  sourceFields: Array<{ path: string; sample?: unknown }>,
  targetFields: Array<{ key: string; label: string; description?: string; required?: boolean }>
): { system: string; user: string } {
  const system = [
    "You map raw provider API field paths to a fixed set of internal target fields.",
    "You return ONLY a JSON object of the shape { \"suggestions\": [{ \"sourceField\": string, \"targetField\": string, \"confidence\": number, \"reasoning\": string }] }.",
    "Rules:",
    "- sourceField must be the LEAF NAME of the source path (the segment after the last `[]` or `.`), not the full dotted path.",
    "- targetField must be one of the provided target keys exactly.",
    "- Only emit a suggestion when you are confident the source carries the target's semantics.",
    "- Skip targets you cannot confidently map.",
    "- confidence is a float between 0 and 1.",
    "- reasoning is at most 100 characters.",
  ].join("\n");

  const user = JSON.stringify(
    {
      provider,
      apiName,
      endpointName,
      sourceFields: sourceFields.map((s) => ({
        path: s.path,
        leaf: s.path.split(".").map((p) => p.replace(/\[\]$/, "")).filter(Boolean).pop() ?? s.path,
        sample: s.sample,
      })),
      targetFields,
    },
    null,
    2
  );

  return { system, user };
}

interface OpenAiResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

async function callOpenAi(
  apiKey: string,
  model: string,
  system: string,
  user: string
): Promise<ProviderResponse> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      temperature: 0,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  const data = (await res.json()) as OpenAiResponse;
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `OpenAI error (${res.status})`);
  }
  const content = data.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content) as { suggestions?: MappingSuggestion[] };
  return {
    suggestions: parsed.suggestions ?? [],
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

async function callAnthropic(
  apiKey: string,
  model: string,
  system: string,
  user: string
): Promise<ProviderResponse> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      temperature: 0,
      system,
      messages: [
        {
          role: "user",
          content: `${user}\n\nReturn only the JSON object — no surrounding text or code fences.`,
        },
      ],
    }),
  });
  const data = (await res.json()) as AnthropicResponse;
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `Anthropic error (${res.status})`);
  }
  const text = (data.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(cleaned) as { suggestions?: MappingSuggestion[] };
  return {
    suggestions: parsed.suggestions ?? [],
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string };
}

async function callGemini(
  apiKey: string,
  model: string,
  system: string,
  user: string
): Promise<ProviderResponse> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { role: "system", parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
      },
    }),
  });
  const data = (await res.json()) as GeminiResponse;
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `Gemini error (${res.status})`);
  }
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("");
  const parsed = JSON.parse(text || "{}") as { suggestions?: MappingSuggestion[] };
  return {
    suggestions: parsed.suggestions ?? [],
    inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

export async function POST(request: NextRequest) {
  let orgId: string;
  try {
    orgId = await getOrgId();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to identify organization" },
      { status: 500 }
    );
  }

  const config = await prisma.aiToolsConfig.findUnique({ where: { orgId } });
  if (!config) {
    return NextResponse.json(
      {
        error: "AI Tools key not configured",
        hint: "Configure an AI Tools key in Settings → AI Assistant → AI Tools (server-side) to enable mapping suggestions.",
      },
      { status: 400 }
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const apiKey = decrypt(config.encryptedApiKey);
  const { provider, apiName, endpointName, sourceFields, targetFields } = parsed.data;
  const { system, user } = buildPrompt(provider, apiName, endpointName, sourceFields, targetFields);

  let result: ProviderResponse;
  try {
    if (config.provider === "openai") {
      result = await callOpenAi(apiKey, config.model, system, user);
    } else if (config.provider === "anthropic") {
      result = await callAnthropic(apiKey, config.model, system, user);
    } else if (config.provider === "gemini") {
      result = await callGemini(apiKey, config.model, system, user);
    } else {
      return NextResponse.json(
        { error: `Unsupported AI Tools provider: ${config.provider}` },
        { status: 400 }
      );
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI suggestion failed" },
      { status: 502 }
    );
  }

  await logAiCall({
    orgId,
    source: "mapping",
    provider: config.provider,
    model: config.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  });

  // De-dupe by targetField, keeping the highest-confidence suggestion.
  const dedup = new Map<string, MappingSuggestion>();
  for (const s of result.suggestions) {
    if (!s.sourceField || !s.targetField) continue;
    const existing = dedup.get(s.targetField);
    if (!existing || (s.confidence ?? 0) > (existing.confidence ?? 0)) {
      dedup.set(s.targetField, s);
    }
  }

  return NextResponse.json({
    suggestions: [...dedup.values()],
    aiProvider: config.provider,
    aiModel: config.model,
  });
}
