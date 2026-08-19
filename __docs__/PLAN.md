# PLAN.md - Current Status, Runbook, and Next Work

**Version:** 4.0
**Updated:** 2026-07-13

This repo has moved past the original phase plan. Use this file as a status
tracker and practical checklist. The older one-time setup details live in
`SET_UP.md` and `VM_SET_UP.md`.

---

## Status table

| Area | Status | Evidence in repo | Notes |
|---|---|---|---|
| Azure VM provisioning | Done | `terraform/` | Do not re-provision unless asked |
| SOCKS5 tunnel | Done | `SET_UP.md`, `VM_SET_UP.md` | Runs as `nebius-tunnel` on VM |
| Backend API | Done | `backend/src/` | Express + SQLite + TypeScript |
| App proxy | Done | `backend/src/proxy.ts` | HTTP and WebSocket through SOCKS5 |
| App CRUD | Done | `backend/src/routes/apps.ts` | Enforces `ALLOWED_HOSTS` |
| JWT auth | Done | `backend/src/routes/auth.ts` | Signup/login/refresh/logout/me |
| Admin approval | Done | `backend/src/routes/admin.ts` | Env-backed superadmin |
| Frontend portal | Done | `frontend/src/` | React/Vite/Tailwind/Zustand |
| nginx config | Done | `nginx/nebius-portal.conf` | SPA, `/api/`, `/app/` |
| Deploy helper | Done | `deploy.sh` | Deploy frontend/backend/nginx |
| HTTPS | Partially documented | `VM_SET_UP.md` | Verify live cert/nginx state before changes |
| Handover docs | In progress | `__docs__/` | Keep docs synchronized with source |

---

## Current architecture

```text
Browser
  -> nginx on Azure VM
      /        -> static React SPA in /var/www/nebius-portal
      /api/    -> Node backend on localhost:3001
      /app/    -> Node backend on localhost:3001
  -> Node backend
      SQLite for apps, users, refresh token hashes
      SocksProxyAgent using socks5h://localhost:1080
  -> autossh SOCKS5 tunnel
  -> Nebius worker host and port
```

The system depends on remote DNS through `socks5h://`. Worker pod IPs can rotate;
worker hostnames should remain the app record format.

---

## Current implementation checkpoints

### Backend

Before backend changes:

```bash
npm --prefix backend run typecheck
```

Backend must preserve:

- `GET /api/health` as a public health check.
- `requireAuth` on `/api/apps` and `/app/`.
- `requireAdmin` on admin management routes.
- SQLite as the persistence layer.
- `socks5h://localhost:1080` remote DNS behavior.
- WebSocket upgrade handling for proxied apps such as Gradio.

### Frontend

Before frontend changes:

```bash
npm --prefix frontend run build
```

Frontend must preserve:

- Public `/login`, `/signup`, and `/admin` routes.
- Protected `/` app grid with `RequireAuth`.
- Protected `/admin/dashboard` and `/admin/users` with `RequireAdmin`.
- Access tokens in Zustand memory.
- New-tab app opening through `/app/{id}/?token=${accessToken}`.

### nginx

Before nginx deployment:

```bash
./deploy.sh nginx
```

`nginx/nebius-portal.conf` must preserve:

- SPA fallback with `try_files $uri $uri/ /index.html`.
- `/api/` proxy to `http://localhost:3001/api/`.
- `/app/` proxy to `http://localhost:3001/app/`.
- WebSocket headers for `/app/`.
- High read/send timeouts for long-running ML app requests.

---

## Deployment checklist

Use the repo-level helper:

```bash
./deploy.sh frontend
./deploy.sh backend
./deploy.sh nginx
./deploy.sh
```

After deployment, verify:

```bash
curl -s http://nebius-portal-vm.uaenorth.cloudapp.azure.com/api/health
ssh azure-nebius-portal-vm "pm2 status"
ssh azure-nebius-portal-vm "sudo systemctl status nebius-tunnel"
ssh azure-nebius-portal-vm "curl --socks5h localhost:1080 http://worker-0:8001"
```

If the public health check fails:

1. Check nginx config and status.
2. Check pm2 process status.
3. Check backend logs.
4. Check that backend `.env` exists on the VM.

---

## Remaining work

### 1. Verify live HTTPS state

`VM_SET_UP.md` documents certbot work, but do not assume the current VM state.
Before changing HTTPS, verify:

```bash
ssh azure-nebius-portal-vm "sudo nginx -T | grep -n \"server_name\\|listen 443\\|ssl_certificate\""
ssh azure-nebius-portal-vm "sudo certbot certificates"
curl -I https://nebius-portal-vm.uaenorth.cloudapp.azure.com/
```

Expected outcome: document whether HTTPS is live, partially installed, or still
pending. Then update `MEMORY.md` and this file.

### 2. Confirm production auth behavior

Exercise the full flow against the deployed portal:

1. Sign up as a new user.
2. Confirm user appears as pending in admin UI.
3. Approve the user.
4. Log in as the approved user.
5. Add or open a test app.
6. Confirm `/app/{id}/?token=...` works in a new tab.

Document any gaps in `AUTH_SPEC.md`.

### 3. Decide refresh-token hardening

Current frontend behavior stores user refresh tokens in `localStorage`.
This works for page reload restoration but has XSS exposure. A stronger design is
HttpOnly refresh-token cookies, which requires coordinated backend and frontend
changes.

Do not migrate this casually. If requested, update `AUTH_SPEC.md` first with the
intended contract.

### 4. Add tests if the project continues growing

There are currently no test scripts in `backend/package.json` or
`frontend/package.json`. If auth/proxy/app CRUD behavior starts changing often,
add focused tests before refactoring.

Suggested first tests:

- Backend route tests for auth status handling.
- Backend validation tests for `ALLOWED_HOSTS`.
- Token helper tests for refresh-token hashing and verification.
- Frontend smoke tests for route guards.

### 5. Clean root README if needed

Root `README.md` is currently minimal. Keep detailed docs in `__docs__/`, but add
a short pointer in root README if the repo will be shared with others.

---

## Known risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| Using `socks5://` instead of `socks5h://` | Worker hostnames resolve on wrong machine | Keep `SOCKS_PROXY=socks5h://localhost:1080` |
| Storing worker pod IPs | Pod IPs can rotate | Store worker hostnames |
| Missing app `root_path` or Vite `base` | App renders broken under `/app/{id}` | Configure app before opening through portal |
| nginx WebSocket headers drift | Gradio and similar apps break | Preserve `/app/` upgrade headers |
| Admin added to DB | Breaks env-only superadmin model | Keep admin auth in env only |
| Refresh tokens in localStorage | XSS can steal long-lived token | Consider HttpOnly cookie migration |
| Docs drift from source | VM operations become risky | Update docs in the same task as code changes |

---

## Session start checklist

Run this from repo root before starting work:

```bash
pwd
git status --short
git diff --stat
ls -la __docs__ backend frontend nginx terraform
npm --prefix backend pkg get scripts
npm --prefix frontend pkg get scripts
```

Then read the specific files you will change. Do not rely on phase labels or old
summaries without checking current source.
