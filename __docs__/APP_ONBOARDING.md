# App onboarding for Nebius Portal

How to make a worker app accessible through the portal. Read this when adding a
new Streamlit, Gradio, or React app.

See also: `APP_REGISTRY.md` for the list of registered apps and their portal
paths.

---

## How the portal routes traffic

```text
Browser
  -> https://nebius-portal-vm.uaenorth.cloudapp.azure.com/app/<id>/
  -> Azure VM nginx
  -> Node.js backend (localhost:3001)
  -> SOCKS5 tunnel (localhost:1080)
  -> worker-N:PORT
```

Every app gets a unique 8-character portal id (e.g. `ad8ce5c8`). The browser
always opens:

```text
/app/<id>/
```

The app on the worker must be configured to know it lives at that path, or it
will load broken (missing styles, 404 routes, wrong API calls).

---

## Checklist for every new app

1. **Add the app in the Nebius Portal UI** (Add app form).
   - Host: `worker-0` through `worker-7`
   - Port: the port your app listens on (e.g. `8001`)
   - Type: `gradio`, `react`, or `other`
2. **Copy the portal path** shown after saving (e.g. `/app/ad8ce5c8`).
3. **Configure the app** on the worker for that path (see type-specific sections below).
4. **Pin the Slurm job** to the same worker you entered in the portal.
5. **Submit the sbatch job** and verify.
6. **Register the app** in `APP_REGISTRY.md`.

---

## Portal app record

In the portal UI, fill in:

| Field | Example | Notes |
|---|---|---|
| Name | `readrio` | Display name on the tile |
| Host | `worker-2` | Must match `#SBATCH --nodelist` |
| Port | `8001` | Must match `--port` in your serve command |
| Type | `react` / `gradio` / `other` | Informational only |
| Description | optional | Shown on the tile |

Allowed hosts: `worker-0` through `worker-7` (configured in backend
`ALLOWED_HOSTS`).

---

## Gradio apps

Gradio uses WebSockets. The portal proxy and nginx already forward upgrade
headers, so Gradio works once `root_path` is set.

### Code change

In your Gradio launch call on the worker:

```python
demo.launch(
    server_name="0.0.0.0",
    server_port=8001,
    root_path="/app/<portal-app-id>",
)
```

Replace `<portal-app-id>` with the id from the portal (e.g. `ad8ce5c8`).

### sbatch template

```bash
#!/usr/bin/env bash
#SBATCH --job-name=my-gradio-app
#SBATCH --output=/data/app_data/my-gradio-app/logs/%j.out
#SBATCH --error=/data/app_data/my-gradio-app/logs/%j.err
#SBATCH --nodelist=worker-2
#SBATCH --cpus-per-task=2
#SBATCH --mem=8G
#SBATCH --time=30-00:00:00

set -euo pipefail

mkdir -p /data/app_data/my-gradio-app/logs

cd /path/to/my-gradio-app

# Activate your Python environment here if needed
# source .venv/bin/activate

python app.py
```

In `app.py`, hardcode or pass the portal path:

```python
PORTAL_PATH = "/app/<portal-app-id>"

demo.launch(
    server_name="0.0.0.0",
    server_port=8001,
    root_path=PORTAL_PATH,
)
```

Submit:

```bash
sbatch run-my-gradio-app.sbatch
squeue -u msalman
```

Portal record: Host=`worker-2`, Port=`8001`, Type=`gradio`.

---

## Streamlit apps

Streamlit does not have a built-in `root_path` like Gradio. Use the
`baseUrlPath` config option (Streamlit >= 1.12).

### Code / config change

Create or edit `.streamlit/config.toml` in your app directory:

```toml
[server]
headless = true
port = 8001
address = "0.0.0.0"
enableCORS = false
enableXsrfProtection = false

[browser]
serverAddress = "nebius-portal-vm.uaenorth.cloudapp.azure.com"
serverPort = 443
```

Run with the base path flag:

```bash
streamlit run app.py \
  --server.port 8001 \
  --server.address 0.0.0.0 \
  --browser.serverAddress nebius-portal-vm.uaenorth.cloudapp.azure.com \
  --browser.serverPort 443
```

For subpath mounting, set the base URL path via environment variable before
launch:

```bash
export STREAMLIT_SERVER_BASE_URL_PATH="/app/<portal-app-id>"
streamlit run app.py --server.port 8001 --server.address 0.0.0.0
```

### sbatch template

```bash
#!/usr/bin/env bash
#SBATCH --job-name=my-streamlit-app
#SBATCH --output=/home/msalman/app-data/my-streamlit-app/logs/%j.out
#SBATCH --error=/home/msalman/app-data/my-streamlit-app/logs/%j.err
#SBATCH --nodelist=worker-3
#SBATCH --cpus-per-task=2
#SBATCH --mem=8G
#SBATCH --time=30-00:00:00

set -euo pipefail

mkdir -p /home/msalman/app-data/my-streamlit-app/logs

cd /path/to/my-streamlit-app

export STREAMLIT_SERVER_BASE_URL_PATH="/app/<portal-app-id>"

# Activate your Python environment here if needed
# source .venv/bin/activate

streamlit run app.py --server.port 8001 --server.address 0.0.0.0
```

Portal record: Host=`worker-3`, Port=`8001`, Type=`other`.

---

## React / Vite apps (SPA only)

For a frontend-only React app served by Vite preview or a static file server.

### Code changes

**vite.config.ts:**

```ts
export default defineConfig({
  base: "/app/<portal-app-id>/",
  // ... rest of config
})
```

**React Router (if used):**

```tsx
<BrowserRouter basename="/app/<portal-app-id>">
```

**API calls:** if the app calls an API, prefix all fetch URLs:

```ts
const BASE = "/app/<portal-app-id>";
fetch(`${BASE}/api/endpoint`)
```

Or use `import.meta.env.BASE_URL` at build time (see readrio example below).

### Build and serve

```bash
cd web-ui
npm install
VITE_PUBLIC_BASE_PATH=/app/<portal-app-id> npm run build
cd ..

# Serve the built dist/ folder
npx serve -s web-ui/dist -l 8001
```

### sbatch template

```bash
#!/usr/bin/env bash
#SBATCH --job-name=my-react-app
#SBATCH --output=/home/msalman/app-data/my-react-app/logs/%j.out
#SBATCH --error=/home/msalman/app-data/my-react-app/logs/%j.err
#SBATCH --nodelist=worker-1
#SBATCH --cpus-per-task=2
#SBATCH --mem=4G
#SBATCH --time=30-00:00:00

set -euo pipefail

mkdir -p /home/msalman/app-data/my-react-app/logs

cd /path/to/my-react-app

export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"
nvm use 22

export VITE_PUBLIC_BASE_PATH="/app/<portal-app-id>"

npm install
npm run build

npx serve -s dist -l 8001
```

Portal record: Host=`worker-1`, Port=`8001`, Type=`react`.

---

## FastAPI + React apps (like readrio)

For apps where FastAPI serves both the API and the built React SPA from one
process.

### Code changes

**Backend:** set `READRIO_PUBLIC_BASE_PATH` (or equivalent env var your app
uses) to `/app/<portal-app-id>`. The backend must register routes under that
prefix in addition to root routes.

**Frontend build:**

```bash
export VITE_READRIO_PUBLIC_BASE_PATH="/app/<portal-app-id>"
npm run build
```

**Frontend router:** use Vite `base` and React Router `basename` derived from
`import.meta.env.BASE_URL`.

**API client:** prefix fetch calls with the base path so they hit
`/app/<id>/api/...` not the portal's own `/api/...`.

See the readrio branch `fix/nebius-portal-prefix-routing` for a working
reference implementation.

### sbatch template (readrio)

```bash
#!/usr/bin/env bash
#SBATCH --job-name=readrio
#SBATCH --output=/home/msalman/app-data/readrio/logs/readrio-%j.out
#SBATCH --error=/home/msalman/app-data/readrio/logs/readrio-%j.err
#SBATCH --nodelist=worker-2
#SBATCH --cpus-per-task=4
#SBATCH --mem=16G
#SBATCH --time=30-00:00:00

set -euo pipefail

mkdir -p /home/msalman/app-data/readrio/logs
mkdir -p /home/msalman/app-data/readrio/data

cd /home/msalman/code-space/CODE/readrio

export READRIO_PUBLIC_BASE_PATH=/app/ad8ce5c8
export VITE_READRIO_PUBLIC_BASE_PATH="$READRIO_PUBLIC_BASE_PATH"
export READRIO_DATA_DIR=/home/msalman/app-data/readrio/data
export READRIO_SECRET_KEY=<your-stable-secret>

export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"
nvm use 22

cd web-ui
npm install
npm run build
cd ..

uv run readrio serve --host 0.0.0.0 --port 8001
```

Submit:

```bash
sbatch run-readrio.sbatch
squeue -u msalman
```

Portal record: Host=`worker-2`, Port=`8001`, Type=`react`.

---

## Slurm reference

### Time format

```text
days-hours:minutes:seconds
```

| Value | Meaning |
|---|---|
| `#SBATCH --time=02:00:00` | 2 hours |
| `#SBATCH --time=1-00:00:00` | 1 day |
| `#SBATCH --time=7-00:00:00` | 7 days |
| `#SBATCH --time=30-00:00:00` | 30 days |

Use the longest time your partition allows. When time expires, Slurm kills the
job and the app goes down.

### Pinning to a worker

```bash
#SBATCH --nodelist=worker-2
```

The portal Host field must match. Check available nodes:

```bash
sinfo -N
```

### Resource sizing guide

| App type | CPUs | Memory | Notes |
|---|---|---|---|
| Gradio (small) | 2 | 8G | Model inference may need more |
| Streamlit (small) | 2 | 8G | |
| React SPA (static) | 2 | 4G | Just serving files |
| FastAPI + React | 2–4 | 8–16G | Depends on backend workload |
| ML inference apps | 4+ | 16G+ | Match model requirements |

Start small. Increase if the app is slow or OOM-killed.

### Useful commands

```bash
sbatch run-my-app.sbatch       # submit
squeue -u msalman              # check running jobs
scancel <job-id>               # cancel a job
scontrol show job <job-id>     # job details
tail -f /home/msalman/app-data/my-app/logs/<job-id>.out   # live logs
```

---

## Verification

After submitting the sbatch job:

**1. From the Azure VM** (through the SOCKS tunnel):

```bash
curl --socks5h localhost:1080 http://worker-2:8001/app/<portal-app-id>/
```

Expect HTML (not connection refused or 502).

**2. From the portal:**

Open the app tile. You should see the app's login/home page, not a broken layout
or "Not found".

**3. Check assets:**

Open browser DevTools → Network. Asset requests should go to
`/app/<id>/assets/...` or `/app/<id>/static/...`, not bare `/assets/...`.

---

## Common failures

| Symptom | Cause | Fix |
|---|---|---|
| App shows "Not found" | Router has no route for `/app/<id>/` | Set `root_path`, Vite `base`, or Router `basename` |
| Page loads but no styling | Assets requested at `/assets/...` instead of `/app/<id>/assets/...` | Fix Vite `base` or Gradio `root_path` |
| API calls fail / wrong auth | Frontend calls `/api/...` (portal API) instead of `/app/<id>/api/...` | Prefix API URLs with the portal path |
| Gradio loads but doesn't respond | WebSocket not forwarding | Already handled by nginx + backend proxy; check `root_path` |
| 502 Bad Gateway | App not running or wrong worker/port | Check `squeue`, portal Host/Port match sbatch |
| Connection refused | Slurm job died or wrong port | Check job logs, resubmit |
| Works via port-forward but not portal | App configured for `/` not `/app/<id>/` | Apply path prefix changes above |

---

## After onboarding

1. Add the app to `APP_REGISTRY.md`.
2. If the app repo lives elsewhere, note the repo path and branch.
3. Store secrets (like `READRIO_SECRET_KEY`) in the sbatch script or a
   worker-local `.env` — never commit them to git.
