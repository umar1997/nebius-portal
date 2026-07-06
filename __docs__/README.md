# nebius-portal

Internal web portal for finding and opening applications running on Nebius
worker nodes. No SSH, no remembering ports. Open the portal, click a tile,
the app opens.

---

## How it works

```
Browser → Azure VM nginx → Node.js backend → SOCKS5 tunnel → Nebius worker:PORT
```

The Azure VM runs three things:
1. **nginx** — serves the React portal and routes traffic to the backend
2. **Node.js backend** — manages the app list in SQLite and proxies app requests
   through the SOCKS5 tunnel
3. **autossh** — holds a permanent SOCKS5 tunnel (port 1080) to the Nebius login
   node, which forwards traffic to any worker node on the internal network

Adding a new app is a form submission. No tunnel restarts, no config file edits.

---

## Infrastructure

| Resource | Detail |
|----------|--------|
| Azure VM | `nebius-portal-vm`, UAE North, Standard_B2s |
| Nebius login node | `89.169.98.29`, SSH alias `nebius-networking` |
| SOCKS5 tunnel | autossh `-D 1080`, runs as systemd service `nebius-tunnel` |
| Worker nodes | worker-0 through worker-7 (see IPs in PROJ_SPEC.md) |

### SSH aliases on the Azure VM (`~/.ssh/config`)

```
Host nebius-networking
    HostName 89.169.98.29
    User networking
    IdentityFile ~/.ssh/nebius_id_rsa

Host worker-0
    HostName 10.62.40.79

Host worker-1
    HostName 10.62.8.22

Host worker-2
    HostName 10.62.12.71

Host worker-3
    HostName 10.62.134.28

Host worker-4
    HostName 10.62.5.94

Host worker-5
    HostName 10.62.115.41

Host worker-6
    HostName 10.62.26.144

Host worker-7
    HostName 10.62.116.171
```

---

## Repo structure

```
nebius-portal/
├── __docs__/
│   ├── PROJ_SPEC.md
│   ├── PLAN.md
│   └── README.md
├── frontend/               # React + Vite + TypeScript + Tailwind
│   ├── src/
│   │   ├── components/
│   │   │   ├── AppGrid.tsx
│   │   │   ├── AppTile.tsx
│   │   │   ├── AddAppModal.tsx
│   │   │   └── StatusDot.tsx
│   │   ├── api/            # calls to /api/apps
│   │   └── App.tsx
│   └── vite.config.ts
├── backend/                # Node.js + Express
│   ├── src/
│   │   ├── index.ts
│   │   ├── routes/apps.ts
│   │   ├── proxy.ts        # SOCKS5 proxy handler
│   │   ├── db.ts           # SQLite
│   │   └── allowlist.ts
│   ├── .env.example
│   └── package.json
├── nginx/
│   └── nebius-portal.conf  # nginx config for the Azure VM
├── terraform/              # Azure VM provisioning
└── README.md
```

---

## The one thing every Nebius app must have

When an app is shown under `/app/{id}/`, the app must know it lives at that path
or it renders with broken styling and dead buttons.

### Gradio apps
```python
demo.launch(
    server_name="0.0.0.0",
    server_port=8001,
    root_path="/app/{id}",   # shown in the portal after you add the app
)
```

### React apps (Vite)
```ts
// vite.config.ts
export default defineConfig({
  base: '/app/{id}/',
})
```
```tsx
// if using React Router
<BrowserRouter basename="/app/{id}">
```

The portal shows the exact value to copy after you save a new app. Apply it on
the Nebius worker and restart the app. One time, per app.

---

## Adding a new app

1. Click **Add app** in the portal
2. Fill in: Name, Host (worker-0 through worker-7), Port, Type, Description
3. Save — tile appears immediately for everyone
4. Copy the `root_path`/`base` value shown in the confirmation banner
5. SSH into the worker and apply that value to the app, then restart it
6. Refresh the portal — the app loads correctly

---

## Environment variables (backend `.env`)

```bash
PORT=3001
DB_PATH=/opt/nebius-portal/backend/data/apps.db

# socks5h:// = remote DNS (the h matters — worker-0 resolves on the login node)
# Do NOT use socks5:// — worker hostnames don't resolve on the Azure VM
SOCKS_PROXY=socks5h://localhost:1080

# Hosts users are allowed to add. Any other host is rejected.
ALLOWED_HOSTS=worker-0,worker-1,worker-2,worker-3,worker-4,worker-5,worker-6,worker-7
```

---

## API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/apps` | List all apps |
| `POST` | `/api/apps` | Add an app |
| `PUT` | `/api/apps/:id` | Edit an app |
| `DELETE` | `/api/apps/:id` | Remove an app |
| `GET` | `/api/apps/:id/health` | Check reachability via tunnel |
| `ANY` | `/app/:id/*` | Proxy to worker:port via SOCKS5 tunnel |

---

## Deploying the frontend

```bash
# On your dev machine
cd frontend
npm install
npm run build

# Deploy to the VM
scp -r dist/* azure-nebius-portal-vm:/var/www/nebius-portal/
```

---

## Managing the backend on the VM

```bash
# View logs
pm2 logs nebius-portal-api

# Restart after a code change
pm2 restart nebius-portal-api

# Check status
pm2 status
```

---

## Managing the tunnel

```bash
# Check tunnel is running
sudo systemctl status nebius-tunnel

# View tunnel logs
journalctl -u nebius-tunnel -f

# Restart tunnel (rarely needed — autossh handles drops automatically)
sudo systemctl restart nebius-tunnel

# Verify SOCKS proxy is listening
nc -zv localhost 1080

# Test a specific worker through the tunnel (use worker hostname, not IP)
curl --socks5h localhost:1080 http://worker-0:8001
```

---

## Adding a new worker node

When a new worker node is added to Nebius:

1. Get its IP from the login node:
   ```bash
   ssh nebius-networking "getent hosts worker-8"
   ```

2. Add it to `~/.ssh/config` on the Azure VM:
   ```
   Host worker-8
       HostName <ip>
   ```

3. Add `worker-8` to `ALLOWED_HOSTS` in the backend `.env`

4. Restart the backend:
   ```bash
   pm2 restart nebius-portal-api
   ```

The tunnel does **not** need to be restarted — SOCKS5 covers all hosts
automatically.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| App loads but looks broken | `root_path`/`base` not set on the Nebius app | Set it on the worker — see above |
| Gradio loads but doesn't respond | WebSocket not forwarding | Check `Upgrade` header is passed in nginx and Node.js proxy |
| `worker-0` hostname not resolving | Using `socks5://` not `socks5h://` | Fix `SOCKS_PROXY` in `.env` — the `h` is not optional |
| Tunnel down, apps unreachable | autossh service crashed | `sudo systemctl restart nebius-tunnel` |
| App list empty after VM restart | pm2 not set to autostart | `pm2 startup` → follow printed command → `pm2 save` |
| New app returns 502 | App not running on that port | SSH to worker, confirm app is running |
| Port 1080 connection refused | Tunnel not running | `sudo systemctl start nebius-tunnel` |

---

## Terraform (VM provisioning)

The `terraform/` directory provisions the Azure VM from scratch.
See `terraform/README.md` for instructions.
All infrastructure is tagged `project=nebius-portal` in Azure.