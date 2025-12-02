#!/usr/bin/env bash
set -euo pipefail

# --------------------------------------------------------------------------------
# Startup
# --------------------------------------------------------------------------------
echo "[entry] Rendering nginx template for ${DOMAIN}"
echo "[entry] Checking initial cert: /etc/letsencrypt/live/${DOMAIN}/fullchain.pem"

# Render template
envsubst '${DOMAIN} ${DOMAIN_WWW}' \
  < /etc/nginx/templates/default.template \
  > /etc/nginx/conf.d/default.conf

# First-run: obtain cert if missing
if [ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  echo "[entry] No existing certificate found for ${DOMAIN}, requesting a new one..."

  if certbot certonly --webroot \
      --webroot-path /var/www/certbot \
      --non-interactive --agree-tos \
      -d "${DOMAIN}" -d "${DOMAIN_WWW}" \
      --email "${CERT_EMAIL}"; then
    echo "[entry] Successfully obtained initial certificate for ${DOMAIN}"
  else
    echo "[entry] ERROR: Failed to obtain initial certificate for ${DOMAIN}" >&2
    exit 1
  fi
else
  echo "[entry] Existing certificate found for ${DOMAIN}, skipping initial obtain."
fi

# Try to renew on startup (no-op if >30 days left) [times out in 30s]
echo "[entry] One-shot renew check on startup (max 120s)..."
if timeout 30 /usr/bin/certbot renew --webroot -w /var/www/certbot --quiet; then
  echo "[entry] Startup renew check completed successfully (or no renewal needed)."
else
  echo "[entry] WARNING: Startup renew check failed or timed out (non-fatal)." >&2
fi

# --------------------------------------------------------------------------------
# Renew nightly at 3am; reload nginx after a successful renewal
# --------------------------------------------------------------------------------
# Write root's crontab where BusyBox crond reads it, with PATH + logging
cat >/etc/crontabs/root <<'CRON'
SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
0 3 * * * /usr/bin/certbot renew --webroot -w /var/www/certbot --quiet --deploy-hook "/usr/sbin/nginx -s reload"
CRON

# Start crond with verbose logging to container stdout
echo "[entry] Starting crond for nightly certbot renew cronjob (3:00 AM)..."
crond -l 8

# --------------------------------------------------------------------------------
# Nginx
# --------------------------------------------------------------------------------
# Exec nginx in foreground
echo "[entry] Starting nginx in foreground..."
exec nginx -g "daemon off;"
