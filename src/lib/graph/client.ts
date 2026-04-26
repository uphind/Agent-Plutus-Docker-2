import { decrypt } from "@/lib/encryption";

interface GraphTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export interface GraphUser {
  id?: string;
  displayName?: string;
  givenName?: string;
  surname?: string;
  mail?: string;
  userPrincipalName?: string;
  jobTitle?: string;
  department?: string;
  officeLocation?: string;
  mobilePhone?: string;
  businessPhones?: string[];
  preferredLanguage?: string;
  employeeId?: string;
  companyName?: string;
  [key: string]: unknown;
}

export async function getAccessToken(
  tenantId: string,
  clientId: string,
  encryptedSecret: string
): Promise<string> {
  const clientSecret = decrypt(encryptedSecret);
  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to get Graph API token: ${res.status} ${text}`);
  }

  const data: GraphTokenResponse = await res.json();
  return data.access_token;
}

// Microsoft Graph's /users endpoint only returns a small default set of
// properties (id, displayName, userPrincipalName, mail, businessPhones, …).
// Anything else — department, companyName, employeeId, accountEnabled,
// createdDateTime, address fields, on-prem fields, extension attributes,
// manager, etc. — is silently omitted unless explicitly requested via
// `$select` / `$expand`. We ask for the full set of stable v1.0 user
// properties so the field-mapping UI can offer every attribute the
// directory might want to use.
//
// `onPremisesExtensionAttributes` is the container for `extensionAttribute1`
// through `extensionAttribute15` — the most common place enterprises stash
// custom HR data (cost center, business unit, manager email, etc.).
//
// `manager` requires `$expand` (it's a navigation property, not a primitive).
export const GRAPH_USER_SELECT_FIELDS: readonly string[] = [
  "id",
  "displayName",
  "givenName",
  "surname",
  "userPrincipalName",
  "mail",
  "mailNickname",
  "otherMails",
  "proxyAddresses",
  "jobTitle",
  "department",
  "companyName",
  "employeeId",
  "employeeType",
  "employeeHireDate",
  "employeeOrgData",
  "officeLocation",
  "mobilePhone",
  "businessPhones",
  "faxNumber",
  "preferredLanguage",
  "country",
  "city",
  "state",
  "streetAddress",
  "postalCode",
  "usageLocation",
  "accountEnabled",
  "createdDateTime",
  "userType",
  "ageGroup",
  "consentProvidedForMinor",
  "legalAgeGroupClassification",
  "onPremisesSamAccountName",
  "onPremisesUserPrincipalName",
  "onPremisesDistinguishedName",
  "onPremisesDomainName",
  "onPremisesImmutableId",
  "onPremisesSecurityIdentifier",
  "onPremisesSyncEnabled",
  "onPremisesExtensionAttributes",
  "externalUserState",
  "externalUserStateChangeDateTime",
  "imAddresses",
  "showInAddressList",
  "lastPasswordChangeDateTime",
  "passwordPolicies",
  "creationType",
];

// Manager is a navigation property — request via $expand with a sub-$select
// so we don't pull the entire manager object.
const MANAGER_EXPAND = "manager($select=id,displayName,mail,userPrincipalName,jobTitle,department)";

const USER_QUERY = `$select=${GRAPH_USER_SELECT_FIELDS.join(",")}&$expand=${MANAGER_EXPAND}`;

export async function fetchGraphUsers(
  accessToken: string,
  endpoint: string = "https://graph.microsoft.com/v1.0"
): Promise<GraphUser[]> {
  const users: GraphUser[] = [];
  // $top=999 is the Graph API maximum per page; combined with $expand=manager
  // it can occasionally trigger throttling, so we let Graph drive paging via
  // @odata.nextLink rather than hard-coding a page size that's too aggressive.
  let url: string | null = `${endpoint}/users?${USER_QUERY}&$top=999`;

  while (url) {
    const response: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Graph API error: ${response.status} ${text}`);
    }

    const body: { value?: GraphUser[]; "@odata.nextLink"?: string } = await response.json();
    users.push(...(body.value ?? []));
    url = body["@odata.nextLink"] ?? null;
  }

  return users;
}

export interface FieldDiscoveryResult {
  /**
   * Best-effort representative user — picked from the sampled batch as the
   * one with the most non-null fields. Used by the mapping UI to show
   * realistic example values next to each source field instead of "null".
   */
  bestSample: GraphUser | null;
  /**
   * Every distinct top-level key seen across the entire sampled batch
   * (excluding `@odata.*` metadata keys). When users on the team are
   * heterogeneous — service accounts vs. real employees, on-prem-synced
   * vs. cloud-only — the union surfaces every attribute that's available
   * for at least one user, so the mapping UI can offer them all.
   */
  unionKeys: string[];
  /**
   * Total users sampled (capped). Surfaced so the UI can say
   * "fields detected from N users" instead of just "from a sample user".
   */
  sampledCount: number;
}

/**
 * Pulls a small batch of users to discover every available field, picking
 * the most populated user as the best example sample. This is intentionally
 * NOT just `$top=1` because the first user returned by Graph is often a
 * test or service account with most fields blank.
 *
 * Replaces the older `fetchSampleUser` (which pulled a single user) — we
 * keep that name as a thin compat shim below for callers that haven't been
 * migrated yet.
 */
export async function fetchFieldDiscovery(
  accessToken: string,
  endpoint: string = "https://graph.microsoft.com/v1.0",
  sampleSize: number = 25
): Promise<FieldDiscoveryResult> {
  const top = Math.max(1, Math.min(sampleSize, 100));
  const res = await fetch(`${endpoint}/users?${USER_QUERY}&$top=${top}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph API error: ${res.status} ${text}`);
  }

  const data: { value?: GraphUser[] } = await res.json();
  const users = data.value ?? [];

  if (users.length === 0) {
    return { bestSample: null, unionKeys: [], sampledCount: 0 };
  }

  const unionKeys = new Set<string>();
  let bestSample: GraphUser = users[0];
  let bestScore = -1;

  for (const user of users) {
    let score = 0;
    for (const [key, value] of Object.entries(user)) {
      if (key.startsWith("@odata")) continue;
      unionKeys.add(key);
      if (value === null || value === undefined) continue;
      if (Array.isArray(value)) {
        if (value.length > 0) score++;
      } else if (typeof value === "object") {
        // Count non-null subfields rather than the whole object so a manager
        // record with everything populated outranks one with just an id.
        for (const sub of Object.values(value as Record<string, unknown>)) {
          if (sub !== null && sub !== undefined && sub !== "") score++;
        }
      } else if (value !== "") {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestSample = user;
    }
  }

  return {
    bestSample,
    unionKeys: [...unionKeys].sort(),
    sampledCount: users.length,
  };
}

/**
 * Compat shim — older routes still call `fetchSampleUser`. Returns the
 * best-populated user from a small batch so legacy callers automatically
 * get the improved sampling without code changes.
 */
export async function fetchSampleUser(
  accessToken: string,
  endpoint: string = "https://graph.microsoft.com/v1.0"
): Promise<GraphUser | null> {
  const { bestSample } = await fetchFieldDiscovery(accessToken, endpoint, 25);
  return bestSample;
}
