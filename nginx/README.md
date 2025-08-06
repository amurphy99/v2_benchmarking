# Infrastructure/Networking Setup

* Install Nginx and Certbot
* Create `default.conf` from the template file (filling in `.env` variables)
* Certbot retreives certificates
* Nginx serves the frontend webapp as well as the API
* Start recurring cron task to renew certificates

We should expect these environment variables when run:
* DOMAIN: "sandbox.cognibot.org" | "cognibot.org"
* DOMAIN_WWW:
* CERT_EMAIL: 
