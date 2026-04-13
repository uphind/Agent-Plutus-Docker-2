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

export async function fetchGraphUsers(
  accessToken: string,
  endpoint: string = "https://graph.microsoft.com/v1.0"
): Promise<GraphUser[]> {
  const users: GraphUser[] = [];
  let url: string | null = `${endpoint}/users?$top=999`;

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
  const res = await fetch(`${endpoint}/users?$top=1`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph API error: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.value?.[0] ?? null;
}
