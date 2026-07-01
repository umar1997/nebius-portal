# nebius-portal

An internal web portal for your team to find and open applications running on
Nebius worker nodes. No SSH, no remembering ports. Open the portal, click a tile,
the app opens.

---

## How it works

```
Browser (team member)
        │
        │  HTTPS — must sign in with work account
        ▼
  Azure VM  (nginx + oauth2-proxy)
        │
        │  direct internal connection
        ▼
  Nebius worker-0  (nginx)
        ├──► app on port 8001  (this node)
        ├──► app on port 8002  (this node)
        └──► worker-1:9001     (another node, Nebius internal network)
```

The **Azure VM** is a thin front door — it handles login and passes traffic
through. The **worker node** does everything else: serves the portal UI, manages
the app list, and routes to the right app.

The worker node can reach other Nebius nodes over the internal network, so adding
an app on another node works the same as adding one on worker-0.

---

## Repo structure

```
nebius-portal/
├── frontend/               # React portal UI (Vite + TypeScript + Tailwind)
│   ├── src/
│   │   ├── components/     # AppGrid, AppTile, AddAppModal, StatusDot, ...
│   │   ├── api/            # calls to /api/apps
│   │   └── App.tsx
│   └── vite.config.ts
├── backend/                # Node.js + Express — app list API
│   ├── src/
│   │   ├── index.ts        # starts the server
│   │   ├── routes/apps.ts  # GET/POST/PUT/DELETE /api/apps
│   │   ├── resolve.ts      # /internal/resolve/:id/:path (dynamic proxy)
│   │   ├── db.ts           # SQLite setup
│   │   └── allowlist.ts    # permitted hosts check
│   └── package.json
├── nginx/
│   ├── worker.conf         # nginx config for the Nebius worker node
│   └── vm.conf             # nginx config for the Azure VM
└── README.md
```

---

## The one thing every app must have configured

When an app is shown under `/app/something/`, the app must know it lives at that
path or it loads broken (no styling, dead buttons). You fix this once per app:

### Gradio apps
```python
demo.launch(
    server_name="0.0.0.0",
    server_port=8001,
    root_path="/app/<your-app-id>",   # shown in the portal after you add the app
)
```

### React apps
```ts
// vite.config.ts
export default defineConfig({
  base: '/app/<your-app-id>/',
})
```
```tsx
// if using React Router
<BrowserRouter basename="/app/<your-app-id>">
```

Keep a record of every app's ID and its corresponding `root_path`/`base` value.
The portal shows the exact value to copy after you save a new app.

---

## Setting up the worker node

### 1. Install dependencies

```bash
# nginx
sudo apt update && sudo apt install -y nginx

# Node.js (LTS)
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs

# pm2 (keeps the backend running)
sudo npm install -g pm2

# SQLite
sudo apt install -y sqlite3
```

### 2. Configure nginx on the worker

Copy `nginx/worker.conf` to `/etc/nginx/sites-available/nebius-portal` and
symlink it:

```bash
sudo ln -s /etc/nginx/sites-available/nebius-portal \
           /etc/nginx/sites-enabled/nebius-portal
sudo nginx -t        # check for errors
sudo systemctl reload nginx
```

The config does three things:
- Serves the built React app from `/var/www/nebius-portal/`
- Proxies `/api/` to the Node.js backend on `localhost:3001`
- Proxies `/app/:id/` dynamically through the Node.js resolver

```nginx
# nginx/worker.conf
server {
    listen 8080;

    # Serve the React portal
    root /var/www/nebius-portal;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }

    # App list API
    location /api/ {
        proxy_pass http://localhost:3001/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Dynamic app routing — the Node backend resolves ID to host:port
    location ~ ^/app/([^/]+)(/.*)?$ {
        proxy_pass http://localhost:3001/internal/resolve/$1$2$is_args$args;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 600s;
    }
}
```

### 3. Run the backend

```bash
cd /opt/nebius-portal/backend
npm install
cp .env.example .env    # fill in the values (see Environment variables below)
pm2 start dist/index.js --name nebius-portal-api
pm2 save                # remember this process across reboots
pm2 startup             # set pm2 to start on boot (follow the printed command)
```

### 4. Deploy the frontend

```bash
# On your development machine:
cd frontend
npm install
npm run build           # produces frontend/dist/

# Copy to the worker:
scp -r dist/* msalman@<worker-ip>:/var/www/nebius-portal/
```

---

## Setting up the Azure VM

### 1. Install nginx

```bash
sudo apt update && sudo apt install -y nginx
```

### 2. Configure nginx on the VM

Copy `nginx/vm.conf` to `/etc/nginx/sites-available/nebius-portal`:

```nginx
# nginx/vm.conf
server {
    listen 80;

    location / {
        proxy_pass http://<worker-ip>:8080/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 600s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/nebius-portal \
           /etc/nginx/sites-enabled/nebius-portal
sudo nginx -t
sudo systemctl reload nginx
```

### 3. Open the firewall

In the Azure portal, go to your VM → Networking → Add inbound port rules for
port 80 and port 443.

### 4. Add HTTPS (free certificate)

```bash
sudo apt install -y certbot python3-certbot-nginx

# First, set up a DNS label for your VM in the Azure portal:
# VM → Overview → DNS name → Configure → add a label
# You get a free address like: myportal.uksouth.cloudapp.azure.com

sudo certbot --nginx -d myportal.uksouth.cloudapp.azure.com
```

Certbot updates the nginx config automatically and sets up auto-renewal.

### 5. Add login (Microsoft work account)

Install `oauth2-proxy` to require sign-in before the portal loads:

```bash
# Download oauth2-proxy (check https://github.com/oauth2-proxy/oauth2-proxy/releases
# for the latest version)
wget https://github.com/oauth2-proxy/oauth2-proxy/releases/download/v7.6.0/\
oauth2-proxy-v7.6.0.linux-amd64.tar.gz
tar xf oauth2-proxy-*.tar.gz
sudo mv oauth2-proxy-*/oauth2-proxy /usr/local/bin/

# Register an app in Azure Entra ID (takes ~10 min in the Azure portal):
# Azure Active Directory → App registrations → New registration
# Redirect URI: https://<your-dns-name>/oauth2/callback
# After registering, note: Application (client) ID, Directory (tenant) ID
# Create a client secret under Certificates & Secrets

# Create the config file
sudo tee /etc/oauth2-proxy.cfg <<EOF
provider = "azure"
azure_tenant = "<your-tenant-id>"
client_id = "<your-client-id>"
client_secret = "<your-client-secret>"
redirect_url = "https://<your-dns-name>/oauth2/callback"
oidc_issuer_url = "https://login.microsoftonline.com/<your-tenant-id>/v2.0"
upstreams = ["http://localhost:8080/"]
email_domains = ["<your-org-domain.com>"]
cookie_secret = "<32-random-characters>"  # generate: openssl rand -base64 32
http_address = "0.0.0.0:4180"
EOF

# Run as a service
sudo tee /etc/systemd/system/oauth2-proxy.service <<EOF
[Unit]
Description=oauth2-proxy
After=network.target

[Service]
ExecStart=/usr/local/bin/oauth2-proxy --config=/etc/oauth2-proxy.cfg
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable --now oauth2-proxy
```

Then update nginx on the VM to pass requests through oauth2-proxy instead of
directly to the worker. The `nginx/vm.conf` in the repo includes the full
oauth2-proxy integration block.

---

## Environment variables (backend `.env`)

```bash
PORT=3001
DB_PATH=/opt/nebius-portal/backend/data/apps.db

# Comma-separated list of hosts the portal is allowed to proxy to.
# Any host not on this list is rejected when a user tries to add an app.
ALLOWED_HOSTS="worker-0,10.0.0.5,172.16.0.10"

# Optional: shown as the default host in the Add App form
DEFAULT_WORKER_HOST="worker-0"
```

---

## API reference

| Method | Path | What it does |
|--------|------|-------------|
| `GET` | `/api/apps` | List all apps |
| `POST` | `/api/apps` | Add an app |
| `PUT` | `/api/apps/:id` | Edit an app |
| `DELETE` | `/api/apps/:id` | Remove an app |
| `GET` | `/api/apps/:id/health` | Check if app host:port is reachable |
| `ANY` | `/internal/resolve/:id/*` | Internal — resolves app ID to host:port and proxies |

---

## Adding an app (what a team member does)

1. Click **Add app** in the portal
2. Fill in: Name, Host (e.g. `worker-0` or `172.16.0.12`), Port (e.g. `8001`),
   Type (React / Gradio / Other), Description (optional)
3. Click Save — the tile appears immediately for everyone
4. Copy the `root_path`/`base` value shown in the confirmation and set it in
   the backend app (see "The one thing every app must have configured" above)

---

## Updating the portal

### Update the frontend
```bash
# On your dev machine
cd frontend && npm run build
scp -r dist/* msalman@<worker-ip>:/var/www/nebius-portal/
```

### Update the backend
```bash
# On the worker node
cd /opt/nebius-portal/backend
git pull
npm install
npm run build
pm2 restart nebius-portal-api
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| App opens but looks broken / unstyled | `root_path` or `base` not set | Set it in the app itself — see the section above |
| Gradio loads but doesn't respond | WebSocket not forwarding | Check the `Upgrade` / `Connection` headers in nginx config |
| Grey status dot on a tile | Worker can't reach that host:port | Check the host and port values, and that the app is actually running |
| "Host not allowed" when adding an app | Host not in `ALLOWED_HOSTS` | Add it to `.env` and restart the backend with `pm2 restart nebius-portal-api` |
| Portal loads on VM but team can't access it | Firewall blocking port 80/443 | Check Azure Network Security Group — add inbound rules for 80 and 443 |
| Portal works but login page never appears | oauth2-proxy not running | `sudo systemctl status oauth2-proxy` — check the logs |
| App list gone after worker restart | pm2 not set to autostart | Run `pm2 startup` and follow the printed command, then `pm2 save` |