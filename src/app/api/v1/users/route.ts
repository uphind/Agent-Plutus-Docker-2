import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

export async function GET(request: NextRequest) {
  const orgId = await getOrgId();

  const { searchParams } = new URL(request.url);
  const department = searchParams.get("department");
  const team = searchParams.get("team");
  const status = searchParams.get("status") ?? "active";
  const search = searchParams.get("search");

  const where: Record<string, unknown> = { orgId: orgId };
  if (department) where.department = department;
  if (team) where.team = team;
  if (status !== "all") where.status = status;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }

  const users = await prisma.orgUser.findMany({
    where,
    orderBy: { name: "asc" },
  });

  const departments = await prisma.orgUser.groupBy({
    by: ["department"],
    where: { orgId: orgId, status: "active" },
    _count: true,
  });

  const teams = await prisma.orgUser.groupBy({
    by: ["team"],
    where: { orgId: orgId, status: "active" },
    _count: true,
  });

  return NextResponse.json({
    users,
    filters: {
      departments: departments
        .filter((d: { department: string | null }) => d.department)
        .map((d: { department: string | null; _count: number }) => ({ name: d.department, count: d._count })),
      teams: teams
        .filter((t: { team: string | null }) => t.team)
        .map((t: { team: string | null; _count: number }) => ({ name: t.team, count: t._count })),
    },
  });
}
