# One-time VM setup

## BACKEND
---

Run this once to install Node.js, pm2, and create the directory:

# 1. Install Node.js 22 LTS (via NodeSource)
ssh azure-nebius-portal-vm "
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - &&
  sudo apt-get install -y nodejs build-essential python3 &&
  node --version && npm --version
"

# 2. Install pm2 globally
ssh azure-nebius-portal-vm "sudo npm install -g pm2"

# 3. Create the directory, owned by azureuser
ssh azure-nebius-portal-vm "
  sudo mkdir -p /opt/nebius-portal/backend/data &&
  sudo chown -R azureuser:azureuser /opt/nebius-portal
"

---
First deploy

Run from your local machine inside the repo root:

# 4. Sync backend code (exclude node_modules, dist, data, .env)
rsync -avz --progress \
  --exclude 'node_modules/' \
  --exclude 'dist/' \
  --exclude 'data/' \
  --exclude '.env' \
  backend/ \
  azure-nebius-portal-vm:/opt/nebius-portal/backend/

# 5. Install dependencies and build on the VM
ssh azure-nebius-portal-vm "
  cd /opt/nebius-portal/backend &&
  npm ci &&
  npm run build
"

---
Configure the .env on the VM

# 6. Generate fresh secrets on the VM and create .env
# If you are already SSH'd into the VM, run:
cd /opt/nebius-portal/backend
node -e 'const c=require("crypto"); console.log("JWT_SECRET="+c.randomBytes(32).toString("hex")); console.log("JWT_REFRESH_SECRET="+c.randomBytes(32).toString("hex"));'

# If you are on your local machine, run this instead:
ssh azure-nebius-portal-vm "
  cd /opt/nebius-portal/backend &&
  node -e 'const c=require(\"crypto\"); console.log(\"JWT_SECRET=\"+c.randomBytes(32).toString(\"hex\")); console.log(\"JWT_REFRESH_SECRET=\"+c.randomBytes(32).toString(\"hex\"));'
"

Then open the .env manually and fill it in:

ssh azure-nebius-portal-vm "vim /opt/nebius-portal/backend/.env"

Paste this template (fill in the <replace> values):

PORT=3001
DB_PATH=/opt/nebius-portal/backend/data/apps.db
SOCKS_PROXY=socks5h://localhost:1080
ALLOWED_HOSTS=worker-0,worker-1,worker-2,worker-3,worker-4,worker-5,worker

JWT_SECRET=<paste output of: node -e "console.log(require('crypto').random
JWT_REFRESH_SECRET=<paste a different output of the same command>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

ADMIN_EMAIL=<your real email>
ADMIN_PASSWORD_HASH=<see command below>

Generate the admin password hash on the VM:

cd /opt/nebius-portal/backend
node -e 'require("bcrypt").hash("m42admin@123", 12).then(console.log).catch(console.error)'

# Paste the output into ADMIN_PASSWORD_HASH in .env

---
Start with pm2

# 7. Run migrations + start
ssh azure-nebius-portal-vm "
  cd /opt/nebius-portal/backend &&
  node -e \"require('./dist/db')\" &&
  pm2 start dist/index.js --name nebius-portal-api &&
  pm2 save
"

# 8. Configure pm2 to survive reboots (run the printed command after this)
ssh azure-nebius-portal-vm "pm2 startup"
# It will print a command like: sudo env PATH=... pm2 startup ...
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u azureuser --hp /home/azureuser
# Copy and run that printed command on the VM

---
Smoke test on the VM

# 9. Verify the backend is up
ssh azure-nebius-portal-vm "curl -s http://localhost:3001/api/health"
expect: {"status":"ok"}

# 10. Test admin login

ssh azure-nebius-portal-vm "
  curl -s -X POST http://localhost:3001/api/admin/login \
    -H 'Content-Type: application/json' \
    -d '{\"email\":\"YOUR_ADMIN_EMAIL\",\"password\":\"YOUR_CHOSEN_PASSWORD\"}'

# expect: "superadmin" in the decoded token

# 11. Test the SOCKS proxy — add the app first, then hit the proxy

sudo apt-get update
sudo apt-get install -y jq


TOKEN=$(curl -s -X POST http://localhost:3001/api/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@nebius-portal.local","password":"m42admin@123"}' | jq -r '.accessToken')
APP_ID=$(curl -s -X POST http://localhost:3001/api/apps \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Test App","host":"worker-0","port":8001,"type":"gradio"}' | jq -r '.app.id')
echo "App ID: $APP_ID"
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/app/$APP_ID/"

# expect: 200 (HTML from worker-0:8001 through the SOCKS tunnel)

---
Re-deploy after code changes

rsync -avz --progress \
  --exclude 'node_modules/' \
  --exclude 'dist/' \
  --exclude 'data/' \
  --exclude '.env' \
  backend/ \
  azure-nebius-portal-vm:/opt/nebius-portal/backend/

ssh azure-nebius-portal-vm "
  cd /opt/nebius-portal/backend &&
  npm ci &&
  npm run build &&
  pm2 restart nebius-portal-api
"

## NGINX
---

# 1. Copy the config to the VM
scp nginx/nebius-portal.conf \
    azure-nebius-portal-vm:/tmp/nebius-portal.conf

# 2. Install nginx, move the config into place, create the web root
ssh azure-nebius-portal-vm "
  sudo apt install -y nginx &&
  sudo mv /tmp/nebius-portal.conf /etc/nginx/sites-available/nebius-portal &&
  sudo ln -s /etc/nginx/sites-available/nebius-portal \
             /etc/nginx/sites-enabled/nebius-portal &&
  sudo rm -f /etc/nginx/sites-enabled/default &&
  sudo mkdir -p /var/www/nebius-portal &&
  sudo nginx -t &&
  sudo systemctl enable nginx &&
  sudo systemctl reload nginx
"

# 3. Verify
curl http://74.243.253.208/api/health
curl http://nebius-portal-vm.uaenorth.cloudapp.azure.com/api/health

ssh azure-nebius-portal-vm "curl -s http://localhost/api/health"

Expected output from step 3: {"status":"ok"} (or whatever your health endpoint returns). If you get a 502, the pm2 process isn't running — ssh azure-nebius-portal-vm "pm2 status" to check.

The map block must live outside the server {} block. Because this conf goes in sites-available/ and is included via include /etc/nginx/sites-enabled/*, which is inside http {}, the placement is correct — the directive is valid there.

Once that curl returns 200, Phase 2 is done. Ready to start Phase 3 (React frontend) whenever you give the go-ahead.


## FRONTEND

Step 1 — build locally:
cd frontend && npm run build && cd ..

Step 2 — ensure the web root exists and is owned by azureuser:
ssh azure-nebius-portal-vm "sudo mkdir -p /var/www/nebius-portal && sudo chown -R azureuser:azureuser /var/www/nebius-portal"

Step 3 — copy the built files to the VM:
scp -r frontend/dist/* azure-nebius-portal-vm:/var/www/nebius-portal/

Step 4 — verify:
curl -s http://nebius-portal-vm.uaenorth.cloudapp.azure.com/api/health

That's it. nginx's try_files $uri $uri/ /index.html directive means all React routes (/login, /signup, /admin, etc.) will serve index.html and let the client-side router take over. The /api/ and /app/ locations bypass that and go straight to Node.js.

Open http://nebius-portal-vm.uaenorth.cloudapp.azure.com/ from mobile data (to bypass Zscaler) and you should see the login page.


## SSL/HTPS
1) ssh azure-nebius-portal-vm "sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx -d nebius-portal-vm.uaenorth.cloudapp.azure.com"

```shell
ssh azure-nebius-portal-vm "sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx -d nebius-portal-vm.uaenorth.cloudapp.azure.com"

WARNING: apt does not have a stable CLI interface. Use with caution in scripts.

Reading package lists...
Building dependency tree...
Reading state information...
certbot is already the newest version (1.21.0-1build1).
python3-certbot-nginx is already the newest version (1.21.0-1).
0 upgraded, 0 newly installed, 0 to remove and 1 not upgraded.
Saving debug log to /var/log/letsencrypt/letsencrypt.log
Enter email address (used for urgent renewal and security notices)
 (Enter 'c' to cancel): musalman@m42.ae

- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
Please read the Terms of Service at
https://letsencrypt.org/documents/LE-SA-v1.7-June-04-2026.pdf. You must agree in
order to register with the ACME server. Do you agree?
- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
(Y)es/(N)o: 
(Y)es/(N)o: Y
Account registered.
Skipped user interaction because Certbot doesn't appear to be running in a terminal. You should probably include --non-interactive or --force-interactive on the command line.
Requesting a certificate for nebius-portal-vm.uaenorth.cloudapp.azure.com

Successfully received certificate.
Certificate is saved at: /etc/letsencrypt/live/nebius-portal-vm.uaenorth.cloudapp.azure.com/fullchain.pem
Key is saved at:         /etc/letsencrypt/live/nebius-portal-vm.uaenorth.cloudapp.azure.com/privkey.pem
This certificate expires on 2026-10-04.
These files will be updated when the certificate renews.
Certbot has set up a scheduled task to automatically renew this certificate in the background.

Deploying certificate
Could not install certificate
NEXT STEPS:
- The certificate was saved, but could not be installed (installer: nginx). After fixing the error shown below, try installing it again by running:
  certbot install --cert-name nebius-portal-vm.uaenorth.cloudapp.azure.com

Could not automatically find a matching server block for nebius-portal-vm.uaenorth.cloudapp.azure.com. Set the `server_name` directive to use the Nginx installer.
Ask for help or search for solutions at https://community.letsencrypt.org. See the logfile /var/log/letsencrypt/letsencrypt.log or re-run Certbot with -v for more details.
```
2) ./deploy.sh nginx

3)  finish the cert install (certbot already has the cert, just needs to wire it into nginx now:
ssh azure-nebius-portal-vm "sudo certbot install --cert-name nebius-portal-vm.uaenorth.cloudapp.azure.com --nginx"






## REDEPLOY — use deploy.sh (repo root)

./deploy.sh                   # all three
./deploy.sh frontend          # React build + scp dist/
./deploy.sh backend           # rsync + npm ci + build + pm2 restart
./deploy.sh nginx             # scp conf + nginx -t + reload
./deploy.sh frontend backend  # any combination

## NGINX REDEPLOY (manual)
scp nginx/nebius-portal.conf azure-nebius-portal-vm:/tmp/nebius-portal.conf
ssh azure-nebius-portal-vm "
  sudo mv /tmp/nebius-portal.conf /etc/nginx/sites-available/nebius-portal &&
  sudo nginx -t &&
  sudo systemctl reload nginx
"

## FRONTEND REDEPLOY (manual)
cd frontend && npm run build && cd ..
scp -r frontend/dist/* azure-nebius-portal-vm:/var/www/nebius-portal/

## BACKEND REDEPLOY (manual)
rsync -avz --progress \
  --exclude 'node_modules/' \
  --exclude 'dist/' \
  --exclude 'data/' \
  --exclude '.env' \
  backend/ \
  azure-nebius-portal-vm:/opt/nebius-portal/backend/

ssh azure-nebius-portal-vm "
  cd /opt/nebius-portal/backend &&
  npm ci &&
  npm run build &&
  pm2 restart nebius-portal-api
"

## NGINX REDEPLOY

scp nginx/nebius-portal.conf azure-nebius-portal-vm:/tmp/nebius-portal.conf
ssh azure-nebius-portal-vm "
  sudo mv /tmp/nebius-portal.conf /etc/nginx/sites-available/nebius-portal &&
  sudo nginx -t &&
  sudo systemctl reload nginx
"


ssh azure-nebius-portal-vm "sudo systemctl status nginx"
ssh azure-nebius-portal-vm "sudo nginx -t && sudo systemctl start nginx"




## Why not Docker

For this specific project, I'd recommend sticking with pm2. Here's the key reason:

The SOCKS tunnel breaks Docker networking. The tunnel runs as a systemd service on the VM host, listening on localhost:1080. Inside a Docker container, localhost is the container — not the VM host — so socks5h://localhost:1080 would fail with ECONNREFUSED. You'd have to either:

- Use network_mode: host (removes all network isolation — the main Docker benefit)
- Change SOCKS_PROXY to socks5h://172.17.0.1:1080 (Docker bridge gateway IP, which can change and doesn't work reliably on all Linux distros)
- Run autossh inside the container itself (now you're managing SSH keys inside Docker, more complexity)

None of those are clean.

Docker would make sense if you had:
- A separate PostgreSQL/Redis service to orchestrate
- Multiple replicas behind a load balancer
- A CI/CD pipeline building and pushing images
- A team of engineers all deploying from different machines

What you actually have:
- One Node.js process + one SQLite file
- One VM
- A SOCKS tunnel that must be on the host network
- One person deploying

pm2 already gives you what Docker would add for this setup: process restart on crash, startup on reboot, log management (pm2 logs), and zero-downtime restarts. The rsync + npm ci + pm2 restart deploy sequence is 3 commands and takes under a minute.

Add Docker when you split off the database or add a second service. Not worth it now.
