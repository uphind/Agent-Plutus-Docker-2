import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

const ALLOWED_DIMENSIONS = ["provider", "model", "department", "team", "user"] as const;
type Dimension = (typeof ALLOWED_DIMENSIONS)[number];

const DIMENSION_SQL: Record<Dimension, { select: string; join: string; groupBy: string }> = {
  provider: {
    select: "ur.provider::text AS dim_provider",
    join: "",
    groupBy: "ur.provider",
  },
  model: {
    select: "COALESCE(ur.model, 'unknown') AS dim_model",
    join: "",
    groupBy: "ur.model",
  },
  department: {
    select: "COALESCE(d.name, 'Unassigned') AS dim_department",
    join: "LEFT JOIN org_users u ON ur.user_id = u.id LEFT JOIN departments d ON u.department_id = d.id",
    groupBy: "d.name",
  },
  team: {
    select: "COALESCE(t.name, 'Unassigned') AS dim_team",
    join: "LEFT JOIN org_users u2 ON ur.user_id = u2.id LEFT JOIN teams t ON u2.team_id = t.id",
    groupBy: "t.name",
  },
  user: {
    select: "COALESCE(ou.name, 'Unknown') AS dim_user, ou.id AS dim_user_id",
    join: "LEFT JOIN org_users ou ON ur.user_id = ou.id",
    groupBy: "ou.name, ou.id",
  },
};

export async function GET(request: NextRequest) {
  const orgId = await getOrgId();
  const { searchParams } = new URL(request.url);

  const groupByParam = searchParams.get("groupBy") ?? "provider";
  const dimensions = groupByParam.split(",").filter((d): d is Dimension =>
    ALLOWED_DIMENSIONS.includes(d as Dimension)
  );
  if (dimensions.length === 0) {
    return NextResponse.json({ error: "At least one valid groupBy dimension required" }, { status: 400 });
  }

  const startDate = searchParams.get("startDate")
    ? new Date(searchParams.get("startDate")!)
    : (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d; })();
  const endDate = searchParams.get("endDate") ? new Date(searchParams.get("endDate")!) : new Date();

  const compareStartDate = searchParams.get("compareStartDate");
  const compareEndDate = searchParams.get("compareEndDate");

  const selects: string[] = [];
  const joins = new Set<string>();
  const groupBys: string[] = [];

  for (const dim of dimensions) {
    const def = DIMENSION_SQL[dim];
    selects.push(def.select);
    if (def.join) joins.add(def.join);
    groupBys.push(def.groupBy);
  }

  const query = `
    SELECT ${selects.join(", ")},
           SUM(ur.cost_usd)::float AS cost,
           SUM(ur.input_tokens + ur.output_tokens)::bigint AS tokens,
           SUM(ur.requests_count)::bigint AS requests,
           SUM(ur.input_tokens)::bigint AS input_tokens,
           SUM(ur.output_tokens)::bigint AS output_tokens,
           SUM(ur.cached_tokens)::bigint AS cached_tokens
    FROM usage_records ur
    ${[...joins].join(" ")}
    WHERE ur.org_id = '${orgId}'
      AND ur.date >= '${startDate.toISOString()}'
      AND ur.date <= '${endDate.toISOString()}'
    GROUP BY ${groupBys.join(", ")}
    ORDER BY cost DESC
    LIMIT 500
  `;

  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(query);

  let comparison: Array<Record<string, unknown>> | undefined;
  if (compareStartDate && compareEndDate) {
    const compQuery = query
      .replace(`AND ur.date >= '${startDate.toISOString()}'`, `AND ur.date >= '${new Date(compareStartDate).toISOString()}'`)
      .replace(`AND ur.date <= '${endDate.toISOString()}'`, `AND ur.date <= '${new Date(compareEndDate).toISOString()}'`);
    comparison = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(compQuery);
  }

  const formatted = rows.map((row) => {
    const dims: Record<string, unknown> = {};
    for (const dim of dimensions) {
      dims[dim] = row[`dim_${dim}`] ?? null;
      if (dim === "user" && row["dim_user_id"]) {
        dims["userId"] = row["dim_user_id"];
      }
    }
    return {
      dimensions: dims,
      metrics: {
        cost: Number(row.cost ?? 0),
        tokens: Number(row.tokens ?? 0),
        requests: Number(row.requests ?? 0),
        inputTokens: Number(row.input_tokens ?? 0),
        outputTokens: Number(row.output_tokens ?? 0),
        cachedTokens: Number(row.cached_tokens ?? 0),
      },
    };
  });

  const compFormatted = comparison?.map((row) => {
    const dims: Record<string, unknown> = {};
    for (const dim of dimensions) {
      dims[dim] = row[`dim_${dim}`] ?? null;
    }
    return {
      dimensions: dims,
      metrics: {
        cost: Number(row.cost ?? 0),
        tokens: Number(row.tokens ?? 0),
        requests: Number(row.requests ?? 0),
      },
    };
  });

  return NextResponse.json({
    rows: formatted,
    comparison: compFormatted,
    dimensions,
    period: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
  });
}
