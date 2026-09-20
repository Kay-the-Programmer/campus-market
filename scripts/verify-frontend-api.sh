#!/usr/bin/env bash
#
# Checks that the browser path from the Vercel frontend to the API actually
# works, from outside the VM - which is the only vantage point that proves
# anything. Curling the API from the box itself passes even when DNS, TLS, the
# edge proxy or the CORS allowlist is wrong, because it skips all four.
#
#   scripts/verify-frontend-api.sh
#   scripts/verify-frontend-api.sh https://api.example.com https://app.example.com
#
# Exits non-zero if any check fails, so it is usable as a post-deploy gate.

set -uo pipefail

API="${1:-https://campusmarket.salepilot.space}"
ORIGIN="${2:-https://campus-market-mu.vercel.app}"

API="${API%/}"
ORIGIN="${ORIGIN%/}"

failures=0

pass() { printf '  \033[32mok\033[0m    %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; failures=$((failures + 1)); }
info() { printf '        %s\n' "$1"; }

# Nothing below pipes into `grep -q` or `head`, and that is deliberate: both
# exit as soon as they have their answer, which hands the upstream process in
# the pipe a SIGPIPE, and under `pipefail` that turns a successful match into a
# failed pipeline. Content is captured into a variable first and matched with
# the shell's own pattern matching instead.

# Header names are case-insensitive on the wire, so they are matched that way.
# The last occurrence wins, to mirror what a browser does.
header_value() {
  printf '%s' "$1" | grep -i "^$2:" | tail -1 | sed 's/^[^:]*: *//' | tr -d '\r'
}

lower() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

header_count() {
  printf '%s' "$1" | grep -ic "^$2:"
}

status_of() {
  printf '%s' "$1" | awk 'NR==1{print $2}'
}

is_2xx() {
  [ "${1:-000}" -ge 200 ] && [ "${1:-000}" -lt 300 ]
}

printf '\nAPI    %s\nOrigin %s\n\n' "$API" "$ORIGIN"

# --- 1. Is the API reachable at all? -------------------------------------
# Separated from the CORS checks below because a 502 here makes every one of
# them fail for a reason that has nothing to do with CORS - which is precisely
# the misdiagnosis this ordering exists to prevent.
printf 'Reachability\n'
health_code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$API/actuator/health" 2>/dev/null)
case "$health_code" in
  200)
    pass "GET /actuator/health -> 200"
    ;;
  502|503|504)
    fail "GET /actuator/health -> $health_code"
    info "The edge is up but cannot reach the API container. Usually one of:"
    info "  - the api container is not running:  docker ps | grep campusmarket-api"
    info "  - it is not on the shared network:   docker network inspect edge"
    info "  - the edge Caddyfile upstream is wrong (expects campusmarket-api:8080)"
    ;;
  000)
    fail "GET /actuator/health -> no response (DNS, TLS or firewall)"
    info "Check the API domain's A record points at the VM and that 443 is open."
    ;;
  *)
    fail "GET /actuator/health -> $health_code"
    ;;
esac

# --- 2. The preflight the browser will actually send ---------------------
# A non-GET request carrying an Authorization header is not "simple", so every
# write this app makes is preceded by exactly this OPTIONS request. If it does
# not come back with the three Allow-* headers, the real request is never sent
# and the app reports a network error with nothing in the server log.
printf '\nPreflight (OPTIONS /api/auth/login)\n'
pre=$(curl -sS -D - -o /dev/null -X OPTIONS --max-time 15 \
  -H "Origin: $ORIGIN" \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type,authorization' \
  "$API/api/auth/login" 2>/dev/null)

pre_code=$(status_of "$pre")
allow_origin=$(header_value "$pre" 'access-control-allow-origin')
allow_methods=$(header_value "$pre" 'access-control-allow-methods')
allow_headers=$(header_value "$pre" 'access-control-allow-headers')
origin_count=$(header_count "$pre" 'access-control-allow-origin')

if is_2xx "$pre_code"; then
  pass "status $pre_code"
else
  fail "status ${pre_code:-none} (a preflight must be 2xx)"
fi

if [ "$origin_count" -gt 1 ]; then
  # Two proxies each adding a header is a real and confusing failure mode:
  # browsers reject a duplicated Allow-Origin outright, so the app breaks in a
  # way that looks like CORS is missing rather than doubled.
  fail "Access-Control-Allow-Origin appears $origin_count times - browsers reject that"
  info "Something between here and the app is adding CORS headers of its own."
  info "Only the application should set them; check the edge Caddyfile."
elif [ "$allow_origin" = "$ORIGIN" ]; then
  pass "Access-Control-Allow-Origin: $allow_origin"
elif [ -n "$allow_origin" ]; then
  fail "Access-Control-Allow-Origin: $allow_origin (expected $ORIGIN)"
else
  fail "Access-Control-Allow-Origin missing - the origin is not on the allowlist"
  info "Add $ORIGIN to CAMPUSMARKET_CORS_ORIGINS and recreate the api container,"
  info "then compare against the 'CORS allowlist:' line in: npm run prod:logs"
fi

case "$allow_methods" in
  *POST*) pass "Access-Control-Allow-Methods: $allow_methods" ;;
  "")     fail "Access-Control-Allow-Methods missing" ;;
  *)      fail "Access-Control-Allow-Methods: $allow_methods (no POST)" ;;
esac

# Authorization is the one that matters: the app sends a bearer token on every
# authenticated request, and a preflight that omits it here blocks all of them
# while leaving anonymous reads working - so the app half-works, which reads
# as a session bug rather than a CORS one.
case "$(lower "$allow_headers")" in
  *authorization*) pass "Access-Control-Allow-Headers: $allow_headers" ;;
  "")              fail "Access-Control-Allow-Headers missing" ;;
  *)               fail "Access-Control-Allow-Headers: $allow_headers (no authorization)" ;;
esac

# --- 3. The real request ------------------------------------------------
# A passing preflight does not imply a passing response: the allowlist is
# consulted again for the actual request, and only this check proves the
# browser will be allowed to read the body it gets back.
printf '\nActual request (GET /api/listings)\n'
act=$(curl -sS -D - -o /dev/null --max-time 20 -H "Origin: $ORIGIN" "$API/api/listings" 2>/dev/null)
act_code=$(status_of "$act")
act_origin=$(header_value "$act" 'access-control-allow-origin')

if [ "${act_code:-000}" -ge 200 ] && [ "${act_code:-000}" -lt 400 ]; then
  pass "status $act_code"
else
  fail "status ${act_code:-none}"
fi

if [ "$act_origin" = "$ORIGIN" ]; then
  pass "Access-Control-Allow-Origin: $act_origin"
else
  fail "Access-Control-Allow-Origin: ${act_origin:-missing} (expected $ORIGIN)"
  info "Without this header the browser discards the response it just received."
fi

# --- 4. What the deployed bundle is actually calling ---------------------
# The frontend's API base is compiled in at build time, so the only way to know
# what production uses is to read production. A stale value here survives every
# server-side fix, and explains the case where everything above passes and the
# app still cannot reach the API.
printf '\nDeployed frontend\n'
index=$(curl -sS --max-time 20 "$ORIGIN/" 2>/dev/null)
bundle=$(printf '%s' "$index" | grep -oE '/assets/index-[A-Za-z0-9._-]+\.js' | sed -n '1p')
if [ -z "$bundle" ]; then
  fail "could not find the main bundle at $ORIGIN/"
else
  bundle_js=$(curl -sS --max-time 30 "$ORIGIN$bundle" 2>/dev/null)
  case "$bundle_js" in
    *"$API"*)
      pass "bundle $bundle is built against $API"
      ;;
    "")
      fail "bundle $bundle could not be downloaded"
      ;;
    *)
      fail "bundle $bundle does not reference $API"
      info "VITE_API_BASE_URL is wrong or stale on Vercel. It is read at BUILD"
      info "time, so set it in Vercel's environment variables and redeploy -"
      info "restarting anything on the VM will not change it."
      ;;
  esac
fi

printf '\n'
if [ "$failures" -eq 0 ]; then
  printf '\033[32mAll checks passed.\033[0m\n\n'
  exit 0
fi
printf '\033[31m%d check(s) failed.\033[0m\n\n' "$failures"
exit 1
