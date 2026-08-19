# MEMORY.md - Project State & Continuation Guide

**Last updated:** 2026-07-13
**Session state:** Backend, JWT auth/admin approval, React frontend, nginx config, and deploy helper exist in the repo. VM setup docs are intentionally separate.

---

## What this project is

Nebius Portal is an internal web portal hosted on an Azure VM. It lets the team
find and open ML applications running on Nebius GPU worker nodes without SSH,
manual port tracking, or per-app tunnel changes.

Traffic flow:

```text
Browser
  -> Azure VM nginx
  -> Node.js backend on localhost:3001
  -> SOCKS5 tunnel on localhost:1080
  -> Nebius worker host and port
```

The core trick is `socks5h://`: worker hostnames resolve through the Nebius login
node, not on the Azure VM. Use worker hostnames like `worker-0`, not pod IPs.

---

## Current state

### Implemented in repo

- `backend/`: Node.js + Express + TypeScript API.
- `backend/src/db.ts`: SQLite schema creation for `apps`, `users`, and `refresh_tokens`.
- `backend/src/routes/apps.ts`: app CRUD plus health checks through the SOCKS tunnel.
- `backend/src/routes/auth.ts`: signup, login, refresh, logout, and current-user routes.
- `backend/src/routes/admin.ts`: env-backed admin login and user approval management.
- `backend/src/proxy.ts`: HTTP and WebSocket proxy for `/app/:id/*`.
- `frontend/`: React 18 + Vite + TypeScript + Tailwind portal UI.
- `frontend/src/lib/api.ts`: API client for auth, admin, and apps.
- `frontend/src/stores/`: Zustand stores for user auth, admin auth, and toasts.
- `nginx/nebius-portal.conf`: nginx config for static frontend, `/api/`, and `/app/`.
- `deploy.sh`: deploy helper for frontend, backend, nginx, or all targets.
- `terraform/`: Azure VM provisioning.

### Live infrastructure

Do not re-provision unless explicitly asked.

| Resource | Detail |
|---|---|
| Azure VM | `nebius-portal-vm`, UAE North, Standard_B2s |
| VM public IP | `74.243.253.208` |
| DNS name | `nebius-portal-vm.uaenorth.cloudapp.azure.com` |
| SSH alias | `azure-nebius-portal-vm` |
| Nebius login node | `89.169.98.29`, SSH alias `nebius-networking` |
| SOCKS5 tunnel | `autossh -D 1080`, systemd service `nebius-tunnel` |
| Backend on VM | `/opt/nebius-portal/backend`, pm2 process `nebius-portal-api` |
| Web root on VM | `/var/www/nebius-portal` |
| Worker nodes | `worker-0` through `worker-7`; use hostnames, not IPs |

---

## Backend map

```text
backend/
  src/
    index.ts              Express entrypoint, route mounting, WS upgrade handler
    db.ts                 SQLite connection and CREATE TABLE IF NOT EXISTS
    allowlist.ts          Reads ALLOWED_HOSTS and validates worker hosts
    proxy.ts              HTTP and WebSocket proxy via SocksProxyAgent
    migrate.ts            DB inspection helper
    lib/tokens.ts         JWT verification and refresh-token hashing helpers
    middleware/auth.ts    requireAuth and requireAdmin middleware
    routes/auth.ts        /api/auth/signup, login, refresh, logout, me
    routes/admin.ts       /api/admin/login and admin user management
    routes/apps.ts        /api/apps CRUD and app health checks
```

Backend scripts:

```bash
npm --prefix backend run dev
npm --prefix backend run typecheck
npm --prefix backend run build
npm --prefix backend run start
```

---

## Frontend map

```text
frontend/
  src/
    App.tsx                    React Router routes and session restore
    lib/api.ts                 API request wrapper and typed API helpers
    pages/AppGrid.tsx          Main app tile grid
    pages/LoginPage.tsx        User login
    pages/SignupPage.tsx       User signup
    pages/admin/*              Admin login, dashboard, user management
    components/*               Route guards, sidebars, tiles, modal, toast
    stores/useAuthStore.ts     User access token and current user in memory
    stores/useAdminStore.ts    Admin access token in memory
    stores/useToastStore.ts    Toast state
```

Frontend scripts:

```bash
npm --prefix frontend run dev
npm --prefix frontend run build
npm --prefix frontend run preview
```

---

## Database schema

SQLite lives at `DB_PATH`. On the VM, use:

```bash
DB_PATH=/opt/nebius-portal/backend/data/apps.db
```

Current tables:

```sql
CREATE TABLE IF NOT EXISTS apps (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  host        TEXT NOT NULL,
  port        INTEGER NOT NULL,
  type        TEXT NOT NULL,
  description TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',
  status        TEXT NOT NULL DEFAULT 'pending',
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  token_hash  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

---

## API summary

### Public

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Backend health check |
| `POST` | `/api/auth/signup` | Register user as `pending` |
| `POST` | `/api/auth/login` | Login approved user |
| `POST` | `/api/auth/refresh` | Issue a new access token |
| `POST` | `/api/admin/login` | Login env-backed superadmin |

### User JWT required

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/logout` | Delete refresh-token hash |
| `GET` | `/api/auth/me` | Current user profile |
| `GET` | `/api/apps` | List apps |
| `POST` | `/api/apps` | Add app, enforcing `ALLOWED_HOSTS` |
| `PUT` | `/api/apps/:id` | Update app, enforcing `ALLOWED_HOSTS` |
| `DELETE` | `/api/apps/:id` | Remove app |
| `GET` | `/api/apps/:id/health` | Probe app through SOCKS tunnel |
| `ANY` | `/app/:id/*` | Proxy app traffic through SOCKS tunnel |

### Admin JWT required

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/admin/users` | List all users |
| `GET` | `/api/admin/users/pending` | List pending users |
| `PATCH` | `/api/admin/users/:id/approve` | Approve user |
| `PATCH` | `/api/admin/users/:id/reject` | Reject user |
| `DELETE` | `/api/admin/users/:id` | Delete user |
| `GET` | `/api/admin/notifications/count` | Pending-user count |

---

## Critical constraints

1. Use `socks5h://localhost:1080`, not `socks5://localhost:1080`. The `h`
   means remote DNS resolution through the Nebius login node.
2. Store app hosts as `worker-0` through `worker-7`. Do not store pod IPs in
   app records unless the user explicitly accepts the rotation risk.
3. `ALLOWED_HOSTS` controls which worker hostnames users can add or edit.
4. Every proxied app must be configured for `/app/{id}`:
   - Gradio: `demo.launch(root_path="/app/{id}")`
   - Vite: `base: "/app/{id}/"`
   - React Router: `basename="/app/{id}"`
5. Admin credentials come only from env vars: `ADMIN_EMAIL` and
   `ADMIN_PASSWORD_HASH`. There is no admin row in SQLite.
6. User refresh tokens are stored only as SHA-256 hashes. Admin refresh tokens
   are signed JWTs and are not stored in SQLite.
7. Frontend access tokens live in Zustand memory. The current frontend stores
   the user refresh token in `localStorage` for page reload restore.
8. Do not commit `.env`, SQLite data, Terraform state, `node_modules`, or build
   artifacts.

---

## Deployment quick reference

Use `deploy.sh` from repo root:

```bash
./deploy.sh frontend
./deploy.sh backend
./deploy.sh nginx
./deploy.sh
```

What it does:

- `frontend`: runs `npm run build` in `frontend/`, then uploads `frontend/dist/*`
  to `/var/www/nebius-portal/`.
- `backend`: rsyncs source to `/opt/nebius-portal/backend`, runs `npm ci`,
  builds, restarts `nebius-portal-api`, and saves pm2 state.
- `nginx`: uploads `nginx/nebius-portal.conf`, runs `nginx -t`, reloads nginx.

Useful VM checks:

```bash
curl -s http://nebius-portal-vm.uaenorth.cloudapp.azure.com/api/health
ssh azure-nebius-portal-vm "pm2 status"
ssh azure-nebius-portal-vm "sudo systemctl status nebius-tunnel"
ssh azure-nebius-portal-vm "curl --socks5h localhost:1080 http://worker-0:8001"
```

---

## Start every new coding session

From repo root:

```bash
pwd
git status --short
git diff --stat
ls -la __docs__ backend frontend nginx terraform
npm --prefix backend pkg get scripts
npm --prefix frontend pkg get scripts
```

Then read the file you are about to change. Do not rely on this memory file
alone; verify current source and deployed commands before making changes.
