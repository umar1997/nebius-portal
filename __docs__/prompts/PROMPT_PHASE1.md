You are implementing the `nebius-portal` project. Before writing a single line of code, read all four documents in `__docs__/` in this order: `PROJ_SPEC.md`, `PLAN.md`, `README.md`, `AUTH_SPEC.md`. Do not skim them. The architecture decisions in those docs are final — do not redesign them.

**Your task is to build Phase 1 of PLAN.md plus the full auth system from AUTH_SPEC.md.** These two things are built together because auth middleware wraps the same routes the proxy uses — you cannot build one cleanly without the other.

**Build in this exact order. Stop and report after each numbered step.**

1. **Node.js + Express project scaffold** on the Azure VM at `/opt/nebius-portal/backend`. TypeScript, `ts-node`, `pm2`. Show me the folder structure and `package.json` before moving on.

2. **SQLite setup** — three tables in one file: `apps`, `users`, `refresh_tokens`. Schema is in `PLAN.md` (apps) and `AUTH_SPEC.md` (users, tokens). Show me the migration output before moving on.

3. **Auth endpoints** — `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/auth/me`. Exactly as specified in `AUTH_SPEC.md`. bcrypt cost 12. Access tokens in memory, refresh tokens hashed in DB.

4. **Admin endpoints** — `POST /api/admin/login` (env credentials only, never DB), `GET /api/admin/users/pending`, `PATCH /api/admin/users/:id/approve`, `PATCH /api/admin/users/:id/reject`. Admin JWT payload must include `role: 'superadmin'`.

5. **Auth middleware** — `requireAuth` and `requireAdmin` as specified in `AUTH_SPEC.md`. Apply `requireAuth` to all existing `/api/apps` and `/app/` routes.

6. **SOCKS5 proxy** — `ANY /app/:id/*` proxied to `host:port` via `socks5h://localhost:1080`. The `h` in `socks5h` is not optional — it means remote DNS resolution on the login node. Using `socks5://` instead will break when Kubernetes pod IPs change. Show me a working `curl http://localhost:3001/app/{id}/` response before moving on.

7. **App list API** — `GET`, `POST`, `PUT`, `DELETE` `/api/apps` backed by SQLite. Host allowlist enforced server-side on POST and PUT. Health check endpoint at `GET /api/apps/:id/health`.

**Constraints — do not violate these:**
- SQLite only. No MongoDB, no JSON files, no in-memory stores.
- `socks5h://` not `socks5://` — remote DNS, not local.
- Admin credentials in env vars only — never written to or read from the database.
- Access tokens are never stored in localStorage — Zustand memory store only.
- The SOCKS tunnel on port 1080 is already running as a systemd service — do not touch it.
- Allowed worker hosts are: `worker-0` through `worker-7` — hardcode these in the allowlist config.
- Build and test locally first using a local SQLite file and a local .env. Only deploy to the VM once curl tests pass locally. Do not develop directly on the VM.

**Environment variables required in `.env`:**
```
PORT=3001
DB_PATH=/opt/nebius-portal/backend/data/apps.db
SOCKS_PROXY=socks5h://localhost:1080
ALLOWED_HOSTS=worker-0,worker-1,worker-2,worker-3,worker-4,worker-5,worker-6,worker-7
JWT_SECRET=<generate with: openssl rand -hex 32>
JWT_REFRESH_SECRET=<generate with: openssl rand -hex 32>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
ADMIN_EMAIL=<your admin email>
ADMIN_PASSWORD_HASH=<generate with: node -e "require('bcrypt').hash('yourpassword',12).then(console.log)">
```

**Definition of done for this phase:**
- `curl -X POST http://localhost:3001/api/auth/signup` creates a pending user
- Pending user cannot log in (returns 403)
- Admin login returns a JWT with `role: superadmin`
- Admin can approve the pending user
- Approved user can log in and receives access + refresh tokens
- `curl http://localhost:3001/app/{id}/` with a valid JWT returns HTML from worker-0:8001
- Without a JWT it returns 401

Do not start the React frontend. Do not set up nginx. Report back after Step 1.