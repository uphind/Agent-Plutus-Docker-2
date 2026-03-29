import "dotenv/config";
import { PrismaClient, Provider, NotificationType } from "../src/generated/prisma/client";
import { encrypt } from "../src/lib/encryption";

const prisma = new PrismaClient();

function rand(min: number, max: number) { return Math.random() * (max - min) + min; }
function randInt(min: number, max: number) { return Math.floor(rand(min, max + 1)); }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function daysBefore(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

interface ModelDef {
  provider: Provider;
  model: string;
  inputCostPer1k: number;
  outputCostPer1k: number;
  weight: number;
}

const MODELS: ModelDef[] = [
  { provider: "anthropic", model: "claude-sonnet-4-20250514",  inputCostPer1k: 0.003,  outputCostPer1k: 0.015,  weight: 40 },
  { provider: "anthropic", model: "claude-3.5-haiku-20241022", inputCostPer1k: 0.001,  outputCostPer1k: 0.005,  weight: 25 },
  { provider: "anthropic", model: "claude-opus-4-20250514",    inputCostPer1k: 0.015,  outputCostPer1k: 0.075,  weight: 8 },
  { provider: "openai", model: "gpt-4o",                      inputCostPer1k: 0.005,  outputCostPer1k: 0.015,  weight: 35 },
  { provider: "openai", model: "gpt-4o-mini",                 inputCostPer1k: 0.00015,outputCostPer1k: 0.0006, weight: 30 },
  { provider: "openai", model: "o3-mini",                     inputCostPer1k: 0.0011, outputCostPer1k: 0.0044, weight: 12 },
  { provider: "openai", model: "gpt-4.1",                     inputCostPer1k: 0.002,  outputCostPer1k: 0.008,  weight: 15 },
  { provider: "gemini", model: "gemini-2.5-pro",              inputCostPer1k: 0.00125,outputCostPer1k: 0.01,   weight: 18 },
  { provider: "gemini", model: "gemini-2.5-flash",            inputCostPer1k: 0.00015,outputCostPer1k: 0.0006, weight: 22 },
  { provider: "gemini", model: "gemini-2.0-flash",            inputCostPer1k: 0.0001, outputCostPer1k: 0.0004, weight: 10 },
  { provider: "cursor", model: "cursor-fast",                 inputCostPer1k: 0.0005, outputCostPer1k: 0.0015, weight: 20 },
  { provider: "cursor", model: "cursor-slow",                 inputCostPer1k: 0.01,   outputCostPer1k: 0.03,   weight: 6 },
];

const OPENAI_API_KEYS = ["sk-proj-abc123", "sk-proj-def456", "sk-proj-ghi789"];

function pickWeightedModel(): ModelDef {
  const totalWeight = MODELS.reduce((s, m) => s + m.weight, 0);
  let r = Math.random() * totalWeight;
  for (const m of MODELS) { r -= m.weight; if (r <= 0) return m; }
  return MODELS[0];
}

type ActivityLevel = "heavy" | "moderate" | "light";

const DEMO_USERS: Array<{
  name: string; dept: string; team: string; title: string;
  activity: ActivityLevel; preferredProviders: Provider[];
  userBudget?: number;
}> = [
  { name: "Alice Chen",    dept: "Engineering", team: "Platform",    title: "Staff Engineer",    activity: "heavy",    preferredProviders: ["anthropic", "openai", "cursor"], userBudget: 500 },
  { name: "Bob Martinez",  dept: "Engineering", team: "Platform",    title: "Senior Engineer",   activity: "heavy",    preferredProviders: ["anthropic", "cursor"] },
  { name: "Carol Wu",      dept: "Engineering", team: "Frontend",    title: "Senior Engineer",   activity: "moderate", preferredProviders: ["openai", "cursor", "gemini"] },
  { name: "David Kim",     dept: "Engineering", team: "Frontend",    title: "Engineer",          activity: "moderate", preferredProviders: ["openai", "cursor"], userBudget: 200 },
  { name: "Eva Singh",     dept: "Engineering", team: "Backend",     title: "Senior Engineer",   activity: "heavy",    preferredProviders: ["anthropic", "openai"] },
  { name: "Frank Lopez",   dept: "Product",     team: "Growth",      title: "Product Manager",   activity: "moderate", preferredProviders: ["openai", "gemini"] },
  { name: "Grace Patel",   dept: "Product",     team: "Growth",      title: "Associate PM",      activity: "light",    preferredProviders: ["openai", "gemini"] },
  { name: "Henry Zhao",    dept: "Product",     team: "Enterprise",  title: "Senior PM",         activity: "moderate", preferredProviders: ["anthropic", "openai"] },
  { name: "Irene Costa",   dept: "Design",      team: "UX Research", title: "Lead Designer",     activity: "moderate", preferredProviders: ["openai", "gemini"] },
  { name: "James Okafor",  dept: "Design",      team: "UX Research", title: "UX Researcher",     activity: "light",    preferredProviders: ["openai"] },
  { name: "Karen Müller",  dept: "Design",      team: "Visual",      title: "Senior Designer",   activity: "light",    preferredProviders: ["openai", "gemini"] },
  { name: "Liam Brooks",   dept: "Marketing",   team: "Content",     title: "Content Lead",      activity: "moderate", preferredProviders: ["openai", "anthropic"] },
  { name: "Mia Thompson",  dept: "Marketing",   team: "Content",     title: "Content Writer",    activity: "moderate", preferredProviders: ["openai", "gemini"] },
  { name: "Noah Davis",    dept: "Sales",       team: "Enterprise",  title: "Account Executive", activity: "light",    preferredProviders: ["openai"] },
  { name: "Olivia Wang",   dept: "Sales",       team: "Enterprise",  title: "Sales Engineer",    activity: "moderate", preferredProviders: ["openai", "anthropic", "cursor"] },
];

const ACTIVITY_RANGES: Record<ActivityLevel, { sessionsPerDay: [number, number]; tokensPerSession: [number, number] }> = {
  heavy:    { sessionsPerDay: [60, 120], tokensPerSession: [6000, 30000] },
  moderate: { sessionsPerDay: [25, 60],  tokensPerSession: [3000, 18000] },
  light:    { sessionsPerDay: [10, 30],  tokensPerSession: [1500, 10000] },
};

async function main() {
  const existing = await prisma.organization.findUnique({ where: { slug: "demo-org" } });

  let orgId: string;
  if (existing) {
    orgId = existing.id;
    console.log("Organization exists:", existing.name, orgId);
  } else {
    const org = await prisma.organization.create({ data: { name: "Demo Organization", slug: "demo-org" } });
    orgId = org.id;
    console.log("Organization created:", org.name, orgId);
  }

  /* ─── Departments ─── */
  const deptBudgets: Record<string, number> = {
    Engineering: 5000, Product: 2000, Design: 1500, Marketing: 200, Sales: 150,
  };
  const deptMap = new Map<string, string>();
  for (const [name, budget] of Object.entries(deptBudgets)) {
    const dept = await prisma.department.upsert({
      where: { orgId_name: { orgId, name } },
      create: { orgId, name, monthlyBudget: budget, alertThreshold: 80 },
      update: { monthlyBudget: budget },
    });
    deptMap.set(name, dept.id);
  }
  console.log(`✓ ${deptMap.size} departments`);

  /* ─── Teams ─── */
  const teamDefs = [
    { dept: "Engineering", name: "Platform",    budget: 2000 },
    { dept: "Engineering", name: "Frontend",    budget: 1500 },
    { dept: "Engineering", name: "Backend",     budget: 1500 },
    { dept: "Product",     name: "Growth",      budget: 1000 },
    { dept: "Product",     name: "Enterprise",  budget: 1000 },
    { dept: "Design",      name: "UX Research", budget: 800 },
    { dept: "Design",      name: "Visual",      budget: 700 },
    { dept: "Marketing",   name: "Content",     budget: 120 },
    { dept: "Sales",       name: "Enterprise",  budget: 100 },
  ];
  const teamMap = new Map<string, string>();
  for (const td of teamDefs) {
    const deptId = deptMap.get(td.dept)!;
    const team = await prisma.team.upsert({
      where: { orgId_departmentId_name: { orgId, departmentId: deptId, name: td.name } },
      create: { orgId, departmentId: deptId, name: td.name, monthlyBudget: td.budget, alertThreshold: 80 },
      update: { monthlyBudget: td.budget },
    });
    teamMap.set(`${td.dept}|${td.name}`, team.id);
  }
  console.log(`✓ ${teamMap.size} teams`);

  /* ─── Users ─── */
  const userIds: string[] = [];
  for (let i = 0; i < DEMO_USERS.length; i++) {
    const u = DEMO_USERS[i];
    const email = `${u.name.toLowerCase().replace(/\s+/g, ".").replace(/[^a-z.]/g, "")}@demo-org.com`;
    const departmentId = deptMap.get(u.dept) ?? null;
    const teamId = teamMap.get(`${u.dept}|${u.team}`) ?? null;

    const user = await prisma.orgUser.upsert({
      where: { orgId_email: { orgId, email } },
      update: {
        name: u.name, department: u.dept, team: u.team, departmentId, teamId,
        jobTitle: u.title, status: "active",
        monthlyBudget: u.userBudget ?? null,
        alertThreshold: u.userBudget ? 80 : 80,
      },
      create: {
        orgId, email, name: u.name, department: u.dept, team: u.team,
        departmentId, teamId, jobTitle: u.title,
        employeeId: `EMP-${String(i + 1).padStart(3, "0")}`, status: "active",
        monthlyBudget: u.userBudget ?? null,
        alertThreshold: u.userBudget ? 80 : 80,
      },
    });
    userIds.push(user.id);
  }
  console.log(`✓ ${userIds.length} users (${DEMO_USERS.filter(u => u.userBudget).length} with budgets)`);

  /* ─── Provider credentials ─── */
  const providers: Array<{ provider: Provider; label: string }> = [
    { provider: "anthropic", label: "Anthropic Enterprise" },
    { provider: "openai",    label: "OpenAI Enterprise" },
    { provider: "gemini",    label: "Google AI" },
    { provider: "cursor",    label: "Cursor Business" },
  ];
  for (const p of providers) {
    await prisma.providerCredential.upsert({
      where: { orgId_provider: { orgId, provider: p.provider } },
      create: { orgId, provider: p.provider, encryptedApiKey: encrypt(`demo-key-${p.provider}-${Date.now()}`), label: p.label, isActive: true, lastSyncAt: new Date() },
      update: { label: p.label, isActive: true, lastSyncAt: new Date() },
    });
  }
  console.log(`✓ ${providers.length} provider credentials`);

  /* ─── Clear old data ─── */
  await prisma.usageRecord.deleteMany({ where: { orgId } });
  await prisma.cursorDau.deleteMany({ where: { orgId } });
  await prisma.notification.deleteMany({ where: { orgId } });

  /* ─── Generate 30 days of usage records ─── */
  const DAYS = 30;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const records: any[] = [];

  for (let dayOffset = DAYS - 1; dayOffset >= 0; dayOffset--) {
    const date = daysBefore(dayOffset);
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const weekendMultiplier = isWeekend ? 0.2 : 1.0;
    const adoptionMultiplier = 0.4 + 0.6 * ((DAYS - dayOffset) / DAYS);

    for (let u = 0; u < DEMO_USERS.length; u++) {
      const userDef = DEMO_USERS[u];
      const userId = userIds[u];
      const profile = ACTIVITY_RANGES[userDef.activity];
      const sessions = Math.round(randInt(...profile.sessionsPerDay) * weekendMultiplier * adoptionMultiplier);
      if (sessions === 0) continue;

      const modelBuckets = new Map<string, {
        md: ModelDef; input: number; output: number; cached: number; reqs: number; cost: number;
        linesAcc: number; linesSug: number; isBatch: boolean; audioIn: number; audioOut: number;
        apiKeyId: string | null; metadata: Record<string, unknown> | null;
      }>();

      for (let s = 0; s < sessions; s++) {
        let md: ModelDef;
        if (Math.random() < 0.8) {
          const filtered = MODELS.filter(m => userDef.preferredProviders.includes(m.provider));
          const pool = filtered.length > 0 ? filtered : MODELS;
          const tw = pool.reduce((s, m) => s + m.weight, 0);
          let r = Math.random() * tw;
          md = pool[0];
          for (const m of pool) { r -= m.weight; if (r <= 0) { md = m; break; } }
        } else {
          md = pickWeightedModel();
        }

        const inputTok = randInt(...profile.tokensPerSession);
        const outputTok = Math.round(inputTok * rand(0.3, 1.2));
        const cachedTok = Math.random() < 0.3 ? Math.round(inputTok * rand(0.1, 0.5)) : 0;
        const cost = (inputTok / 1000) * md.inputCostPer1k + (outputTok / 1000) * md.outputCostPer1k;

        const isCursor = md.provider === "cursor";
        const linesSug = isCursor ? randInt(5, 80) : 0;
        const linesAcc = isCursor ? Math.round(linesSug * rand(0.4, 0.9)) : 0;

        // OpenAI enrichment
        const isOpenAI = md.provider === "openai";
        const isBatch = isOpenAI && Math.random() < 0.15;
        const audioIn = isOpenAI && Math.random() < 0.05 ? randInt(100, 2000) : 0;
        const audioOut = audioIn > 0 ? randInt(50, 1000) : 0;
        const apiKeyId = isOpenAI ? pick(OPENAI_API_KEYS) : null;

        // Cursor metadata enrichment
        let metadata: Record<string, unknown> | null = null;
        if (isCursor) {
          metadata = {
            composer_requests: randInt(2, 15),
            chat_requests: randInt(5, 30),
            agent_requests: randInt(0, 8),
            tab_requests: randInt(10, 100),
            fast_premium_requests: randInt(0, 5),
          };
        }

        const key = `${md.provider}|${md.model}`;
        const existing = modelBuckets.get(key);
        if (existing) {
          existing.input += inputTok;
          existing.output += outputTok;
          existing.cached += cachedTok;
          existing.reqs += 1;
          existing.cost += cost;
          existing.linesAcc += linesAcc;
          existing.linesSug += linesSug;
          existing.audioIn += audioIn;
          existing.audioOut += audioOut;
          if (!existing.isBatch && isBatch) existing.isBatch = true;
          if (metadata && existing.metadata) {
            for (const [k, v] of Object.entries(metadata)) {
              (existing.metadata as Record<string, number>)[k] = ((existing.metadata as Record<string, number>)[k] ?? 0) + (v as number);
            }
          }
        } else {
          modelBuckets.set(key, {
            md, input: inputTok, output: outputTok, cached: cachedTok, reqs: 1, cost,
            linesAcc, linesSug, isBatch, audioIn, audioOut, apiKeyId, metadata,
          });
        }
      }

      for (const b of modelBuckets.values()) {
        records.push({
          orgId, userId, provider: b.md.provider, model: b.md.model, date,
          inputTokens: b.input, outputTokens: b.output, cachedTokens: b.cached,
          requestsCount: b.reqs,
          costUsd: Math.round(b.cost * 1000000) / 1000000,
          apiKeyId: b.apiKeyId,
          inputAudioTokens: b.audioIn,
          outputAudioTokens: b.audioOut,
          isBatch: b.isBatch,
          linesAccepted: b.md.provider === "cursor" ? b.linesAcc : null,
          linesSuggested: b.md.provider === "cursor" ? b.linesSug : null,
          acceptRate: b.md.provider === "cursor" && b.linesSug > 0
            ? Math.round((b.linesAcc / b.linesSug) * 10000) / 10000
            : null,
          metadata: b.metadata,
        });
      }
    }
  }

  const BATCH_SIZE = 500;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    await prisma.usageRecord.createMany({ data: records.slice(i, i + BATCH_SIZE) });
  }
  console.log(`✓ ${records.length} usage records across ${DAYS} days`);

  /* ─── Cursor DAU ─── */
  const dauRecords = [];
  for (let d = DAYS - 1; d >= 0; d--) {
    const date = daysBefore(d);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    dauRecords.push({
      orgId,
      date,
      dauCount: isWeekend ? randInt(2, 5) : randInt(6, 13),
    });
  }
  await prisma.cursorDau.createMany({ data: dauRecords });
  console.log(`✓ ${dauRecords.length} Cursor DAU records`);

  /* ─── Sync logs ─── */
  await prisma.syncLog.deleteMany({ where: { orgId } });
  const syncLogs: Array<{
    orgId: string; provider: Provider; status: string; message: string;
    startedAt: Date; finishedAt: Date;
  }> = [];
  for (const p of providers) {
    for (let i = 0; i < 8; i++) {
      const startedAt = new Date(Date.now() - randInt(1, 7) * 86400000 - randInt(0, 86400000));
      const duration = randInt(3, 25) * 1000;
      syncLogs.push({
        orgId, provider: p.provider, status: "success",
        message: `Synced ${randInt(50, 500)} records from ${p.label}`,
        startedAt, finishedAt: new Date(startedAt.getTime() + duration),
      });
    }
  }
  const failStart = new Date(Date.now() - 3600000);
  syncLogs.push({
    orgId, provider: "gemini", status: "error",
    message: "Rate limit exceeded — retrying in 60s",
    startedAt: failStart, finishedAt: new Date(failStart.getTime() + 2000),
  });
  await prisma.syncLog.createMany({ data: syncLogs });
  console.log(`✓ ${syncLogs.length} sync logs`);

  /* ─── Notifications ─── */
  const notifications = [
    {
      orgId, type: NotificationType.budget_alert, severity: "warning",
      title: "Engineering approaching budget",
      message: "Engineering department has used 82% of its $5,000 monthly budget.",
      entityType: "department", entityId: deptMap.get("Engineering")!,
    },
    {
      orgId, type: NotificationType.budget_alert, severity: "critical",
      title: "Marketing exceeded budget",
      message: "Marketing department has exceeded its $1,000 monthly budget by $87.",
      entityType: "department", entityId: deptMap.get("Marketing")!,
    },
    {
      orgId, type: NotificationType.anomaly, severity: "warning",
      title: "Unusual spend by Alice Chen",
      message: "$42.50 yesterday vs $18.20 daily average (2.3x above normal).",
      entityType: "user", entityId: userIds[0],
    },
    {
      orgId, type: NotificationType.idle_seat, severity: "info",
      title: "2 idle seats detected",
      message: "Noah Davis, James Okafor have had no AI usage in the last 30 days.",
      entityType: "user",
    },
    {
      orgId, type: NotificationType.sync_failure, severity: "warning",
      title: "Gemini sync failed",
      message: "Rate limit exceeded — retrying in 60s. Last successful sync was 2 hours ago.",
      entityType: "provider", entityId: "gemini",
    },
    {
      orgId, type: NotificationType.suggestion, severity: "info",
      title: "Switch 3 users from claude-opus to claude-sonnet",
      message: "Estimated savings: $120/mo by switching non-critical workloads to claude-sonnet.",
    },
  ];

  for (let i = 0; i < notifications.length; i++) {
    const n = notifications[i];
    await prisma.notification.create({
      data: {
        ...n,
        isRead: i > 2,
        createdAt: new Date(Date.now() - i * 3600000 * randInt(2, 12)),
      },
    });
  }
  console.log(`✓ ${notifications.length} notifications`);

  /* ─── Summary ─── */
  const totalCost = records.reduce((s: number, r: { costUsd: number }) => s + r.costUsd, 0);
  const totalTokens = records.reduce((s: number, r: { inputTokens: number; outputTokens: number }) => s + r.inputTokens + r.outputTokens, 0);
  const uniqueModels = new Set(records.map((r: { model: string }) => r.model)).size;
  const uniqueProviders = new Set(records.map((r: { provider: string }) => r.provider)).size;
  const batchRecords = records.filter((r: { isBatch: boolean }) => r.isBatch).length;
  const audioRecords = records.filter((r: { inputAudioTokens: number }) => r.inputAudioTokens > 0).length;

  console.log("\n━━━ Demo data summary ━━━");
  console.log(`  Total spend:      $${totalCost.toFixed(2)}`);
  console.log(`  Total tokens:     ${(totalTokens / 1000000).toFixed(1)}M`);
  console.log(`  Models used:      ${uniqueModels}`);
  console.log(`  Providers:        ${uniqueProviders}`);
  console.log(`  Usage records:    ${records.length}`);
  console.log(`  Batch records:    ${batchRecords}`);
  console.log(`  Audio records:    ${audioRecords}`);
  console.log(`  DAU records:      ${dauRecords.length}`);
  console.log(`  Notifications:    ${notifications.length}`);
  console.log(`  Date range:       ${daysBefore(DAYS - 1).toISOString().slice(0, 10)} → ${daysBefore(0).toISOString().slice(0, 10)}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
