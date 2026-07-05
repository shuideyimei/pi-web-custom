#!/usr/bin/env bash
set -euo pipefail

ROOT="${PI_WEB_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
CONFIG="${PI_WEB_SUPERVISOR_CONFIG:-$HOME/.config/pi-web/supervisord.conf}"
PROGRAMS=(pi-web-sessiond pi-web-web pi-web-client)
DEFAULT_NODE_VERSION="24.18.0"

project_node_version() {
  if [[ "${PI_WEB_NODE_VERSION:-}" != "" ]]; then
    printf "%s\n" "${PI_WEB_NODE_VERSION#v}"
    return
  fi

  if [[ -f "$ROOT/.nvmrc" ]]; then
    local version
    version="$(tr -d '[:space:]' < "$ROOT/.nvmrc")"
    if [[ "$version" != "" ]]; then
      printf "%s\n" "${version#v}"
      return
    fi
  fi

  printf "%s\n" "$DEFAULT_NODE_VERSION"
}

resolve_node_bin() {
  local target_version="$1"
  local target="v$target_version"
  local nvm_dir="${NVM_DIR:-$HOME/.nvm}"
  local nvm_sh="$nvm_dir/nvm.sh"

  if [[ -s "$nvm_sh" ]]; then
    # shellcheck disable=SC1090
    source "$nvm_sh"
    if [[ "$(nvm version "$target" 2>/dev/null || true)" == "N/A" ]]; then
      echo "Installing Node.js $target with nvm..."
      nvm install "$target"
    fi
    nvm use "$target" >/dev/null
    command -v node
    return
  fi

  local nvm_candidate="$nvm_dir/versions/node/$target/bin/node"
  if [[ -x "$nvm_candidate" ]]; then
    printf "%s\n" "$nvm_candidate"
    return
  fi

  if command -v node >/dev/null 2>&1; then
    local current_version
    current_version="$(node -p 'process.versions.node')"
    if [[ "$current_version" == "$target_version" ]]; then
      command -v node
      return
    fi
  fi

  cat >&2 <<EOF
Node.js $target is required for PI WEB.
Install it with nvm first, or set PI_WEB_NODE_VERSION/PI_WEB_ROOT to a project with a matching .nvmrc.
EOF
  exit 1
}

quote_path_for_display() {
  printf "%q" "$1"
}

TARGET_NODE_VERSION="$(project_node_version)"
NODE_BIN="$(resolve_node_bin "$TARGET_NODE_VERSION")"
NODE_HOME="$(cd "$(dirname "$NODE_BIN")/.." && pwd)"
NPM_BIN="$NODE_HOME/bin/npm"
ACTUAL_NODE_VERSION="$($NODE_BIN -p 'process.versions.node')"

if [[ "$ACTUAL_NODE_VERSION" != "$TARGET_NODE_VERSION" ]]; then
  echo "Expected Node.js v$TARGET_NODE_VERSION, but resolved $NODE_BIN reports v$ACTUAL_NODE_VERSION" >&2
  exit 1
fi

if [[ ! -x "$NPM_BIN" ]]; then
  echo "Missing npm for Node.js v$TARGET_NODE_VERSION: $NPM_BIN" >&2
  exit 1
fi

BASE_SERVICE_PATH="${PI_WEB_SERVICE_BASE_PATH:-/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin}"
SERVICE_PATH="$ROOT/node_modules/.bin:$HOME/.pi/agent/bin:$NODE_HOME/bin:$BASE_SERVICE_PATH"
export PATH="$SERVICE_PATH"

if [[ ! -f "$CONFIG" ]]; then
  echo "Missing supervisor config: $CONFIG" >&2
  exit 1
fi

update_supervisor_config() {
  PI_WEB_RESOLVED_NPM_BIN="$NPM_BIN" \
  PI_WEB_SERVICE_PATH="$SERVICE_PATH" \
  python3 - "$CONFIG" <<'PY'
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

config = Path(sys.argv[1])
npm_bin = os.environ["PI_WEB_RESOLVED_NPM_BIN"]
service_path = os.environ["PI_WEB_SERVICE_PATH"]
program_commands = {
    "program:pi-web-web": f"command={npm_bin} run dev:web",
    "program:pi-web-client": f"command={npm_bin} run dev:client",
}
program_sections = {"program:pi-web-sessiond", *program_commands.keys()}

original = config.read_text()
lines = original.splitlines(keepends=True)
updated: list[str] = []
section = ""

for line in lines:
    newline = "\n" if line.endswith("\n") else ""
    body = line[:-1] if newline else line
    stripped = body.strip()

    if stripped.startswith("[") and stripped.endswith("]"):
        section = stripped[1:-1]

    if section in program_commands and body.startswith("command="):
        body = program_commands[section]
    elif section in program_sections and body.startswith("environment="):
        if "PATH=" in body:
            body = re.sub(r'PATH="[^"]*"', f'PATH="{service_path}"', body)
        else:
            body = f'{body},PATH="{service_path}"'

    updated.append(body + newline)

text = "".join(updated)
if text != original:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = config.with_name(f"{config.name}.bak-{timestamp}")
    backup.write_text(original)
    config.write_text(text)
    print(f"Updated supervisor config for Node.js service PATH: {config}")
    print(f"Backup written to: {backup}")
else:
    print(f"Supervisor config already targets the project Node.js PATH: {config}")
PY
}

update_supervisor_config

echo "Using Node.js v$ACTUAL_NODE_VERSION from $(quote_path_for_display "$NODE_BIN")"
echo "Using npm from $(quote_path_for_display "$NPM_BIN")"

if [[ "${PI_WEB_SKIP_BUILD:-0}" != "1" ]]; then
  echo "Building PI WEB before restart..."
  (cd "$ROOT" && "$NPM_BIN" run build)
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
