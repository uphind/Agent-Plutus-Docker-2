import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

interface UsageRow {
  user_name: string;
  email: string;
  provider: string;
  model: string;
  date: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  requests_count: number;
  cost_usd: number;
}

export async function GET(request: NextRequest) {
  const orgId = await getOrgId();
  const { searchParams } = new URL(request.url);

  const departmentId = searchParams.get("departmentId");
  const month = searchParams.get("month");
  const format = searchParams.get("format") ?? "csv";

  if (!departmentId || !month) {
    return NextResponse.json({ error: "departmentId and month are required" }, { status: 400 });
  }

  const dept = await prisma.department.findUnique({ where: { id: departmentId } });
  if (!dept || dept.orgId !== orgId) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 });
  }

  const [year, monthNum] = month.split("-").map(Number);
  const monthStart = new Date(year, monthNum - 1, 1);
  const monthEnd = new Date(year, monthNum, 0, 23, 59, 59);

  const rows = await prisma.$queryRaw<UsageRow[]>`
    SELECT u.name AS user_name, u.email, ur.provider::text,
           COALESCE(ur.model, 'unknown') AS model, ur.date::text,
           ur.input_tokens, ur.output_tokens, ur.cached_tokens,
           ur.requests_count, ur.cost_usd::float
    FROM usage_records ur
    JOIN org_users u ON ur.user_id = u.id
    WHERE ur.org_id = ${orgId}
      AND u.department_id = ${departmentId}
      AND ur.date >= ${monthStart}
      AND ur.date <= ${monthEnd}
    ORDER BY ur.date, u.name, ur.provider, ur.model
  `;

  if (format === "csv") {
    const header = "User,Email,Provider,Model,Date,Input Tokens,Output Tokens,Cached Tokens,Requests,Cost (USD)";
    const csvRows = rows.map((r) =>
      [
        `"${r.user_name}"`, `"${r.email}"`, r.provider, `"${r.model}"`,
        r.date.split("T")[0], r.input_tokens, r.output_tokens, r.cached_tokens,
        r.requests_count, r.cost_usd.toFixed(6),
      ].join(",")
    );
    const csv = [header, ...csvRows].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${dept.name}-${month}.csv"`,
      },
    });
  }

  // PDF: generate a simple HTML-based PDF using printable HTML
  const totalCost = rows.reduce((s, r) => s + r.cost_usd, 0);
  const totalTokens = rows.reduce((s, r) => s + r.input_tokens + r.output_tokens, 0);
  const totalRequests = rows.reduce((s, r) => s + r.requests_count, 0);

  // Aggregate by user
  const byUser = new Map<string, { name: string; email: string; cost: number; tokens: number; requests: number }>();
  for (const r of rows) {
    const entry = byUser.get(r.email) ?? { name: r.user_name, email: r.email, cost: 0, tokens: 0, requests: 0 };
    entry.cost += r.cost_usd;
    entry.tokens += r.input_tokens + r.output_tokens;
    entry.requests += r.requests_count;
    byUser.set(r.email, entry);
  }

  // Aggregate by model
  const byModel = new Map<string, { model: string; provider: string; cost: number; tokens: number; requests: number }>();
  for (const r of rows) {
    const key = `${r.provider}|${r.model}`;
    const entry = byModel.get(key) ?? { model: r.model, provider: r.provider, cost: 0, tokens: 0, requests: 0 };
    entry.cost += r.cost_usd;
    entry.tokens += r.input_tokens + r.output_tokens;
    entry.requests += r.requests_count;
    byModel.set(key, entry);
  }

  const budget = dept.monthlyBudget ? Number(dept.monthlyBudget) : null;
  const budgetPct = budget ? ((totalCost / budget) * 100).toFixed(1) : null;

  const monthName = new Date(year, monthNum - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${dept.name} - ${monthName}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 40px; color: #1a1a1a; font-size: 13px; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  h2 { font-size: 16px; margin-top: 28px; margin-bottom: 8px; color: #333; }
  .subtitle { color: #666; font-size: 13px; margin-bottom: 20px; }
  .kpi-row { display: flex; gap: 16px; margin-bottom: 24px; }
  .kpi { flex: 1; padding: 12px 16px; border: 1px solid #e5e7eb; border-radius: 8px; }
  .kpi-label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.05em; }
  .kpi-value { font-size: 20px; font-weight: 700; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #888; padding: 8px 12px; border-bottom: 2px solid #e5e7eb; }
  td { padding: 8px 12px; border-bottom: 1px solid #f0f0f0; }
  .right { text-align: right; }
  .mono { font-family: 'SF Mono', 'Consolas', monospace; font-size: 12px; }
  .footer { margin-top: 32px; font-size: 11px; color: #999; border-top: 1px solid #e5e7eb; padding-top: 12px; }
</style></head><body>
<h1>${dept.name}</h1>
<div class="subtitle">Monthly Report — ${monthName}</div>

<div class="kpi-row">
  <div class="kpi"><div class="kpi-label">Total Spend</div><div class="kpi-value">$${totalCost.toFixed(2)}</div></div>
  <div class="kpi"><div class="kpi-label">Total Tokens</div><div class="kpi-value">${totalTokens.toLocaleString()}</div></div>
  <div class="kpi"><div class="kpi-label">Requests</div><div class="kpi-value">${totalRequests.toLocaleString()}</div></div>
  ${budget ? `<div class="kpi"><div class="kpi-label">Budget</div><div class="kpi-value">$${budget.toFixed(0)} <span style="font-size:13px;color:${Number(budgetPct) > 100 ? '#ef4444' : '#888'}">(${budgetPct}%)</span></div></div>` : ""}
</div>

<h2>Spend by User</h2>
<table>
  <thead><tr><th>User</th><th>Email</th><th class="right">Cost</th><th class="right">Tokens</th><th class="right">Requests</th></tr></thead>
  <tbody>
    ${[...byUser.values()].sort((a, b) => b.cost - a.cost).map((u) => `
      <tr><td>${u.name}</td><td>${u.email}</td><td class="right mono">$${u.cost.toFixed(2)}</td><td class="right">${u.tokens.toLocaleString()}</td><td class="right">${u.requests.toLocaleString()}</td></tr>
    `).join("")}
  </tbody>
</table>

<h2>Spend by Model</h2>
<table>
  <thead><tr><th>Model</th><th>Provider</th><th class="right">Cost</th><th class="right">Tokens</th><th class="right">Requests</th></tr></thead>
  <tbody>
    ${[...byModel.values()].sort((a, b) => b.cost - a.cost).map((m) => `
      <tr><td class="mono">${m.model}</td><td>${m.provider}</td><td class="right mono">$${m.cost.toFixed(2)}</td><td class="right">${m.tokens.toLocaleString()}</td><td class="right">${m.requests.toLocaleString()}</td></tr>
    `).join("")}
  </tbody>
</table>

<div class="footer">Generated by Agent Plutus · ${new Date().toISOString().split("T")[0]}</div>
</body></html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": format === "pdf" ? "text/html" : "text/html",
      "Content-Disposition": `attachment; filename="${dept.name}-${month}.html"`,
    },
  });
}
