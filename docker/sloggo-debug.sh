#!/bin/sh
set -eu

frontend_port="${SLOGGO_FRONTEND_PORT:-${SLOGGO_API_PORT:-3000}}"
backend_port="${SLOGGO_INTERNAL_API_PORT:-8080}"

export SLOGGO_API_PORT="$backend_port"
export SLOGGO_DEBUG_PROXY_API="true"
export SLOGGO_BACKEND_ORIGIN="http://127.0.0.1:${backend_port}"

cleanup() {
  if [ "${backend_pid:-}" != "" ] && kill -0 "$backend_pid" 2>/dev/null; then
    kill "$backend_pid" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

/app/sloggo &
backend_pid=$!

cd /app
exec pnpm exec next dev --hostname 0.0.0.0 --port "$frontend_port"
