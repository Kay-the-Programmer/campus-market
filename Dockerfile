# ---- Build stage: produces dist/ ----------------------------------------
FROM node:22-alpine AS build
WORKDIR /build

# Copied first so the dependency layer is cached independently of source
# changes - the same reason backend/Dockerfile splits pom.xml from src/.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Runtime stage: Caddy serves the build and fronts the API -----------
# Caddy rather than nginx for one reason: it provisions and renews Let's
# Encrypt certificates by itself, given a domain that resolves here. That is
# the single fiddliest part of putting a small app on a VPS, and it is the
# whole config below rather than a certbot sidecar with a renewal timer.
FROM caddy:2-alpine AS runtime

COPY --from=build /build/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile

# 80 is not optional even for an HTTPS-only site: the ACME HTTP-01 challenge
# and the redirect to HTTPS both need it.
EXPOSE 80 443
