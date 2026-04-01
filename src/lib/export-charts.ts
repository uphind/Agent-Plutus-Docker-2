import {
  Chart,
  LineController,
  BarController,
  DoughnutController,
  LineElement,
  BarElement,
  PointElement,
  ArcElement,
  CategoryScale,
  LinearScale,
  Filler,
  Legend,
  Tooltip,
  Title,
} from "chart.js";
import { PROVIDER_LABELS } from "@/lib/utils";
import type { UsageRow } from "@/lib/export-templates";

Chart.register(
  LineController,
  BarController,
  DoughnutController,
  LineElement,
  BarElement,
  PointElement,
  ArcElement,
  CategoryScale,
  LinearScale,
  Filler,
  Legend,
  Tooltip,
  Title
);

const BRAND = "#0c163e";
const BRAND_LIGHT = "rgba(12,22,62,0.12)";
const PROVIDER_CHART_COLORS: Record<string, string> = {
  anthropic: "#D4A574",
  openai: "#10A37F",
  gemini: "#8E75B2",
  cursor: "#6366F1",
  vertex: "#4285F4",
};
const FALLBACK_COLORS = [
  "#6366F1", "#10A37F", "#D4A574", "#8E75B2", "#4285F4",
  "#F59E0B", "#EF4444", "#06B6D4", "#84CC16", "#EC4899",
  "#14B8A6", "#F97316",
];

type ChartConfig = ConstructorParameters<typeof Chart>[1];

function renderChart(
  width: number,
  height: number,
  config: ChartConfig
): string {
  const canvas = document.createElement("canvas");
  canvas.width = width * 2;
  canvas.height = height * 2;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(2, 2);

  const chart = new Chart(ctx, {
    ...config,
    options: {
      ...(config.options ?? {}),
      responsive: false,
      animation: false,
      devicePixelRatio: 2,
    },
  });

  const dataUrl = canvas.toDataURL("image/png");
  chart.destroy();
  return dataUrl;
}

interface DailyAggregate {
  date: string;
  cost: number;
  tokens: number;
}

function aggregateByDate(rows: UsageRow[]): DailyAggregate[] {
  const map = new Map<string, DailyAggregate>();
  for (const r of rows) {
    const d = r.date.slice(0, 10);
    const entry = map.get(d) ?? { date: d, cost: 0, tokens: 0 };
    entry.cost += Number(r.cost_usd);
    entry.tokens += r.input_tokens + r.output_tokens;
    map.set(d, entry);
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

interface ProviderAggregate {
  provider: string;
  label: string;
  cost: number;
  tokens: number;
  requests: number;
}

function aggregateByProvider(rows: UsageRow[]): ProviderAggregate[] {
  const map = new Map<string, ProviderAggregate>();
  for (const r of rows) {
    const entry = map.get(r.provider) ?? {
      provider: r.provider,
      label: PROVIDER_LABELS[r.provider] ?? r.provider,
      cost: 0,
      tokens: 0,
      requests: 0,
    };
    entry.cost += Number(r.cost_usd);
    entry.tokens += r.input_tokens + r.output_tokens;
    entry.requests += r.requests_count;
    map.set(r.provider, entry);
  }
  return [...map.values()].sort((a, b) => b.cost - a.cost);
}

interface ModelDailyAggregate {
  model: string;
  dailyCost: Map<string, number>;
  totalCost: number;
}

function aggregateModelDaily(rows: UsageRow[], topN = 8): { models: ModelDailyAggregate[]; dates: string[] } {
  const dateSet = new Set<string>();
  const modelMap = new Map<string, ModelDailyAggregate>();

  for (const r of rows) {
    const d = r.date.slice(0, 10);
    dateSet.add(d);
    const entry = modelMap.get(r.model) ?? { model: r.model, dailyCost: new Map(), totalCost: 0 };
    entry.dailyCost.set(d, (entry.dailyCost.get(d) ?? 0) + Number(r.cost_usd));
    entry.totalCost += Number(r.cost_usd);
    modelMap.set(r.model, entry);
  }

  const dates = [...dateSet].sort();
  const models = [...modelMap.values()].sort((a, b) => b.totalCost - a.totalCost).slice(0, topN);
  return { models, dates };
}

function shortDate(d: string): string {
  const dt = new Date(d);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const dollarTick = (v: string | number) => `$${Number(v).toFixed(0)}`;
const tokenTick = (v: string | number) => {
  const n = Number(v);
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : String(n);
};

export function renderSpendTrendChart(rows: UsageRow[], w: number, h: number): string {
  const daily = aggregateByDate(rows);
  return renderChart(w, h, {
    type: "line" as const,
    data: {
      labels: daily.map((d) => shortDate(d.date)),
      datasets: [
        {
          label: "Daily Spend ($)",
          data: daily.map((d) => d.cost),
          borderColor: BRAND,
          backgroundColor: BRAND_LIGHT,
          fill: true,
          tension: 0.3,
          pointRadius: daily.length > 30 ? 0 : 2,
          borderWidth: 2,
        },
      ],
    },
    options: {
      plugins: {
        title: { display: true, text: "Spend Trend", font: { size: 13, weight: "bold" as const }, color: BRAND },
        legend: { display: false },
      },
      scales: {
        y: {
          ticks: { callback: dollarTick, font: { size: 9 } },
          grid: { color: "rgba(0,0,0,0.05)" },
        },
        x: { ticks: { font: { size: 8 }, maxRotation: 45 }, grid: { display: false } },
      },
    },
  });
}

export function renderProviderBarChart(rows: UsageRow[], w: number, h: number): string {
  const byProv = aggregateByProvider(rows);
  return renderChart(w, h, {
    type: "bar" as const,
    data: {
      labels: byProv.map((p) => p.label),
      datasets: [
        {
          label: "Cost ($)",
          data: byProv.map((p) => p.cost),
          backgroundColor: byProv.map((p) => PROVIDER_CHART_COLORS[p.provider] ?? "#6b7280"),
          borderRadius: 4,
          barPercentage: 0.6,
        },
      ],
    },
    options: {
      plugins: {
        title: { display: true, text: "Spend by Provider", font: { size: 13, weight: "bold" as const }, color: BRAND },
        legend: { display: false },
      },
      scales: {
        y: {
          ticks: { callback: dollarTick, font: { size: 9 } },
          grid: { color: "rgba(0,0,0,0.05)" },
        },
        x: { ticks: { font: { size: 9 } }, grid: { display: false } },
      },
    },
  });
}

export function renderTokenTrendChart(rows: UsageRow[], w: number, h: number): string {
  const daily = aggregateByDate(rows);
  return renderChart(w, h, {
    type: "line" as const,
    data: {
      labels: daily.map((d) => shortDate(d.date)),
      datasets: [
        {
          label: "Daily Tokens",
          data: daily.map((d) => d.tokens),
          borderColor: "#10A37F",
          backgroundColor: "rgba(16,163,127,0.10)",
          fill: true,
          tension: 0.3,
          pointRadius: daily.length > 30 ? 0 : 2,
          borderWidth: 2,
        },
      ],
    },
    options: {
      plugins: {
        title: { display: true, text: "Token Volume Trend", font: { size: 13, weight: "bold" as const }, color: BRAND },
        legend: { display: false },
      },
      scales: {
        y: { ticks: { callback: tokenTick, font: { size: 9 } }, grid: { color: "rgba(0,0,0,0.05)" } },
        x: { ticks: { font: { size: 8 }, maxRotation: 45 }, grid: { display: false } },
      },
    },
  });
}

export function renderCostByModelChart(rows: UsageRow[], w: number, h: number): string {
  const { models, dates } = aggregateModelDaily(rows, 8);
  return renderChart(w, h, {
    type: "line" as const,
    data: {
      labels: dates.map(shortDate),
      datasets: models.map((m, i) => ({
        label: m.model.length > 25 ? m.model.slice(0, 22) + "..." : m.model,
        data: dates.map((d) => m.dailyCost.get(d) ?? 0),
        borderColor: FALLBACK_COLORS[i % FALLBACK_COLORS.length],
        backgroundColor: "transparent",
        tension: 0.3,
        pointRadius: dates.length > 30 ? 0 : 2,
        borderWidth: 1.5,
      })),
    },
    options: {
      plugins: {
        title: { display: true, text: "Cost by Model Over Time", font: { size: 13, weight: "bold" as const }, color: BRAND },
        legend: { display: true, position: "bottom" as const, labels: { font: { size: 7 }, boxWidth: 10, padding: 8 } },
      },
      scales: {
        y: { ticks: { callback: dollarTick, font: { size: 9 } }, grid: { color: "rgba(0,0,0,0.05)" } },
        x: { ticks: { font: { size: 7 }, maxRotation: 45 }, grid: { display: false } },
      },
    },
  });
}

export function renderCumulativeCostChart(rows: UsageRow[], w: number, h: number): string {
  const { models, dates } = aggregateModelDaily(rows, 8);

  const cumulativeDatasets = models.map((m, i) => {
    let cumulative = 0;
    const data = dates.map((d) => {
      cumulative += m.dailyCost.get(d) ?? 0;
      return cumulative;
    });
    const color = FALLBACK_COLORS[i % FALLBACK_COLORS.length];
    return {
      label: m.model.length > 25 ? m.model.slice(0, 22) + "..." : m.model,
      data,
      borderColor: color,
      backgroundColor: color + "20",
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      borderWidth: 1.5,
    };
  });

  return renderChart(w, h, {
    type: "line" as const,
    data: { labels: dates.map(shortDate), datasets: cumulativeDatasets },
    options: {
      plugins: {
        title: { display: true, text: "Cumulative Cost (Stacked)", font: { size: 13, weight: "bold" as const }, color: BRAND },
        legend: { display: true, position: "bottom" as const, labels: { font: { size: 7 }, boxWidth: 10, padding: 8 } },
      },
      scales: {
        y: { stacked: true, ticks: { callback: dollarTick, font: { size: 9 } }, grid: { color: "rgba(0,0,0,0.05)" } },
        x: { ticks: { font: { size: 7 }, maxRotation: 45 }, grid: { display: false } },
      },
    },
  });
}

export function renderProviderPieChart(rows: UsageRow[], w: number, h: number): string {
  const byProv = aggregateByProvider(rows);
  return renderChart(w, h, {
    type: "doughnut" as const,
    data: {
      labels: byProv.map((p) => p.label),
      datasets: [
        {
          data: byProv.map((p) => p.cost),
          backgroundColor: byProv.map((p) => PROVIDER_CHART_COLORS[p.provider] ?? "#6b7280"),
          borderWidth: 2,
          borderColor: "#fff",
        },
      ],
    },
    options: {
      plugins: {
        title: { display: true, text: "Cost Distribution by Provider", font: { size: 13, weight: "bold" as const }, color: BRAND },
        legend: { display: true, position: "right" as const, labels: { font: { size: 9 }, padding: 12 } },
      },
    },
  });
}

export function renderProviderTokenBar(rows: UsageRow[], w: number, h: number): string {
  const byProv = aggregateByProvider(rows).sort((a, b) => b.tokens - a.tokens);
  return renderChart(w, h, {
    type: "bar" as const,
    data: {
      labels: byProv.map((p) => p.label),
      datasets: [
        {
          label: "Tokens",
          data: byProv.map((p) => p.tokens),
          backgroundColor: byProv.map((p) => PROVIDER_CHART_COLORS[p.provider] ?? "#6b7280"),
          borderRadius: 4,
          barPercentage: 0.6,
        },
      ],
    },
    options: {
      plugins: {
        title: { display: true, text: "Token Volume by Provider", font: { size: 13, weight: "bold" as const }, color: BRAND },
        legend: { display: false },
      },
      scales: {
        y: { ticks: { callback: tokenTick, font: { size: 9 } }, grid: { color: "rgba(0,0,0,0.05)" } },
        x: { ticks: { font: { size: 9 } }, grid: { display: false } },
      },
    },
  });
}
