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
// createdDateTime, address fields, on-prem fields, etc. — is silently
// omitted unless explicitly requested via `$select`. We ask for the full
// set of stable v1.0 user properties so the field-mapping UI can offer
// every attribute the directory might want to use.
const GRAPH_USER_SELECT_FIELDS = [
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
  "externalUserState",
  "externalUserStateChangeDateTime",
  "imAddresses",
  "showInAddressList",
  "lastPasswordChangeDateTime",
  "passwordPolicies",
  "creationType",
].join(",");

const USER_SELECT_QUERY = `$select=${GRAPH_USER_SELECT_FIELDS}`;

export async function fetchGraphUsers(
  accessToken: string,
  endpoint: string = "https://graph.microsoft.com/v1.0"
): Promise<GraphUser[]> {
  const users: GraphUser[] = [];
  let url: string | null = `${endpoint}/users?${USER_SELECT_QUERY}&$top=999`;

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

export async function fetchSampleUser(
  accessToken: string,
  endpoint: string = "https://graph.microsoft.com/v1.0"
): Promise<GraphUser | null> {
  const res = await fetch(`${endpoint}/users?${USER_SELECT_QUERY}&$top=1`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph API error: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.value?.[0] ?? null;
}
