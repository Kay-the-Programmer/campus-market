# CampusMarket

Student-to-student campus marketplace: products, services and food, with peer-to-peer
meetup coordination instead of centralised payments.

- **Backend** — Java 21 / Spring Boot 3.4 REST API, PostgreSQL 16, Flyway migrations, running in Docker.
- **Frontend** — React 19 + Vite + Tailwind, talking to the API through a dev proxy.

## Running it

Docker Desktop must be running. The API image builds Maven and the JDK inside the
container, so no local Java install is needed.

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

## Demo accounts

| Account | Password | Why it exists |
|---|---|---|
| `admin@campus.edu` | `Admin123!` | Admin console |
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
