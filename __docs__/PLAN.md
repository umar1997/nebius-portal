# PLAN.md — Build Plan
**Version:** 3.0 (final — confirmed architecture)

---

## Current state (what is already done)

- ✅ Azure VM created and running (`nebius-portal-vm`, UAE North)
- ✅ SSH access to VM configured (`azure-nebius-portal-vm` alias)
- ✅ SSH access to Nebius login node configured (`nebius-networking` alias)
- ✅ autossh SOCKS5 tunnel running as systemd service on port 1080
- ✅ Tunnel confirmed working: `curl --socks5 localhost:1080 http://10.62.40.79:8001` returns HTML
- ✅ All 8 worker node IPs confirmed and added to `~/.ssh/config` on the VM
- ✅ Terraform scripts for VM provisioning written and committed to repo

**Start at Phase 1. Everything above is done.**

---

## Phase 1 — Node.js backend (2–3 days) ← START HERE

**Goal:** a backend that stores the app list in SQLite and proxies `/app/{id}/`
requests through the SOCKS5 tunnel to the right worker and port, with remote DNS
resolution so worker hostnames (not IPs) are used.

### 1.1 Project setup on the Azure VM

```bash
sudo apt install -y nodejs npm
sudo npm install -g pm2
mkdir -p /opt/nebius-portal/backend
cd /opt/nebius-portal/backend
npm init -y
npm install express better-sqlite3 socks-proxy-agent http-proxy-agent \
            node-http-proxy cors dotenv
npm install -D typescript @types/express @types/node ts-node
```

### 1.2 SQLite schema

One table:
```sql
CREATE TABLE apps (
  id          TEXT PRIMARY KEY,   -- auto-generated slug, e.g. "abc123"
  name        TEXT NOT NULL,
  host        TEXT NOT NULL,      -- e.g. "worker-0"
  port        INTEGER NOT NULL,
  type        TEXT NOT NULL,      -- "react" | "gradio" | "other"
  description TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);
```

### 1.3 API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/apps` | List all apps |
| `POST` | `/api/apps` | Add an app (validate + allowlist) |
| `PUT` | `/api/apps/:id` | Edit an app |
| `DELETE` | `/api/apps/:id` | Remove an app |
| `GET` | `/api/apps/:id/health` | Check if `host:port` responds via tunnel |
| `ANY` | `/app/:id/*` | Proxy to `host:port` via SOCKS5 (remote DNS) |

### 1.4 The proxy (critical detail)

The proxy must use **remote DNS** — hostname resolution happens on the login node,
not the Azure VM. This handles the Kubernetes IP-change problem.

```ts
import { SocksProxyAgent } from 'socks-proxy-agent';

// socks5h:// = remote DNS resolution (h = hostname)
// socks5://  = local DNS resolution (wrong — worker-0 won't resolve on Azure)
const agent = new SocksProxyAgent('socks5h://localhost:1080');
```

The `h` in `socks5h://` is the entire difference between this working reliably
and breaking every time a pod restarts.

### 1.5 Host allowlist

The POST /api/apps endpoint must reject hosts not in a configured allowlist.
This stops the portal from being used to probe arbitrary internal addresses.

```bash
# In .env
ALLOWED_HOSTS=worker-0,worker-1,worker-2,worker-3,worker-4,worker-5,worker-6,worker-7
SOCKS_PROXY=socks5h://localhost:1080
PORT=3001
DB_PATH=/opt/nebius-portal/backend/data/apps.db
```

### 1.6 Run and verify

```bash
pm2 start dist/index.js --name nebius-portal-api
pm2 save
pm2 startup

# Test
curl http://localhost:3001/api/apps          # returns []
curl -X POST http://localhost:3001/api/apps \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","host":"worker-0","port":8001,"type":"react"}'
# Then visit http://localhost:3001/app/{id}/ — should return HTML from worker-0:8001
```

**Phase 1 is done when:** `curl http://localhost:3001/app/{id}/` returns the
same HTML as `curl --socks5 localhost:1080 http://worker-0:8001`.

---

## Phase 2 — nginx config on the Azure VM (half a day)

**Goal:** nginx routes traffic to the Node.js backend so the portal is accessible
on port 80 (and later 443).

```nginx
# /etc/nginx/sites-available/nebius-portal
server {
    listen 80;

    # Serve the React portal (added in Phase 3)
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

    # App proxy — passes to Node.js which routes through SOCKS tunnel
    location /app/ {
        proxy_pass http://localhost:3001/app/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 600s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/nebius-portal \
           /etc/nginx/sites-enabled/nebius-portal
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

**Phase 2 is done when:** `curl http://<VM-public-IP>/api/apps` returns JSON
and `http://<VM-public-IP>/app/{id}/` returns app HTML.

---

## Phase 3 — React portal UI (2–3 days)

**Goal:** the grid, tiles, and Add App form — connected to the real API.

Build locally on your dev machine, then deploy the built files to the VM.

### Features
- Grid of app tiles, loaded from `GET /api/apps`
- Each tile: name, type badge, description, status dot (green/grey)
- Click tile → opens `/app/{id}/` in a new tab
- Per-tile menu: edit, remove (with confirmation)
- **Add App modal** — fields: name, host (dropdown of worker-0 to worker-7),
  port, type, description
- After saving: banner showing exact `root_path`/`base` value to set on Nebius
- Empty state, loading states, error toasts
- Responsive grid (2 columns mobile, 3–4 columns desktop)

### Deploy to VM

```bash
# On your dev machine
cd frontend
npm run build

# Copy built files to VM
scp -r dist/* azure-nebius-portal-vm:/var/www/nebius-portal/
```

**Phase 3 is done when:** the full portal loads at the VM's public IP, tiles
appear, Add App works, and clicking a tile opens the real app.

---

## Phase 4 — HTTPS + login (1–2 days)

### HTTPS (free)

```bash
# On the Azure VM
sudo certbot --nginx -d nebius-portal-vm.uaenorth.cloudapp.azure.com
```

### Login (oauth2-proxy + Entra ID)

> Skip this phase if no Entra ID tenant is available — use basic auth as a
> temporary measure and revisit.

```bash
# Install oauth2-proxy
wget https://github.com/oauth2-proxy/oauth2-proxy/releases/download/v7.6.0/\
oauth2-proxy-v7.6.0.linux-amd64.tar.gz
tar xf oauth2-proxy-*.tar.gz
sudo mv oauth2-proxy-*/oauth2-proxy /usr/local/bin/
```

Register an app in Azure Entra ID, set redirect URI to
`https://<your-dns>/oauth2/callback`, then configure oauth2-proxy to sit
in front of nginx.

**Phase 4 is done when:** the portal requires a Microsoft sign-in and only
your org's accounts can get through.

---

## Phase 5 — Handover (half a day)

- [ ] Confirm README matches what was built
- [ ] Document all live apps and their `root_path`/`base` values
- [ ] Write "how to add a new app" one-pager for the team
- [ ] Confirm `pm2 startup` is set so backend survives VM reboots
- [ ] Confirm systemd tunnel service is enabled (`systemctl is-enabled nebius-tunnel`)

---

## Timeline

| Phase | Work |
|-------|------|
| 1 — Node.js backend + SOCKS proxy | 2–3 days |
| 2 — nginx config | 0.5 day |
| 3 — React UI | 2–3 days |
| 4 — HTTPS + login | 1–2 days |
| 5 — Handover | 0.5 day |
| **Total** | **~6–9 working days** |

Phases 0–tunnel setup are already complete — the original estimate was 8–12 days.

---

## Things most likely to go wrong

| Problem | Cause | Fix |
|---------|-------|-----|
| `/app/{id}/` returns HTML but app looks broken | `root_path`/`base` not set on Nebius app | Set it on the worker — one line |
| Gradio loads but doesn't respond | WebSocket not forwarding through proxy | Ensure Node.js proxy forwards `Upgrade` header |
| `worker-0` doesn't resolve | Using `socks5://` not `socks5h://` | Change to `socks5h://` in `socks-proxy-agent` |
| App list gone after VM restart | pm2 not configured to autostart | Run `pm2 startup` and follow the printed command |
| Tunnel drops and doesn't recover | autossh misconfigured | Check `systemctl status nebius-tunnel` and `journalctl -u nebius-tunnel` |