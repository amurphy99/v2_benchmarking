# Speech System // Nginx

Infrastructure/networking setup

Each version has their own subdomain, or site 'prefix' (i.e. "sandbox.cognibot.org" or "sandbox2.cognibot.org"). Each version also includes the main domain. just "cognibot.org" in the nginx configuration file, but only one will actually have traffic mapped to it from the DNS server. When switching which version is set as the "main" version of the site, we simply change the IP that "cognibot.org" is mapped to and manually request the certificate for that domain on that VM. In sum, each VM always has its own subdomain, and one VM gets the real domain in addition to its subdomain. 


<br>

1. Install Nginx and Certbot
2. Create `default.conf` from the template file (filling in `.env` variables)
3. Certbot retreives certificates
4. Nginx serves the frontend webapp as well as the API
5. Start recurring cron task to renew certificates (every day at 3:00 AM)

<hr>



<details closed> <summary>Useful Commands</summary>
<br>

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
</details>

