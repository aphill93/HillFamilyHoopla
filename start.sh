#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# HillFamilyHoopla — dev startup script
# Usage: ./start.sh [--reset-db] [--skip-seed]
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

RESET_DB=false
SKIP_SEED=false
for arg in "$@"; do
  case $arg in
    --reset-db)   RESET_DB=true ;;
    --skip-seed)  SKIP_SEED=true ;;
  esac
done

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${BLUE}[hoopla]${RESET} $*"; }
success() { echo -e "${GREEN}[hoopla]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[hoopla]${RESET} $*"; }
error()   { echo -e "${RED}[hoopla] ERROR:${RESET} $*" >&2; }
step()    { echo -e "\n${BOLD}── $* ──${RESET}"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── 1. Prerequisites ──────────────────────────────────────────────────────────
step "Checking prerequisites"

check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    error "'$1' not found. $2"
    exit 1
  fi
  success "$1 found"
}

check_cmd node  "Install from https://nodejs.org (v20+)"
check_cmd npm   "Comes with Node.js"
check_cmd docker "Install from https://docs.docker.com/get-docker/"
check_cmd openssl "Usually pre-installed. brew install openssl on Mac."

NODE_MAJOR=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 20 ]; then
  error "Node.js v20+ required (you have v$(node --version))"
  exit 1
fi

# ── 2. JWT certs ──────────────────────────────────────────────────────────────
step "JWT keys"

CERTS_DIR="$SCRIPT_DIR/api/certs"
mkdir -p "$CERTS_DIR"

if [ ! -f "$CERTS_DIR/jwt_private.pem" ] || [ ! -f "$CERTS_DIR/jwt_public.pem" ]; then
  info "Generating RSA-2048 JWT key pair…"
  openssl genrsa -out "$CERTS_DIR/jwt_private.pem" 2048 2>/dev/null
  openssl rsa -in "$CERTS_DIR/jwt_private.pem" -pubout -out "$CERTS_DIR/jwt_public.pem" 2>/dev/null
  success "Keys generated at api/certs/"
else
  success "Keys already exist"
fi

# ── 3. api/.env ───────────────────────────────────────────────────────────────
step "API environment"

API_ENV="$SCRIPT_DIR/api/.env"
if [ ! -f "$API_ENV" ]; then
  info "Creating api/.env from example…"
  cp "$SCRIPT_DIR/api/.env.example" "$API_ENV"

  # Fill in generated values
  ENCRYPTION_KEY=$(openssl rand -hex 32)
  sed -i "s|your_32_byte_hex_key_here_000000000|$ENCRYPTION_KEY|g" "$API_ENV"

  warn "api/.env created with defaults. Edit it if needed."
fi

# Always ensure JWT paths are absolute (works regardless of where Node is run from)
sed -i "s|JWT_PRIVATE_KEY_PATH=.*|JWT_PRIVATE_KEY_PATH=$CERTS_DIR/jwt_private.pem|" "$API_ENV"
sed -i "s|JWT_PUBLIC_KEY_PATH=.*|JWT_PUBLIC_KEY_PATH=$CERTS_DIR/jwt_public.pem|" "$API_ENV"
success "api/.env ready"

# ── 4. web/.env.local ────────────────────────────────────────────────────────
step "Web environment"

WEB_ENV="$SCRIPT_DIR/web/.env.local"
if [ ! -f "$WEB_ENV" ]; then
  echo "NEXT_PUBLIC_API_URL=http://localhost:3001" > "$WEB_ENV"
  success "web/.env.local created"
else
  success "web/.env.local already exists"
fi

# ── 5. Docker services (Postgres + Redis) ────────────────────────────────────
step "Starting Docker services"

if ! docker info &>/dev/null; then
  error "Docker daemon is not running. Please start Docker Desktop and try again."
  exit 1
fi

if $RESET_DB; then
  warn "Resetting database volumes…"
  docker compose down -v 2>/dev/null || true
fi

docker compose up -d postgres redis
info "Waiting for Postgres to be healthy…"

RETRIES=30
until docker compose exec -T postgres pg_isready -U hoopla -d hillfamilyhoopla &>/dev/null; do
  RETRIES=$((RETRIES - 1))
  if [ $RETRIES -eq 0 ]; then
    error "Postgres didn't become ready in time. Run: docker compose logs postgres"
    exit 1
  fi
  sleep 1
done
success "Postgres is ready"

# ── 6. Node dependencies ──────────────────────────────────────────────────────
step "Installing dependencies"

if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
  info "Running npm install…"
  npm install --legacy-peer-deps
else
  success "node_modules present (skipping install — run 'npm install' manually if needed)"
fi

# ── 7. Build shared package ───────────────────────────────────────────────────
step "Building shared package"

SHARED_DIST="$SCRIPT_DIR/shared/dist"
if [ ! -d "$SHARED_DIST" ] || [ "$RESET_DB" = true ]; then
  info "Compiling @hillfamilyhoopla/shared…"
  npm run build -w @hillfamilyhoopla/shared
  success "Shared package built"
else
  success "Shared dist already exists (skipping — run 'npm run build -w @hillfamilyhoopla/shared' to rebuild)"
fi

# ── 8. Database migrations ────────────────────────────────────────────────────
step "Database migrations"

info "Running migrations…"
npm run db:migrate -w @hillfamilyhoopla/api
success "Migrations complete"

# ── 9. Seed data ──────────────────────────────────────────────────────────────
if ! $SKIP_SEED; then
  step "Seeding database"
  info "Seeding sample data (safe to re-run — skips existing rows)…"
  npm run db:seed -w @hillfamilyhoopla/api && success "Seed complete" || warn "Seed skipped or already applied"
fi

# ── 10. Start API + Web ───────────────────────────────────────────────────────
step "Starting servers"

# Kill any existing processes on our ports
kill_port() {
  local pid
  pid=$(lsof -ti tcp:"$1" 2>/dev/null || true)
  if [ -n "$pid" ]; then
    info "Stopping existing process on port $1 (pid $pid)…"
    kill "$pid" 2>/dev/null || true
    sleep 1
  fi
}

kill_port 3001
kill_port 3000

LOG_DIR="$SCRIPT_DIR/.logs"
mkdir -p "$LOG_DIR"

info "Starting API (port 3001)…"
npm run dev -w @hillfamilyhoopla/api > "$LOG_DIR/api.log" 2>&1 &
API_PID=$!
echo $API_PID > "$LOG_DIR/api.pid"

info "Starting web (port 3000)…"
npm run dev -w @hillfamilyhoopla/web > "$LOG_DIR/web.log" 2>&1 &
WEB_PID=$!
echo $WEB_PID > "$LOG_DIR/web.pid"

# ── 11. Wait for servers ──────────────────────────────────────────────────────
info "Waiting for API to respond…"
RETRIES=30
until curl -s http://localhost:3001/health &>/dev/null; do
  RETRIES=$((RETRIES - 1))
  if [ $RETRIES -eq 0 ]; then
    error "API didn't start. Check logs: tail -f .logs/api.log"
    exit 1
  fi
  sleep 1
done
success "API is up"

info "Waiting for web to respond…"
RETRIES=60
until curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null | grep -qE "^[23]|307"; do
  RETRIES=$((RETRIES - 1))
  if [ $RETRIES -eq 0 ]; then
    error "Web didn't start. Check logs: tail -f .logs/web.log"
    exit 1
  fi
  sleep 1
done
success "Web is up"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}╔════════════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}${BOLD}║   HillFamilyHoopla is running!                 ║${RESET}"
echo -e "${GREEN}${BOLD}╠════════════════════════════════════════════════╣${RESET}"
echo -e "${GREEN}${BOLD}║${RESET}  Web app:  ${BOLD}http://localhost:3000${RESET}               ${GREEN}${BOLD}║${RESET}"
echo -e "${GREEN}${BOLD}║${RESET}  API:      http://localhost:3001              ${GREEN}${BOLD}║${RESET}"
echo -e "${GREEN}${BOLD}╠════════════════════════════════════════════════╣${RESET}"
echo -e "${GREEN}${BOLD}║${RESET}  Login credentials (password: Hoopla123!)    ${GREEN}${BOLD}║${RESET}"
echo -e "${GREEN}${BOLD}║${RESET}  parent1@hillfamilyhoopla.dev  (Admin)       ${GREEN}${BOLD}║${RESET}"
echo -e "${GREEN}${BOLD}║${RESET}  parent2@hillfamilyhoopla.dev  (Parent)      ${GREEN}${BOLD}║${RESET}"
echo -e "${GREEN}${BOLD}║${RESET}  teen@hillfamilyhoopla.dev     (Teen)        ${GREEN}${BOLD}║${RESET}"
echo -e "${GREEN}${BOLD}║${RESET}  kid1@hillfamilyhoopla.dev     (Kid)         ${GREEN}${BOLD}║${RESET}"
echo -e "${GREEN}${BOLD}╠════════════════════════════════════════════════╣${RESET}"
echo -e "${GREEN}${BOLD}║${RESET}  Logs:  tail -f .logs/api.log              ${GREEN}${BOLD}  ║${RESET}"
echo -e "${GREEN}${BOLD}║${RESET}         tail -f .logs/web.log              ${GREEN}${BOLD}  ║${RESET}"
echo -e "${GREEN}${BOLD}║${RESET}  Stop:  ./stop.sh                          ${GREEN}${BOLD}  ║${RESET}"
echo -e "${GREEN}${BOLD}╚════════════════════════════════════════════════╝${RESET}"
echo ""

# Try to open in browser automatically
if command -v open &>/dev/null; then
  open http://localhost:3000
elif command -v xdg-open &>/dev/null; then
  xdg-open http://localhost:3000 &>/dev/null &
fi
