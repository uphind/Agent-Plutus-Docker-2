import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";
import { Prisma } from "@/generated/prisma/client";

// `.passthrough()` keeps every additional key the caller sent (e.g.
// extensionAttribute7, costCenter, manager_email, location.country) so
// downstream we can persist them on `OrgUser.rawAttributes` and surface
// them on the Directory tab without HR systems having to fit into our
// 7 hardcoded columns.
const userSchema = z
  .object({
    email: z.string().email(),
    name: z.string().min(1),
    department: z.string().optional(),
    team: z.string().optional(),
    job_title: z.string().optional(),
    employee_id: z.string().optional(),
    status: z.string().optional().default("active"),
  })
  .passthrough();

const KNOWN_USER_KEYS = new Set([
  "email",
  "name",
  "department",
  "team",
  "job_title",
  "employee_id",
  "status",
]);

const directorySchema = z.object({
  users: z.array(userSchema).min(1),
});

export async function POST(request: NextRequest) {
  const orgId = await getOrgId();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = directorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { users } = parsed.data;
  const incomingEmails = new Set(users.map((u) => u.email.toLowerCase()));

  // Auto-create Department and Team entities from directory data
  const deptMap = new Map<string, string>(); // name -> id
  const teamMap = new Map<string, string>(); // "dept|team" -> id

  const deptNames = new Set(users.map((u) => u.department).filter(Boolean) as string[]);
  for (const deptName of deptNames) {
    const dept = await prisma.department.upsert({
      where: { orgId_name: { orgId: orgId, name: deptName } },
      create: { orgId: orgId, name: deptName },
      update: {},
    });
    deptMap.set(deptName, dept.id);
  }

  const teamEntries = users
    .filter((u) => u.department && u.team)
    .map((u) => ({ dept: u.department!, team: u.team! }));
  const uniqueTeams = new Map<string, { dept: string; team: string }>();
  for (const entry of teamEntries) {
    uniqueTeams.set(`${entry.dept}|${entry.team}`, entry);
  }
  for (const [key, { dept, team }] of uniqueTeams) {
    const deptId = deptMap.get(dept);
    if (!deptId) continue;
    const t = await prisma.team.upsert({
      where: { orgId_departmentId_name: { orgId: orgId, departmentId: deptId, name: team } },
      create: { orgId: orgId, departmentId: deptId, name: team },
      update: {},
    });
    teamMap.set(key, t.id);
  }

  const results = { upserted: 0, deactivated: 0 };

  for (const user of users) {
    const departmentId = user.department ? deptMap.get(user.department) ?? null : null;
    const teamKey = user.department && user.team ? `${user.department}|${user.team}` : null;
    const teamId = teamKey ? teamMap.get(teamKey) ?? null : null;

    // Capture every extra field the caller sent (e.g. costCenter, location,
    // extensionAttribute*) so the Directory tab can render them. We tag the
    // payload with `_source` so admins can tell pushed-via-API entries apart
    // from Graph-synced ones. Cast through JSON to satisfy Prisma's strict
    // InputJsonValue shape — same pattern used by the sync-engine for
    // UsageRecord.metadata.
    const extras: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(user)) {
      if (KNOWN_USER_KEYS.has(key)) continue;
      extras[key] = value;
    }
    const rawAttributes: Prisma.InputJsonValue | undefined =
      Object.keys(extras).length > 0
        ? (JSON.parse(JSON.stringify({ ...extras, _source: "directory_api" })) as Prisma.InputJsonValue)
        : undefined;

    await prisma.orgUser.upsert({
      where: { orgId_email: { orgId: orgId, email: user.email.toLowerCase() } },
      create: {
        orgId: orgId,
        email: user.email.toLowerCase(),
        name: user.name,
        department: user.department ?? null,
        team: user.team ?? null,
        departmentId,
        teamId,
        jobTitle: user.job_title ?? null,
        employeeId: user.employee_id ?? null,
        status: user.status ?? "active",
        rawAttributes,
      },
      update: {
        name: user.name,
        department: user.department ?? null,
        team: user.team ?? null,
        departmentId,
        teamId,
        jobTitle: user.job_title ?? null,
        employeeId: user.employee_id ?? null,
        status: user.status ?? "active",
        ...(rawAttributes ? { rawAttributes } : {}),
      },
    });
    results.upserted++;
  }

  const existingUsers = await prisma.orgUser.findMany({
    where: { orgId: orgId, status: "active" },
    select: { id: true, email: true },
  });

  for (const existing of existingUsers) {
    if (!incomingEmails.has(existing.email)) {
      await prisma.orgUser.update({
        where: { id: existing.id },
        data: { status: "inactive" },
      });
      results.deactivated++;
    }
  }

  return NextResponse.json({
    success: true,
    ...results,
    departments_created: deptMap.size,
    teams_created: teamMap.size,
    total_users: users.length,
  });
}
