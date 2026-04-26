import { GRAPH_USER_SELECT_FIELDS, type GraphUser } from "./client";

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

/**
 * Static schema of every field the Graph user `$select` query asks for, plus
 * the well-known `manager` and `onPremisesExtensionAttributes.*` sub-fields.
 *
 * We expose this so the mapping UI can display the FULL set of available
 * fields immediately after connect — even if the sampled users happen to
 * have most of them null. Without this, users with sparse test accounts
 * never see attributes like `companyName`, `country`, or
 * `onPremisesExtensionAttributes.extensionAttribute7` in the dropdown.
 *
 * The list is unioned with what's actually present in the sampled batch
 * (which surfaces tenant-specific fields like `employeeOrgData.divisionId`
 * that aren't in this static list).
 */
export const KNOWN_GRAPH_USER_FIELDS: readonly string[] = [
  ...GRAPH_USER_SELECT_FIELDS,
  // Manager sub-fields (we $expand=manager($select=id,displayName,...))
  "manager",
  "manager.id",
  "manager.displayName",
  "manager.mail",
  "manager.userPrincipalName",
  "manager.jobTitle",
  "manager.department",
  // Extension attribute container — most enterprises stash custom HR data here
  // (cost center, BU code, manager email, security clearance, etc.).
  ...Array.from(
    { length: 15 },
    (_, i) => `onPremisesExtensionAttributes.extensionAttribute${i + 1}`
  ),
  // employeeOrgData is a complex type with two well-known sub-fields
  "employeeOrgData.divisionId",
  "employeeOrgData.costCenter",
];

export function extractFieldNames(sample: unknown, maxDepth = 4): string[] {
  const paths = new Set<string>();
  walk(sample, "", paths, maxDepth);
  return [...paths].sort();
}

/**
 * Returns the union of:
 *   1. Every field path present in the sampled object (including `null`
 *      leaves — surfaced so test accounts don't drop fields).
 *   2. The static `KNOWN_GRAPH_USER_FIELDS` schema, so the mapping UI lists
 *      every Graph attribute we explicitly request even when no sampled
 *      user has populated it yet.
 *
 * The union is what the field-mapping UI should consume — it's the only way
 * to guarantee every supported attribute appears in the dropdown regardless
 * of which users were in the sample window.
 */
export function buildAvailableFields(
  sample: unknown,
  unionKeysFromBatch: readonly string[] = []
): string[] {
  const merged = new Set<string>([
    ...extractFieldNames(sample),
    ...KNOWN_GRAPH_USER_FIELDS,
    ...unionKeysFromBatch,
  ]);
  return [...merged].sort();
}

function walk(value: unknown, prefix: string, out: Set<string>, depthLeft: number): void {
  if (value === undefined) return;
  if (value === null) {
    if (prefix) out.add(prefix);
    return;
  }
  if (depthLeft <= 0) {
    if (prefix) out.add(prefix);
    return;
  }

  // Arrays: surface the array path itself plus paths of the first element
  if (Array.isArray(value)) {
    if (prefix) out.add(prefix);
    if (value.length > 0) walk(value[0], prefix, out, depthLeft - 1);
    return;
  }

  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).filter((k) => !k.startsWith("@odata"));
    if (keys.length === 0 && prefix) {
      // Empty object — record the container so the user can still see it
      // exists (e.g. `onPremisesExtensionAttributes` with all 15 nulls).
      out.add(prefix);
      return;
    }
    for (const key of keys) {
      const child = (value as Record<string, unknown>)[key];
      const path = prefix ? `${prefix}.${key}` : key;
      // Crucially: do NOT skip null/undefined here — the field still
      // exists on the schema, it just happens to be empty for this sample.
      // Skipping it caused the mapping UI to miss every attribute that
      // happens to be blank on the first/sampled user (the original bug).
      if (child === undefined) {
        out.add(path);
        continue;
      }
      if (child === null) {
        out.add(path);
        continue;
      }
      if (typeof child === "object" && !Array.isArray(child)) {
        walk(child, path, out, depthLeft - 1);
      } else if (Array.isArray(child)) {
        out.add(path);
        if (child.length > 0 && typeof child[0] === "object") {
          walk(child[0], path, out, depthLeft - 1);
        }
      } else {
        out.add(path);
      }
    }
    return;
  }

  // Primitive at root — nothing to extract
}
