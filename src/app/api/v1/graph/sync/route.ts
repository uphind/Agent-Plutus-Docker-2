import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";
import { getAccessToken, fetchGraphUsers } from "@/lib/graph/client";
import { mapGraphUsers } from "@/lib/graph/mapper";

export async function POST() {
  const orgId = await getOrgId();

  const config = await prisma.graphConfig.findUnique({ where: { orgId } });
  if (!config) {
    return NextResponse.json(
      { error: "Graph API not configured" },
      { status: 404 }
    );
  }

  const mappings = await prisma.fieldMapping.findMany({
    where: { orgId, entityType: "user" },
    select: { sourceField: true, targetField: true },
  });

  try {
    const token = await getAccessToken(config.tenantId, config.clientId, config.encryptedSecret);
    const graphUsers = await fetchGraphUsers(token, config.graphEndpoint);
    const directoryUsers = mapGraphUsers(graphUsers, mappings);

    const existingEmails = new Set(
      (await prisma.orgUser.findMany({ where: { orgId }, select: { email: true } }))
        .map((u) => u.email.toLowerCase())
    );

    let created = 0;
    let updated = 0;

    for (const user of directoryUsers) {
      const deptRecord = user.department
        ? await prisma.department.upsert({
            where: { orgId_name: { orgId, name: user.department } },
            update: {},
            create: { orgId, name: user.department },
          })
        : null;

      const teamRecord =
        user.team && deptRecord
          ? await prisma.team.upsert({
              where: { orgId_departmentId_name: { orgId, departmentId: deptRecord.id, name: user.team } },
              update: {},
              create: { orgId, departmentId: deptRecord.id, name: user.team },
            })
          : null;

      if (existingEmails.has(user.email.toLowerCase())) {
        await prisma.orgUser.update({
          where: { orgId_email: { orgId, email: user.email } },
          data: {
            name: user.name,
            department: user.department,
            team: user.team,
            departmentId: deptRecord?.id ?? undefined,
            teamId: teamRecord?.id ?? undefined,
            jobTitle: user.job_title,
            employeeId: user.employee_id,
            status: user.status || "active",
          },
        });
        updated++;
      } else {
        await prisma.orgUser.create({
          data: {
            orgId,
            email: user.email,
            name: user.name,
            department: user.department,
            team: user.team,
            departmentId: deptRecord?.id,
            teamId: teamRecord?.id,
            jobTitle: user.job_title,
            employeeId: user.employee_id,
            status: user.status || "active",
          },
        });
        created++;
      }
    }

    await prisma.graphConfig.update({
      where: { orgId },
      data: { lastSyncAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      total: directoryUsers.length,
      created,
      updated,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
