# Agent Plutus

Enterprise AI usage analytics platform. Connects to your AI providers (Anthropic, OpenAI, Cursor, Vertex AI, Gemini), cross-references usage with your employee directory, and gives you per-user, per-team, and per-department cost visibility.

## Quick Start (one command)

On a fresh Ubuntu/Debian server:

```bash
curl -sSL https://raw.githubusercontent.com/uphind/Agent-Plutus-Docker-2/main/install.sh | bash
```

That's it. The installer will:

1. Install Docker if missing
2. Clone this repo to `/opt/agent-plutus-docker-2`
3. Auto-generate all secrets (`ENCRYPTION_KEY`, `AUTH_SECRET`, `POSTGRES_PASSWORD`) — you never touch them
4. Prompt for your domain, HTTP/HTTPS choice, and SSO settings
5. Generate self-signed TLS certs if needed
6. Start all containers and wait until healthy
7. Print the URL to open

Total time: ~3-5 minutes (mostly the Docker build).

### Already cloned?

```bash
git clone https://github.com/uphind/Agent-Plutus-Docker-2 && cd Agent-Plutus-Docker-2
./install.sh
```

---

## Manual Setup (advanced)

If you'd rather configure each step yourself, follow the manual instructions below.

### Prerequisites

- A Linux server (Ubuntu 22.04+ recommended) or macOS/Windows with Docker Desktop
- An SSO identity provider (Okta, Microsoft Entra ID, Google Workspace, AD FS, etc.) — only needed for HTTPS mode

### 1. Install Docker (Ubuntu/Debian)

Skip this step if Docker is already installed (`docker --version` to check).

```bash
# Update system packages
sudo apt-get update && sudo apt-get upgrade -y

# Install dependencies
sudo apt-get install -y ca-certificates curl gnupg git

# Add Docker's official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine + Compose
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Enable and start Docker
sudo systemctl enable docker
sudo systemctl start docker

# (Optional) Run Docker without sudo
sudo usermod -aG docker $USER
# Log out and back in for this to take effect
```

Verify the installation:

```bash
docker --version
docker compose version
```

### 2. Clone and configure

```bash
git clone https://github.com/uphind/Agent-Plutus-Docker-2 && cd Agent-Plutus-Docker-2
cp .env.example .env
```

Edit `.env` with your values:

```bash
nano .env
```

**Find your server's public IP:**

```bash
curl ifconfig.me
```

**Set your domain and protocol.** Choose one:

| Scenario | PROTOCOL | DOMAIN | Certs needed? | SSO needed? |
|----------|----------|--------|---------------|-------------|
| Testing with IP (simplest) | `"http"` | `"143.198.55.12"` | No | No |
| Testing with domain | `"https"` | `"your-domain.com"` | Auto (Let's Encrypt) | Yes |
| Internal / corporate | `"https"` | `"your-domain.com"` | Corporate CA (see below) | Yes |

For testing, use HTTP mode — no certificates, no SSO, just works:

```bash
sed -i 's/^PROTOCOL=.*/PROTOCOL="http"/' .env
sed -i 's/^DOMAIN=.*/DOMAIN="<your-server-ip>"/' .env
```

**Generate secrets** (required for both HTTP and HTTPS):

```bash
sed -i "s/^ENCRYPTION_KEY=.*/ENCRYPTION_KEY=\"$(openssl rand -base64 32)\"/" .env
sed -i "s/^AUTH_SECRET=.*/AUTH_SECRET=\"$(openssl rand -base64 32)\"/" .env
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=\"$(openssl rand -hex 24)\"/" .env
```

See [Environment Variables](#environment-variables) below for SSO and other options.

### 3. Open firewall ports

```bash
sudo ufw allow 80
sudo ufw allow 443
```

If you're on DigitalOcean, AWS, or another cloud provider, also check the firewall rules in their web console.

### 4. Generate TLS certificates (HTTPS mode only)

Skip this step if using HTTP mode.

**If your domain is public** (e.g. `your-domain.com` with DNS pointing at your server), Caddy gets a Let's Encrypt certificate automatically. Nothing to do.

**If using an IP address or internal domain with HTTPS**, generate a self-signed cert:

```bash
chmod +x generate-certs.sh
./generate-certs.sh
```

This reads `DOMAIN` from your `.env` and creates `certs/cert.pem` + `certs/key.pem`. Your browser will show a certificate warning — click through it.

**If using corporate CA certificates**, place them in the `certs/` directory:

```bash
cp /path/to/your/cert.pem certs/cert.pem
cp /path/to/your/key.pem certs/key.pem
```

### 5. Start

```bash
sudo docker compose up -d
```

This starts three containers:

| Container | Role | Port |
|-----------|------|------|
| **caddy** | Reverse proxy | **443** (HTTPS) or **80** (HTTP) |
| **app** | Next.js application | 3000 (internal only) |
| **db** | PostgreSQL 16 | 5432 (internal only) |

The database schema is automatically applied on first boot (`prisma migrate deploy`).

To check that all containers are running:

```bash
sudo docker compose ps
```

All three should show `Up`. If the app shows `Restarting`, check logs with `sudo docker compose logs app --tail 20`.

### 6. Access the dashboard

Open your browser **on your local machine** and go to:

- **HTTP mode:** `http://<your-server-ip>` (e.g. `http://143.198.55.12`)
- **HTTPS mode:** `https://your-domain.com` (you'll get a cert warning if using self-signed)

If using HTTPS with SSO, log in via your SSO provider.

### 7. Connect AI providers

Navigate to **Providers** in the sidebar. For each provider you use:

1. Click **Configure**
2. Paste the provider's admin/analytics API key
3. Click **Save** — the key is validated, encrypted (AES-256-GCM), and stored
4. Click **Sync Now** to pull usage data immediately

Supported providers:

| Provider | Key type | What's synced |
|----------|----------|---------------|
| Anthropic | Admin API key (`sk-ant-admin...`) | Tokens, cost, by model/workspace |
| OpenAI | Admin API key | Tokens, cost, by model/user/project |
| Gemini | Google AI Studio API key | Tokens, cost, by model |
| Cursor | Enterprise Analytics API key | Agent edits, tabs, DAU, model usage |
| Vertex AI | GCP Service Account JSON | Placeholder — requires GCP setup |

After the initial sync, data is refreshed automatically (default: every 6 hours, configurable in **Settings**).

### 8. Push your employee directory

Your HR system, Active Directory, or a script should POST your user directory so usage can be mapped to people:

```bash
curl -X POST https://your-domain.com/api/v1/directory \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_ORG_API_KEY" \
  -d '{
    "users": [
      {
        "email": "alice@company.com",
        "name": "Alice Chen",
        "department": "Engineering",
        "team": "Platform",
        "job_title": "Staff Engineer",
        "employee_id": "EMP-001",
        "status": "active"
      }
    ]
  }'
```

Users not included in the payload are marked inactive. Departments and teams are auto-created from the directory data.

---

## Environment Variables

Create a `.env` file in the **project root** (same directory as `docker-compose.yml`). All variables are read by Docker Compose.

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `DOMAIN` | Public hostname. Caddy uses this for TLS — a real domain gets auto Let's Encrypt; `localhost` gets a self-signed cert. | `your-domain.com` |
| `ENCRYPTION_KEY` | Secret for encrypting provider API keys at rest. Generate with `openssl rand -base64 32`. | `k8Jd9f...` (32+ chars) |
| `AUTH_SECRET` | Secret for signing NextAuth session tokens. Generate with `openssl rand -base64 32`. | `Mx7Rp2...` (32+ chars) |

### SSO Authentication

SSO is only required when `PROTOCOL="https"`. The dashboard authenticates users via your corporate identity provider. Set `SSO_PROVIDER` to either `oidc` or `saml`.

#### OIDC (Okta, Microsoft Entra ID, Google Workspace, Auth0, Keycloak, PingFederate)

| Variable | Description |
|----------|-------------|
| `SSO_PROVIDER` | `"oidc"` |
| `SSO_ISSUER` | Issuer URL (see provider-specific examples below) |
| `SSO_CLIENT_ID` | OAuth client ID from your IdP |
| `SSO_CLIENT_SECRET` | OAuth client secret from your IdP |
| `SSO_ALLOWED_DOMAINS` | (Optional) Comma-separated email domains to allow, e.g. `"company.com"`. Leave empty to allow all authenticated users. |

Register this redirect URI in your IdP: `https://{DOMAIN}/api/auth/callback/oidc`

The app requests scopes `openid email profile`.

#### Microsoft Entra ID Setup (step-by-step)

1. Go to [Azure Portal](https://portal.azure.com) > **Microsoft Entra ID** > **App registrations** > **New registration**
2. Configure the registration:
   - **Name:** `Agent Plutus`
   - **Supported account types:** "Accounts in this organizational directory only"
   - **Redirect URI:** Select **Web** and enter `https://<your-domain>/api/auth/callback/oidc`
3. Click **Register**
4. On the app's **Overview** page, copy:
   - **Application (client) ID** → use as `SSO_CLIENT_ID`
   - **Directory (tenant) ID** → use in the issuer URL below
5. Go to **Certificates & secrets** > **New client secret**
   - Add a description, pick an expiry, click **Add**
   - Copy the **Value** (not the Secret ID) → use as `SSO_CLIENT_SECRET`
6. Go to **API permissions** > verify `openid`, `email`, and `profile` are listed under Microsoft Graph (they're added by default)

Set these in your `.env`:

```
SSO_PROVIDER="oidc"
SSO_ISSUER="https://login.microsoftonline.com/<your-tenant-id>/v2.0"
SSO_CLIENT_ID="<application-client-id>"
SSO_CLIENT_SECRET="<client-secret-value>"
SSO_ALLOWED_DOMAINS="company.com"
```

#### Okta Setup (step-by-step)

1. Go to **Okta Admin Console** > **Applications** > **Create App Integration**
2. Select **OIDC - OpenID Connect** > **Web Application** > **Next**
3. Configure:
   - **App integration name:** `Agent Plutus`
   - **Sign-in redirect URIs:** `https://<your-domain>/api/auth/callback/oidc`
   - **Assignments:** Select who can access the app
4. Click **Save**
5. Copy the **Client ID** and **Client secret** from the app's settings

Set these in your `.env`:

```
SSO_PROVIDER="oidc"
SSO_ISSUER="https://<your-okta-domain>.okta.com"
SSO_CLIENT_ID="<client-id>"
SSO_CLIENT_SECRET="<client-secret>"
```

#### Google Workspace Setup (step-by-step)

1. Go to [Google Cloud Console](https://console.cloud.google.com) > **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. Select **Web application** and configure:
   - **Name:** `Agent Plutus`
   - **Authorized redirect URIs:** `https://<your-domain>/api/auth/callback/oidc`
4. Click **Create** and copy the **Client ID** and **Client secret**

Set these in your `.env`:

```
SSO_PROVIDER="oidc"
SSO_ISSUER="https://accounts.google.com"
SSO_CLIENT_ID="<client-id>.apps.googleusercontent.com"
SSO_CLIENT_SECRET="<client-secret>"
SSO_ALLOWED_DOMAINS="company.com"
```

#### SAML 2.0 (AD FS, Shibboleth, any SAML 2.0 IdP)

| Variable | Description |
|----------|-------------|
| `SSO_PROVIDER` | `"saml"` |
| `SSO_SAML_ENTRY_POINT` | IdP SSO URL (e.g. `https://adfs.company.com/adfs/ls/`) |
| `SSO_SAML_ISSUER` | Entity ID / Issuer (typically your app's URL) |
| `SSO_SAML_CERT` | Base64-encoded IdP signing certificate |

Register this ACS URL in your IdP: `https://{DOMAIN}/api/auth/saml/acs`

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `POSTGRES_PASSWORD` | Database password | `plutus_secret` |

---

## TLS / HTTPS

The Caddy reverse proxy handles TLS automatically:

| Scenario | What happens |
|----------|--------------|
| `DOMAIN=localhost` | Self-signed certificate (browser will show a warning) |
| `DOMAIN=your-domain.com` | Automatic Let's Encrypt certificate (server must be reachable on port 443) |
| Corporate CA / custom certs | Place `cert.pem` and `key.pem` in a `./certs/` directory, then uncomment the volume mount in `docker-compose.yml` |

To use corporate certificates, uncomment this line in `docker-compose.yml` under the `caddy` service:

```yaml
- ./certs:/certs:ro
```

---

## Local Development

```bash
npm install

# Start only the database
docker compose up db -d

# Set up the database
npx prisma generate
npx prisma migrate dev --name init

# Start dev server
npm run dev
```

The dev server runs at `http://localhost:3000`.

---

## Architecture

```
                         ┌──────────────┐
                         │   Your IdP   │  (Okta / Entra ID / AD FS)
                         └──────┬───────┘
                                │ SSO (OIDC or SAML)
                                ▼
  ┌───────────────────────────────────────────────────────────┐
  │                    Caddy (port 443)                       │
  │                    TLS termination                        │
  └──────────────────────────┬────────────────────────────────┘
                             │ reverse proxy
                             ▼
  ┌───────────────────────────────────────────────────────────┐
  │              Agent Plutus App (port 3000)                  │
  │                                                           │
  │   Dashboard UI ──── Next.js App Router                    │
  │   API Routes ────── /api/v1/*                             │
  │   Sync Engine ───── node-cron (configurable interval)     │
  │                                                           │
  └────────┬──────────┬──────────┬──────────┬─────────────────┘
           │          │          │          │
           ▼          ▼          ▼          ▼
       Anthropic   OpenAI    Gemini     Cursor    Vertex AI
                                                     │
  ┌──────────────────────────────────────────────────────────┐
  │                  PostgreSQL 16                            │
  │   Users, departments, teams, usage records, credentials  │
  └──────────────────────────────────────────────────────────┘

  POST /api/v1/directory  <──  Your HR system / Active Directory
```

---

## API Reference

API routes require the `X-API-Key` header with the organization's API key.

### User Directory

- **POST** `/api/v1/directory` — Push employee directory (creates/updates users, departments, teams)

### Provider Credentials

- **GET** `/api/v1/providers` — List configured providers
- **POST** `/api/v1/providers` — Add or update a provider API key
- **DELETE** `/api/v1/providers?provider=anthropic` — Remove a provider

### Analytics

- **GET** `/api/v1/analytics/overview?days=30` — Aggregated dashboard metrics
- **GET** `/api/v1/analytics/by-user?days=30` — Per-user cost breakdown
- **GET** `/api/v1/analytics/trends?days=30` — Spend trends over time
- **GET** `/api/v1/analytics/anomalies` — Unusual spending patterns
- **GET** `/api/v1/analytics/explorer` — Detailed usage explorer

### Sync

- **POST** `/api/v1/sync` — Trigger sync for all providers
- **POST** `/api/v1/sync` with `{"provider": "anthropic"}` — Sync a specific provider
- **GET** `/api/v1/sync` — View sync logs

### Reports

- **GET** `/api/v1/reports/cost-summary` — Cost summary report
- **GET** `/api/v1/reports/export` — Export usage data
- **GET** `/api/v1/reports/department-export` — Department-level export

### Users & Budgets

- **GET** `/api/v1/users?department=Engineering&search=alice` — List/filter users
- **PUT** `/api/v1/users/:id/budget` — Set user budget and alert threshold

### Departments & Teams

- **GET** `/api/v1/departments` — List departments
- **GET** `/api/v1/teams` — List teams

### Notifications

- **GET** `/api/v1/notifications` — List notifications
- **POST** `/api/v1/notifications/:id/read` — Mark notification as read
- **POST** `/api/v1/notifications/read-all` — Mark all as read

---

## Tech Stack

- **Framework**: Next.js 16 (App Router, TypeScript)
- **UI**: Tailwind CSS v4, Recharts
- **Database**: PostgreSQL 16 + Prisma ORM
- **Auth**: NextAuth v5 with OIDC and SAML 2.0 SSO
- **Encryption**: AES-256-GCM for provider credentials at rest
- **Scheduling**: node-cron (configurable sync interval)
- **Reverse proxy**: Caddy (automatic HTTPS)
- **Deployment**: Docker Compose (single `docker compose up -d`)
