# PROJ_SPEC — Nebius Portal
**Version:** 3.0 (final — confirmed architecture)
**Repo:** `nebius-portal`

---

## 1. What this is

A web portal hosted on an Azure VM that gives the internal team one place to find
and open all applications running on Nebius worker nodes. Apps appear as tiles in
a grid. Click a tile, the app opens in a new tab. Authorised users can add new apps
through a form in the UI — no config files, no restarts, no SSH required.

---

## 2. Confirmed infrastructure (do not re-litigate)

| Piece | Detail | Status |
|-------|--------|--------|
| Azure VM | `nebius-portal-vm`, UAE North, Standard_B2s | ✅ Running |
| SOCKS5 tunnel | `autossh -D 1080` via `nebius-networking` alias | ✅ Running as systemd service |
| Login node | `89.169.98.29`, SSH alias `nebius-networking` | ✅ Reachable |
| Worker nodes | 8 nodes, worker-0 through worker-7 (see IPs below) | ✅ Confirmed |
| Test app | `worker-0:8001` — React app, HTML confirmed via tunnel | ✅ Proven |

### Worker node IPs
> ⚠️ These are Kubernetes pod IPs and may change if pods restart.
> The Node.js backend must use remote DNS resolution through the SOCKS proxy
> (resolving `worker-0` on the login node) rather than these IPs directly.
> IPs listed for reference only.

| Node | IP |
|------|----|
| worker-0 | 10.62.40.79 |
| worker-1 | 10.62.8.22 |
| worker-2 | 10.62.12.71 |
| worker-3 | 10.62.134.28 |
| worker-4 | 10.62.5.94 |
| worker-5 | 10.62.115.41 |
| worker-6 | 10.62.26.144 |
| worker-7 | 10.62.116.171 |

---

## 3. Architecture

```
Team member's browser
        │
        │ HTTPS (port 443)
        ▼
┌─────────────────────────────────────────────┐
│  Azure VM (nebius-portal-vm)                │
│                                             │
│  nginx                                      │
│   ├── /          → React portal (static)    │
│   ├── /api/      → Node.js backend :3001    │
│   └── /app/      → Node.js backend :3001    │
│                                             │
│  Node.js backend                            │
│   ├── SQLite     (app list, persistent)     │
│   └── socks-proxy-agent → localhost:1080    │
│                          (remote DNS)       │
│                                             │
│  autossh -D 1080  (SOCKS5 tunnel)           │
└──────────────────────┬──────────────────────┘
                       │ SSH port 22
                       ▼
              Nebius login node (89.169.98.29)
                       │
                       │ Nebius internal network
              ┌────────┴────────┐
              ▼                 ▼
        worker-0:8001     worker-0:8888
        worker-1:XXXX     worker-2:XXXX  ...etc
```

**Why SOCKS5 instead of per-port `-L` forwarding:**
One tunnel covers all 10+ apps and every future app added through the UI.
Per-port forwarding (`-L 8001:... -L 8888:...`) requires editing the systemd
service and restarting the tunnel every time an app is added. SOCKS5 eliminates
this entirely — adding an app is a database write, nothing else.

**Why remote DNS resolution matters:**
Worker nodes are Kubernetes pods. Their IPs can change on restart.
Using `worker-0` as a hostname resolved by the login node (which has internal
Nebius DNS) is resilient to IP changes. Using raw IPs is not.

---

## 4. How adding an app works (end to end)

1. User opens the portal and clicks **Add app**
2. Fills in: name, worker host (e.g. `worker-0`), port, type, description
3. Hits save → `POST /api/apps` → row written to SQLite
4. Tile appears immediately in the grid for all users
5. Portal shows a banner: **"Set `root_path="/app/{id}"` in your app on Nebius
   before it will render correctly"**
6. Someone SSH-es into the worker and adds that one line to the app
7. App works through the portal

Step 6 cannot be automated without the portal SSH-ing into Nebius and editing
files — more complexity than it's worth. The form makes the required value
explicit so the manual step is fast and unambiguous.

---

## 5. The broken-page requirement (non-negotiable)

Every app shown under `/app/{id}/` must be told it lives at that path or it
renders broken — no styling, dead buttons. This is a one-line fix per app:

**Gradio:**
```python
demo.launch(root_path="/app/{id}")
```

**React (Vite):**
```ts
// vite.config.ts
export default defineConfig({ base: '/app/{id}/' })
```
```tsx
<BrowserRouter basename="/app/{id}">
```

The portal shows the exact value after saving a new app. The developer who
adds the app to Nebius applies it once. It never needs to change unless the
app is removed and re-added with a different ID.

---

## 6. Technology

| Layer | Choice |
|-------|--------|
| Frontend | React + Vite + TypeScript + Tailwind CSS |
| Backend | Node.js + Express |
| Proxy | `socks-proxy-agent` (remote DNS via SOCKS5 tunnel) |
| App list | SQLite on the Azure VM disk |
| Tunnel | autossh `-D 1080` as a systemd service |
| Web server | nginx on the Azure VM |
| Auth | oauth2-proxy + Microsoft Entra ID (Phase 6) |

---

## 7. What is out of scope for v1

- Automating `root_path` / `base` changes on Nebius apps
- Embedding apps inside the portal (new tab only)
- Per-app permissions
- Audit logs

---

## 8. Open questions

1. **Entra ID tenant** — do you have one set up and can you register an app in it?
   Needed for oauth2-proxy login. If not, basic auth is the v1 fallback.
2. **App list ownership** — shared editable list for all signed-in users is the
   default. Fine for v1?