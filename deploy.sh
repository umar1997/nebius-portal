#!/usr/bin/env bash
# deploy.sh — redeploy any combination of frontend / backend / nginx
#
# Usage:
#   ./deploy.sh               — deploy all three
#   ./deploy.sh frontend      — frontend only
#   ./deploy.sh backend       — backend only
#   ./deploy.sh nginx         — nginx only
#   ./deploy.sh frontend backend   — two at once

set -euo pipefail

VM="azure-nebius-portal-vm"
REMOTE_BACKEND="/opt/nebius-portal/backend"
REMOTE_WEB="/var/www/nebius-portal"

# ── colours ──────────────────────────────────────────────────────────────────
BOLD='\033[1m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; RESET='\033[0m'
step() { echo -e "\n${CYAN}▸ $1${RESET}"; }
ok()   { echo -e "${GREEN}✓ $1${RESET}"; }

# ── targets ──────────────────────────────────────────────────────────────────
deploy_frontend() {
  step "Building frontend..."
  (cd frontend && npm run build)

  step "Uploading to VM (${REMOTE_WEB})..."
  scp -r frontend/dist/* "${VM}:${REMOTE_WEB}/"

  ok "Frontend deployed"
}

deploy_backend() {
  step "Syncing backend source to VM..."
  rsync -avz --progress \
    --exclude 'node_modules/' \
    --exclude 'dist/' \
    --exclude 'data/' \
    --exclude '.env' \
    backend/ "${VM}:${REMOTE_BACKEND}/"

  step "Installing deps, building, restarting pm2..."
  ssh "${VM}" "
    set -e
    cd ${REMOTE_BACKEND}
    npm ci --prefer-offline
    npm run build
    pm2 restart nebius-portal-api
    pm2 save
  "

  ok "Backend deployed"
}

deploy_nginx() {
  step "Uploading nginx config..."
  scp nginx/nebius-portal.conf "${VM}:/tmp/nebius-portal.conf"

  step "Installing config and reloading nginx..."
  ssh "${VM}" "
    sudo mv /tmp/nebius-portal.conf /etc/nginx/sites-available/nebius-portal
    sudo nginx -t
    sudo systemctl reload nginx
  "

  ok "Nginx reloaded"
}

# ── entrypoint ────────────────────────────────────────────────────────────────
echo -e "${BOLD}Nebius Portal — Deploy${RESET}"

if [[ $# -eq 0 ]]; then
  deploy_frontend
  deploy_backend
  deploy_nginx
else
  for target in "$@"; do
    case "$target" in
      frontend) deploy_frontend ;;
      backend)  deploy_backend  ;;
      nginx)    deploy_nginx    ;;
      *)
        echo "Unknown target: ${target}"
        echo "Usage: $0 [frontend] [backend] [nginx]"
        exit 1
        ;;
    esac
  done
fi

echo -e "\n${BOLD}${GREEN}All done.${RESET}"
