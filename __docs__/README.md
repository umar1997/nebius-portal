# nebius-portal

Internal web portal for finding and opening applications running on Nebius worker
nodes. Users log in, see app tiles, and open apps without SSH or remembering
ports.

---

## How it works

```text
Browser -> Azure VM nginx -> Node.js backend -> SOCKS5 tunnel -> Nebius worker:PORT
```

The Azure VM runs:

1. `nginx`, which serves the React SPA and routes `/api/` plus `/app/`.
2. A Node.js backend on `localhost:3001`, managed by pm2 as
   `nebius-portal-api`.
3. An `autossh -D 1080` SOCKS5 tunnel to the Nebius login node, managed by
   systemd as `nebius-tunnel`.

Adding a new app is a database write through the portal UI. The tunnel does not
need to be changed or restarted for each app.

---

## Infrastructure

| Resource | Detail |
|---|---|
| Azure VM | `nebius-portal-vm`, UAE North, Standard_B2s |
| Public IP | `74.243.253.208` |
| DNS name | `nebius-portal-vm.uaenorth.cloudapp.azure.com` |
| VM SSH alias | `azure-nebius-portal-vm` |
| Nebius login node | `89.169.98.29`, SSH alias `nebius-networking` |
| SOCKS5 tunnel | `autossh -D 1080`, service `nebius-tunnel` |
| Worker nodes | `worker-0` through `worker-7` |

Worker pod IPs can rotate. Use hostnames like `worker-0` in app records.

---

## Repo structure

```text
nebius-portal/
  __docs__/
    PROJ_SPEC.md      Architecture and project invariants
    MEMORY.md         Current continuation guide
    README.md         This operator-facing overview
    AUTH_SPEC.md      Implemented auth/admin behavior
    PLAN.md           Status, remaining work, and runbook
    SET_UP.md         Terraform and tunnel setup notes
    VM_SET_UP.md      VM setup and deployment notes
  backend/
    src/
      index.ts
      db.ts
      allowlist.ts
      proxy.ts
      middleware/auth.ts
      routes/auth.ts
      routes/admin.ts
      routes/apps.ts
    .env.example
    package.json
  frontend/
    src/
      App.tsx
      lib/api.ts
      components/
      pages/
      stores/
    package.json
    vite.config.ts
  nginx/
    nebius-portal.conf
  terraform/
  deploy.sh
```

---

## Local development

Install dependencies in each app directory:

```bash
cd backend && npm install
cd ../frontend && npm install
```

Backend:

```bash
npm --prefix backend run dev
npm --prefix backend run typecheck
npm --prefix backend run build
```

Frontend:

```bash
npm --prefix frontend run dev
npm --prefix frontend run build
```

The frontend API client calls relative `/api/*` paths. In production nginx routes
those to the backend.

---

## Backend environment

Use `backend/.env.example` as the template.

```bash
PORT=3001
DB_PATH=/opt/nebius-portal/backend/data/apps.db
SOCKS_PROXY=socks5h://localhost:1080
ALLOWED_HOSTS=worker-0,worker-1,worker-2,worker-3,worker-4,worker-5,worker-6,worker-7

JWT_SECRET=<64 hex chars>
JWT_REFRESH_SECRET=<64 hex chars, different from JWT_SECRET>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

ADMIN_EMAIL=<admin email>
ADMIN_PASSWORD_HASH=<bcrypt hash, cost 12>
```

Important: `socks5h://` is required. The `h` makes DNS resolution happen through
the Nebius login node, where `worker-0` hostnames resolve.

Generate admin password hash on the VM:

```bash
cd /opt/nebius-portal/backend
node -e 'require("bcrypt").hash("your-password", 12).then(console.log)'
```

---

## Routes

### Frontend routes

| Path | Purpose |
|---|---|
| `/login` | User login |
| `/signup` | User registration |
| `/` | Protected app grid |
| `/admin` | Admin login |
| `/admin/dashboard` | Protected admin dashboard |
| `/admin/users` | Protected user approval and management |

### API routes

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/auth/signup` | Create pending user |
| `POST` | `/api/auth/login` | Login approved user |
| `POST` | `/api/auth/refresh` | Refresh access token |
| `POST` | `/api/auth/logout` | Revoke user refresh token |
| `GET` | `/api/auth/me` | Current user |
| `POST` | `/api/admin/login` | Env-backed admin login |
| `GET` | `/api/admin/users` | List all users |
| `GET` | `/api/admin/users/pending` | List pending users |
| `PATCH` | `/api/admin/users/:id/approve` | Approve user |
| `PATCH` | `/api/admin/users/:id/reject` | Reject user |
| `DELETE` | `/api/admin/users/:id` | Delete user |
| `GET` | `/api/admin/notifications/count` | Pending-user count |
| `GET` | `/api/apps` | List apps |
| `POST` | `/api/apps` | Add app |
| `PUT` | `/api/apps/:id` | Update app |
| `DELETE` | `/api/apps/:id` | Remove app |
| `GET` | `/api/apps/:id/health` | Probe app through SOCKS tunnel |
| `ANY` | `/app/:id/*` | Proxy to worker app through SOCKS tunnel |

`/api/apps` and `/app/` require a user JWT. Admin routes require a superadmin
JWT.

---

## Adding a new app

1. Log in to the portal.
2. Click **Add app**.
3. Enter name, host (`worker-0` through `worker-7`), port, type, and description.
4. Save the app. The backend creates an 8-character app id.
5. Configure the app on Nebius to live under `/app/{id}`.
6. Restart the Nebius app and open the tile from the portal.

The portal proxy preserves the `/app/{id}` path. Apps must be configured for
that path or static assets and routing can break.

### Gradio apps

```python
demo.launch(
    server_name="0.0.0.0",
    server_port=8001,
    root_path="/app/{id}",
)
```

### React/Vite apps

```ts
// vite.config.ts
export default defineConfig({
  base: "/app/{id}/",
})
```

```tsx
<BrowserRouter basename="/app/{id}">
```

---

## Deployment

Use the repo-level helper:

```bash
./deploy.sh frontend
./deploy.sh backend
./deploy.sh nginx
./deploy.sh
```

Deploy targets:

| Target | What it does |
|---|---|
| `frontend` | Builds `frontend/` and uploads `frontend/dist/*` to `/var/www/nebius-portal/` |
| `backend` | Rsyncs backend source, installs deps, builds, restarts pm2 |
| `nginx` | Uploads `nginx/nebius-portal.conf`, tests config, reloads nginx |
| no args | Runs frontend, backend, and nginx deployment |

---

## Operations

Backend:

```bash
ssh azure-nebius-portal-vm "pm2 status"
ssh azure-nebius-portal-vm "pm2 logs nebius-portal-api --lines 50"
ssh azure-nebius-portal-vm "pm2 restart nebius-portal-api"
```

Tunnel:

```bash
ssh azure-nebius-portal-vm "sudo systemctl status nebius-tunnel"
ssh azure-nebius-portal-vm "journalctl -u nebius-tunnel -n 100 --no-pager"
ssh azure-nebius-portal-vm "curl --socks5h localhost:1080 http://worker-0:8001"
```

Public smoke checks:

```bash
curl -s http://nebius-portal-vm.uaenorth.cloudapp.azure.com/api/health
curl -s http://74.243.253.208/api/health
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| App loads without styling or broken buttons | App is not configured for `/app/{id}` | Set Gradio `root_path` or Vite `base`/router basename |
| Worker hostname does not resolve | Using `socks5://` or local DNS | Use `socks5h://localhost:1080` |
| App returns 502 | Worker app is down, wrong port, or tunnel is down | Check app process, port, and `nebius-tunnel` |
| New host rejected | Host missing from `ALLOWED_HOSTS` | Add hostname to env and restart backend |
| Backend 502 through nginx | pm2 process is down | Check `pm2 status` and backend logs |
| Frontend route 404s | nginx SPA fallback missing or stale config | Deploy `nginx/nebius-portal.conf` and reload nginx |

---

## Related docs

- `__docs__/PROJ_SPEC.md`: architecture and invariants.
- `__docs__/AUTH_SPEC.md`: auth and admin approval details.
- `__docs__/MEMORY.md`: current continuation guide.
- `__docs__/PLAN.md`: status, remaining work, and operations checklist.
- `__docs__/SET_UP.md`: Terraform, SSH, and tunnel setup.
- `__docs__/VM_SET_UP.md`: VM deployment runbook.
