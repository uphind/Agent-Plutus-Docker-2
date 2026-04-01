import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

function linearRegression(points: Array<{ x: number; y: number }>): { slope: number; intercept: number; r2: number } {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.y ?? 0, r2: 0 };

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumX2 += p.x * p.x;
    sumY2 += p.y * p.y;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  const ssTot = sumY2 - (sumY * sumY) / n;
  const ssRes = points.reduce((s, p) => {
    const predicted = slope * p.x + intercept;
    return s + (p.y - predicted) ** 2;
  }, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { slope, intercept, r2 };
}

export async function GET(request: NextRequest) {
  const orgId = await getOrgId();
  const { searchParams } = new URL(request.url);
  const historyDays = parseInt(searchParams.get("historyDays") ?? "90", 10);
  const forecastDays = parseInt(searchParams.get("forecastDays") ?? "30", 10);

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - historyDays);

  const dailySpend = await prisma.$queryRawUnsafe<
    Array<{ date: string; spend: number; tokens: number; requests: number }>
  >(
    `SELECT date::text, SUM(cost_usd)::float AS spend,
            SUM(input_tokens + output_tokens)::bigint AS tokens,
            SUM(requests_count)::bigint AS requests
     FROM usage_records
     WHERE org_id = '${orgId}' AND date >= '${startDate.toISOString()}'
     GROUP BY date ORDER BY date`
  );

  const weekdaySpend: number[] = [];
  const weekendSpend: number[] = [];
  for (const d of dailySpend) {
    const dow = new Date(d.date).getDay();
    if (dow === 0 || dow === 6) weekendSpend.push(d.spend);
    else weekdaySpend.push(d.spend);
  }
  const avgWeekday = weekdaySpend.length > 0 ? weekdaySpend.reduce((a, b) => a + b, 0) / weekdaySpend.length : 0;
  const avgWeekend = weekendSpend.length > 0 ? weekendSpend.reduce((a, b) => a + b, 0) / weekendSpend.length : 0;

  const points = dailySpend.map((d, i) => ({ x: i, y: d.spend }));
  const reg = linearRegression(points);

  const today = new Date();
  const forecast: Array<{ date: string; projected: number; low: number; high: number }> = [];
  const residuals = points.map((p) => Math.abs(p.y - (reg.slope * p.x + reg.intercept)));
  const stdResidual = residuals.length > 0
    ? Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / residuals.length)
    : 0;

  for (let i = 1; i <= forecastDays; i++) {
    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + i);
    const x = points.length + i - 1;
    const dow = futureDate.getDay();
    const isWeekend = dow === 0 || dow === 6;

    let projected = reg.slope * x + reg.intercept;
    if (isWeekend && avgWeekday > 0) {
      projected *= avgWeekend / avgWeekday;
    }
    projected = Math.max(0, projected);

    const confidence = stdResidual * 1.96;
    forecast.push({
      date: futureDate.toISOString().slice(0, 10),
      projected,
      low: Math.max(0, projected - confidence),
      high: projected + confidence,
    });
  }

  const weeklyGrowth = dailySpend.length >= 14
    ? (() => {
        const recentWeek = dailySpend.slice(-7).reduce((s, d) => s + d.spend, 0);
        const priorWeek = dailySpend.slice(-14, -7).reduce((s, d) => s + d.spend, 0);
        return priorWeek > 0 ? ((recentWeek - priorWeek) / priorWeek) * 100 : 0;
      })()
    : null;

  const departments = await prisma.$queryRawUnsafe<
    Array<{
      department_id: string;
      department: string;
      monthly_budget: number | null;
      current_spend: number;
      daily_rate: number;
    }>
  >(
    `SELECT
       u.department_id,
       COALESCE(u.department, 'Unassigned') AS department,
       d.monthly_budget::float AS monthly_budget,
       COALESCE(SUM(ur.cost_usd), 0)::float AS current_spend,
       COALESCE(SUM(ur.cost_usd), 0)::float /
         GREATEST(EXTRACT(DAY FROM NOW() - DATE_TRUNC('month', NOW())) + 1, 1) AS daily_rate
     FROM org_users u
     LEFT JOIN departments d ON u.department_id = d.id
     LEFT JOIN usage_records ur ON ur.user_id = u.id AND ur.org_id = '${orgId}'
       AND ur.date >= DATE_TRUNC('month', NOW())
     WHERE u.org_id = '${orgId}' AND u.status = 'active'
     GROUP BY u.department_id, u.department, d.monthly_budget
     HAVING u.department_id IS NOT NULL`
  );

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const daysRemaining = daysInMonth - dayOfMonth;

  const budgetExhaustion = departments
    .filter((d) => d.monthly_budget && d.monthly_budget > 0 && d.daily_rate > 0)
    .map((d) => {
      const remaining = d.monthly_budget! - d.current_spend;
      const daysUntilExhausted = remaining > 0 ? remaining / d.daily_rate : 0;
      const exhaustionDate = new Date();
      exhaustionDate.setDate(exhaustionDate.getDate() + daysUntilExhausted);
      const projectedMonthEnd = d.current_spend + d.daily_rate * daysRemaining;
      return {
        departmentId: d.department_id,
        department: d.department,
        budget: d.monthly_budget!,
        currentSpend: d.current_spend,
        dailyRate: d.daily_rate,
        projectedMonthEnd,
        projectedOverage: Math.max(0, projectedMonthEnd - d.monthly_budget!),
        daysUntilExhausted: remaining > 0 ? Math.round(daysUntilExhausted) : 0,
        exhaustionDate: remaining > 0 ? exhaustionDate.toISOString().slice(0, 10) : null,
        willExceed: projectedMonthEnd > d.monthly_budget!,
      };
    })
    .sort((a, b) => (a.daysUntilExhausted || 999) - (b.daysUntilExhausted || 999));

  const byProvider = await prisma.$queryRawUnsafe<
    Array<{ provider: string; recent_spend: number; prior_spend: number }>
  >(
    `SELECT provider::text,
       SUM(CASE WHEN date >= NOW() - INTERVAL '7 days' THEN cost_usd ELSE 0 END)::float AS recent_spend,
       SUM(CASE WHEN date >= NOW() - INTERVAL '14 days' AND date < NOW() - INTERVAL '7 days' THEN cost_usd ELSE 0 END)::float AS prior_spend
     FROM usage_records
     WHERE org_id = '${orgId}' AND date >= NOW() - INTERVAL '14 days'
     GROUP BY provider`
  );

  const providerGrowth = byProvider.map((p) => ({
    provider: p.provider,
    recentWeekSpend: p.recent_spend,
    priorWeekSpend: p.prior_spend,
    growthRate: p.prior_spend > 0 ? ((p.recent_spend - p.prior_spend) / p.prior_spend) * 100 : 0,
  }));

  const totalProjected30d = forecast.reduce((s, f) => s + f.projected, 0);

  return NextResponse.json({
    period: { historyDays, forecastDays },
    regression: { slope: reg.slope, intercept: reg.intercept, r2: reg.r2 },
    seasonality: { avgWeekday, avgWeekend, weekendRatio: avgWeekday > 0 ? avgWeekend / avgWeekday : 0 },
    history: dailySpend,
    forecast,
    projectedTotal30d: totalProjected30d,
    weeklyGrowthRate: weeklyGrowth,
    providerGrowth,
    budgetExhaustion,
    currentMonth: { dayOfMonth, daysInMonth, daysRemaining },
  });
}
