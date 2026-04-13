# Agent Plutus

Enterprise AI usage analytics platform. Connects to your AI providers (Anthropic, OpenAI, Cursor, Vertex AI, Gemini), cross-references usage with your employee directory, and gives you per-user, per-team, and per-department cost visibility.

## Quick Start (Docker)

### Prerequisites

- Docker & Docker Compose
- An SSO identity provider (Okta, Microsoft Entra ID, Google Workspace, AD FS, etc.)

### 1. Clone and configure

```bash
git clone <repo-url> && cd agent-plutus
cp .env.example .env
```

Edit `.env` with your values (see [Environment Variables](#environment-variables) below).

### 2. Start

```bash
docker compose up -d
```

This starts three containers:

| Container | Role | Port |
|-----------|------|------|
| **caddy** | HTTPS reverse proxy (TLS termination) | **443** (exposed to host) |
| **app** | Next.js application | 3000 (internal only) |
| **db** | PostgreSQL 16 | 5432 (internal only) |

The database schema is automatically applied on first boot (`prisma migrate deploy`).

### 3. Access the dashboard

Open **https://your-domain.com** (or **https://localhost** with a self-signed cert warning for testing).

Log in via your SSO provider.

### 4. Connect AI providers

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

### 5. Push your employee directory

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
| `DOMAIN` | Public hostname. Caddy uses this for TLS — a real domain gets auto Let's Encrypt; `localhost` gets a self-signed cert. | `ai-analytics.company.com` |
| `ENCRYPTION_KEY` | Secret for encrypting provider API keys at rest. Generate with `openssl rand -base64 32`. | `k8Jd9f...` (32+ chars) |
| `AUTH_SECRET` | Secret for signing NextAuth session tokens. Generate with `openssl rand -base64 32`. | `Mx7Rp2...` (32+ chars) |

### SSO Authentication

The dashboard authenticates users via your corporate identity provider. Set `SSO_PROVIDER` to either `oidc` or `saml`.

**OIDC** (Okta, Microsoft Entra ID, Google Workspace, Auth0, Keycloak, PingFederate):

| Variable | Description |
|----------|-------------|
| `SSO_PROVIDER` | `"oidc"` |
| `SSO_ISSUER` | Issuer URL (e.g. `https://login.microsoftonline.com/{tenant-id}/v2.0`) |
| `SSO_CLIENT_ID` | OAuth client ID from your IdP |
| `SSO_CLIENT_SECRET` | OAuth client secret from your IdP |

Register this redirect URI in your IdP: `https://{DOMAIN}/api/auth/callback/oidc`

**SAML 2.0** (AD FS, Shibboleth, any SAML 2.0 IdP):

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
| `DOMAIN=ai-analytics.company.com` | Automatic Let's Encrypt certificate (server must be reachable on port 443) |
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
