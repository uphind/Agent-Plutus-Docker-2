import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";
import { getAccessToken, fetchGraphUsers, type GraphUser } from "@/lib/graph/client";
import { mapGraphUser } from "@/lib/graph/mapper";
import { Prisma } from "@/generated/prisma/client";

/**
 * Strip Graph's `@odata.*` keys from the user object and cast to Prisma's
 * `InputJsonValue` shape so the JSONB column accepts it. The JSON.stringify
 * round-trip is the same pattern the sync-engine uses for `UsageRecord.metadata`
 * — Prisma's input type is stricter than `Record<string, unknown>` and
 * requires a structural narrowing.
 */
function sanitizeRawAttributes(user: GraphUser): Prisma.InputJsonValue {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(user)) {
    if (key.startsWith("@odata")) continue;
    out[key] = value;
  }
  return JSON.parse(JSON.stringify(out)) as Prisma.InputJsonValue;
}

export async function POST() {
  try {
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

    const token = await getAccessToken(config.tenantId, config.clientId, config.encryptedSecret);
    const graphUsers = await fetchGraphUsers(token, config.graphEndpoint);

    const existingEmails = new Set(
      (await prisma.orgUser.findMany({ where: { orgId }, select: { email: true } }))
        .map((u) => u.email.toLowerCase())
    );

    let created = 0;
    let updated = 0;

    // We iterate the original Graph users (not just the post-mapping shape)
    // so we can persist the raw object alongside the mapped relational
    // columns — admins need to see every attribute on the Directory tab
    // even when it doesn't correspond to a mapped target field.
    for (const graphUser of graphUsers) {
      const user = mapGraphUser(graphUser, mappings);
      if (!user.email) continue;

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

      const rawAttributes = sanitizeRawAttributes(graphUser);

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
            rawAttributes,
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
            rawAttributes,
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
      total: graphUsers.length,
      created,
      updated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    const m = message.toLowerCase();
    let hint: string | undefined;
    if (m.includes("password authentication") || m.includes("p1010") || m.includes("p1001")) {
      hint = "Database connection failed. Check that POSTGRES_PASSWORD in .env matches the running database.";
    } else if (m.includes("401") || m.includes("invalid_client")) {
      hint = "Microsoft Graph rejected the credentials. Verify the client secret VALUE (not the Secret ID) and that the app has User.Read.All permission with admin consent granted.";
    } else if (m.includes("403")) {
      hint = "Microsoft Graph access denied. The app registration likely needs User.Read.All Application permission with admin consent.";
    }
    return NextResponse.json({ error: message, hint }, { status: 500 });
  }
}
