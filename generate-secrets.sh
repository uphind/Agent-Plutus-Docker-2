#!/usr/bin/env bash
# ============================================================================
# Agent Plutus — Secret Generator
# ============================================================================
# Generates production-ready secrets for .env
#
# Usage:
#   chmod +x generate-secrets.sh
#   ./generate-secrets.sh            # print to stdout
#   ./generate-secrets.sh >> .env    # append to .env (edit after)
# ============================================================================

set -euo pipefail

gen() { openssl rand -base64 32; }

echo ""
echo "# ── Generated secrets ($(date -u +%Y-%m-%dT%H:%M:%SZ)) ──"
echo ""
echo "ENCRYPTION_KEY=\"$(gen)\""
echo "AUTH_SECRET=\"$(gen)\""
echo "POSTGRES_PASSWORD=\"$(openssl rand -hex 24)\""
echo ""
