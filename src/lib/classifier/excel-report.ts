import ExcelJS from "exceljs";
import type { RecommendedRow, ClassifySummary, CategoryName } from "./types";

const BLUE_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFD6E4F0" },
};
const YELLOW_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFF2CC" },
};
const GREEN_FILL: ExcelJS.FillPattern = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFC6EFCE" },
};
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, size: 11 };
const TITLE_FONT: Partial<ExcelJS.Font> = { bold: true, size: 14 };
const KPI_FONT: Partial<ExcelJS.Font> = { bold: true, size: 12 };
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  bottom: { style: "thin" },
  left: { style: "thin" },
  right: { style: "thin" },
};

const CATEGORY_DESCRIPTIONS: Record<CategoryName, string> = {
  "\u{1F9D1}\u200D\u{1F4BB} Power / Technical":
    "Heavy usage, large inputs, flagship or IDE models, agentic/tool or web-search patterns. Coding, analysis, research, big documents.",
  "\u270D\uFE0F Content Generator":
    "Output >> Input. Writing, drafting, summarisation.",
  "\u{1F4AC} Conversational":
    "Balanced usage. Brainstorming, back-and-forth dialogue.",
  "\u{1F50D} Lookup / Q&A":
    "Short inputs, short outputs, many requests. Search-like Q&A.",
  "\u{1F9EA} Explorer":
    "Low/irregular usage. Still discovering capabilities.",
};

function applyHeaderRow(ws: ExcelJS.Worksheet, row: number, fills: (ExcelJS.FillPattern | null)[]) {
  const r = ws.getRow(row);
  r.font = HEADER_FONT;
  r.alignment = { vertical: "middle", wrapText: true };
  r.border = THIN_BORDER;
  r.eachCell((cell, colNum) => {
    const fill = fills[colNum - 1];
    if (fill) cell.fill = fill;
  });
}

function usd(v: number | null | undefined): string {
  if (v == null) return "—";
  return `$${v.toFixed(2)}`;
}

function pct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toFixed(1)}%`;
}

export async function generateExcelReport(
  rows: RecommendedRow[],
  summary: ClassifySummary
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Agent Plutus";
  wb.created = new Date();

  buildExecutiveSummary(wb, rows, summary);
  buildCostSavings(wb, rows);
  buildSummarySheet(wb, rows);
  buildLegend(wb);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

function buildExecutiveSummary(
  wb: ExcelJS.Workbook,
  rows: RecommendedRow[],
  summary: ClassifySummary
) {
  const ws = wb.addWorksheet("Executive Summary");
  ws.columns = [
    { width: 30 }, { width: 20 }, { width: 20 },
    { width: 25 }, { width: 22 }, { width: 22 },
    { width: 25 }, { width: 22 }, { width: 22 },
  ];

  ws.mergeCells("A1:I1");
  const titleCell = ws.getCell("A1");
  titleCell.value = "AI Usage Classification — Executive Summary";
  titleCell.font = TITLE_FONT;
  titleCell.alignment = { vertical: "middle" };
  ws.getRow(1).height = 30;

  const kpis: [string, string][] = [
    ["Total Current Cost", usd(summary.totalCost)],
    ["Est. Potential Savings (any vendor)", usd(summary.estSavingsGlobal)],
    ["Est. Potential Savings (same vendor)", usd(summary.estSavingsSameVendor)],
    ["Forecast Cost (any vendor scenario)", usd(summary.forecastCostGlobal)],
    ["Saving % (any vendor)", pct(summary.savingPctGlobal)],
  ];

  let r = 3;
  for (const [label, value] of kpis) {
    ws.getCell(r, 1).value = label;
    ws.getCell(r, 1).font = HEADER_FONT;
    ws.getCell(r, 2).value = value;
    ws.getCell(r, 2).font = KPI_FONT;
    if (label.includes("Savings") || label.includes("Saving")) {
      ws.getCell(r, 2).fill = GREEN_FILL;
    }
    r++;
  }

  r += 2;
  ws.mergeCells(r, 1, r, 9);
  ws.getCell(r, 1).value = "Top Savings Opportunities";
  ws.getCell(r, 1).font = { bold: true, size: 13 };
  r++;

  const headers = [
    "User", "AI Category", "Current Vendor", "Current Model",
    "Cheapest (any vendor)", "Est. saving A",
    "Cheapest (same vendor)", "Est. saving B", "Saving %",
  ];
  const fills = [
    BLUE_FILL, YELLOW_FILL, BLUE_FILL, BLUE_FILL,
    YELLOW_FILL, GREEN_FILL,
    YELLOW_FILL, GREEN_FILL, GREEN_FILL,
  ];

  for (let i = 0; i < headers.length; i++) {
    ws.getCell(r, i + 1).value = headers[i];
  }
  applyHeaderRow(ws, r, fills);
  r++;

  const top15 = [...rows]
    .sort((a, b) => {
      const aGlobal = a.est_savings_global_usd ?? 0;
      const bGlobal = b.est_savings_global_usd ?? 0;
      if (bGlobal !== aGlobal) return bGlobal - aGlobal;
      return (b.est_savings_same_vendor_usd ?? 0) - (a.est_savings_same_vendor_usd ?? 0);
    })
    .filter((row) => row.is_cheaper_global || row.is_cheaper_same_vendor)
    .slice(0, 15);

  for (const row of top15) {
    const savPct =
      row.total_cost_usd > 0 && row.est_savings_global_usd
        ? (row.est_savings_global_usd / row.total_cost_usd) * 100
        : null;
    const vals = [
      row.user_name || row.user_email,
      row.category,
      row.provider,
      row.model,
      row.recommendation_global,
      row.is_cheaper_global ? usd(row.est_savings_global_usd) : "—",
      row.recommendation_same_vendor,
      row.is_cheaper_same_vendor ? usd(row.est_savings_same_vendor_usd) : "—",
      savPct != null ? pct(savPct) : "—",
    ];
    for (let i = 0; i < vals.length; i++) {
      const cell = ws.getCell(r, i + 1);
      cell.value = vals[i];
      cell.border = THIN_BORDER;
      if (i >= 5 && vals[i] !== "—") cell.fill = GREEN_FILL;
    }
    r++;
  }

  r += 2;
  ws.mergeCells(r, 1, r, 9);
  ws.getCell(r, 1).value =
    "Savings A = hypothetical switch to the cheapest qualifying model across all vendors. " +
    "Savings B = cheapest qualifying model within the current vendor only. " +
    "Both use the same token mix and ~5% minimum discount rule.";
  ws.getCell(r, 1).font = { italic: true, size: 9, color: { argb: "FF666666" } };
}

function buildCostSavings(wb: ExcelJS.Workbook, rows: RecommendedRow[]) {
  const ws = wb.addWorksheet("Cost Savings Opportunities");

  const eligible = rows
    .filter((r) => r.is_cheaper_global || r.is_cheaper_same_vendor)
    .sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      const nameA = a.user_name || a.user_email;
      const nameB = b.user_name || b.user_email;
      if (nameA !== nameB) return nameA.localeCompare(nameB);
      return (a.model ?? "").localeCompare(b.model ?? "");
    });

  const blueHeaders = [
    "AI Vendor", "AI Model", "User", "Email", "Department", "Team",
    "Total Requests", "Active Days", "Req / Day",
    "Avg Input Tokens", "Avg Output Tokens", "Output/Input Ratio", "Total Cost ($)",
  ];
  const yellowHeaders = [
    "AI Category",
    "Cheapest — any vendor", "Est. savings A ($)", "Savings A (%)",
    "Cheapest — same vendor", "Est. savings B ($)", "Savings B (%)",
    "Explanation",
  ];
  const allHeaders = [...blueHeaders, ...yellowHeaders];

  ws.columns = allHeaders.map((h) => ({
    width: h.includes("Explanation") ? 50 : h.length < 10 ? 14 : 20,
  }));

  const headerFills = [
    ...blueHeaders.map(() => BLUE_FILL),
    YELLOW_FILL,
    YELLOW_FILL, GREEN_FILL, GREEN_FILL,
    YELLOW_FILL, GREEN_FILL, GREEN_FILL,
    YELLOW_FILL,
  ];

  for (let i = 0; i < allHeaders.length; i++) {
    ws.getCell(1, i + 1).value = allHeaders[i];
  }
  applyHeaderRow(ws, 1, headerFills);
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: allHeaders.length } };

  let r = 2;
  for (const row of eligible) {
    const savPctGlobal =
      row.total_cost_usd > 0 && row.est_savings_global_usd
        ? (row.est_savings_global_usd / row.total_cost_usd) * 100
        : null;
    const savPctSame =
      row.total_cost_usd > 0 && row.est_savings_same_vendor_usd
        ? (row.est_savings_same_vendor_usd / row.total_cost_usd) * 100
        : null;

    const vals: (string | number)[] = [
      row.provider, row.model, row.user_name || row.user_email, row.user_email,
      row.department, row.team,
      row.total_requests, row.active_days,
      Math.round(row.requests_per_day * 10) / 10,
      Math.round(row.avg_input), Math.round(row.avg_output),
      Math.round(row.ratio * 100) / 100,
      Math.round(row.total_cost_usd * 100) / 100,
      row.category,
      row.recommendation_global,
      row.is_cheaper_global ? Math.round((row.est_savings_global_usd ?? 0) * 100) / 100 : 0,
      savPctGlobal != null ? Math.round(savPctGlobal * 10) / 10 : 0,
      row.recommendation_same_vendor,
      row.is_cheaper_same_vendor ? Math.round((row.est_savings_same_vendor_usd ?? 0) * 100) / 100 : 0,
      savPctSame != null ? Math.round(savPctSame * 10) / 10 : 0,
      row.explanation,
    ];

    for (let i = 0; i < vals.length; i++) {
      const cell = ws.getCell(r, i + 1);
      cell.value = vals[i];
      cell.border = THIN_BORDER;
      if ((i === 15 || i === 16) && row.is_cheaper_global) cell.fill = GREEN_FILL;
      if ((i === 18 || i === 19) && row.is_cheaper_same_vendor) cell.fill = GREEN_FILL;
    }
    r++;
  }
}

function buildSummarySheet(wb: ExcelJS.Workbook, rows: RecommendedRow[]) {
  const ws = wb.addWorksheet("Summary");
  ws.columns = [
    { width: 30 }, { width: 12 }, { width: 18 },
    { width: 30 }, { width: 30 },
  ];

  const headers = ["Category", "Users", "Total Cost ($)", "Top global target", "Top same-vendor target"];
  for (let i = 0; i < headers.length; i++) {
    ws.getCell(1, i + 1).value = headers[i];
  }
  applyHeaderRow(ws, 1, headers.map(() => BLUE_FILL));

  const categories = Object.keys(CATEGORY_DESCRIPTIONS) as CategoryName[];
  let r = 2;
  for (const cat of categories) {
    const catRows = rows.filter((row) => row.category === cat);
    const uniqueUsers = new Set(catRows.map((row) => row.user_email));
    const totalCost = catRows.reduce((s, row) => s + row.total_cost_usd, 0);

    const globalRecs = catRows
      .filter((row) => row.is_cheaper_global)
      .map((row) => row.recommendation_global);
    const sameRecs = catRows
      .filter((row) => row.is_cheaper_same_vendor)
      .map((row) => row.recommendation_same_vendor);

    const topGlobal = mode(globalRecs) || "—";
    const topSame = mode(sameRecs) || "—";

    const vals: (string | number)[] = [cat, uniqueUsers.size, Math.round(totalCost * 100) / 100, topGlobal, topSame];
    for (let i = 0; i < vals.length; i++) {
      const cell = ws.getCell(r, i + 1);
      cell.value = vals[i];
      cell.border = THIN_BORDER;
    }
    r++;
  }
}

function buildLegend(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet("Legend");
  ws.columns = [{ width: 30 }, { width: 80 }];

  ws.getCell(1, 1).value = "Category";
  ws.getCell(1, 2).value = "Description";
  applyHeaderRow(ws, 1, [BLUE_FILL, BLUE_FILL]);

  let r = 2;
  for (const [cat, desc] of Object.entries(CATEGORY_DESCRIPTIONS)) {
    ws.getCell(r, 1).value = cat;
    ws.getCell(r, 1).border = THIN_BORDER;
    ws.getCell(r, 2).value = desc;
    ws.getCell(r, 2).border = THIN_BORDER;
    ws.getCell(r, 2).alignment = { wrapText: true };
    r++;
  }

  r += 2;
  ws.getCell(r, 1).value = "Color Convention";
  ws.getCell(r, 1).font = HEADER_FONT;
  r++;
  const colors: [string, ExcelJS.FillPattern][] = [
    ["Blue = data from input", BLUE_FILL],
    ["Yellow = AI analysis output", YELLOW_FILL],
    ["Green = estimated cost savings", GREEN_FILL],
  ];
  for (const [label, fill] of colors) {
    ws.getCell(r, 1).value = label;
    ws.getCell(r, 1).fill = fill;
    ws.getCell(r, 1).border = THIN_BORDER;
    r++;
  }
}

function mode(arr: string[]): string | null {
  if (arr.length === 0) return null;
  const counts = new Map<string, number>();
  for (const v of arr) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best = "";
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}
