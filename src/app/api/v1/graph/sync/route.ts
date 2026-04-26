import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrgId } from "@/lib/org";
import { getAccessToken, fetchGraphUsers, type GraphUser } from "@/lib/graph/client";
import { mapGraphUser } from "@/lib/graph/mapper";
import { Prisma } from "@/generated/prisma/client";
import {
  createSyncJob,
  updateSyncProgress,
  completeSyncJob,
  failSyncJob,
} from "@/lib/sync-job";

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

/**
 * Run the actual Graph sync, writing progress to the SyncJob row on every
 * meaningful percentage step. This runs *after* the HTTP response goes out
 * — the request handler returns `{ jobId }` immediately so the UI can start
 * polling for live progress.
 *
 * IMPORTANT: this function intentionally swallows its errors and routes them
 * through `failSyncJob` so the caller (a fire-and-forget promise) doesn't
 * crash the Node process with an unhandled rejection.
 */
async function runDirectorySync(jobId: string, orgId: string) {
  try {
    const config = await prisma.graphConfig.findUnique({ where: { orgId } });
    if (!config) {
      await failSyncJob(jobId, {
        orgId,
        kind: "directory",
        error: "Graph API not configured",
      });
      return;
    }

    await updateSyncProgress(jobId, 0, 0, "Authenticating with Microsoft Graph…");

    const mappings = await prisma.fieldMapping.findMany({
      where: { orgId, entityType: "user" },
      select: { sourceField: true, targetField: true },
    });

    const token = await getAccessToken(config.tenantId, config.clientId, config.encryptedSecret);

    await updateSyncProgress(jobId, 0, 0, "Pulling users from Microsoft Graph…");
    const graphUsers = await fetchGraphUsers(token, config.graphEndpoint);

    const total = graphUsers.length;
    await updateSyncProgress(
      jobId,
      0,
      total,
      total === 0 ? "Graph returned 0 users" : `Writing ${total} users to the database…`
    );

    const existingEmails = new Set(
      (await prisma.orgUser.findMany({ where: { orgId }, select: { email: true } }))
        .map((u) => u.email.toLowerCase())
    );

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let processed = 0;

    for (const graphUser of graphUsers) {
      const user = mapGraphUser(graphUser, mappings);
      processed++;

      if (!user.email) {
        skipped++;
        await updateSyncProgress(jobId, processed, total);
        continue;
      }

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

      await updateSyncProgress(jobId, processed, total);
    }

    await prisma.graphConfig.update({
      where: { orgId },
      data: { lastSyncAt: new Date() },
    });

    const summaryParts = [`${total} user${total === 1 ? "" : "s"} pulled`];
    if (created) summaryParts.push(`${created} created`);
    if (updated) summaryParts.push(`${updated} updated`);
    if (skipped) summaryParts.push(`${skipped} skipped`);
    await completeSyncJob(jobId, {
      orgId,
      kind: "directory",
      summary: summaryParts.join(" · "),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    const m = message.toLowerCase();
    let hint = message;
    if (m.includes("password authentication") || m.includes("p1010") || m.includes("p1001")) {
      hint = "Database connection failed. Check that POSTGRES_PASSWORD in .env matches the running database.";
    } else if (m.includes("401") || m.includes("invalid_client")) {
      hint = "Microsoft Graph rejected the credentials. Verify the client secret VALUE (not the Secret ID) and that the app has User.Read.All permission with admin consent granted.";
    } else if (m.includes("403")) {
      hint = "Microsoft Graph access denied. The app registration likely needs User.Read.All Application permission with admin consent.";
    }
    await failSyncJob(jobId, { orgId, kind: "directory", error: hint });
  }
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

    // Refuse to start a second concurrent directory sync — the worker is
    // idempotent (upserts), but two concurrent runs would just double the
    // database load and fight over the same row updates.
    const inflight = await prisma.syncJob.findFirst({
      where: { orgId, kind: "directory", status: "running" },
      orderBy: { startedAt: "desc" },
    });
    if (inflight) {
      return NextResponse.json(
        { jobId: inflight.id, async: true, alreadyRunning: true },
        { status: 202 }
      );
    }

    const job = await createSyncJob(orgId, "directory", "Starting directory sync…");

    // Kick off the work in the background. We deliberately do NOT await this
    // — the standalone Next.js server (Docker) keeps the event loop alive
    // long enough for the promise to settle, and the UI polls SyncJob for
    // progress instead of waiting on the HTTP response.
    void runDirectorySync(job.id, orgId);

    return NextResponse.json(
      { jobId: job.id, async: true },
      { status: 202 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start sync";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
