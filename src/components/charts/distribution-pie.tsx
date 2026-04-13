"use client";

import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

interface PieDataItem {
  name: string;
  value: number;
  color?: string;
}

interface DistributionPieProps {
  data: PieDataItem[];
  height?: number;
  innerRadius?: number;
  showLegend?: boolean;
  formatValue?: (value: number) => string;
}

const DEFAULT_COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#84cc16",
];

function CustomTooltip({
  active,
  payload,
  total,
  formatter,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: PieDataItem }>;
  total: number;
  formatter: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0";
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-md text-xs">
      <p className="font-medium">{item.name}</p>
      <p className="text-muted-foreground">
        {formatter(item.value)} ({pct}%)
      </p>
    </div>
  );
}

export function DistributionPie({
  data,
  height = 280,
  innerRadius = 55,
  showLegend = true,
  formatValue = formatCurrency,
}: DistributionPieProps) {
  const total = data.reduce((s, d) => s + d.value, 0);

  if (!data.length || total === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={innerRadius}
          outerRadius={innerRadius + 40}
          paddingAngle={2}
          dataKey="value"
          animationBegin={0}
          animationDuration={600}
        >
          {data.map((entry, i) => (
            <Cell
              key={entry.name}
              fill={entry.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
              strokeWidth={1}
              stroke="var(--color-card)"
            />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip total={total} formatter={formatValue} />} />
        {showLegend && (
          <Legend
            layout="vertical"
            align="right"
            verticalAlign="middle"
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: "11px", paddingLeft: "12px" }}
          />
        )}
      </PieChart>
    </ResponsiveContainer>
  );
}
