import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";
import { encrypt } from "@/lib/encryption";

/**
 * GET  -> Returns whether an AI Tools key is configured + the chosen
 *         provider/model. The encrypted key itself is NEVER returned.
 *
 * PUT  -> Validate the new key (lightweight reachability ping per provider)
 *         and upsert the encrypted value.
 *
 * DELETE -> Remove the AI Tools config entirely.
 */

const AI_PROVIDERS = ["openai", "anthropic", "gemini"] as const;

const putSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  model: z.string().min(1),
  apiKey: z.string().min(1),
  skipTest: z.boolean().optional(),
});

async function pingKey(provider: string, apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    } else if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/models?limit=1", {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    } else if (provider === "gemini") {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(apiKey)}&pageSize=1`
      );
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Connection failed" };
  }
}

export async function GET() {
  try {
    const orgId = await getOrgId();
    const config = await prisma.aiToolsConfig.findUnique({
      where: { orgId },
      select: { provider: true, model: true, updatedAt: true },
    });
    return NextResponse.json({
      configured: !!config,
      provider: config?.provider ?? null,
      model: config?.model ?? null,
      updatedAt: config?.updatedAt ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load AI Tools config" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  let orgId: string;
  try {
    orgId = await getOrgId();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to identify organization" },
      { status: 500 }
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = putSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { provider, model, apiKey, skipTest } = parsed.data;

  if (!skipTest) {
    const ping = await pingKey(provider, apiKey);
    if (!ping.ok) {
      return NextResponse.json(
        {
          error: `Connection test failed${ping.error ? `: ${ping.error}` : ""}`,
          hint: "Make sure the key is correct and has access to the model list endpoint of the chosen provider.",
        },
        { status: 422 }
      );
    }
  }

  const encryptedApiKey = encrypt(apiKey);
  const config = await prisma.aiToolsConfig.upsert({
    where: { orgId },
    create: { orgId, provider, model, encryptedApiKey },
    update: { provider, model, encryptedApiKey },
  });

  return NextResponse.json({
    configured: true,
    provider: config.provider,
    model: config.model,
    updatedAt: config.updatedAt,
  });
}

export async function DELETE() {
  try {
    const orgId = await getOrgId();
    await prisma.aiToolsConfig.deleteMany({ where: { orgId } });
    return NextResponse.json({ configured: false });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to clear AI Tools config" },
      { status: 500 }
    );
  }
}
