import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";

const userSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  department: z.string().optional(),
  team: z.string().optional(),
  job_title: z.string().optional(),
  employee_id: z.string().optional(),
  status: z.string().optional().default("active"),
});

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
