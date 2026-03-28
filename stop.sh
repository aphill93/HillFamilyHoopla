#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# HillFamilyHoopla — stop all dev services
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

GREEN='\033[0;32m'; BLUE='\033[0;34m'; RESET='\033[0m'
info() { echo -e "${BLUE}[hoopla]${RESET} $*"; }
success() { echo -e "${GREEN}[hoopla]${RESET} $*"; }

LOG_DIR="$SCRIPT_DIR/.logs"

stop_pid_file() {
  local pidfile="$LOG_DIR/$1.pid"
  local name=$1
  if [ -f "$pidfile" ]; then
    local pid
    pid=$(cat "$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
      info "Stopping $name (pid $pid)…"
      kill "$pid" 2>/dev/null || true
    fi
    rm -f "$pidfile"
  fi
}

stop_pid_file api
stop_pid_file web

# Also kill anything still on those ports
for port in 3000 3001; do
  pid=$(lsof -ti tcp:$port 2>/dev/null || true)
  if [ -n "$pid" ]; then
    info "Killing process on port $port (pid $pid)…"
    kill "$pid" 2>/dev/null || true
  fi
done

info "Stopping Docker services…"
docker compose stop postgres redis 2>/dev/null || true

success "All services stopped."
echo "  To also remove DB data: docker compose down -v"
