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

function resolveField(user: GraphUser, sourceField: string): string | undefined {
  const value = user[sourceField];
  if (value == null) return undefined;
  if (Array.isArray(value)) return value[0]?.toString();
  return String(value);
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

export function extractFieldNames(sampleUser: GraphUser): string[] {
  return Object.keys(sampleUser).filter(
    (k) => !k.startsWith("@odata") && sampleUser[k] != null
  );
}
