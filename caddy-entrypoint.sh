#!/bin/sh
set -e

DOMAIN="${DOMAIN:-localhost}"
PROTOCOL="${PROTOCOL:-https}"
CADDYFILE="/etc/caddy/Caddyfile"

IS_IP=$(echo "$DOMAIN" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' && echo "yes" || echo "no")

if [ "$PROTOCOL" = "http" ]; then
  cat > "$CADDYFILE" <<EOF
:80 {
  reverse_proxy app:3000
}
EOF
  echo "Caddy config: http://${DOMAIN}:80 (no TLS)"
else
  if [ -f /certs/cert.pem ] && [ -f /certs/key.pem ]; then
    TLS_LINE="tls /certs/cert.pem /certs/key.pem"
  elif [ "$DOMAIN" = "localhost" ] || [ "$IS_IP" = "yes" ]; then
    TLS_LINE="tls internal"
  else
    TLS_LINE=""
  fi

  if [ "$IS_IP" = "yes" ] || [ "$DOMAIN" = "localhost" ]; then
    cat > "$CADDYFILE" <<CEOF
{
  default_sni ${DOMAIN}
}

https:// {
  reverse_proxy app:3000
  ${TLS_LINE}
}
CEOF
  else
    cat > "$CADDYFILE" <<CEOF
${DOMAIN}:443 {
  reverse_proxy app:3000
  ${TLS_LINE}
}
CEOF
  fi

  echo "Caddy config: https://${DOMAIN}:443 tls=${TLS_LINE:-auto}"
fi

exec caddy run --config "$CADDYFILE" --adapter caddyfile
