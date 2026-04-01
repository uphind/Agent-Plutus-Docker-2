import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { PROVIDER_LABELS } from "@/lib/utils";
import {
  renderSpendTrendChart,
  renderProviderBarChart,
  renderCostByModelChart,
  renderCumulativeCostChart,
  renderTokenTrendChart,
  renderProviderTokenBar,
  renderProviderPieChart,
} from "@/lib/export-charts";

export type TemplateId = "complete" | "cost" | "usage" | "executive" | "chargeback";
export type PdfOrientation = "landscape" | "portrait";

export interface TemplateDefinition {
  id: TemplateId;
  name: string;
  description: string;
}

export const TEMPLATES: TemplateDefinition[] = [
  { id: "complete", name: "Complete Report", description: "All records with every field" },
  { id: "cost", name: "Cost Analysis", description: "Spend by department, provider, and model" },
  { id: "usage", name: "Usage Breakdown", description: "Tokens and requests by model and user" },
  { id: "executive", name: "Executive Summary", description: "High-level KPIs for leadership" },
  { id: "chargeback", name: "Chargeback", description: "Cost allocation by department & cost center" },
];

export interface UsageRow {
  date: string;
  user_name: string;
  email: string;
  department: string;
  team: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  requests_count: number;
  cost_usd: number;
}

interface AggRow {
  key: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  tokens: number;
  requests: number;
  count: number;
}

function aggregate(rows: UsageRow[], keyFn: (r: UsageRow) => string): AggRow[] {
  const map = new Map<string, AggRow>();
  for (const r of rows) {
    const key = keyFn(r);
    const entry = map.get(key) ?? { key, cost: 0, inputTokens: 0, outputTokens: 0, tokens: 0, requests: 0, count: 0 };
    entry.cost += Number(r.cost_usd);
    entry.inputTokens += r.input_tokens;
    entry.outputTokens += r.output_tokens;
    entry.tokens += r.input_tokens + r.output_tokens;
    entry.requests += r.requests_count;
    entry.count++;
    map.set(key, entry);
  }
  return [...map.values()];
}

function fmt$(n: number): string { return `$${n.toFixed(2)}`; }
function fmtN(n: number): string { return n.toLocaleString(); }
function providerName(p: string): string { return PROVIDER_LABELS[p] ?? p; }

// ─── CSV Generation ────────────────────────────────────────────────────────────

function toCsvString(headers: string[], body: string[][]): string {
  const escape = (v: string) => (v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [headers.map(escape).join(",")];
  for (const row of body) lines.push(row.map(escape).join(","));
  return lines.join("\n");
}

function csvSection(title: string, headers: string[], body: string[][]): string {
  return `${title}\n${toCsvString(headers, body)}\n`;
}

export function generateCsv(template: TemplateId, rows: UsageRow[]): string {
  switch (template) {
    case "complete":
      return toCsvString(
        ["Date", "User", "Email", "Department", "Team", "Provider", "Model", "Input Tokens", "Output Tokens", "Requests", "Cost (USD)"],
        rows.map((r) => [
          r.date, r.user_name, r.email, r.department, r.team, providerName(r.provider), r.model,
          String(r.input_tokens), String(r.output_tokens), String(r.requests_count), Number(r.cost_usd).toFixed(6),
        ])
      );

    case "cost": {
      const byDept = aggregate(rows, (r) => r.department || "Unassigned").sort((a, b) => b.cost - a.cost);
      const byProv = aggregate(rows, (r) => providerName(r.provider)).sort((a, b) => b.cost - a.cost);
      const byModel = aggregate(rows, (r) => `${r.model}|${r.provider}`).sort((a, b) => b.cost - a.cost);
      const byUser = aggregate(rows, (r) => `${r.user_name}|${r.email}`).sort((a, b) => b.cost - a.cost).slice(0, 20);
      const totalCost = rows.reduce((s, r) => s + Number(r.cost_usd), 0);

      let csv = csvSection("Cost by Department", ["Department", "Cost", "% of Total", "Requests"],
        byDept.map((d) => [d.key, fmt$(d.cost), `${((d.cost / totalCost) * 100).toFixed(1)}%`, fmtN(d.requests)]));
      csv += "\n" + csvSection("Cost by Provider", ["Provider", "Cost", "% of Total", "Cost/Request"],
        byProv.map((p) => [p.key, fmt$(p.cost), `${((p.cost / totalCost) * 100).toFixed(1)}%`, p.requests > 0 ? fmt$(p.cost / p.requests) : "$0.00"]));
      csv += "\n" + csvSection("Cost by Model", ["Model", "Provider", "Cost", "% of Total", "Requests"],
        byModel.map((m) => { const [model, prov] = m.key.split("|"); return [model, providerName(prov), fmt$(m.cost), `${((m.cost / totalCost) * 100).toFixed(1)}%`, fmtN(m.requests)]; }));
      csv += "\n" + csvSection("Top 20 Spenders", ["User", "Email", "Cost", "Requests"],
        byUser.map((u) => { const [name, email] = u.key.split("|"); return [name, email, fmt$(u.cost), fmtN(u.requests)]; }));
      return csv;
    }

    case "usage": {
      const byModel = aggregate(rows, (r) => `${r.model}|${r.provider}`).sort((a, b) => b.tokens - a.tokens);
      const byProv = aggregate(rows, (r) => providerName(r.provider)).sort((a, b) => b.tokens - a.tokens);
      const byUser = aggregate(rows, (r) => `${r.user_name}|${r.email}|${r.department}`).sort((a, b) => b.tokens - a.tokens).slice(0, 20);

      let csv = csvSection("Usage by Model", ["Model", "Provider", "Input Tokens", "Output Tokens", "Total Tokens", "Requests"],
        byModel.map((m) => { const [model, prov] = m.key.split("|"); return [model, providerName(prov), fmtN(m.inputTokens), fmtN(m.outputTokens), fmtN(m.tokens), fmtN(m.requests)]; }));
      csv += "\n" + csvSection("Usage by Provider", ["Provider", "Input Tokens", "Output Tokens", "Total Tokens", "Requests"],
        byProv.map((p) => [p.key, fmtN(p.inputTokens), fmtN(p.outputTokens), fmtN(p.tokens), fmtN(p.requests)]));
      csv += "\n" + csvSection("Top 20 Users by Token Volume", ["User", "Email", "Department", "Total Tokens", "Requests"],
        byUser.map((u) => { const [name, email, dept] = u.key.split("|"); return [name, email, dept, fmtN(u.tokens), fmtN(u.requests)]; }));
      return csv;
    }

    case "executive": {
      const totalCost = rows.reduce((s, r) => s + Number(r.cost_usd), 0);
      const totalTokens = rows.reduce((s, r) => s + r.input_tokens + r.output_tokens, 0);
      const totalRequests = rows.reduce((s, r) => s + r.requests_count, 0);
      const uniqueUsers = new Set(rows.map((r) => r.email)).size;
      const byDept = aggregate(rows, (r) => r.department || "Unassigned").sort((a, b) => b.cost - a.cost);
      const byProv = aggregate(rows, (r) => providerName(r.provider)).sort((a, b) => b.cost - a.cost);

      let csv = csvSection("Summary", ["Metric", "Value"], [
        ["Total Cost", fmt$(totalCost)], ["Total Tokens", fmtN(totalTokens)], ["Total Requests", fmtN(totalRequests)],
        ["Active Users", String(uniqueUsers)], ["Avg Cost/User", uniqueUsers > 0 ? fmt$(totalCost / uniqueUsers) : "$0.00"],
        ["Avg Cost/Request", totalRequests > 0 ? `$${(totalCost / totalRequests).toFixed(4)}` : "$0.00"],
      ]);
      csv += "\n" + csvSection("Department Overview", ["Department", "Cost", "% of Total", "Users", "Tokens"],
        byDept.map((d) => { const users = new Set(rows.filter((r) => (r.department || "Unassigned") === d.key).map((r) => r.email)).size; return [d.key, fmt$(d.cost), `${((d.cost / totalCost) * 100).toFixed(1)}%`, String(users), fmtN(d.tokens)]; }));
      csv += "\n" + csvSection("Provider Overview", ["Provider", "Cost", "% of Total", "Tokens", "Requests"],
        byProv.map((p) => [p.key, fmt$(p.cost), `${((p.cost / totalCost) * 100).toFixed(1)}%`, fmtN(p.tokens), fmtN(p.requests)]));
      return csv;
    }

    case "chargeback": {
      const totalCost = rows.reduce((s, r) => s + Number(r.cost_usd), 0);
      const byDept = aggregate(rows, (r) => r.department || "Unassigned").sort((a, b) => b.cost - a.cost);
      const byDeptProvider = aggregate(rows, (r) => `${r.department || "Unassigned"}|${providerName(r.provider)}`).sort((a, b) => b.cost - a.cost);

      let csv = csvSection("Chargeback Summary", ["Department", "Cost", "% of Total", "Users", "Tokens", "Requests"],
        byDept.map((d) => {
          const users = new Set(rows.filter((r) => (r.department || "Unassigned") === d.key).map((r) => r.email)).size;
          return [d.key, fmt$(d.cost), `${((d.cost / totalCost) * 100).toFixed(1)}%`, String(users), fmtN(d.tokens), fmtN(d.requests)];
        }));
      csv += "\n" + csvSection("Department × Provider Detail", ["Department", "Provider", "Cost", "Tokens", "Requests"],
        byDeptProvider.map((dp) => {
          const [dept, prov] = dp.key.split("|");
          return [dept, prov, fmt$(dp.cost), fmtN(dp.tokens), fmtN(dp.requests)];
        }));
      csv += `\nTotal,${fmt$(totalCost)}\n`;
      return csv;
    }
  }
}

// ─── PDF Generation ────────────────────────────────────────────────────────────

const BRAND_RGB = [12, 22, 62] as const;
const HEAD_STYLE = { fillColor: [...BRAND_RGB] as [number, number, number], textColor: 255, fontSize: 7.5, fontStyle: "bold" as const };
const ROW_ALT = { fillColor: [248, 249, 252] as [number, number, number] };
const TABLE_STYLE = { fontSize: 7, cellPadding: 1.5 };
const MARGIN = 14;

function pdfHeader(doc: jsPDF, title: string, period: string, filterParts: string[]) {
  doc.setFontSize(18);
  doc.setTextColor(...BRAND_RGB);
  doc.text(`Agent Plutus — ${title}`, MARGIN, 18);
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text([period, ...filterParts].join("  •  "), MARGIN, 24);
  doc.text(`Generated ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, MARGIN, 29);
}

function pdfFooters(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.text(`Agent Plutus  •  Page ${i} of ${pageCount}`, doc.internal.pageSize.getWidth() / 2, doc.internal.pageSize.getHeight() - 6, { align: "center" });
  }
}

function pdfSectionTitle(doc: jsPDF, y: number, text: string): number {
  if (y > doc.internal.pageSize.getHeight() - 30) { doc.addPage(); y = 20; }
  doc.setFontSize(11);
  doc.setTextColor(...BRAND_RGB);
  doc.setFont("helvetica", "bold");
  doc.text(text, MARGIN, y);
  doc.setFont("helvetica", "normal");
  return y + 2;
}

function pdfKpiStrip(doc: jsPDF, y: number, kpis: Array<{ label: string; value: string }>): number {
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);
  doc.setFont("helvetica", "bold");
  const spacing = (doc.internal.pageSize.getWidth() - MARGIN * 2) / kpis.length;
  kpis.forEach((kpi, i) => doc.text(`${kpi.label}: ${kpi.value}`, MARGIN + i * spacing, y));
  doc.setFont("helvetica", "normal");
  return y + 6;
}

function getLastY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 40;
}

function pageW(doc: jsPDF): number { return doc.internal.pageSize.getWidth(); }
function pageH(doc: jsPDF): number { return doc.internal.pageSize.getHeight(); }
function contentW(doc: jsPDF): number { return pageW(doc) - MARGIN * 2; }

function addChartPair(
  doc: jsPDF,
  y: number,
  leftImg: string,
  rightImg: string,
  chartH: number
): number {
  const cw = contentW(doc);
  const halfW = (cw - 4) / 2;
  const imgHmm = chartH * (halfW / (chartH * 1.6));

  if (y + imgHmm > pageH(doc) - 15) { doc.addPage(); y = 20; }

  doc.addImage(leftImg, "PNG", MARGIN, y, halfW, imgHmm);
  doc.addImage(rightImg, "PNG", MARGIN + halfW + 4, y, halfW, imgHmm);
  return y + imgHmm + 6;
}

function addChartFull(doc: jsPDF, y: number, img: string, chartH: number): number {
  const cw = contentW(doc);
  const imgHmm = chartH * (cw / (chartH * 2.2));

  if (y + imgHmm > pageH(doc) - 15) { doc.addPage(); y = 20; }

  doc.addImage(img, "PNG", MARGIN, y, cw, imgHmm);
  return y + imgHmm + 6;
}

function chartPixelW(doc: jsPDF, half: boolean): number {
  return half ? 440 : 900;
}

export function generatePdf(
  template: TemplateId,
  rows: UsageRow[],
  period: string,
  filterParts: string[],
  orientation: PdfOrientation = "landscape"
): jsPDF {
  const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });

  const totalCost = rows.reduce((s, r) => s + Number(r.cost_usd), 0);
  const totalTokens = rows.reduce((s, r) => s + r.input_tokens + r.output_tokens, 0);
  const totalRequests = rows.reduce((s, r) => s + r.requests_count, 0);
  const uniqueUsers = new Set(rows.map((r) => r.email)).size;

  const chartHalf = chartPixelW(doc, true);
  const chartFull = chartPixelW(doc, false);
  const chartPxH = 260;

  switch (template) {
    case "complete": {
      pdfHeader(doc, "Complete Report", period, filterParts);
      let y = pdfKpiStrip(doc, 36, [
        { label: "Total Cost", value: fmt$(totalCost) },
        { label: "Tokens", value: fmtN(totalTokens) },
        { label: "Requests", value: fmtN(totalRequests) },
        { label: "Records", value: fmtN(rows.length) },
      ]);

      if (rows.length > 0) {
        const trendImg = renderSpendTrendChart(rows, chartHalf, chartPxH);
        const provImg = renderProviderBarChart(rows, chartHalf, chartPxH);
        y = addChartPair(doc, y, trendImg, provImg, chartPxH);
      }

      autoTable(doc, {
        startY: y,
        head: [["Date", "User", "Email", "Dept", "Team", "Provider", "Model", "In Tokens", "Out Tokens", "Requests", "Cost"]],
        body: rows.map((r) => [
          r.date, r.user_name, r.email, r.department, r.team, providerName(r.provider), r.model,
          fmtN(r.input_tokens), fmtN(r.output_tokens), fmtN(r.requests_count), `$${Number(r.cost_usd).toFixed(4)}`,
        ]),
        styles: TABLE_STYLE, headStyles: HEAD_STYLE, alternateRowStyles: ROW_ALT,
        margin: { left: MARGIN, right: MARGIN },
      });
      break;
    }

    case "cost": {
      pdfHeader(doc, "Cost Analysis", period, filterParts);
      let y = pdfKpiStrip(doc, 36, [
        { label: "Total Spend", value: fmt$(totalCost) },
        { label: "Avg/User", value: uniqueUsers > 0 ? fmt$(totalCost / uniqueUsers) : "$0" },
        { label: "Avg/Request", value: totalRequests > 0 ? `$${(totalCost / totalRequests).toFixed(4)}` : "$0" },
        { label: "Active Users", value: String(uniqueUsers) },
      ]);

      if (rows.length > 0) {
        const trendImg = renderSpendTrendChart(rows, chartHalf, chartPxH);
        const provImg = renderProviderBarChart(rows, chartHalf, chartPxH);
        y = addChartPair(doc, y, trendImg, provImg, chartPxH);

        const modelImg = renderCostByModelChart(rows, chartFull, chartPxH + 40);
        y = addChartFull(doc, y, modelImg, chartPxH + 40);

        const cumImg = renderCumulativeCostChart(rows, chartFull, chartPxH + 40);
        y = addChartFull(doc, y, cumImg, chartPxH + 40);
      }

      const byDept = aggregate(rows, (r) => r.department || "Unassigned").sort((a, b) => b.cost - a.cost);
      y = pdfSectionTitle(doc, y, "Cost by Department");
      autoTable(doc, {
        startY: y,
        head: [["Department", "Cost", "% of Total", "Requests", "Cost/Request"]],
        body: byDept.map((d) => [d.key, fmt$(d.cost), `${((d.cost / totalCost) * 100).toFixed(1)}%`, fmtN(d.requests), d.requests > 0 ? `$${(d.cost / d.requests).toFixed(4)}` : "—"]),
        styles: TABLE_STYLE, headStyles: HEAD_STYLE, alternateRowStyles: ROW_ALT, margin: { left: MARGIN, right: MARGIN },
      });

      const byProv = aggregate(rows, (r) => providerName(r.provider)).sort((a, b) => b.cost - a.cost);
      y = getLastY(doc) + 6;
      y = pdfSectionTitle(doc, y, "Cost by Provider");
      autoTable(doc, {
        startY: y,
        head: [["Provider", "Cost", "% of Total", "Requests", "Cost/Request"]],
        body: byProv.map((p) => [p.key, fmt$(p.cost), `${((p.cost / totalCost) * 100).toFixed(1)}%`, fmtN(p.requests), p.requests > 0 ? `$${(p.cost / p.requests).toFixed(4)}` : "—"]),
        styles: TABLE_STYLE, headStyles: HEAD_STYLE, alternateRowStyles: ROW_ALT, margin: { left: MARGIN, right: MARGIN },
      });

      const byModel = aggregate(rows, (r) => `${r.model}|${r.provider}`).sort((a, b) => b.cost - a.cost).slice(0, 15);
      y = getLastY(doc) + 6;
      y = pdfSectionTitle(doc, y, "Top Models by Cost");
      autoTable(doc, {
        startY: y,
        head: [["Model", "Provider", "Cost", "% of Total", "Requests"]],
        body: byModel.map((m) => { const [model, prov] = m.key.split("|"); return [model, providerName(prov), fmt$(m.cost), `${((m.cost / totalCost) * 100).toFixed(1)}%`, fmtN(m.requests)]; }),
        styles: TABLE_STYLE, headStyles: HEAD_STYLE, alternateRowStyles: ROW_ALT, margin: { left: MARGIN, right: MARGIN },
      });

      const byUser = aggregate(rows, (r) => `${r.user_name}|${r.email}`).sort((a, b) => b.cost - a.cost).slice(0, 15);
      y = getLastY(doc) + 6;
      y = pdfSectionTitle(doc, y, "Top Spenders");
      autoTable(doc, {
        startY: y,
        head: [["User", "Email", "Cost", "% of Total", "Requests"]],
        body: byUser.map((u) => { const [name, email] = u.key.split("|"); return [name, email, fmt$(u.cost), `${((u.cost / totalCost) * 100).toFixed(1)}%`, fmtN(u.requests)]; }),
        styles: TABLE_STYLE, headStyles: HEAD_STYLE, alternateRowStyles: ROW_ALT, margin: { left: MARGIN, right: MARGIN },
      });
      break;
    }

    case "usage": {
      pdfHeader(doc, "Usage Breakdown", period, filterParts);
      let y = pdfKpiStrip(doc, 36, [
        { label: "Total Tokens", value: fmtN(totalTokens) },
        { label: "Input", value: fmtN(rows.reduce((s, r) => s + r.input_tokens, 0)) },
        { label: "Output", value: fmtN(rows.reduce((s, r) => s + r.output_tokens, 0)) },
        { label: "Requests", value: fmtN(totalRequests) },
      ]);

      if (rows.length > 0) {
        const tokenImg = renderTokenTrendChart(rows, chartHalf, chartPxH);
        const provTokenImg = renderProviderTokenBar(rows, chartHalf, chartPxH);
        y = addChartPair(doc, y, tokenImg, provTokenImg, chartPxH);
      }

      const byModel = aggregate(rows, (r) => `${r.model}|${r.provider}`).sort((a, b) => b.tokens - a.tokens);
      y = pdfSectionTitle(doc, y, "Usage by Model");
      autoTable(doc, {
        startY: y,
        head: [["Model", "Provider", "Input Tokens", "Output Tokens", "Total Tokens", "Requests"]],
        body: byModel.map((m) => { const [model, prov] = m.key.split("|"); return [model, providerName(prov), fmtN(m.inputTokens), fmtN(m.outputTokens), fmtN(m.tokens), fmtN(m.requests)]; }),
        styles: TABLE_STYLE, headStyles: HEAD_STYLE, alternateRowStyles: ROW_ALT, margin: { left: MARGIN, right: MARGIN },
      });

      const byProv = aggregate(rows, (r) => providerName(r.provider)).sort((a, b) => b.tokens - a.tokens);
      y = getLastY(doc) + 6;
      y = pdfSectionTitle(doc, y, "Usage by Provider");
      autoTable(doc, {
        startY: y,
        head: [["Provider", "Input Tokens", "Output Tokens", "Total Tokens", "Requests"]],
        body: byProv.map((p) => [p.key, fmtN(p.inputTokens), fmtN(p.outputTokens), fmtN(p.tokens), fmtN(p.requests)]),
        styles: TABLE_STYLE, headStyles: HEAD_STYLE, alternateRowStyles: ROW_ALT, margin: { left: MARGIN, right: MARGIN },
      });

      const byUser = aggregate(rows, (r) => `${r.user_name}|${r.email}|${r.department}`).sort((a, b) => b.tokens - a.tokens).slice(0, 20);
      y = getLastY(doc) + 6;
      y = pdfSectionTitle(doc, y, "Top Users by Token Volume");
      autoTable(doc, {
        startY: y,
        head: [["User", "Email", "Department", "Total Tokens", "Requests"]],
        body: byUser.map((u) => { const [name, email, dept] = u.key.split("|"); return [name, email, dept, fmtN(u.tokens), fmtN(u.requests)]; }),
        styles: TABLE_STYLE, headStyles: HEAD_STYLE, alternateRowStyles: ROW_ALT, margin: { left: MARGIN, right: MARGIN },
      });
      break;
    }

    case "executive": {
      pdfHeader(doc, "Executive Summary", period, filterParts);
      let y = pdfKpiStrip(doc, 36, [
        { label: "Total Spend", value: fmt$(totalCost) },
        { label: "Tokens", value: fmtN(totalTokens) },
        { label: "Requests", value: fmtN(totalRequests) },
        { label: "Users", value: String(uniqueUsers) },
      ]);
      y = pdfKpiStrip(doc, y, [
        { label: "Cost/User", value: uniqueUsers > 0 ? fmt$(totalCost / uniqueUsers) : "$0" },
        { label: "Cost/Request", value: totalRequests > 0 ? `$${(totalCost / totalRequests).toFixed(4)}` : "$0" },
        { label: "Tokens/Request", value: totalRequests > 0 ? fmtN(Math.round(totalTokens / totalRequests)) : "0" },
      ]);

      if (rows.length > 0) {
        const trendImg = renderSpendTrendChart(rows, chartHalf, chartPxH);
        const pieImg = renderProviderPieChart(rows, chartHalf, chartPxH);
        y = addChartPair(doc, y, trendImg, pieImg, chartPxH);
      }

      const byDept = aggregate(rows, (r) => r.department || "Unassigned").sort((a, b) => b.cost - a.cost);
      y = pdfSectionTitle(doc, y, "Department Overview");
      autoTable(doc, {
        startY: y,
        head: [["Department", "Cost", "% of Total", "Active Users", "Tokens", "Requests"]],
        body: byDept.map((d) => {
          const users = new Set(rows.filter((r) => (r.department || "Unassigned") === d.key).map((r) => r.email)).size;
          return [d.key, fmt$(d.cost), `${((d.cost / totalCost) * 100).toFixed(1)}%`, String(users), fmtN(d.tokens), fmtN(d.requests)];
        }),
        styles: TABLE_STYLE, headStyles: HEAD_STYLE, alternateRowStyles: ROW_ALT, margin: { left: MARGIN, right: MARGIN },
      });

      const byProv = aggregate(rows, (r) => providerName(r.provider)).sort((a, b) => b.cost - a.cost);
      y = getLastY(doc) + 6;
      y = pdfSectionTitle(doc, y, "Provider Overview");
      autoTable(doc, {
        startY: y,
        head: [["Provider", "Cost", "% of Total", "Tokens", "Requests", "Cost/Request"]],
        body: byProv.map((p) => [p.key, fmt$(p.cost), `${((p.cost / totalCost) * 100).toFixed(1)}%`, fmtN(p.tokens), fmtN(p.requests), p.requests > 0 ? `$${(p.cost / p.requests).toFixed(4)}` : "—"]),
        styles: TABLE_STYLE, headStyles: HEAD_STYLE, alternateRowStyles: ROW_ALT, margin: { left: MARGIN, right: MARGIN },
      });

      const topModels = aggregate(rows, (r) => `${r.model}|${r.provider}`).sort((a, b) => b.cost - a.cost).slice(0, 10);
      y = getLastY(doc) + 6;
      y = pdfSectionTitle(doc, y, "Top Models");
      autoTable(doc, {
        startY: y,
        head: [["Model", "Provider", "Cost", "Tokens", "Requests"]],
        body: topModels.map((m) => { const [model, prov] = m.key.split("|"); return [model, providerName(prov), fmt$(m.cost), fmtN(m.tokens), fmtN(m.requests)]; }),
        styles: TABLE_STYLE, headStyles: HEAD_STYLE, alternateRowStyles: ROW_ALT, margin: { left: MARGIN, right: MARGIN },
      });
      break;
    }

    case "chargeback": {
      pdfHeader(doc, "Chargeback Report", period, filterParts);
      let y = pdfKpiStrip(doc, 36, [
        { label: "Total Cost", value: fmt$(totalCost) },
        { label: "Departments", value: String(new Set(rows.map((r) => r.department || "Unassigned")).size) },
        { label: "Users", value: String(uniqueUsers) },
        { label: "Providers", value: String(new Set(rows.map((r) => r.provider)).size) },
      ]);

      if (rows.length > 0) {
        const provImg = renderProviderPieChart(rows, chartHalf, chartPxH);
        const barImg = renderProviderBarChart(rows, chartHalf, chartPxH);
        y = addChartPair(doc, y, provImg, barImg, chartPxH);
      }

      const byDeptCb = aggregate(rows, (r) => r.department || "Unassigned").sort((a, b) => b.cost - a.cost);
      y = pdfSectionTitle(doc, y, "Cost Allocation by Department");
      autoTable(doc, {
        startY: y,
        head: [["Department", "Cost", "% of Total", "Users", "Tokens", "Requests"]],
        body: byDeptCb.map((d) => {
          const users = new Set(rows.filter((r) => (r.department || "Unassigned") === d.key).map((r) => r.email)).size;
          return [d.key, fmt$(d.cost), `${((d.cost / totalCost) * 100).toFixed(1)}%`, String(users), fmtN(d.tokens), fmtN(d.requests)];
        }),
        styles: TABLE_STYLE, headStyles: HEAD_STYLE, alternateRowStyles: ROW_ALT, margin: { left: MARGIN, right: MARGIN },
      });

      const byDeptProv = aggregate(rows, (r) => `${r.department || "Unassigned"}|${providerName(r.provider)}`).sort((a, b) => b.cost - a.cost);
      y = getLastY(doc) + 6;
      y = pdfSectionTitle(doc, y, "Department × Provider Detail");
      autoTable(doc, {
        startY: y,
        head: [["Department", "Provider", "Cost", "Tokens", "Requests"]],
        body: byDeptProv.map((dp) => { const [dept, prov] = dp.key.split("|"); return [dept, prov, fmt$(dp.cost), fmtN(dp.tokens), fmtN(dp.requests)]; }),
        styles: TABLE_STYLE, headStyles: HEAD_STYLE, alternateRowStyles: ROW_ALT, margin: { left: MARGIN, right: MARGIN },
      });

      y = getLastY(doc) + 10;
      doc.setFontSize(10);
      doc.setTextColor(80, 80, 80);
      doc.text(`Grand Total: ${fmt$(totalCost)}`, MARGIN, y);
      break;
    }
  }

  pdfFooters(doc);
  return doc;
}
