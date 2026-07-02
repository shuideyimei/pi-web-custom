#!/usr/bin/env bash
set -euo pipefail

ROOT="${PI_WEB_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
CONFIG="${PI_WEB_SUPERVISOR_CONFIG:-$HOME/.config/pi-web/supervisord.conf}"
PROGRAMS=(pi-web-sessiond pi-web-web pi-web-client)

if [[ ! -f "$CONFIG" ]]; then
  echo "Missing supervisor config: $CONFIG" >&2
  exit 1
fi

if [[ "${PI_WEB_SKIP_BUILD:-0}" != "1" ]]; then
  echo "Building PI WEB before restart..."
  (cd "$ROOT" && npm run build)
fi

echo "Restarting PI WEB services with config: $CONFIG"

if ! supervisorctl -c "$CONFIG" status >/dev/null 2>&1; then
  echo "supervisord is not running; starting it first..."
  supervisord -c "$CONFIG"
  for _ in {1..50}; do
    if supervisorctl -c "$CONFIG" status >/dev/null 2>&1; then
      break
    fi
    sleep 0.1
  done
fi

supervisorctl -c "$CONFIG" reread
supervisorctl -c "$CONFIG" update

for program in "${PROGRAMS[@]}"; do
  echo "Stopping $program..."
  supervisorctl -c "$CONFIG" stop "$program" >/dev/null 2>&1 || true
done

for program in "${PROGRAMS[@]}"; do
  echo "Starting $program..."
  supervisorctl -c "$CONFIG" start "$program"
done

echo ""
echo "PI WEB services restarted:"
supervisorctl -c "$CONFIG" status
