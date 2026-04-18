#!/bin/sh
# Ensures a default Organization row exists.
# Idempotent — safe to run on every container boot.
# Uses `prisma db execute` so we don't need the Prisma JS client at runtime.

set -e

ORG_NAME="${ORG_NAME:-Default Organization}"
ORG_SLUG="${ORG_SLUG:-default}"

echo "[seed] Ensuring organization '${ORG_NAME}' (slug: ${ORG_SLUG}) exists..."

# Escape single quotes for SQL by doubling them
ORG_NAME_ESC=$(printf "%s" "$ORG_NAME" | sed "s/'/''/g")
ORG_SLUG_ESC=$(printf "%s" "$ORG_SLUG" | sed "s/'/''/g")

cat <<SQL | npx prisma db execute --stdin --schema prisma/schema.prisma
INSERT INTO organizations (id, name, slug, created_at, updated_at)
VALUES (gen_random_uuid(), '${ORG_NAME_ESC}', '${ORG_SLUG_ESC}', NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;
SQL

echo "[seed] Done."
