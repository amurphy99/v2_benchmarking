FROM nginx:1.27-alpine

# Remove the default site just to make sure it doesn't interfere
RUN rm /etc/nginx/conf.d/default.conf

# Copy the conf file as a template
COPY default.conf /etc/nginx/templates/default.template

# Add Certbot & cron
RUN apk add --no-cache certbot curl bash tzdata

# Entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
