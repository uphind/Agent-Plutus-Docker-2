import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

interface AnomalyRecord {
  userId: string;
  userName: string;
  date: string;
  spend: number;
  avgSpend: number;
  stddev: number;
  zScore: number;
}

export async function GET() {
  const orgId = await getOrgId();

  const anomalies = await prisma.$queryRaw<AnomalyRecord[]>`
    WITH daily_user_spend AS (
      SELECT ur.user_id, u.name AS user_name, ur.date::text AS date,
             SUM(ur.cost_usd)::float AS spend
      FROM usage_records ur
      JOIN org_users u ON ur.user_id = u.id
      WHERE ur.org_id = ${orgId}
        AND ur.date >= CURRENT_DATE - INTERVAL '21 days'
        AND ur.user_id IS NOT NULL
      GROUP BY ur.user_id, u.name, ur.date
    ),
    user_stats AS (
      SELECT user_id, user_name,
             AVG(spend) AS avg_spend,
             STDDEV_POP(spend) AS stddev
      FROM daily_user_spend
      WHERE date::date < CURRENT_DATE - INTERVAL '7 days'
      GROUP BY user_id, user_name
      HAVING COUNT(*) >= 5 AND STDDEV_POP(spend) > 0
    )
    SELECT
      d.user_id AS "userId",
      d.user_name AS "userName",
      d.date,
      d.spend,
      s.avg_spend AS "avgSpend",
      s.stddev,
      (d.spend - s.avg_spend) / s.stddev AS "zScore"
    FROM daily_user_spend d
    JOIN user_stats s ON d.user_id = s.user_id
    WHERE d.date::date >= CURRENT_DATE - INTERVAL '7 days'
      AND d.spend > s.avg_spend + 2 * s.stddev
    ORDER BY (d.spend - s.avg_spend) / s.stddev DESC
    LIMIT 50
  `;

  return NextResponse.json({
    anomalies,
    count: anomalies.length,
  });
}
