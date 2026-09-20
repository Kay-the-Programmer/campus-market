# CampusMarket

Student-to-student campus marketplace: products, services and food, with peer-to-peer
meetup coordination instead of centralised payments.

- **Backend** — Java 21 / Spring Boot 3.4 REST API, PostgreSQL 16, Flyway migrations, running in Docker.
- **Frontend** — React 19 + Vite + Tailwind, talking to the API through a dev proxy.

## Running it

Docker Desktop must be running. The API image builds Maven and the JDK inside the
container, so no local Java install is needed.

Copy `.env.example` to `.env` first — `POSTGRES_PASSWORD` is required, and Compose
refuses to start without it rather than defaulting to something guessable.

```bash
docker compose up -d --build
```

That starts Postgres and the API on `http://localhost:8080`. Flyway creates the schema
on first boot and demo data is seeded automatically.

Then start the frontend:

```bash
npm install && npm run dev
```

The app is on `http://localhost:3000` and proxies `/api` to the backend.

Useful extras:

```bash
npm run api:logs
```

To wipe the database and reseed from scratch:

```bash
docker compose down -v && docker compose up -d --build
```

## Deploying

Compose is split in three, and the split is load-bearing: dev conveniences that
would be dangerous in production live in a file the production command never
loads.

| File | Loaded when | Holds |
|---|---|---|
| `docker-compose.yml` | always | Postgres and the API. No published ports, no dev flags. |
| `docker-compose.override.yml` | bare `docker compose` only | Published ports, dev tokens, verbose errors, rate limiting off. |
| `docker-compose.prod.yml` | named explicitly | Restart policies, rate limiting on, the shared edge network. |

### The current production topology

The frontend and the API are deployed to different places, and the split is worth
stating plainly because most of the configuration below only makes sense in light
of it:

- **Frontend — Vercel.** Built from this repo. It needs `VITE_API_BASE_URL` set in
  Vercel's own Project Settings → Environment Variables, because Vite reads it at
  build time and bakes the value into the bundle. Changing it requires a redeploy.
- **API — a Google Cloud VM**, behind the Caddy that belongs to the *SalePilot*
  stack on the same box. That Caddy publishes host ports 80 and 443; two containers
  cannot publish the same port, so this project does not run an edge of its own in
  production. It joins a shared Docker network instead, and SalePilot's Caddyfile
  has the site block that terminates TLS for the API domain and proxies to it.

Because the two are on different origins, CORS is real and is enforced by the API:
`CAMPUSMARKET_CORS_ORIGINS` must list the origin **serving the frontend** — not the
API's own domain, which needs no entry. The API logs the allowlist it resolved on
startup; read that line before theorising about a CORS failure.

### On the VM

Once per box, create the network the two projects share:

```bash
docker network create edge
```

Then set `POSTGRES_PASSWORD` and `CAMPUSMARKET_CORS_ORIGINS` in `.env`, point the
API domain's DNS at the box, and:

```bash
npm run prod:up
```

`SITE_ADDRESS` and this repo's own `Caddyfile` belong to the all-in-one deployment,
where one Caddy serves both the SPA and the API on a single origin. That is not the
setup above, and nothing in the production path reads either of them.

**Type the production command, never a bare `docker compose up`.** On the VPS a bare
`up` silently pulls in `docker-compose.override.yml`, which publishes the database
port and turns password-reset tokens back on in API responses. `npm run prod:up`
exists so that command is one word instead of a long one worth mistyping.

Database backups are not automatic. `scripts/backup-db.sh` is a nightly `pg_dump`
intended for cron — read the header, set `BACKUP_REMOTE`, and restore one dump into
a scratch database before trusting it.

### Starting from a clean database

`CAMPUSMARKET_SEED_DEMO_DATA=false` only stops demo rows being *written*. Rows seeded
on an earlier boot stay exactly where they are, so a site that was ever brought up
with seeding on still has Alex Rivers and five sample listings in it. Clearing them is
a database operation, and the honest way to do it is to throw the database away:

```bash
# 1. What is actually in there? Do this before deciding.
docker exec campusmarket-db psql -U campusmarket -d campusmarket \
  -c "select email, role, created_at from users order by created_at;"

# 2. Take a dump you can go back to.
./scripts/backup-db.sh

# 3. Destroy the data and rebuild it empty.
docker compose -f docker-compose.yml -f docker-compose.prod.yml down -v
npm run prod:up
```

**`down -v` deletes every volume this project owns** — the database *and* the uploads
volume. It is irreversible. Step 1 exists because "start fresh" and "delete the accounts
people have already signed up with" are the same command, and only the row listing tells
you which one you are actually running.

What comes back: the eight categories, and one administrator built from
`CAMPUSMARKET_ADMIN_EMAIL` / `_NAME`. Nothing else.

### How the administrator signs in

With Google, exactly like everyone else — there is no password form anywhere in
the app. The seeder creates the account with the `ADMIN` role and no password; the
first time someone signs in with the Google account for that exact address,
`AuthService.googleSignIn` finds the existing row by Google-verified email, links
the Google identity to it, and the role carries across.

Two consequences worth stating plainly:

- **`CAMPUSMARKET_ADMIN_EMAIL` must be a Google account you can sign in to.** A
  Gmail address, or a Workspace address on a domain with Google sign-in. Anything
  else creates an administrator nobody can become, which is why the production
  compose file refuses to start without the variable set.
- **The email is the credential.** Whoever controls that Google account is the
  admin. Protect it the way you would a root password — 2-step verification on,
  recovery options current.

Locked out — lost the Google account, or set the wrong address? Change
`CAMPUSMARKET_ADMIN_EMAIL` to any Google account you control and restart. The seeder
promotes an existing account with that address to `ADMIN` (or creates one), and you
sign in with Google. The previous admin account is left untouched.

## Demo accounts

These exist only when `CAMPUSMARKET_SEED_DEMO_DATA=true`, which is the local default and
is hardcoded off in `docker-compose.prod.yml`.

| Account | Password | Why it exists |
|---|---|---|
| `admin@campus.edu` | `Admin123!` (local only — set `CAMPUSMARKET_ADMIN_PASSWORD` in production) | Admin console |
| `alex.rivers@campus.edu` | `Password123` | Customer **with** listings → renders the Seller nav |
| `emma.w@campus.edu` | `Password123` | Customer with **no** listings → renders the Customer nav |
| `john.doe@campus.edu`, `sarah.j@campus.edu`, `marcus.c@campus.edu` | `Password123` | Other sellers |

In development a dark bar at the top switches between these accounts. It performs a real
password login each time — there is no back door that mints a session — and it is compiled
out of production builds.

## Email-driven flows

Signup verification and password reset issue real single-use tokens. There is no mail
provider wired up, so `LoggingEmailService` prints the link to the container log
(`npm run api:logs`). With `CAMPUSMARKET_EXPOSE_DEV_TOKENS=true` (the compose default)
the token is also returned in the API response, which is what powers the "Dev shortcut"
button in the auth modal. **Both must be off in production** — set the env var to `false`
and swap in a real `EmailService` implementation.

## Push notifications

Everything that writes a notification also sends a push: new messages, every order
transition, reviews, moderation actions, and price drops on listings you saved. There is
one call site per event — `NotificationService.notify` — so a workflow that notifies is
pushable the day it ships.

Delivery goes through Firebase Cloud Messaging, reusing the service-account key that
already powers "Continue with Google". It is optional in exactly the same way: with no
credentials the API starts normally, notifications still appear in-app, and the UI hides
the opt-in rather than offering a switch that cannot do anything.

To enable it, add the client half to a `.env` at the repo root (values from Firebase
Console → Project settings; the VAPID key is under Cloud Messaging → Web Push
certificates):

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_VAPID_KEY=...
```

The server half is the same `CAMPUSMARKET_FIREBASE_CREDENTIALS_JSON` variable Google
sign-in uses — no second secret.

Turning it on is a per-device act (browser permission) and a per-account one (which
activities may interrupt you). The prompt lives on the notifications screen and the
toggles on your own profile. Both are needed, which is why they explain each other:
permission cannot follow you between devices, and preferences cannot be asked for by a
browser.

Notes worth knowing when working on this:

- The backend sends **data-only** messages. `assets/firebase-messaging-sw.js` decides what
  to display and what a click does, so notification copy and deep-link behaviour live in
  one file instead of split across a payload and a worker.
- Sends happen after the transaction commits, on a bounded executor. Checkout never waits
  on Google, and a notification is never delivered for an order that failed to save.
- Dead tokens are pruned when FCM reports them, which is the only garbage collection
  `push_devices` gets.
- Logout unregisters the device before clearing the session — a shared campus laptop must
  stop buzzing for the account that just signed out.
- Moderation notices have no per-type opt-out. They explain actions taken *on* an account,
  so muting them would make enforcement invisible to the person it applies to. The master
  push switch still silences everything.

## Architecture notes

**Sessions are server-side, not JWTs.** Tokens are opaque and stored in `user_sessions`.
This is what makes two spec requirements actually true: banning a user kills their live
session on the next request, and resetting a password logs out every other session. A
stateless JWT could not do either without a revocation list.

**"Seller" is derived, never stored.** A seller is a customer with at least one `ACTIVE`
or `RESERVED` listing. It is recomputed per request in `SessionAuthFilter`, so publishing
a first listing flips the navigation immediately with no re-login.

**Contact details are omitted, not hidden.** `DtoMapper` is the only place email, phone or
address can enter a response, and it emits them only for the account owner or an admin —
so another logged-in customer viewing a profile receives a payload with no contact block
at all.

**Restricted sellers are filtered at query time.** Suspending a user hides their listings
via `ListingSpecifications.publiclyVisible()` rather than by mutating listing rows, so
reinstatement restores them automatically and a lapsed suspension stops hiding them on
its own.

## Layout

```
backend/                 Spring Boot API
  src/main/java/com/campusmarket/
    domain/              JPA entities + enums
    repository/          Spring Data repositories
    security/            Session filter, Principal, AccessGuard
    service/             Workflow logic
    web/                 Controllers, DTOs, error handling
  src/main/resources/db/migration/   Flyway schema
src/                     React frontend
docker-compose.yml       Postgres + API
```
