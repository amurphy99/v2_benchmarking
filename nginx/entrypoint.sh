#!/usr/bin/env bash
set -euo pipefail

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

# Cron for renewals
echo "0 3 * * * certbot renew --webroot -w /var/www/certbot --quiet --post-hook 'nginx -s reload'" | crontab -
crond

# Exec nginx in foreground
exec nginx -g "daemon off;"
