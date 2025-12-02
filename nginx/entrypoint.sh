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
  certbot certonly --webroot \
    --webroot-path /var/www/certbot \
    --non-interactive --agree-tos \
    -d "${DOMAIN}" -d "${DOMAIN_WWW}" \
    --email "${CERT_EMAIL}"
fi

# Try to renew on startup (no-op if >30 days left)
echo "[entry] One-shot renew check on startup..."
/usr/bin/certbot renew --webroot -w /var/www/certbot --quiet || true

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
crond -l 8

# --------------------------------------------------------------------------------
# Nginx
# --------------------------------------------------------------------------------
# Exec nginx in foreground
exec nginx -g "daemon off;"
