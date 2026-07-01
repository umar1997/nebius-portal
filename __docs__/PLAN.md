# PLAN.md — Build Plan

Build order matters here. The riskiest part of this project is not the React UI —
it is getting nginx on the worker to proxy a real app correctly. That is proven
in Phase 2, before anything else. If something is going to break, you find out
on day 2, not day 12.

---

## Phase 0 — Get everything ready (half a day)

**Goal:** nothing to build yet, just confirm you have what you need.

- [ ] Confirm you can SSH into the Azure VM
- [ ] Confirm the Azure VM can reach the worker node
      (run `curl http://<worker-ip>:<any-app-port>` from the VM — it should respond)
- [ ] Confirm nginx is installed on the worker node (`nginx -v`)
- [ ] Confirm Node.js is installed on the worker node (`node -v`) — install if not
- [ ] Have the Entra ID tenant name ready (or decide to use simple password auth for v1)
- [ ] Note the host and port of at least one real app running on the worker right now

**Done when:** you can reach an app port from the Azure VM, and nginx + Node are
confirmed on the worker.

---

## Phase 1 — nginx on the worker proxies one real app (1–2 days) ⚠️ prove this first

**Goal:** visit the worker's address in a browser (from the VM or a browser pointed
at it) and have a real app load correctly through nginx — not broken, fully usable.

- [ ] Write a basic nginx config on the worker that:
  - Serves a placeholder page at `/`
  - Proxies `/app/test-app/` to one real app (e.g. `http://localhost:8001/`)
  - Forwards WebSocket connections (required for Gradio):
    ```nginx
    location /app/test-app/ {
        proxy_pass http://localhost:8001/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
    ```
- [ ] Fix the broken-page issue at the source for this test app:
  - Gradio: add `root_path="/app/test-app"` to `launch()`
  - React: set `base: '/app/test-app/'` in vite config
- [ ] Open the proxied app in a browser and verify it looks and works correctly

**Done when:** the app opens through nginx, looks fully styled, and all buttons/
interactions work. For Gradio, the live interface must respond (not just load).

> This is the gate. Do not move to Phase 2 until this works. Every other phase
> builds on this assumption.

---

## Phase 2 — Node.js backend for the app list (1–2 days)

**Goal:** a small API running on the worker that stores and serves the list of apps.

- [ ] Scaffold a Node.js + Express project on the worker
- [ ] Set up SQLite with a simple `apps` table:
      `id, name, host, port, type, description, created_at`
- [ ] Build these endpoints:
  - `GET /api/apps` — return all apps
  - `POST /api/apps` — add an app (validate fields, check host allowlist)
  - `PUT /api/apps/:id` — edit an app
  - `DELETE /api/apps/:id` — remove an app
  - `GET /api/apps/:id/health` — try connecting to the app's host:port and return
    reachable/unreachable
- [ ] Add the host allowlist: reject any host not in a configured list of permitted
      worker hostnames/IPs
- [ ] Run the backend on a local port (e.g. `3001`) and keep it alive with `pm2`
      (a simple process manager: `pm2 start server.js --name portal-api`)
- [ ] Update nginx to proxy `/api/` to `http://localhost:3001/`

**Done when:** you can `curl` each endpoint from the worker and get correct
responses, and `pm2` keeps the backend running after you close your SSH session.

---

## Phase 3 — nginx dynamic routing (1 day)

**Goal:** when you add an app via the API, nginx can route to it without a manual
config change.

The cleanest approach here is to make nginx use a pattern rule rather than one
block per app:

```nginx
location ~ ^/app/([^/]+)/(.*)$ {
    # The backend will resolve app ID to host:port
    proxy_pass http://localhost:3001/internal/resolve/$1/$2;
    ...
}
```

The Node backend's `/internal/resolve/:id/:path` looks up the app in SQLite,
gets its host:port, and either proxies the request itself or returns a redirect.

- [ ] Add the dynamic resolve endpoint to the Node backend
- [ ] Update nginx config to use the pattern route
- [ ] Test: add a new app via `curl POST /api/apps`, then immediately visit
      `/app/{new-id}/` and confirm it loads — no nginx restart needed

**Done when:** adding an app via API immediately makes it accessible through
nginx with no manual steps.

---

## Phase 4 — React portal UI (2–3 days)

**Goal:** the real grid UI, connected to the real API.

- [ ] Scaffold React + Vite + TypeScript + Tailwind
- [ ] Build the grid: fetches `/api/apps`, renders tiles
- [ ] Tile design: name, description, type badge, status dot
- [ ] "Add app" modal form: name, host, port, type, description — posts to API
- [ ] Per-tile menu: open in new tab, edit, remove (with confirmation)
- [ ] Empty state, loading states, error messages
- [ ] Status dots: calls `/api/apps/:id/health` and shows green/grey
- [ ] Responsive layout (works on a laptop and a wide monitor)

Build the React app locally (against a locally running copy of the Node backend).
When it works locally:

- [ ] Run `npm run build` — this produces a `dist/` folder of static files
- [ ] Copy `dist/` to the worker node (e.g. `/var/www/nebius-portal/`)
- [ ] Update nginx to serve that folder at `/`

**Done when:** the full portal — grid, add app, status dots — works when accessed
through the worker's nginx.

---

## Phase 5 — Azure VM front door (1 day)

**Goal:** the portal is accessible via the Azure VM's address, with the VM acting
as a passthrough proxy.

- [ ] Install nginx on the Azure VM
- [ ] Configure it to forward all traffic to the worker node:
  ```nginx
  server {
      listen 80;
      location / {
          proxy_pass http://<worker-ip>:<nginx-port>/;
          proxy_http_version 1.1;
          proxy_set_header Upgrade $http_upgrade;
          proxy_set_header Connection "upgrade";
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
      }
  }
  ```
- [ ] Open port 80 (and 443) on the Azure VM's firewall (Network Security Group)
- [ ] Confirm the portal loads via the VM's public IP address

**Done when:** a team member can type the VM's public IP into a browser and see
the portal.

---

## Phase 6 — Add HTTPS and login (1–2 days)

**Goal:** the portal is served over HTTPS and requires a work account to sign in.

### HTTPS
- [ ] Point a DNS name at the VM's IP (can use Azure's free DNS label:
      `yourname.region.cloudapp.azure.com` — no domain purchase needed)
- [ ] Install `certbot` on the VM and get a free Let's Encrypt certificate
- [ ] Update nginx on the VM to serve on 443 with the certificate, redirect HTTP
      to HTTPS

### Login
- [ ] Install `oauth2-proxy` on the Azure VM
- [ ] Register an app in Azure Entra ID (the Azure portal — takes 10 minutes)
- [ ] Configure `oauth2-proxy` to sit in front of nginx and require a valid
      Microsoft sign-in before passing requests through
- [ ] Restrict sign-in to your organisation's directory only

**Done when:** visiting the portal URL redirects to Microsoft login, and only
your org's accounts can get in.

---

## Phase 7 — Polish and handover (1 day)

- [ ] Confirm README matches what was actually built
- [ ] Document every deployed app and its `root_path`/`base` value
- [ ] Write a one-page "how to add a new app" guide for the team
- [ ] Set up `pm2` to auto-start on worker reboot (`pm2 startup`)
- [ ] Set nginx to auto-start on VM reboot (it does by default on Ubuntu)

---

## Timeline

| Phase | Work |
|-------|------|
| 0 — Prerequisites | 0.5 day |
| 1 — nginx proxies one real app | 1–2 days |
| 2 — Node.js app list API | 1–2 days |
| 3 — Dynamic nginx routing | 1 day |
| 4 — React portal UI | 2–3 days |
| 5 — Azure VM front door | 1 day |
| 6 — HTTPS + login | 1–2 days |
| 7 — Polish + handover | 1 day |
| **Total** | **~8–12 working days** |

---

## The four things most likely to go wrong

1. **App loads broken through nginx** — the `root_path`/`base` setting is missing
   or wrong on the backend app. Fix it there, not in nginx.

2. **Gradio interface loads but never responds** — WebSocket forwarding is missing
   in the nginx config. The `Upgrade` and `Connection` headers must be set.

3. **Adding an app works but routing doesn't** — the dynamic resolve logic in the
   Node backend has a bug. Test the `/internal/resolve/` endpoint directly with
   `curl` to isolate it from the UI.

4. **Portal works from VM but not from a browser** — a firewall rule (Network
   Security Group on the VM, or a Nebius firewall on the worker) is blocking the
   port. Check both.