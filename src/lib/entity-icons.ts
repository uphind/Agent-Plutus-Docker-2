import {
  Building2, Code2, Megaphone, ShoppingCart, Palette,
  FlaskConical, Headphones, Shield, BarChart3, Briefcase,
  Rocket, Heart, Globe, BookOpen, Wrench,
  UsersRound, Monitor, Server, Smartphone, Lightbulb,
  PenTool, Target, TrendingUp, Package, Layers,
  Cpu, Database, Cloud, Mail, Phone,
  type LucideIcon,
} from "lucide-react";

const DEPARTMENT_KEYWORDS: [string[], LucideIcon, string, string][] = [
  [["engineer", "develop", "dev", "tech", "r&d"], Code2, "bg-blue-50", "text-blue-600"],
  [["market", "growth", "brand"], Megaphone, "bg-pink-50", "text-pink-600"],
  [["sale", "revenue", "business dev"], ShoppingCart, "bg-emerald-50", "text-emerald-600"],
  [["design", "creative", "ux", "ui"], Palette, "bg-violet-50", "text-violet-600"],
  [["product", "pm"], Rocket, "bg-orange-50", "text-orange-600"],
  [["research", "science", "data science", "analytics"], FlaskConical, "bg-cyan-50", "text-cyan-600"],
  [["support", "customer", "success", "service"], Headphones, "bg-amber-50", "text-amber-600"],
  [["security", "infosec", "compliance", "legal"], Shield, "bg-red-50", "text-red-600"],
  [["finance", "account", "billing"], BarChart3, "bg-lime-50", "text-lime-600"],
  [["hr", "human", "people", "talent", "recruit"], Heart, "bg-rose-50", "text-rose-600"],
  [["ops", "operation", "devops", "infra", "platform"], Wrench, "bg-slate-100", "text-slate-600"],
  [["content", "editorial", "copy", "writing"], BookOpen, "bg-indigo-50", "text-indigo-600"],
  [["international", "global", "local"], Globe, "bg-teal-50", "text-teal-600"],
  [["executive", "leadership", "c-suite", "management"], Briefcase, "bg-gray-100", "text-gray-700"],
];

const TEAM_KEYWORDS: [string[], LucideIcon, string, string][] = [
  [["frontend", "front-end", "web", "ui"], Monitor, "bg-blue-50", "text-blue-600"],
  [["backend", "back-end", "api", "server"], Server, "bg-slate-100", "text-slate-600"],
  [["mobile", "ios", "android", "app"], Smartphone, "bg-violet-50", "text-violet-600"],
  [["platform", "infra", "devops", "sre", "cloud"], Cloud, "bg-cyan-50", "text-cyan-600"],
  [["data", "ml", "ai", "machine learning", "analytics"], Cpu, "bg-emerald-50", "text-emerald-600"],
  [["design", "ux", "ui", "visual", "creative"], PenTool, "bg-pink-50", "text-pink-600"],
  [["research", "discovery", "user research"], FlaskConical, "bg-amber-50", "text-amber-600"],
  [["growth", "acquisition", "performance"], TrendingUp, "bg-lime-50", "text-lime-600"],
  [["content", "editorial", "copy", "seo"], BookOpen, "bg-indigo-50", "text-indigo-600"],
  [["brand", "comms", "pr", "communication"], Megaphone, "bg-rose-50", "text-rose-600"],
  [["enterprise", "strategic", "partner"], Briefcase, "bg-orange-50", "text-orange-600"],
  [["support", "success", "service"], Headphones, "bg-teal-50", "text-teal-600"],
  [["security", "compliance", "trust"], Shield, "bg-red-50", "text-red-600"],
  [["product", "feature", "roadmap"], Lightbulb, "bg-yellow-50", "text-yellow-600"],
  [["qa", "test", "quality"], Target, "bg-fuchsia-50", "text-fuchsia-600"],
  [["database", "storage", "db"], Database, "bg-sky-50", "text-sky-600"],
  [["email", "outreach", "crm"], Mail, "bg-green-50", "text-green-600"],
  [["sales", "inside", "outbound", "inbound"], Phone, "bg-emerald-50", "text-emerald-600"],
  [["ops", "operation", "logistics"], Wrench, "bg-gray-100", "text-gray-600"],
  [["deploy", "release", "ship", "package"], Package, "bg-blue-50", "text-blue-600"],
  [["layer", "stack", "full"], Layers, "bg-purple-50", "text-purple-600"],
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const FALLBACK_DEPT_ICONS: [LucideIcon, string, string][] = [
  [Building2, "bg-blue-50", "text-blue-600"],
  [Briefcase, "bg-orange-50", "text-orange-600"],
  [Globe, "bg-teal-50", "text-teal-600"],
  [Rocket, "bg-violet-50", "text-violet-600"],
  [BarChart3, "bg-emerald-50", "text-emerald-600"],
];

const FALLBACK_TEAM_ICONS: [LucideIcon, string, string][] = [
  [UsersRound, "bg-teal-50", "text-teal-600"],
  [Lightbulb, "bg-amber-50", "text-amber-600"],
  [Target, "bg-pink-50", "text-pink-600"],
  [Layers, "bg-cyan-50", "text-cyan-600"],
  [Package, "bg-indigo-50", "text-indigo-600"],
];

export interface EntityIconResult {
  icon: LucideIcon;
  bgClass: string;
  colorClass: string;
}

function match(name: string, keywords: [string[], LucideIcon, string, string][]): EntityIconResult | null {
  const lower = name.toLowerCase();
  for (const [keys, icon, bg, color] of keywords) {
    if (keys.some((k) => lower.includes(k))) {
      return { icon, bgClass: bg, colorClass: color };
    }
  }
  return null;
}

export function getDepartmentIcon(name: string): EntityIconResult {
  return match(name, DEPARTMENT_KEYWORDS) ?? (() => {
    const fb = FALLBACK_DEPT_ICONS[hashStr(name) % FALLBACK_DEPT_ICONS.length];
    return { icon: fb[0], bgClass: fb[1], colorClass: fb[2] };
  })();
}

export function getTeamIcon(name: string): EntityIconResult {
  return match(name, TEAM_KEYWORDS) ?? (() => {
    const fb = FALLBACK_TEAM_ICONS[hashStr(name) % FALLBACK_TEAM_ICONS.length];
    return { icon: fb[0], bgClass: fb[1], colorClass: fb[2] };
  })();
}
