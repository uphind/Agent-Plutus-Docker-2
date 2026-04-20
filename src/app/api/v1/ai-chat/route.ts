import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";
import { logAiCall } from "@/lib/ai-usage-log";

interface ChatCallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
}

const chatSchema = z.object({
  question: z.string().min(1).max(2000),
  provider: z.enum(["openai", "anthropic", "gemini"]),
  model: z.string().min(1),
  apiKey: z.string().min(1),
  suggestions: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        category: z.string(),
        severity: z.string(),
        estimatedSavings: z.number().optional(),
        affectedEntities: z.array(z.object({ name: z.string() })),
      })
    )
    .optional(),
});

type SuggestionItem = {
  title: string;
  description: string;
  category: string;
  severity: string;
  estimatedSavings?: number;
  affectedEntities: Array<{ name: string }>;
};

async function gatherSystemContext(orgId: string, clientSuggestions?: SuggestionItem[]) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const startDate = thirtyDaysAgo;

  const [overview, modelBreakdown, userBreakdown, idleUsers, departmentBudgets] =
    await Promise.all([
      prisma.$queryRaw<
        Array<{
          total_cost: number;
          total_requests: number;
          total_input: number;
          total_output: number;
          active_users: number;
        }>
      >`
        SELECT
          COALESCE(SUM(cost_usd), 0)::float AS total_cost,
          COALESCE(SUM(requests_count), 0)::int AS total_requests,
          COALESCE(SUM(input_tokens), 0)::float AS total_input,
          COALESCE(SUM(output_tokens), 0)::float AS total_output,
          COUNT(DISTINCT user_id)::int AS active_users
        FROM usage_records
        WHERE org_id = ${orgId} AND date >= ${startDate}
      `,

      prisma.$queryRaw<
        Array<{
          model: string;
          provider: string;
          total_cost: number;
          total_requests: number;
          user_count: number;
        }>
      >`
        SELECT model, provider,
               SUM(cost_usd)::float AS total_cost,
               SUM(requests_count)::int AS total_requests,
               COUNT(DISTINCT user_id)::int AS user_count
        FROM usage_records
        WHERE org_id = ${orgId} AND date >= ${startDate} AND model IS NOT NULL
        GROUP BY model, provider
        ORDER BY total_cost DESC
        LIMIT 20
      `,

      prisma.$queryRaw<
        Array<{
          user_id: string;
          user_name: string;
          email: string;
          department: string | null;
          team: string | null;
          total_cost: number;
          total_requests: number;
        }>
      >`
        SELECT ur.user_id, u.name AS user_name, u.email,
               u.department, u.team,
               SUM(ur.cost_usd)::float AS total_cost,
               SUM(ur.requests_count)::int AS total_requests
        FROM usage_records ur
        JOIN org_users u ON ur.user_id = u.id
        WHERE ur.org_id = ${orgId} AND ur.date >= ${startDate}
        GROUP BY ur.user_id, u.name, u.email, u.department, u.team
        ORDER BY total_cost DESC
        LIMIT 30
      `,

      prisma.$queryRaw<
        Array<{ user_id: string; name: string; email: string }>
      >`
        SELECT u.id AS user_id, u.name, u.email
        FROM org_users u
        LEFT JOIN usage_records ur ON ur.user_id = u.id AND ur.date >= ${thirtyDaysAgo}
        WHERE u.org_id = ${orgId} AND u.status = 'active'
        GROUP BY u.id, u.name, u.email
        HAVING COUNT(ur.id) = 0
      `,

      prisma.$queryRaw<
        Array<{
          dept_name: string;
          budget: number | null;
          spent: number;
          user_count: number;
        }>
      >`
        SELECT d.name AS dept_name,
               d.monthly_budget::float AS budget,
               COALESCE(SUM(ur.cost_usd), 0)::float AS spent,
               COUNT(DISTINCT u.id)::int AS user_count
        FROM departments d
        LEFT JOIN org_users u ON u.department_id = d.id
        LEFT JOIN usage_records ur ON ur.user_id = u.id AND ur.date >= ${startDate}
        WHERE d.org_id = ${orgId}
        GROUP BY d.id, d.name, d.monthly_budget
        ORDER BY spent DESC
      `,
    ]);

  let suggestionsText: string;
  if (clientSuggestions && clientSuggestions.length > 0) {
    suggestionsText = clientSuggestions
      .map(
        (s, i) =>
          `${i + 1}. [${s.severity.toUpperCase()}] ${s.title}\n   ${s.description}\n   Category: ${s.category}${s.estimatedSavings ? `, Est. savings: $${s.estimatedSavings}/mo` : ""}${s.affectedEntities.length ? `\n   Affected: ${s.affectedEntities.map((e) => e.name).join(", ")}` : ""}`
      )
      .join("\n\n");
  } else {
    suggestionsText = "No active suggestions — the organization looks well-optimized.";
  }

  const ov = overview[0] ?? {
    total_cost: 0,
    total_requests: 0,
    total_input: 0,
    total_output: 0,
    active_users: 0,
  };

  const lines: string[] = [
    `=== Organization Usage Summary (Last 30 Days) ===`,
    `Total cost: $${ov.total_cost.toFixed(2)}`,
    `Total requests: ${ov.total_requests.toLocaleString()}`,
    `Input tokens: ${ov.total_input.toLocaleString()}`,
    `Output tokens: ${ov.total_output.toLocaleString()}`,
    `Active users this month: ${ov.active_users}`,
    `Idle users (no usage in 30 days): ${idleUsers.length}`,
    "",
    `=== Model Breakdown (Top 20 by cost) ===`,
    ...modelBreakdown.map(
      (m) =>
        `- ${m.model} (${m.provider}): $${m.total_cost.toFixed(2)}, ${m.total_requests.toLocaleString()} requests, ${m.user_count} users`
    ),
    "",
    `=== Top Users by Spend ===`,
    ...userBreakdown.map(
      (u) =>
        `- ${u.user_name} (${u.email}): $${u.total_cost.toFixed(2)}, ${u.total_requests.toLocaleString()} requests${u.department ? `, dept: ${u.department}` : ""}${u.team ? `, team: ${u.team}` : ""}`
    ),
    "",
    `=== Department Budgets ===`,
    ...departmentBudgets.map(
      (d) =>
        `- ${d.dept_name}: spent $${d.spent.toFixed(2)}${d.budget ? ` / budget $${d.budget.toFixed(2)} (${((d.spent / d.budget) * 100).toFixed(0)}%)` : " (no budget set)"}, ${d.user_count} users`
    ),
    "",
    `=== Idle Users (No usage in 30 days) ===`,
    ...(idleUsers.length > 0
      ? idleUsers.map((u) => `- ${u.name} (${u.email})`)
      : ["None"]),
    "",
    `=== Current Active Suggestions ===`,
    suggestionsText,
  ];

  return lines.join("\n");
}

const SYSTEM_PROMPT = `You are the AI assistant for Agent Plutus, an AI spend management platform. You help administrators understand and optimize their organization's AI/LLM usage and costs.

You have access to real-time data about the organization's usage, including costs, models, users, departments, budgets, and optimization suggestions.

Guidelines:
- Be concise and direct. Use numbers and specifics from the data.
- When discussing suggestions, explain the reasoning behind them using the actual usage data.
- When asked "what more can I do?", analyze the data for additional optimization opportunities beyond the existing suggestions.
- Format currency as $X.XX. Use tables or bullet points for clarity when listing multiple items.
- If you don't have enough data to answer a question, say so honestly.
- Keep responses focused and actionable.`;

async function callOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  context: string,
  question: string
): Promise<ChatCallResult> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Here is the current organization data:\n\n${context}\n\n---\n\nUser question: ${question}`,
        },
      ],
      max_tokens: 1500,
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err.error?.message ?? `OpenAI API error: ${res.status}`
    );
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      prompt_tokens_details?: { cached_tokens?: number };
    };
  };
  return {
    text: data.choices?.[0]?.message?.content ?? "No response generated.",
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    cachedTokens: data.usage?.prompt_tokens_details?.cached_tokens ?? 0,
  };
}

async function callAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  context: string,
  question: string
): Promise<ChatCallResult> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Here is the current organization data:\n\n${context}\n\n---\n\nUser question: ${question}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err.error?.message ?? `Anthropic API error: ${res.status}`
    );
  }

  const data = (await res.json()) as {
    content?: Array<{ text?: string }>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  return {
    text:
      (data.content ?? []).map((c) => c.text ?? "").join("") ||
      "No response generated.",
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
    cachedTokens: data.usage?.cache_read_input_tokens ?? 0,
  };
}

async function callGemini(
  apiKey: string,
  model: string,
  systemPrompt: string,
  context: string,
  question: string
): Promise<ChatCallResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [
        {
          parts: [
            {
              text: `Here is the current organization data:\n\n${context}\n\n---\n\nUser question: ${question}`,
            },
          ],
        },
      ],
      generationConfig: { maxOutputTokens: 1500, temperature: 0.3 },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err.error?.message ?? `Gemini API error: ${res.status}`
    );
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      cachedContentTokenCount?: number;
    };
  };
  return {
    text:
      (data.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text ?? "")
        .join("") || "No response generated.",
    inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    cachedTokens: data.usageMetadata?.cachedContentTokenCount ?? 0,
  };
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = chatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { question, provider, model, apiKey, suggestions } = parsed.data;

  let orgId: string;
  try {
    orgId = await getOrgId();
  } catch {
    return NextResponse.json(
      { error: "Organization not found" },
      { status: 401 }
    );
  }

  let context: string;
  try {
    context = await gatherSystemContext(orgId, suggestions);
  } catch (e) {
    console.error("Failed to gather system context:", e);
    context = "System context could not be loaded. Answer based on general knowledge.";
  }

  try {
    let result: ChatCallResult;

    switch (provider) {
      case "openai":
        result = await callOpenAI(apiKey, model, SYSTEM_PROMPT, context, question);
        break;
      case "anthropic":
        result = await callAnthropic(apiKey, model, SYSTEM_PROMPT, context, question);
        break;
      case "gemini":
        result = await callGemini(apiKey, model, SYSTEM_PROMPT, context, question);
        break;
      default:
        return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
    }

    // Persist usage metrics for the chatbot tracker. Logging is best-effort
    // and never blocks/breaks the user-visible response.
    await logAiCall({
      orgId,
      source: "chatbot",
      provider,
      model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      cachedTokens: result.cachedTokens,
    });

    return NextResponse.json({
      answer: result.text,
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        cachedTokens: result.cachedTokens ?? 0,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "LLM request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
