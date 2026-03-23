export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startSyncScheduler } = await import("@/lib/sync/scheduler");
    await startSyncScheduler();
  }
}
