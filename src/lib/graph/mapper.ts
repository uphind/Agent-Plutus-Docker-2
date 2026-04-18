import type { GraphUser } from "./client";

export interface DirectoryUser {
  email: string;
  name: string;
  department?: string;
  team?: string;
  job_title?: string;
  employee_id?: string;
  status?: string;
}

export interface FieldMappingRule {
  sourceField: string;
  targetField: string;
}

const AGENT_PLUTUS_FIELDS = [
  "email",
  "name",
  "department",
  "team",
  "job_title",
  "employee_id",
  "status",
] as const;

export type AgentPlutusField = (typeof AGENT_PLUTUS_FIELDS)[number];

export function getAgentPlutusFields(): readonly string[] {
  return AGENT_PLUTUS_FIELDS;
}

function resolveField(obj: unknown, sourceField: string): string | undefined {
  if (obj == null) return undefined;

  // Walk the dot path: "actor.email_address" → obj.actor.email_address
  const parts = sourceField.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  if (current == null) return undefined;
  if (Array.isArray(current)) {
    const first = current[0];
    if (first == null) return undefined;
    if (typeof first === "object") return JSON.stringify(first);
    return String(first);
  }
  if (typeof current === "object") return JSON.stringify(current);
  return String(current);
}

export function mapGraphUser(
  user: GraphUser,
  mappings: FieldMappingRule[]
): DirectoryUser {
  const mapped: Record<string, string | undefined> = {};

  for (const rule of mappings) {
    mapped[rule.targetField] = resolveField(user, rule.sourceField);
  }

  return {
    email: mapped.email || user.mail || user.userPrincipalName || "",
    name: mapped.name || user.displayName || "",
    department: mapped.department || user.department,
    team: mapped.team,
    job_title: mapped.job_title || user.jobTitle,
    employee_id: mapped.employee_id || user.employeeId,
    status: mapped.status || "active",
  };
}

export function mapGraphUsers(
  users: GraphUser[],
  mappings: FieldMappingRule[]
): DirectoryUser[] {
  return users
    .map((u) => mapGraphUser(u, mappings))
    .filter((u) => u.email);
}

export function extractFieldNames(sample: unknown, maxDepth = 4): string[] {
  const paths: string[] = [];
  walk(sample, "", paths, maxDepth);
  return paths;
}

function walk(value: unknown, prefix: string, out: string[], depthLeft: number): void {
  if (value == null) return;
  if (depthLeft <= 0) {
    if (prefix) out.push(prefix);
    return;
  }

  // Arrays: surface the array path itself plus paths of the first element
  if (Array.isArray(value)) {
    if (prefix) out.push(prefix);
    if (value.length > 0) walk(value[0], prefix, out, depthLeft - 1);
    return;
  }

  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).filter((k) => !k.startsWith("@odata"));
    for (const key of keys) {
      const child = (value as Record<string, unknown>)[key];
      const path = prefix ? `${prefix}.${key}` : key;
      if (child == null) continue;
      if (typeof child === "object" && !Array.isArray(child)) {
        walk(child, path, out, depthLeft - 1);
      } else if (Array.isArray(child)) {
        out.push(path);
        if (child.length > 0 && typeof child[0] === "object") {
          walk(child[0], path, out, depthLeft - 1);
        }
      } else {
        out.push(path);
      }
    }
    return;
  }

  // Primitive at root — nothing to extract
}
