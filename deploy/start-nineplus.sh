#!/usr/bin/env bash
# Start (or restart) Product Plus on the nineplus server as user `product` — no root needed.
# api: built dist on :4010 · web: `next start` on :3020 (Apache vhost product-plus.nineplus.co.th → :3020).
# Run after `pnpm build`. Also run from `crontab -e`:  @reboot /home/product/product-plus/deploy/start-nineplus.sh
#
# The api runs WITHOUT NODE_ENV=production on purpose: production makes the session cookie `secure`, which the
# browser drops over plain http. Switch it on (and set APP_PASSWORD) once the site has a real https certificate.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
LOGS="$HOME/logs/product-plus"
# ~/.local/bin holds pnpm and the claude CLI (AI_BACKEND=cli); cron starts with a bare PATH.
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
mkdir -p "$LOGS"

stop_port() {
  local pids
  pids="$(ss -ltnpH "sport = :$1" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u || true)"
  [ -z "$pids" ] && return 0
  kill $pids 2>/dev/null || true
  for _ in $(seq 1 20); do ss -ltnH "sport = :$1" | grep -q . || return 0; sleep 0.5; done
  echo "port $1 still busy" >&2
  return 1
}

stop_port 4010
stop_port 3020

cd "$REPO/apps/api"
setsid nohup node --env-file-if-exists=.env dist/main.js >>"$LOGS/api.log" 2>&1 </dev/null &
cd "$REPO/apps/web"
setsid nohup pnpm start >>"$LOGS/web.log" 2>&1 </dev/null &

for _ in $(seq 1 60); do
  if curl -fs -o /dev/null http://127.0.0.1:4010/api/health && curl -s -o /dev/null http://127.0.0.1:3020/login; then
    echo "product-plus up (api :4010, web :3020) — logs in $LOGS"
    exit 0
  fi
  sleep 1
done
echo "product-plus did not come up in 60 s — see $LOGS" >&2
exit 1
