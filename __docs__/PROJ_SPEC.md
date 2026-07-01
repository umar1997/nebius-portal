# PROJ_SPEC — Nebius Portal

**Version:** 2.0 (final architecture)
**Repo:** `nebius-portal`

---

## 1. What this is

A web portal that gives your internal team one place to find and open all the
applications running on your Nebius worker nodes. It looks like a grid of tiles —
one tile per app. Click a tile, the app opens in a new tab. Authorised users can
also add, edit, or remove apps directly from the UI without touching any config
files or restarting anything.

Nobody on the team needs to SSH into anything or remember port numbers.

---

## 2. How it works (plain English)

```
Team member's browser
        │  (HTTPS, must sign in)
        ▼
┌─────────────────────┐
│   Azure VM          │  ← the public front door, handles login
│   (nginx)           │
└────────┬────────────┘
         │  direct network connection (confirmed)
         ▼
┌─────────────────────────────────────────────────┐
│   Nebius worker-0                               │
│                                                 │
│   nginx                                         │
│    ├── serves the React grid UI                 │
│    ├── /api/*  → Node.js (manages app list)     │
│    ├── /app/X  → app on port 8001 (this node)   │
│    ├── /app/Y  → app on port 8002 (this node)   │
│    └── /app/Z  → worker-1:9001  (other node,    │
│                   internal Nebius network)       │
└─────────────────────────────────────────────────┘
```

**The Azure VM** is a thin front door. Its only jobs are: require login, accept
HTTPS from the team, and forward everything to the worker node. It does not run
any app logic.

**The worker node** does all the real work. nginx on the worker serves the
React portal UI, and routes each `/app/X` request to the right port — whether that
app is on this worker or another one on Nebius's internal network.

**Why the worker node does the routing:** the worker can reach every other Nebius
node over the internal network. The Azure VM cannot — it only has a path to
worker-0. So putting the routing logic on worker-0 means any app on any node can
be reached through one single connection.

---

## 3. The two pieces of infrastructure

### Azure VM
- Small Linux VM (Ubuntu, B1s or B2s tier — roughly £8–20/month)
- Runs nginx as a reverse proxy
- Runs `oauth2-proxy` in front of nginx to enforce Microsoft Entra ID (work
  account) login — only people in your organisation can sign in
- Has a direct network connection to the Nebius worker node (confirmed)
- This is the only thing exposed to the public internet

### Nebius worker-0
- Already exists — your existing worker node
- nginx installed and configured as the internal router
- A small Node.js backend running on a local port (manages the app list)
- A SQLite database file storing the app list (simple, no external service needed,
  survives restarts because it's a real file on a real disk — not a container)
- The React portal app, built and placed in nginx's web root

---

## 4. What the portal does

### Grid view
- Shows all registered apps as tiles
- Each tile: app name, short description, type badge (React / Gradio / Other),
  status dot (green = reachable, grey = not responding)
- Clicking a tile opens the app in a new tab

### Add / edit / remove apps
- A form lets authorised users add an app: name, host (worker hostname or IP),
  port, type, description
- The app immediately appears as a tile for everyone
- Apps can be edited or removed from a per-tile menu
- The host entered is checked against a server-side allowlist — you cannot point
  the portal at arbitrary addresses on the internet

### Proxy routing
- Each app gets a path: `/app/{id}/`
- nginx on the worker forwards that path to `http://{host}:{port}/`
- Both normal web requests and live (WebSocket) connections are forwarded —
  required for Gradio to work

### The "broken page" fix
When an app is shown under `/app/something/`, it must be told it lives there or
its styling and buttons break. Because you own these apps:

- **Gradio apps:** add `root_path="/app/{id}"` to the `launch()` call
- **React apps:** set `base: '/app/{id}/'` in `vite.config.ts` and `basename`
  on the router

This is a one-line change per app, done once. The portal shows the exact value
to use after you add an app.

---

## 5. Users and access

- Everyone signs in with their work Microsoft account (Entra ID)
- One shared app list, visible and editable by all signed-in users
- No separate Viewer/Editor roles in v1 (can be added later with minimal changes)

---

## 6. Technology choices

| Piece | Technology | Why |
|-------|-----------|-----|
| Portal UI | React + Vite + TypeScript | Fast, typed, base-path config is one line |
| UI styling | Tailwind CSS | Clean, professional, no heavy framework |
| Backend (app list API) | Node.js + Express | Simple, same language ecosystem as frontend |
| App list storage | SQLite (file on worker disk) | No external service, survives restarts, zero cost |
| Internal proxy | nginx on worker-0 | You already have it; handles WebSockets; proven in your Apache config |
| Public front door | nginx on Azure VM | Thin passthrough, easy to configure |
| Login / auth | oauth2-proxy + Microsoft Entra ID | One sidecar process, no custom auth code |

---

## 7. What is deliberately NOT in v1

- Custom domain name (the portal uses the VM's public IP or Azure DNS name)
- Apps embedded inside the portal page (new tab only — avoids the broken-page
  problem entirely for apps you don't control)
- Opening apps directly from the browser to the worker (not needed — everything
  routes through the VM → worker path)
- Per-app permissions
- Audit logs / usage analytics

---

## 8. Open questions (decide before build starts)

1. **Auth requirement:** do you have an Azure Entra ID tenant set up for your org,
   and can you register an app in it? This is needed for the login to work.
   If not, a simpler username/password approach can be used for v1.

2. **Other worker nodes:** do apps run on other worker nodes beyond worker-0 today,
   or is everything on worker-0 for now? Affects how much of the multi-node routing
   needs to be built vs. left for later.

3. **VM already exists?** Do you already have an Azure VM you want to use, or does
   one need to be created?