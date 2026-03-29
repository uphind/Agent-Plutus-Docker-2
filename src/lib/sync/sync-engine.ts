import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { getAdapter } from "@/lib/providers";
import { Provider, Prisma } from "@/generated/prisma/client";
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

    const records = result.records;

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
