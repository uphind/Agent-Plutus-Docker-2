#!/usr/bin/env bash
# =============================================================================
# Agent Plutus — One-command installer
# =============================================================================
# Usage on a fresh Ubuntu/Debian server:
#
#   curl -sSL https://raw.githubusercontent.com/uphind/Agent-Plutus-Production/main/install.sh | bash
#
# Or after cloning:
#
#   ./install.sh
#
# What it does:
#   1. Installs Docker + Compose if missing
#   2. Clones the repo (if not already in it)
#   3. Generates ENCRYPTION_KEY, AUTH_SECRET, POSTGRES_PASSWORD automatically
#   4. Prompts for domain, HTTPS, and SSO settings
#   5. Generates self-signed TLS certs if needed
#   6. Starts all containers and waits for them to become healthy
#   7. Prints the URL to open
# =============================================================================

set -euo pipefail

REPO_URL="https://github.com/uphind/Agent-Plutus-Production.git"
INSTALL_DIR="${INSTALL_DIR:-/opt/agent-plutus-production}"
LOG_FILE="/tmp/agent-plutus-install.log"

# Colors
BOLD=$'\033[1m'
DIM=$'\033[2m'
GREEN=$'\033[32m'
YELLOW=$'\033[33m'
RED=$'\033[31m'
BLUE=$'\033[34m'
RESET=$'\033[0m'

log()   { echo "${DIM}[$(date +%H:%M:%S)]${RESET} $*" | tee -a "$LOG_FILE"; }
info()  { echo "${BLUE}${BOLD}==>${RESET} ${BOLD}$*${RESET}" | tee -a "$LOG_FILE"; }
ok()    { echo "${GREEN}${BOLD}OK${RESET}  $*" | tee -a "$LOG_FILE"; }
warn()  { echo "${YELLOW}${BOLD}!${RESET}   $*" | tee -a "$LOG_FILE"; }
err()   { echo "${RED}${BOLD}ERR${RESET} $*" | tee -a "$LOG_FILE" >&2; }
die()   { err "$*"; exit 1; }

# Run a command with sudo if needed
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    die "This script needs root privileges or sudo installed."
  fi
fi

prompt() {
  local question="$1" default="${2:-}" answer
  if [ -n "$default" ]; then
    read -r -p "$(echo "${BOLD}?${RESET} ${question} ${DIM}[${default}]${RESET}: ")" answer </dev/tty
  else
    read -r -p "$(echo "${BOLD}?${RESET} ${question}: ")" answer </dev/tty
  fi
  echo "${answer:-$default}"
}

prompt_yn() {
  local question="$1" default="${2:-n}" answer
  while true; do
    answer=$(prompt "${question} [y/n]" "$default")
    case "${answer,,}" in
      y|yes) echo "y"; return 0 ;;
      n|no)  echo "n"; return 0 ;;
      *) warn "Please answer y or n" ;;
    esac
  done
}

# ---------------------------------------------------------------------------
# Step 1: Install Docker if missing
# ---------------------------------------------------------------------------

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker --version >/dev/null 2>&1; then
    ok "Docker already installed: $(docker --version)"
    return
  fi

  info "Installing Docker..."

  if ! command -v apt-get >/dev/null 2>&1; then
    die "Auto-install only supports Ubuntu/Debian. Install Docker manually then re-run this script."
  fi

  $SUDO apt-get update -y
  $SUDO apt-get install -y ca-certificates curl gnupg git

  $SUDO install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | $SUDO gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  $SUDO chmod a+r /etc/apt/keyrings/docker.gpg

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    $SUDO tee /etc/apt/sources.list.d/docker.list > /dev/null

  $SUDO apt-get update -y
  $SUDO apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  $SUDO systemctl enable docker
  $SUDO systemctl start docker

  if [ -n "${SUDO_USER:-${USER:-}}" ] && [ "${USER:-}" != "root" ]; then
    $SUDO usermod -aG docker "${SUDO_USER:-$USER}" || true
    warn "Added $USER to docker group. You may need to log out and back in for it to take effect."
  fi

  ok "Docker installed: $(docker --version)"
}

# ---------------------------------------------------------------------------
# Step 2: Clone repo (or detect we're in it)
# ---------------------------------------------------------------------------

clone_or_use_repo() {
  if [ -f "./docker-compose.yml" ] && [ -f "./.env.example" ]; then
    INSTALL_DIR="$(pwd)"
    ok "Using existing repo at: $INSTALL_DIR"
    return
  fi

  if [ -d "$INSTALL_DIR/.git" ]; then
    info "Repo already cloned at $INSTALL_DIR — pulling latest"
    cd "$INSTALL_DIR"
    git pull --ff-only
    return
  fi

  info "Cloning repo to $INSTALL_DIR..."
  $SUDO mkdir -p "$(dirname "$INSTALL_DIR")"
  $SUDO chown -R "$USER:$USER" "$(dirname "$INSTALL_DIR")" 2>/dev/null || true
  git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
  ok "Cloned to $INSTALL_DIR"
}

# ---------------------------------------------------------------------------
# Step 3: Generate .env with secrets and prompts
# ---------------------------------------------------------------------------

write_env() {
  if [ -f .env ]; then
    warn "An existing .env file was found at $(pwd)/.env"
    local overwrite
    overwrite=$(prompt_yn "Overwrite it with new values?" "n")
    if [ "$overwrite" = "n" ]; then
      ok "Keeping existing .env — skipping configuration"
      return
    fi
    cp .env ".env.bak.$(date +%s)"
    log "Backed up existing .env"
  fi

  info "Detecting public IP..."
  local public_ip
  public_ip=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || curl -s --max-time 5 icanhazip.com 2>/dev/null || echo "")
  if [ -n "$public_ip" ]; then
    ok "Public IP: $public_ip"
  else
    warn "Could not auto-detect public IP"
    public_ip="localhost"
  fi

  echo ""
  info "Configuration"

  local domain protocol use_sso sso_provider sso_issuer sso_client_id sso_client_secret sso_allowed_domains

  domain=$(prompt "Domain or IP" "$public_ip")

  local use_https
  use_https=$(prompt_yn "Use HTTPS? (recommended for production with a real domain)" "n")
  if [ "$use_https" = "y" ]; then
    protocol="https"
  else
    protocol="http"
  fi

  sso_provider="oidc"
  sso_issuer=""
  sso_client_id=""
  sso_client_secret=""
  sso_allowed_domains=""

  if [ "$protocol" = "https" ]; then
    use_sso=$(prompt_yn "Configure SSO now? (you can also set this up later in .env)" "n")
    if [ "$use_sso" = "y" ]; then
      echo ""
      echo "  ${BOLD}Which identity provider are you using?${RESET}"
      echo "    1) Microsoft Entra ID (formerly Azure AD)"
      echo "    2) Okta"
      echo "    3) Google Workspace"
      echo "    4) Other OIDC (Auth0, Keycloak, PingFederate, etc.)"
      echo "    5) SAML 2.0 (AD FS, Shibboleth, etc.)"
      echo ""
      local idp_choice
      idp_choice=$(prompt "Choose 1-5" "1")

      case "$idp_choice" in
        1)
          sso_provider="oidc"
          local tenant_id
          tenant_id=$(prompt "Microsoft Entra Tenant ID (Directory ID from Azure Portal)")
          sso_issuer="https://login.microsoftonline.com/${tenant_id}/v2.0"
          sso_client_id=$(prompt "Application (Client) ID")
          sso_client_secret=$(prompt "Client Secret VALUE (not the Secret ID)")
          ;;
        2)
          sso_provider="oidc"
          local okta_domain
          okta_domain=$(prompt "Okta domain (e.g. yourcompany.okta.com)")
          sso_issuer="https://${okta_domain}"
          sso_client_id=$(prompt "Client ID")
          sso_client_secret=$(prompt "Client Secret")
          ;;
        3)
          sso_provider="oidc"
          sso_issuer="https://accounts.google.com"
          sso_client_id=$(prompt "Client ID (ends with .apps.googleusercontent.com)")
          sso_client_secret=$(prompt "Client Secret")
          ;;
        4)
          sso_provider="oidc"
          sso_issuer=$(prompt "SSO_ISSUER (issuer URL)")
          sso_client_id=$(prompt "SSO_CLIENT_ID")
          sso_client_secret=$(prompt "SSO_CLIENT_SECRET")
          ;;
        5)
          sso_provider="saml"
          warn "SAML setup requires manual .env editing after install. See SETUP-GUIDE.md."
          ;;
        *)
          warn "Invalid choice — skipping SSO setup. You can configure it later in .env"
          ;;
      esac

      sso_allowed_domains=$(prompt "Allowed email domains (comma-separated, blank = allow all from your IdP)" "")

      echo ""
      info "Important: register this redirect URI in your IdP:"
      echo "    ${BOLD}${protocol}://${domain}/api/auth/callback/oidc${RESET}"
      echo ""
    fi
  fi

  info "Generating secrets..."
  local encryption_key auth_secret postgres_password
  encryption_key=$(openssl rand -base64 32)
  auth_secret=$(openssl rand -base64 32)
  postgres_password=$(openssl rand -hex 24)
  ok "ENCRYPTION_KEY, AUTH_SECRET, POSTGRES_PASSWORD generated"

  cp .env.example .env

  # Use # as sed delimiter since base64 can contain /
  sed -i "s#^PROTOCOL=.*#PROTOCOL=\"${protocol}\"#" .env
  sed -i "s#^DOMAIN=.*#DOMAIN=\"${domain}\"#" .env
  sed -i "s#^ENCRYPTION_KEY=.*#ENCRYPTION_KEY=\"${encryption_key}\"#" .env
  sed -i "s#^AUTH_SECRET=.*#AUTH_SECRET=\"${auth_secret}\"#" .env
  sed -i "s#^POSTGRES_PASSWORD=.*#POSTGRES_PASSWORD=\"${postgres_password}\"#" .env
  sed -i "s#^SSO_PROVIDER=.*#SSO_PROVIDER=\"${sso_provider}\"#" .env
  sed -i "s#^SSO_ISSUER=.*#SSO_ISSUER=\"${sso_issuer}\"#" .env
  sed -i "s#^SSO_CLIENT_ID=.*#SSO_CLIENT_ID=\"${sso_client_id}\"#" .env
  sed -i "s#^SSO_CLIENT_SECRET=.*#SSO_CLIENT_SECRET=\"${sso_client_secret}\"#" .env
  sed -i "s#^SSO_ALLOWED_DOMAINS=.*#SSO_ALLOWED_DOMAINS=\"${sso_allowed_domains}\"#" .env

  ok "Wrote .env"
}

# ---------------------------------------------------------------------------
# Step 4: Generate self-signed TLS cert if HTTPS + IP/localhost
# ---------------------------------------------------------------------------

maybe_generate_certs() {
  local protocol domain
  protocol=$(grep -E '^PROTOCOL=' .env | cut -d'"' -f2)
  domain=$(grep -E '^DOMAIN=' .env | cut -d'"' -f2)

  if [ "$protocol" != "https" ]; then
    return
  fi

  # Public domain → Caddy handles Let's Encrypt automatically
  if [ "$domain" != "localhost" ] && ! echo "$domain" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
    log "Public domain detected — Caddy will fetch a Let's Encrypt cert automatically"
    return
  fi

  if [ -f certs/cert.pem ] && [ -f certs/key.pem ]; then
    ok "Certs already exist in certs/ — skipping generation"
    return
  fi

  info "Generating self-signed cert for $domain..."
  chmod +x ./generate-certs.sh
  ./generate-certs.sh "$domain"
  ok "Self-signed cert generated"
}

# ---------------------------------------------------------------------------
# Step 5: Open firewall (best-effort)
# ---------------------------------------------------------------------------

open_firewall() {
  if command -v ufw >/dev/null 2>&1 && $SUDO ufw status | grep -q "Status: active"; then
    info "Opening ports 80 and 443 in ufw..."
    $SUDO ufw allow 80 || true
    $SUDO ufw allow 443 || true
    ok "Firewall rules applied"
  fi
}

# ---------------------------------------------------------------------------
# Step 6: Start containers
# ---------------------------------------------------------------------------

start_containers() {
  info "Starting Docker containers (this may take 2-5 minutes for the first build)..."
  $SUDO docker compose up -d --build
}

# ---------------------------------------------------------------------------
# Step 7: Wait for app to become healthy
# ---------------------------------------------------------------------------

wait_for_healthy() {
  info "Waiting for app to become ready..."

  local protocol domain url
  protocol=$(grep -E '^PROTOCOL=' .env | cut -d'"' -f2)
  domain=$(grep -E '^DOMAIN=' .env | cut -d'"' -f2)

  # Hit localhost — internal check, doesn't depend on external DNS
  if [ "$protocol" = "https" ]; then
    url="https://localhost"
  else
    url="http://localhost"
  fi

  local max_wait=180 elapsed=0 status=""
  while [ "$elapsed" -lt "$max_wait" ]; do
    status=$(curl -sk -o /dev/null -w "%{http_code}" --max-time 3 "$url" 2>/dev/null || echo "000")
    if [ "$status" = "200" ] || [ "$status" = "302" ] || [ "$status" = "307" ]; then
      echo ""
      ok "App is responding (HTTP $status)"
      return 0
    fi
    printf "."
    sleep 3
    elapsed=$((elapsed + 3))
  done

  echo ""
  warn "App did not respond within ${max_wait}s. Check logs with:"
  warn "  cd $INSTALL_DIR && sudo docker compose logs app"
  return 1
}

# ---------------------------------------------------------------------------
# Step 8: Print summary
# ---------------------------------------------------------------------------

print_summary() {
  local protocol domain url
  protocol=$(grep -E '^PROTOCOL=' .env | cut -d'"' -f2)
  domain=$(grep -E '^DOMAIN=' .env | cut -d'"' -f2)
  url="${protocol}://${domain}"

  echo ""
  echo "${GREEN}${BOLD}============================================================${RESET}"
  echo "${GREEN}${BOLD}  Agent Plutus is running${RESET}"
  echo "${GREEN}${BOLD}============================================================${RESET}"
  echo ""
  echo "  ${BOLD}URL:${RESET}        $url"
  echo "  ${BOLD}.env path:${RESET}  $(pwd)/.env"
  echo "  ${BOLD}Logs:${RESET}       cd $(pwd) && sudo docker compose logs -f app"
  echo "  ${BOLD}Restart:${RESET}    cd $(pwd) && sudo docker compose restart"
  echo ""
  if [ "$protocol" = "https" ] && (echo "$domain" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' || [ "$domain" = "localhost" ]); then
    echo "  ${YELLOW}Note: self-signed certificate — your browser will show a warning.${RESET}"
    echo "  ${YELLOW}      Click Advanced -> Proceed to continue.${RESET}"
    echo ""
  fi
  echo "  ${BOLD}Next steps:${RESET}"
  echo "    1. Open $url in your browser"
  if [ "$protocol" = "https" ]; then
    echo "    2. Log in via your SSO provider"
  fi
  echo "    3. Add provider API keys in the Providers page"
  echo ""
  echo "  Install log: $LOG_FILE"
  echo ""
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

main() {
  : > "$LOG_FILE"

  echo "${BOLD}============================================================${RESET}"
  echo "${BOLD}  Agent Plutus Installer${RESET}"
  echo "${BOLD}============================================================${RESET}"
  echo ""

  install_docker
  clone_or_use_repo

  cd "$INSTALL_DIR"

  write_env
  maybe_generate_certs
  open_firewall
  start_containers
  wait_for_healthy || true
  print_summary
}

main "$@"
