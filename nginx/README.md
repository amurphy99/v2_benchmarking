# Infrastructure/Networking Setup

* [I don't know for sure what happens if there is no existing certificate in the volume...]
* Install Nginx and Certbot
* Create `default.conf` from the template file (filling in `.env` variables)
* Certbot retreives certificates
* Nginx serves the frontend webapp as well as the API
* Start recurring cron task to renew certificates (every day at 3:00 AM)

<hr>

### Useful Commands:

```
# Check logs
docker logs nginx --since=15m

# Did the ACME webroot work? (should be HTTP/200)
docker exec -it nginx sh -lc 'mkdir -p /var/www/certbot/.well-known/acme-challenge && echo ok >/var/www/certbot/.well-known/acme-challenge/test'
curl -I http://cognibot.org/.well-known/acme-challenge/test

# Did the cert actually renew yet?
echo | openssl s_client -servername cognibot.org -connect cognibot.org:443 2>/dev/null | openssl x509 -noout -dates

# Manual renew
sudo docker exec -it nginx sh -lc '/usr/bin/certbot renew --webroot -w /var/www/certbot --force-renewal && /usr/sbin/nginx -t && /usr/sbin/nginx -s reload'

```

<hr>

We should expect these environment variables when run:
* DOMAIN: "sandbox.cognibot.org" | "cognibot.org"
* DOMAIN_WWW:
* CERT_EMAIL: 
