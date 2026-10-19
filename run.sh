#!/usr/bin/env bash
# Runs the end-to-end UI tests in Docker, against a throwaway stack:
#   db    Postgres (in memory; gone when the run ends)
#   llm   a stand-in AI model with scripted answers (fake-llm/server.py)
#   api   the backend, built from ../customer-data
#   web   the production web app, built from ../website, with /api/ proxied to the backend
#   tests Playwright + Chromium, recording one video per test
# Videos are saved to videos/<test name>.webm; the HTML report to playwright-report/.
#
#   ./run.sh                   build, run every test, then remove the stack
#   ./run.sh -g "assistant"    extra arguments go to `playwright test`
#   ./run.sh --up              start the stack only, with the web app on
#                              http://localhost:18081 (for writing tests:
#                              `npm test` here runs them from your machine)
#   ./run.sh --down            remove a stack left by --up
#   ./run.sh --no-build        reuse the images from the last run
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
NAME=mustard-e2e
NETWORK=$NAME
HOST_PORT="${E2E_PORT:-18081}"
PLAYWRIGHT_IMAGE=mcr.microsoft.com/playwright:v1.63.0-noble

MODE=test
BUILD=1
ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --up) MODE=up ;;
    --down) MODE=down ;;
    --no-build) BUILD=0 ;;
    -h | --help) sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) ARGS+=("$1") ;;
  esac
  shift
done

step() { printf '\n\033[1;33m▸ %s\033[0m\n' "$*"; }

down() {
  docker rm -f "$NAME-tests" "$NAME-web" "$NAME-api" "$NAME-llm" "$NAME-db" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
}

if [ "$MODE" = down ]; then
  down
  echo "Removed the end-to-end stack."
  exit 0
fi

docker info >/dev/null 2>&1 || { echo "Docker isn't running." >&2; exit 1; }

if [ "$BUILD" = 1 ]; then
  step "Building images"
  docker build -q -t "$NAME-api" "$ROOT/customer-data"
  docker build -q -t "$NAME-web" "$ROOT/website"
  [ "$MODE" = test ] && docker build -q -t "$NAME-tests" "$HERE"
fi

# The website's own nginx config, plus the backend on the same origin under
# /api/ (as an ingress would do in production).
mkdir -p "$HERE/.generated"
awk '
  /^    location \/ \{/ && !done {
    print "    # End-to-end tests only: the backend on the same origin."
    print "    location /api/ {"
    print "        proxy_pass http://api:8080;"
    print "        proxy_set_header Host $host;"
    print "        proxy_read_timeout 180s;"
    print "    }"
    print ""
    done = 1
  }
  { print }
' "$ROOT/website/nginx.conf" > "$HERE/.generated/nginx.conf"
grep -q 'location /api/' "$HERE/.generated/nginx.conf" || { echo "Couldn't add the /api/ proxy to nginx.conf." >&2; exit 1; }

step "Starting the stack"
down
[ "$MODE" = test ] && trap down EXIT
docker network create "$NETWORK" >/dev/null
docker run -d --name "$NAME-db" --network "$NETWORK" --network-alias db \
  -e POSTGRES_USER=mustard -e POSTGRES_PASSWORD=mustard -e POSTGRES_DB=mustard \
  --tmpfs /var/lib/postgresql/data postgres:17 >/dev/null
docker run -d --name "$NAME-llm" --network "$NETWORK" --network-alias llm \
  -v "$HERE/fake-llm:/app:ro" python:3.12-alpine python /app/server.py >/dev/null
for _ in $(seq 1 60); do
  docker exec "$NAME-db" pg_isready -q -h 127.0.0.1 -U mustard -d mustard && break
  sleep 1
done
docker run -d --name "$NAME-api" --network "$NETWORK" --network-alias api \
  -e DATABASE_URL='postgres://mustard:mustard@db:5432/mustard?sslmode=disable' \
  -e CORS_ALLOWED_ORIGINS="http://web:8080,http://localhost:$HOST_PORT" \
  -e LLM_PROVIDER=openai -e LLM_BASE_URL=http://llm:8000/v1 -e LLM_MODEL=stand-in \
  "$NAME-api" >/dev/null
docker run -d --name "$NAME-web" --network "$NETWORK" --network-alias web \
  -p "$HOST_PORT:8080" \
  -v "$HERE/.generated/nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
  "$NAME-web" >/dev/null

if [ "$MODE" = up ]; then
  echo "The stack is up: http://localhost:$HOST_PORT (./run.sh --down removes it)."
  exit 0
fi

step "Running the tests"
mkdir -p "$HERE/videos" "$HERE/playwright-report" "$HERE/test-results"
rm -f "$HERE/videos/"*.webm
status=0
docker run --name "$NAME-tests" --network "$NETWORK" --ipc=host \
  -e BASE_URL=http://web:8080 -e CI=1 \
  -v "$HERE/videos:/tests/videos" \
  -v "$HERE/playwright-report:/tests/playwright-report" \
  -v "$HERE/test-results:/tests/test-results" \
  "$NAME-tests" npx playwright test ${ARGS[@]+"${ARGS[@]}"} || status=$?

if [ "$status" != 0 ]; then
  step "Backend log (last 40 lines)"
  docker logs --tail 40 "$NAME-api" 2>&1 || true
fi
step "Videos"
ls -1 "$HERE/videos" 2>/dev/null || true
exit "$status"
