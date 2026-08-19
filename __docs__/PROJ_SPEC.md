# PROJ_SPEC - Nebius Portal

**Version:** 4.0
**Repo:** `nebius-portal`
**Updated:** 2026-07-13

---

## 1. What this is

Nebius Portal is an internal web portal hosted on an Azure VM. It gives the team
one place to find and open applications running on Nebius worker nodes.

Users log in, view a grid of app tiles, and click a tile to open the app in a
new tab. Approved users can add, update, and remove app records through the UI.
The app list is stored in SQLite on the VM.

The portal exists to remove per-user SSH and port-memory work. Adding an app
should be a UI action, not a tunnel or nginx change.

---

## 2. Confirmed infrastructure

| Piece | Detail | Status |
|---|---|---|
| Azure VM | `nebius-portal-vm`, UAE North, Standard_B2s | Running |
| Public IP | `74.243.253.208` | Assigned |
| DNS name | `nebius-portal-vm.uaenorth.cloudapp.azure.com` | Assigned |
| VM SSH alias | `azure-nebius-portal-vm` | Configured |
| Nebius login node | `89.169.98.29`, alias `nebius-networking` | Reachable |
| SOCKS5 tunnel | `autossh -D 1080` | systemd service `nebius-tunnel` |
| Backend | Node.js on `localhost:3001` | pm2 process `nebius-portal-api` |
| Frontend | Static React build | served from `/var/www/nebius-portal` |
| Worker nodes | `worker-0` through `worker-7` | Use hostnames |

Worker node IPs are reference-only because they can rotate:

| Node | IP |
|---|---|
| `worker-0` | `10.62.40.79` |
| `worker-1` | `10.62.8.22` |
| `worker-2` | `10.62.12.71` |
| `worker-3` | `10.62.134.28` |
| `worker-4` | `10.62.5.94` |
| `worker-5` | `10.62.115.41` |
| `worker-6` | `10.62.26.144` |
| `worker-7` | `10.62.116.171` |

Do not store these IPs in app records unless explicitly accepting the rotation
risk. Store worker hostnames like `worker-0`.

---

## 3. Architecture

```text
Team member browser
  |
  | HTTP/HTTPS
  v
Azure VM: nebius-portal-vm
  |
  | nginx
  |   /        -> React SPA static files
  |   /api/    -> Node.js backend on localhost:3001
  |   /app/    -> Node.js backend on localhost:3001
  |
  | Node.js backend
  |   SQLite: apps, users, refresh token hashes
  |   SocksProxyAgent: socks5h://localhost:1080
  |
  | autossh SOCKS5 tunnel
  v
Nebius login node: 89.169.98.29
  |
  | Nebius internal DNS/network
  v
worker-N:PORT
```

### Why SOCKS5

One SOCKS5 tunnel covers all current and future worker apps. Per-port forwarding
would require editing systemd and restarting the tunnel for every app.

### Why `socks5h://`

The `h` means hostname resolution happens remotely through the Nebius login node.
That is required because worker hostnames resolve in the Nebius network, not on
the Azure VM.

---

## 4. Technology

| Layer | Choice |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS |
| Frontend state | Zustand |
| Backend | Node.js + Express + TypeScript |
| Database | SQLite through `better-sqlite3` |
| Proxy | `http-proxy` + `socks-proxy-agent` |
| Tunnel | `autossh -D 1080` systemd service |
| Web server | nginx |
| Auth | Local JWT auth with admin approval |
| Deployment | `deploy.sh` over SSH/SCP/rsync |
| Infrastructure | Terraform for Azure VM |

---

## 5. Auth model

The current implementation uses local JWT auth, not oauth2-proxy or Entra ID.

User flow:

1. User signs up at `/signup`.
2. Backend creates a `users` row with `status = 'pending'`.
3. Admin logs in at `/admin` using `ADMIN_EMAIL` and `ADMIN_PASSWORD_HASH`.
4. Admin approves or rejects the user.
5. Approved users log in and receive access and refresh tokens.

Important auth invariants:

- Admin is env-backed only and is never stored in SQLite.
- User access tokens live in frontend memory.
- User refresh tokens are hashed before storage in SQLite.
- Admin refresh tokens are signed JWTs and are not stored in SQLite.
- `/api/apps` and `/app/` require user auth.
- `/api/admin/*` management routes require superadmin auth.
- `/app/:id/*` accepts `?token=` so app tiles can open in a browser tab.

See `AUTH_SPEC.md` for endpoint-level details.

---

## 6. Data model

SQLite tables are created idempotently in `backend/src/db.ts`.

### apps

| Field | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | 8-character generated slug |
| `name` | `TEXT NOT NULL` | Display name |
| `host` | `TEXT NOT NULL` | Worker hostname, e.g. `worker-0` |
| `port` | `INTEGER NOT NULL` | Worker app port |
| `type` | `TEXT NOT NULL` | `react`, `gradio`, or `other` |
| `description` | `TEXT` | Optional |
| `created_at` | `TEXT` | Defaults to `datetime('now')` |

### users

| Field | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | UUID |
| `name` | `TEXT NOT NULL` | User name |
| `email` | `TEXT UNIQUE NOT NULL` | Login email |
| `password_hash` | `TEXT NOT NULL` | bcrypt cost 12 |
| `role` | `TEXT NOT NULL` | Defaults to `user` |
| `status` | `TEXT NOT NULL` | `pending`, `approved`, `rejected` |
| `created_at` | `TEXT` | Defaults to `datetime('now')` |
| `updated_at` | `TEXT` | Updated on approval/rejection |

### refresh_tokens

| Field | Type | Notes |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | UUID |
| `user_id` | `TEXT NOT NULL` | FK to `users.id` |
| `token_hash` | `TEXT NOT NULL` | SHA-256 hash of refresh token |
| `expires_at` | `TEXT NOT NULL` | From JWT expiry |
| `created_at` | `TEXT` | Defaults to `datetime('now')` |

---

## 7. Adding an app

End-to-end behavior:

1. Approved user opens the portal.
2. User clicks **Add app**.
3. User enters name, host, port, type, and description.
4. Frontend calls `POST /api/apps`.
5. Backend validates host against `ALLOWED_HOSTS`.
6. Backend writes an `apps` row to SQLite.
7. Frontend shows the new tile.
8. Developer configures the Nebius app to live under `/app/{id}`.
9. Clicking the tile opens `/app/{id}/?token=<accessToken>` in a new tab.
10. Backend proxies the request to `http://{host}:{port}` through SOCKS5.

The manual root-path step is intentional. The portal does not SSH into Nebius
workers and edit app code.

---

## 8. App root-path requirement

Every app shown under `/app/{id}/` must know it lives at that path.

Gradio:

```python
demo.launch(root_path="/app/{id}")
```

Vite:

```ts
export default defineConfig({
  base: "/app/{id}/",
})
```

React Router:

```tsx
<BrowserRouter basename="/app/{id}">
```

If this is missing, the app may load HTML but fail to load assets, styles,
routes, or WebSocket requests correctly.

---

## 9. Deployment model

`deploy.sh` is the canonical deploy helper.

```bash
./deploy.sh frontend
./deploy.sh backend
./deploy.sh nginx
./deploy.sh
```

Deployment destinations:

| Target | Destination |
|---|---|
| Frontend build | `/var/www/nebius-portal/` |
| Backend source/build | `/opt/nebius-portal/backend/` |
| nginx config | `/etc/nginx/sites-available/nebius-portal` |

Backend deployment excludes `node_modules/`, `dist/`, `data/`, and `.env`.
The VM `.env` must be managed on the VM.

---

## 10. Out of scope for current version

- Automatically modifying app code on Nebius workers.
- Embedding worker apps inside iframes.
- Per-app permissions.
- Audit logs.
- Multi-admin user management.
- Replacing local auth with Entra ID or oauth2-proxy.
- Replacing SQLite with a network database.

---

## 11. Open items

1. Verify and document the live HTTPS state on the VM.
2. Decide whether to migrate refresh tokens from `localStorage` to HttpOnly
   cookies.
3. Add focused tests if backend auth/proxy behavior changes frequently.
4. Add a short root `README.md` pointer to `__docs__/` if the repo is shared.
5. Keep `MEMORY.md`, `README.md`, `AUTH_SPEC.md`, and `PLAN.md` synchronized
   with source changes.
