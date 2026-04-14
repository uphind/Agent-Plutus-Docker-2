import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { getAdapter } from "@/lib/providers";
import { getAccessToken, fetchGraphUsers } from "@/lib/graph/client";
import { mapGraphUsers } from "@/lib/graph/mapper";
import { Provider, Prisma } from "@/generated/prisma/client";
import type { NormalizedUsageRecord } from "@/lib/providers/types";

interface FieldMappingRule {
  sourceField: string;
  targetField: string;
}

/**
 * Load provider field mappings saved by the user.
 * Returns null when nothing is stored (= use adapter defaults as-is).
 */
async function loadProviderMappings(
  orgId: string,
  provider: Provider
): Promise<FieldMappingRule[] | null> {
  const stored = await prisma.fieldMapping.findMany({
    where: { orgId, entityType: `provider:${provider}` },
    select: { sourceField: true, targetField: true },
  });
  return stored.length > 0 ? stored : null;
}

const STRING_FIELDS = new Set(["userRef", "model", "apiKeyId"]);
const NUMBER_FIELDS = new Set([
  "inputTokens", "outputTokens", "cachedTokens", "requestsCount",
  "costUsd", "inputAudioTokens", "outputAudioTokens",
  "linesAccepted", "linesSuggested", "acceptRate",
]);

function coerceValue(targetField: string, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (STRING_FIELDS.has(targetField)) return String(value);
  if (NUMBER_FIELDS.has(targetField)) return Number(value) || 0;
  if (targetField === "isBatch") return Boolean(value);
  if (targetField === "date") {
    if (value instanceof Date) return value;
    return new Date(typeof value === "number" ? value * 1000 : String(value));
  }
  return value;
}

/**
 * Apply user-defined field mappings to records produced by an adapter.
 * Each adapter stashes raw source values in `metadata._raw`.
 * When the user has saved custom mappings, this function reads from `_raw`
 * and writes the coerced values onto the NormalizedUsageRecord fields.
 * When no custom mappings exist (null), adapter output is used as-is.
 */
export function applyFieldMappings(
  records: NormalizedUsageRecord[],
  mappings: FieldMappingRule[] | null
): NormalizedUsageRecord[] {
  if (!mappings) return records;

  return records.map((record) => {
    const raw = (record.metadata as Record<string, unknown> | undefined)?._raw as
      | Record<string, unknown>
      | undefined;
    if (!raw) return record;

    const remapped = { ...record };
    for (const { sourceField, targetField } of mappings) {
      const value = raw[sourceField];
      if (value !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (remapped as any)[targetField] = coerceValue(targetField, value);
      }
    }
    return remapped;
  });
}
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === maxRetries) break;

      const isRateLimit =
        lastError.message.includes("429") ||
        lastError.message.includes("rate limit");

      const baseDelay = isRateLimit ? 5000 : 1000;
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

export async function syncProvider(orgId: string, provider: Provider) {
  const credential = await prisma.providerCredential.findUnique({
    where: { orgId_provider: { orgId, provider } },
  });

  if (!credential || !credential.isActive) {
    throw new Error(`No active credential for ${provider}`);
  }

  const syncLog = await prisma.syncLog.create({
    data: { orgId, provider, status: "running" },
  });

  try {
    const apiKey = decrypt(credential.encryptedApiKey);
    const adapter = getAdapter(provider);

    const endDate = new Date();
    const startDate = new Date();
    if (credential.lastSyncAt) {
      startDate.setTime(credential.lastSyncAt.getTime() - 86400000);
    } else {
      startDate.setDate(startDate.getDate() - 7);
    }

    const result = await withRetry(() =>
      adapter.fetchUsage(apiKey, startDate, endDate)
    );

    const fieldMappings = await loadProviderMappings(orgId, provider);
    const records = applyFieldMappings(result.records, fieldMappings);

    const orgUsers = await prisma.orgUser.findMany({
      where: { orgId },
      select: { id: true, email: true, employeeId: true },
    });

    const emailIndex = new Map<string, string>(
      orgUsers.map((u) => [u.email, u.id])
    );
    const empIdIndex = new Map<string, string>(
      orgUsers
        .filter(
          (u): u is typeof u & { employeeId: string } => !!u.employeeId
        )
        .map((u) => [u.employeeId, u.id])
    );

    const BATCH_SIZE = 50;
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      for (const record of batch) {
        let resolvedUserId: string | null = null;
        if (record.userRef) {
          resolvedUserId =
            emailIndex.get(record.userRef) ??
            empIdIndex.get(record.userRef) ??
            null;
        }

        const base = {
          provider: record.provider,
          model: record.model,
          date: record.date,
          inputTokens: record.inputTokens,
          outputTokens: record.outputTokens,
          cachedTokens: record.cachedTokens,
          requestsCount: record.requestsCount,
          costUsd: record.costUsd,
          apiKeyId: record.apiKeyId ?? null,
          inputAudioTokens: record.inputAudioTokens ?? 0,
          outputAudioTokens: record.outputAudioTokens ?? 0,
          isBatch: record.isBatch ?? false,
          linesAccepted: record.linesAccepted ?? null,
          linesSuggested: record.linesSuggested ?? null,
          acceptRate: record.acceptRate ?? null,
          metadata: record.metadata
            ? (JSON.parse(JSON.stringify(record.metadata)) as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          userRef: record.userRef ?? null,
        };

        // Upsert only works when all unique fields are non-null
        if (resolvedUserId && record.model) {
          await prisma.usageRecord.upsert({
            where: {
              usage_dedup: {
                orgId,
                userId: resolvedUserId,
                provider: record.provider,
                model: record.model,
                date: record.date,
              },
            },
            create: { orgId, userId: resolvedUserId, ...base },
            update: {
              inputTokens: record.inputTokens,
              outputTokens: record.outputTokens,
              cachedTokens: record.cachedTokens,
              requestsCount: record.requestsCount,
              costUsd: record.costUsd,
              apiKeyId: record.apiKeyId ?? null,
              inputAudioTokens: record.inputAudioTokens ?? 0,
              outputAudioTokens: record.outputAudioTokens ?? 0,
              isBatch: record.isBatch ?? false,
              linesAccepted: record.linesAccepted ?? null,
              linesSuggested: record.linesSuggested ?? null,
              acceptRate: record.acceptRate ?? null,
              userRef: record.userRef ?? null,
              metadata: record.metadata
                ? (JSON.parse(JSON.stringify(record.metadata)) as Prisma.InputJsonValue)
                : undefined,
            },
          });
        } else {
          await prisma.usageRecord.create({
            data: { orgId, userId: resolvedUserId, ...base },
          });
        }
      }
    }

    if (result.cursorDau?.length) {
      for (const dau of result.cursorDau) {
        await prisma.cursorDau.upsert({
          where: { orgId_date: { orgId, date: dau.date } },
          create: { orgId, date: dau.date, dauCount: dau.dauCount },
          update: { dauCount: dau.dauCount },
        });
      }
    }

    await prisma.providerCredential.update({
      where: { id: credential.id },
      data: { lastSyncAt: new Date() },
    });

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: "success",
        finishedAt: new Date(),
        message: `Synced ${records.length} records`,
      },
    });

    return { success: true, recordsCount: records.length };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: { status: "error", finishedAt: new Date(), message },
    });
    throw error;
  }
}

export async function syncAllProviders(orgId: string) {
  const credentials = await prisma.providerCredential.findMany({
    where: { orgId, isActive: true },
  });

  const settled = await Promise.allSettled(
    credentials.map((cred) => syncProvider(orgId, cred.provider))
  );

  const results: Record<
    string,
    { success: boolean; records?: number; error?: string }
  > = {};

  credentials.forEach((cred, i) => {
    const outcome = settled[i];
    if (outcome.status === "fulfilled") {
      results[cred.provider] = {
        success: true,
        records: outcome.value.recordsCount,
      };
    } else {
      results[cred.provider] = {
        success: false,
        error:
          outcome.reason instanceof Error
            ? outcome.reason.message
            : "Unknown error",
      };
    }
  });

  return results;
}

export async function relinkOrphanedRecords(orgId: string) {
  const orgUsers = await prisma.orgUser.findMany({
    where: { orgId },
    select: { id: true, email: true, employeeId: true },
  });

  const emailIndex = new Map<string, string>(
    orgUsers.map((u) => [u.email, u.id])
  );
  const empIdIndex = new Map<string, string>(
    orgUsers
      .filter((u): u is typeof u & { employeeId: string } => !!u.employeeId)
      .map((u) => [u.employeeId, u.id])
  );

  const orphaned = await prisma.usageRecord.findMany({
    where: { orgId, userId: null, userRef: { not: null } },
  });

  let relinked = 0;
  let merged = 0;
  let unresolved = 0;

  for (const record of orphaned) {
    const resolvedUserId =
      emailIndex.get(record.userRef!) ??
      empIdIndex.get(record.userRef!) ??
      null;

    if (!resolvedUserId) {
      unresolved++;
      continue;
    }

    if (record.model) {
      const existing = await prisma.usageRecord.findUnique({
        where: {
          usage_dedup: {
            orgId,
            userId: resolvedUserId,
            provider: record.provider,
            model: record.model,
            date: record.date,
          },
        },
      });
      if (existing) {
        await prisma.usageRecord.update({
          where: { id: existing.id },
          data: {
            inputTokens: existing.inputTokens + record.inputTokens,
            outputTokens: existing.outputTokens + record.outputTokens,
            cachedTokens: existing.cachedTokens + record.cachedTokens,
            requestsCount: existing.requestsCount + record.requestsCount,
            costUsd: existing.costUsd.add(record.costUsd),
            inputAudioTokens: existing.inputAudioTokens + record.inputAudioTokens,
            outputAudioTokens: existing.outputAudioTokens + record.outputAudioTokens,
          },
        });
        await prisma.usageRecord.delete({ where: { id: record.id } });
        merged++;
      } else {
        await prisma.usageRecord.update({
          where: { id: record.id },
          data: { userId: resolvedUserId },
        });
        relinked++;
      }
    } else {
      await prisma.usageRecord.update({
        where: { id: record.id },
        data: { userId: resolvedUserId },
      });
      relinked++;
    }
  }

  await prisma.organization.update({
    where: { id: orgId },
    data: { lastRelinkAt: new Date() },
  });

  return { total: orphaned.length, relinked, merged, unresolved };
}

export async function syncDirectory(orgId: string) {
  const config = await prisma.graphConfig.findUnique({ where: { orgId } });
  if (!config) return null;

  const mappings = await prisma.fieldMapping.findMany({
    where: { orgId, entityType: "user" },
    select: { sourceField: true, targetField: true },
  });

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

  return { total: directoryUsers.length, created, updated };
}
