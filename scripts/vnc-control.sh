#!/usr/bin/env bash
set -euo pipefail

# Control a local TigerVNC desktop exposed through noVNC/websockify.
#
# Defaults match the current dev environment:
#   ./scripts/vnc-control.sh start
#   ./scripts/vnc-control.sh status
#   ./scripts/vnc-control.sh stop
#
# Override when needed:
#   WEB_PORT=8006 DISPLAY_NUM=6 GEOMETRY=1440x900 ./scripts/vnc-control.sh restart

ACTION="${1:-status}"
DISPLAY_NUM="${DISPLAY_NUM:-5}"
WEB_PORT="${WEB_PORT:-8005}"
GEOMETRY="${GEOMETRY:-1280x800}"
DEPTH="${DEPTH:-24}"
LOCALHOST_ONLY="${LOCALHOST_ONLY:-yes}"
NOVNC_WEB_ROOT="${NOVNC_WEB_ROOT:-/usr/share/novnc}"
VNC_RFB_PORT="${VNC_RFB_PORT:-$((5900 + DISPLAY_NUM))}"
PID_FILE="${PID_FILE:-/tmp/novnc-${WEB_PORT}.pid}"
LOG_FILE="${LOG_FILE:-/tmp/novnc-${WEB_PORT}.log}"
VNC_START_LOG="${VNC_START_LOG:-/tmp/vncserver-${DISPLAY_NUM}-start.log}"

usage() {
  cat <<EOF
Usage: $0 {start|stop|restart|status|logs}

Environment overrides:
  WEB_PORT=$WEB_PORT              noVNC/websockify listen port
  DISPLAY_NUM=$DISPLAY_NUM            VNC X display number (:DISPLAY_NUM)
  VNC_RFB_PORT=$VNC_RFB_PORT          VNC RFB port, defaults to 5900 + DISPLAY_NUM
  GEOMETRY=$GEOMETRY          Desktop size
  DEPTH=$DEPTH                 Desktop color depth
  LOCALHOST_ONLY=$LOCALHOST_ONLY      Bind VNC backend to localhost only: yes/no
  NOVNC_WEB_ROOT=$NOVNC_WEB_ROOT
  PID_FILE=$PID_FILE
  LOG_FILE=$LOG_FILE

Examples:
  $0 start
  $0 stop
  $0 restart
  WEB_PORT=8006 DISPLAY_NUM=6 $0 start
EOF
}

require_command() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

port_pid() {
  local port="$1"

  if command -v ss >/dev/null 2>&1; then
    ss -ltnp 2>/dev/null \
      | awk -v port=":$port" '$4 ~ port"$" {print $NF}' \
      | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' \
      | sort -u
    return 0
  fi

  if command -v netstat >/dev/null 2>&1; then
    netstat -ltnp 2>/dev/null \
      | awk -v port=":$port" '$4 ~ port"$" {split($7,a,"/"); if (a[1] ~ /^[0-9]+$/) print a[1]}' \
      | sort -u
    return 0
  fi

  return 0
}

is_process_running() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1
}

is_display_running() {
  vncserver -list 2>/dev/null | awk 'NR > 2 {print $1}' | grep -qx "$DISPLAY_NUM"
}

clean_stale_vnc() {
  vncserver -list -cleanstale >/tmp/vnc-clean.log 2>&1 || true
}

stop_novnc() {
  local pid=""

  if [[ -f "$PID_FILE" ]]; then
    pid="$(tr -cd '0-9' < "$PID_FILE" || true)"
    if is_process_running "$pid"; then
      echo "Stopping noVNC/websockify pid $pid"
      kill "$pid" || true
    fi
    rm -f "$PID_FILE"
  fi

  # Fallback for stale/missing pid file: stop only websockify processes that own WEB_PORT.
  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    if ps -p "$pid" -o comm= -o args= 2>/dev/null | grep -q 'websockify'; then
      echo "Stopping noVNC/websockify on port $WEB_PORT pid $pid"
      kill "$pid" || true
    else
      echo "Port $WEB_PORT is used by pid $pid, but it is not websockify; leaving it running" >&2
    fi
  done < <(port_pid "$WEB_PORT")
}

start_vnc() {
  require_command vncserver
  mkdir -p "$HOME/.vnc"
  clean_stale_vnc

  if is_display_running; then
    echo "VNC display :$DISPLAY_NUM is already running"
    return 0
  fi

  echo "Starting VNC display :$DISPLAY_NUM on RFB port $VNC_RFB_PORT"
  vncserver ":$DISPLAY_NUM" \
    -localhost "$LOCALHOST_ONLY" \
    -geometry "$GEOMETRY" \
    -depth "$DEPTH" \
    >"$VNC_START_LOG" 2>&1
}

start_novnc() {
  require_command websockify

  if [[ ! -d "$NOVNC_WEB_ROOT" ]]; then
    echo "noVNC web root not found: $NOVNC_WEB_ROOT" >&2
    exit 1
  fi

  local existing_pids
  existing_pids="$(port_pid "$WEB_PORT" | tr '\n' ' ' | xargs || true)"
  if [[ -n "$existing_pids" ]]; then
    if ps -p ${existing_pids} -o comm= -o args= 2>/dev/null | grep -q 'websockify'; then
      echo "noVNC/websockify is already running on port $WEB_PORT pid(s): $existing_pids"
      return 0
    fi

    echo "Port $WEB_PORT is already in use by pid(s): $existing_pids" >&2
    echo "Run '$0 stop' first, or choose another port: WEB_PORT=8006 $0 start" >&2
    exit 1
  fi

  echo "Starting noVNC on 0.0.0.0:$WEB_PORT -> localhost:$VNC_RFB_PORT"
  nohup websockify --web="$NOVNC_WEB_ROOT" "0.0.0.0:$WEB_PORT" "localhost:$VNC_RFB_PORT" \
    >"$LOG_FILE" 2>&1 &
  echo "$!" > "$PID_FILE"
  sleep 1

  if ! is_process_running "$(cat "$PID_FILE")"; then
    echo "Failed to start noVNC/websockify. Log:" >&2
    tail -50 "$LOG_FILE" >&2 || true
    exit 1
  fi
}

start() {
  start_vnc
  start_novnc
  status
}

stop() {
  require_command vncserver
  stop_novnc

  clean_stale_vnc
  if is_display_running; then
    echo "Stopping VNC display :$DISPLAY_NUM"
    vncserver -kill ":$DISPLAY_NUM" >/dev/null 2>&1 || true
  else
    echo "VNC display :$DISPLAY_NUM is not running"
  fi

  clean_stale_vnc
  status
}

status() {
  echo "VNC sessions:"
  vncserver -list 2>&1 || true

  echo
  echo "Listening ports for WEB_PORT=$WEB_PORT and VNC_RFB_PORT=$VNC_RFB_PORT:"
  if command -v ss >/dev/null 2>&1; then
    ss -ltnp 2>/dev/null | awk -v web=":$WEB_PORT" -v rfb=":$VNC_RFB_PORT" 'NR == 1 || $4 ~ web"$" || $4 ~ rfb"$"' || true
  elif command -v netstat >/dev/null 2>&1; then
    netstat -ltnp 2>/dev/null | awk -v web=":$WEB_PORT" -v rfb=":$VNC_RFB_PORT" 'NR == 1 || $4 ~ web"$" || $4 ~ rfb"$"' || true
  else
    echo "Neither ss nor netstat is available"
  fi

  echo
  echo "noVNC URL: http://<machine>:$WEB_PORT/vnc.html"
  echo "PID file: $PID_FILE"
  echo "Log file: $LOG_FILE"
}

logs() {
  echo "== noVNC log: $LOG_FILE =="
  tail -80 "$LOG_FILE" 2>/dev/null || echo "No noVNC log found"
  echo
  echo "== VNC start log: $VNC_START_LOG =="
  tail -80 "$VNC_START_LOG" 2>/dev/null || echo "No VNC start log found"
}

case "$ACTION" in
  start) start ;;
  stop) stop ;;
  restart)
    stop
    start
    ;;
  status) status ;;
  logs) logs ;;
  -h|--help|help) usage ;;
  *)
    usage >&2
    exit 2
    ;;
esac
