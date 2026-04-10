import * as fs from "fs";
import * as path from "path";

function rand(min: number, max: number) { return Math.random() * (max - min) + min; }
function randInt(min: number, max: number) { return Math.floor(rand(min, max + 1)); }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function daysBefore(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

type Provider = "anthropic" | "openai" | "gemini" | "cursor";

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
  { provider: "openai",    model: "gpt-4o",                    inputCostPer1k: 0.005,  outputCostPer1k: 0.015,  weight: 35 },
  { provider: "openai",    model: "gpt-4o-mini",               inputCostPer1k: 0.00015,outputCostPer1k: 0.0006, weight: 30 },
  { provider: "openai",    model: "o3-mini",                   inputCostPer1k: 0.0011, outputCostPer1k: 0.0044, weight: 12 },
  { provider: "openai",    model: "gpt-4.1",                   inputCostPer1k: 0.002,  outputCostPer1k: 0.008,  weight: 15 },
  { provider: "gemini",    model: "gemini-2.5-pro",            inputCostPer1k: 0.00125,outputCostPer1k: 0.01,   weight: 18 },
  { provider: "gemini",    model: "gemini-2.5-flash",          inputCostPer1k: 0.00015,outputCostPer1k: 0.0006, weight: 22 },
  { provider: "gemini",    model: "gemini-2.0-flash",          inputCostPer1k: 0.0001, outputCostPer1k: 0.0004, weight: 10 },
  { provider: "cursor",    model: "cursor-fast",               inputCostPer1k: 0.0005, outputCostPer1k: 0.0015, weight: 20 },
  { provider: "cursor",    model: "cursor-slow",               inputCostPer1k: 0.01,   outputCostPer1k: 0.03,   weight: 6 },
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
  name: string; email: string; dept: string; team: string; title: string;
  activity: ActivityLevel; preferredProviders: Provider[];
}> = [
  { name: "Alice Chen",    email: "alice.chen@demo-org.com",       dept: "Engineering", team: "Platform",    title: "Staff Engineer",    activity: "heavy",    preferredProviders: ["anthropic", "openai", "cursor"] },
  { name: "Bob Martinez",  email: "bob.martinez@demo-org.com",     dept: "Engineering", team: "Platform",    title: "Senior Engineer",   activity: "heavy",    preferredProviders: ["anthropic", "cursor"] },
  { name: "Carol Wu",      email: "carol.wu@demo-org.com",         dept: "Engineering", team: "Frontend",    title: "Senior Engineer",   activity: "moderate", preferredProviders: ["openai", "cursor", "gemini"] },
  { name: "David Kim",     email: "david.kim@demo-org.com",        dept: "Engineering", team: "Frontend",    title: "Engineer",          activity: "moderate", preferredProviders: ["openai", "cursor"] },
  { name: "Eva Singh",     email: "eva.singh@demo-org.com",        dept: "Engineering", team: "Backend",     title: "Senior Engineer",   activity: "heavy",    preferredProviders: ["anthropic", "openai"] },
  { name: "Frank Lopez",   email: "frank.lopez@demo-org.com",      dept: "Product",     team: "Growth",      title: "Product Manager",   activity: "moderate", preferredProviders: ["openai", "gemini"] },
  { name: "Grace Patel",   email: "grace.patel@demo-org.com",      dept: "Product",     team: "Growth",      title: "Associate PM",      activity: "light",    preferredProviders: ["openai", "gemini"] },
  { name: "Henry Zhao",    email: "henry.zhao@demo-org.com",       dept: "Product",     team: "Enterprise",  title: "Senior PM",         activity: "moderate", preferredProviders: ["anthropic", "openai"] },
  { name: "Irene Costa",   email: "irene.costa@demo-org.com",      dept: "Design",      team: "UX Research", title: "Lead Designer",     activity: "moderate", preferredProviders: ["openai", "gemini"] },
  { name: "James Okafor",  email: "james.okafor@demo-org.com",     dept: "Design",      team: "UX Research", title: "UX Researcher",     activity: "light",    preferredProviders: ["openai"] },
  { name: "Karen Müller",  email: "karen.muller@demo-org.com",     dept: "Design",      team: "Visual",      title: "Senior Designer",   activity: "light",    preferredProviders: ["openai", "gemini"] },
  { name: "Liam Brooks",   email: "liam.brooks@demo-org.com",      dept: "Marketing",   team: "Content",     title: "Content Lead",      activity: "moderate", preferredProviders: ["openai", "anthropic"] },
  { name: "Mia Thompson",  email: "mia.thompson@demo-org.com",     dept: "Marketing",   team: "Content",     title: "Content Writer",    activity: "moderate", preferredProviders: ["openai", "gemini"] },
  { name: "Noah Davis",    email: "noah.davis@demo-org.com",       dept: "Sales",       team: "Enterprise",  title: "Account Executive", activity: "light",    preferredProviders: ["openai"] },
  { name: "Olivia Wang",   email: "olivia.wang@demo-org.com",      dept: "Sales",       team: "Enterprise",  title: "Sales Engineer",    activity: "moderate", preferredProviders: ["openai", "anthropic", "cursor"] },
];

const ACTIVITY_RANGES: Record<ActivityLevel, { sessionsPerDay: [number, number]; tokensPerSession: [number, number] }> = {
  heavy:    { sessionsPerDay: [60, 120], tokensPerSession: [6000, 30000] },
  moderate: { sessionsPerDay: [25, 60],  tokensPerSession: [3000, 18000] },
  light:    { sessionsPerDay: [10, 30],  tokensPerSession: [1500, 10000] },
};

interface UsageRecord {
  date: string;
  provider: string;
  model: string;
  user_name: string;
  user_email: string;
  department: string;
  team: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  total_tokens: number;
  requests_count: number;
  cost_usd: number;
  is_batch: boolean;
  input_audio_tokens: number;
  output_audio_tokens: number;
  lines_accepted: number | null;
  lines_suggested: number | null;
  accept_rate: number | null;
  api_key_id: string | null;
}

const DAYS = 90;
const records: UsageRecord[] = [];

for (let dayOffset = DAYS - 1; dayOffset >= 0; dayOffset--) {
  const date = daysBefore(dayOffset);
  const dateStr = date.toISOString().slice(0, 10);
  const dayOfWeek = date.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const weekendMultiplier = isWeekend ? 0.2 : 1.0;
  const adoptionMultiplier = 0.4 + 0.6 * ((DAYS - dayOffset) / DAYS);

  for (const userDef of DEMO_USERS) {
    const profile = ACTIVITY_RANGES[userDef.activity];
    const sessions = Math.round(randInt(...profile.sessionsPerDay) * weekendMultiplier * adoptionMultiplier);
    if (sessions === 0) continue;

    const modelBuckets = new Map<string, {
      md: ModelDef; input: number; output: number; cached: number; reqs: number; cost: number;
      linesAcc: number; linesSug: number; isBatch: boolean; audioIn: number; audioOut: number;
      apiKeyId: string | null;
    }>();

    for (let s = 0; s < sessions; s++) {
      let md: ModelDef;
      if (Math.random() < 0.8) {
        const filtered = MODELS.filter(m => userDef.preferredProviders.includes(m.provider));
        const pool = filtered.length > 0 ? filtered : MODELS;
        const tw = pool.reduce((sum, m) => sum + m.weight, 0);
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

      const isOpenAI = md.provider === "openai";
      const isBatch = isOpenAI && Math.random() < 0.15;
      const audioIn = isOpenAI && Math.random() < 0.05 ? randInt(100, 2000) : 0;
      const audioOut = audioIn > 0 ? randInt(50, 1000) : 0;
      const apiKeyId = isOpenAI ? pick(OPENAI_API_KEYS) : null;

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
      } else {
        modelBuckets.set(key, {
          md, input: inputTok, output: outputTok, cached: cachedTok, reqs: 1, cost,
          linesAcc, linesSug, isBatch, audioIn, audioOut, apiKeyId,
        });
      }
    }

    for (const b of modelBuckets.values()) {
      records.push({
        date: dateStr,
        provider: b.md.provider,
        model: b.md.model,
        user_name: userDef.name,
        user_email: userDef.email,
        department: userDef.dept,
        team: userDef.team,
        input_tokens: b.input,
        output_tokens: b.output,
        cached_tokens: b.cached,
        total_tokens: b.input + b.output,
        requests_count: b.reqs,
        cost_usd: Math.round(b.cost * 1000000) / 1000000,
        is_batch: b.isBatch,
        input_audio_tokens: b.audioIn,
        output_audio_tokens: b.audioOut,
        lines_accepted: b.md.provider === "cursor" ? b.linesAcc : null,
        lines_suggested: b.md.provider === "cursor" ? b.linesSug : null,
        accept_rate: b.md.provider === "cursor" && b.linesSug > 0
          ? Math.round((b.linesAcc / b.linesSug) * 10000) / 10000
          : null,
        api_key_id: b.apiKeyId,
      });
    }
  }
}

const outDir = path.join(__dirname, "..", "data");
fs.mkdirSync(outDir, { recursive: true });

// JSON
const jsonPath = path.join(outDir, "demo-usage-data.json");
fs.writeFileSync(jsonPath, JSON.stringify(records, null, 2));

// CSV
const CSV_COLUMNS: (keyof UsageRecord)[] = [
  "date", "provider", "model", "user_name", "user_email", "department", "team",
  "input_tokens", "output_tokens", "cached_tokens", "total_tokens",
  "requests_count", "cost_usd", "is_batch",
  "input_audio_tokens", "output_audio_tokens",
  "lines_accepted", "lines_suggested", "accept_rate", "api_key_id",
];

function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const csvHeader = CSV_COLUMNS.join(",");
const csvRows = records.map(r => CSV_COLUMNS.map(c => escapeCsv(r[c])).join(","));
const csvContent = [csvHeader, ...csvRows].join("\n");

const csvPath = path.join(outDir, "demo-usage-data.csv");
fs.writeFileSync(csvPath, csvContent);

// Summary
const totalCost = records.reduce((s, r) => s + r.cost_usd, 0);
const totalTokens = records.reduce((s, r) => s + r.total_tokens, 0);
const uniqueModels = new Set(records.map(r => r.model)).size;
const uniqueProviders = new Set(records.map(r => r.provider)).size;
const uniqueUsers = new Set(records.map(r => r.user_email)).size;
const dateRange = `${records[0].date} → ${records[records.length - 1].date}`;

console.log(`\n━━━ Demo data exported ━━━`);
console.log(`  Records:     ${records.length.toLocaleString()}`);
console.log(`  Total spend: $${totalCost.toFixed(2)}`);
console.log(`  Total tokens: ${(totalTokens / 1_000_000).toFixed(1)}M`);
console.log(`  Providers:   ${uniqueProviders}`);
console.log(`  Models:      ${uniqueModels}`);
console.log(`  Users:       ${uniqueUsers}`);
console.log(`  Date range:  ${dateRange}`);
console.log(`  CSV:  ${csvPath}`);
console.log(`  JSON: ${jsonPath}`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
