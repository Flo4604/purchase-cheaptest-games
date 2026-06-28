# Web App Plan

Turn the Steam purchase helper (currently an inquirer CLI in `src/`) into a
multi-user web app, without losing the hard-won Steam scraping/automation logic
in `src/helper/steam.js`.

## 1. Decisions (locked)

- **User-present only.** No background/scheduled automation. The user logs in,
  kicks off a flow, and watches it run. This is what makes zero-knowledge
  encryption possible.
- **Zero-knowledge credential storage.** Steam refresh tokens are encrypted with
  a key derived from the user's app password. A DB breach (even full server
  breach) leaks only ciphertext.
- **The Steam engine runs in a persistent Node runtime** (a container), NOT in
  Cloudflare Workers/DO and NOT in the browser. `steam-user`,
  `steam-tradeoffer-manager`, `steamcommunity`, `steamstore`, `steam-session`
  need Node's `net`/`tls`/`crypto` and long-lived connections.
- **No Durable Object per account, no VM per account.** A shared,
  concurrency-limited job pool with a per-account lock does the same job with far
  less complexity.
- **Rewrite in TypeScript + Effect.** Effect's `Schedule`/`retry`/`RateLimiter`/
  typed errors fit Steam's flakiness (429s, partial failures) far better than the
  current manual `sleep`/retry.
- **Turso (libSQL) for data**, storing ciphertext for tokens. The current Prisma
  SQLite schema ports over almost directly.
- **Steam tokens are all-or-nothing.** Valve does not let you mint a scoped
  ("market-only") token. Any "scoped capability" is *our* app-level authz over
  which flows a session may run — not a real restriction on the Steam credential.

## 2. Architecture

```
╭──────────────╮   HTTPS / WS    ╭───────────────────────────╮
│  Web client  │────────────────▶│  Node service (Effect)    │
│  (dashboard) │◀── progress ────│  - HTTP API + WS          │
╰──────────────╯   events (WS)   │  - auth + session         │
                                 │  - job queue + per-acct   │
                                 │    lock + concurrency cap │
                                 │  - Steam engine in-proc   │
                                 ╰───────┬───────────┬───────╯
                                         │           │
                                         ▼           ▼
                                   ╭──────────╮  ╭──────────╮
                                   │ Turso    │  │ Steam    │
                                   │(ciphertxt)│ │ servers  │
                                   ╰──────────╯  ╰──────────╯
```

Single Node service to start: it serves the API/WS *and* runs the engine
in-process behind a job pool. Split the engine into its own service later only if
needed (see §9 scaling).

## 3. Security design (the core of the product)

The asset is the Steam **refresh token** (bearer cred, ~200-day life).

### Key hierarchy (envelope encryption)

```
password ──Argon2id(salt_auth)──▶ auth hash        (stored; for login)
password ──Argon2id(salt_kek)───▶ KEK              (NEVER stored; in memory only)

random 32-byte DEK ──AES-256-GCM──▶ encrypted Steam refresh token
KEK ──AES-256-GCM──▶ wrapped DEK

DB row stores: { auth_hash, salt_auth, salt_kek, wrapped_DEK, dek_nonce,
                 encrypted_token, token_nonce }   ← all ciphertext/salts
```

- Two independent Argon2id derivations from the password: one for the login
  hash, one for the KEK. The KEK is never persisted anywhere.
- The DEK indirection means a password change only re-wraps the DEK; the token
  ciphertext is untouched.
- **On login:** re-derive KEK from the submitted password → unwrap DEK → decrypt
  the refresh token, all in process memory, held only for the session lifetime,
  then wiped.
- **Breach properties:** DB-only breach → useless ciphertext. Full-server breach
  while no user is logged in → still useless. The only residual risk is offline
  brute force of weak passwords → mitigate with strong Argon2id params
  (e.g. m=64MB+, t=3, p=1) and a password policy.

### Session handling

- After password verification, mint a short-lived server session (httpOnly,
  Secure, SameSite cookie). The unwrapped DEK (or the decrypted token) lives in
  the engine process memory keyed by session, never written to disk.
- Session expiry / logout wipes the in-memory key. Re-running a flow after expiry
  re-prompts for the password.
- Steam token refresh/rotation (steam-session) happens in-session; the new
  refresh token is re-encrypted with the in-memory DEK and persisted.

### What we deliberately do NOT do

- No storing the password, KEK, or DEK in plaintext anywhere.
- No "undeletable browser storage" scheme (it solved a non-problem and added huge
  complexity).
- No background jobs that would force a server-held decryption key.

## 4. Data model (Turso / libSQL)

Port the current Prisma models, with changes:

- **User** (new): `id`, `email`, `auth_hash`, `salt_auth`, `salt_kek`,
  `created_at`. Owns Steam accounts.
- **Account** (changed): drop plaintext `accessToken`/`refreshToken`; add
  `wrapped_dek`, `dek_nonce`, `encrypted_refresh_token`, `token_nonce`,
  `user_id` (FK). Keep `username`, per-account config (`limit`, `usage`,
  `maxPrice`, `priceOptionsFlag`, `mode`).
- **App / BundleApp**: unchanged (shared game catalog/cache).
- **ActivatedKey**: unchanged, scoped by `accountId`.
- **ItemNameId**: **delete** — dead after the SSR parser change (orderbook now
  comes from the listing page's SSR blob).
- **Job** (new): `id`, `account_id`, `type` (buy/sell/cleanup/gems/redeem/
  activate), `status` (queued/running/done/failed/canceled), `params_json`,
  `progress_json`, `created_at`, `finished_at`, `error`. Backs the queue, history,
  and resumable progress.

Migration: **Drizzle ORM** (libSQL driver) — works for both a local SQLite file
and Turso. The legacy `src/db/` layer has already been ported from Prisma to
Drizzle.

## 5. The engine

`src/helper/steam.js` (2235 lines) becomes a typed `SteamEngine` service:

- One class/Effect service per logged-in account session, holding the
  `steam-user` CM connection + `steamcommunity`/`steamstore` cookie jars.
- Public methods mirror the current flows: `buyGames`, `sellItems`,
  `removeOverpricedItems` (cleanup), `turnIntoGems`, `redeemApps`,
  `activateKeys`, plus read helpers (`getWalletBalance`, `getOwnedApps`,
  `getOwnedAppsCount`).
- **Progress as a stream**, not `cli-progress`/`logger`: each method emits typed
  progress events (`{step, current, total, message, level}`) consumed by the WS
  layer. This replaces all terminal UI.
- Wrap Steam calls in Effect: `RateLimiter` for the 75–100ms sleeps and 429
  handling, `retry` with `Schedule.exponential` for transient failures, typed
  errors (`SteamRateLimited`, `SteamAuthExpired`, `SsrParseError`, …).
- The already-ported `src/helper/ssrParser.js` + `getListingOrderbook` move in
  as-is (logic validated against live pages).

CM connection is established **per job** (logon with refresh token → do work →
logoff), not held forever per account.

## 6. Job model & concurrency

- A flow run = a `Job` row + an in-memory worker.
- **Per-account lock**: at most one running job per account (DB advisory lock or a
  `status='running'` guard). Prevents concurrent Steam sessions clobbering each
  other.
- **Global concurrency cap**: pool size N across all accounts (Steam rate limits +
  memory). Effect `Semaphore`/queue.
- Progress streamed to the client over WS; on disconnect the job keeps running and
  the client can re-attach by job id.

## 7. API surface (sketch)

- `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`
- `POST /accounts` (add Steam account via QR/token login; encrypt + store)
- `GET /accounts` (list, with cached wallet/owned-count)
- `POST /accounts/:id/unlock` (submit password → derive KEK in memory for session)
- `POST /accounts/:id/jobs` (start a flow: buy/sell/cleanup/gems/redeem/activate
  with params; returns job id)
- `GET /accounts/:id/jobs`, `GET /jobs/:id`
- `POST /jobs/:id/cancel`
- `WS /jobs/:id/stream` (live progress events)

## 8. Frontend (locked: TanStack Start + StyleX)

- **Framework: TanStack Start** (React, Vite, TanStack Router + Query). Used as a
  **thin BFF**: session cookies, auth, and proxying/authorizing requests to the
  engine. The Steam engine and the in-memory KEK NEVER live in the web tier.
- **Data/realtime:** TanStack Query as the async-state layer; job progress
  streamed over WS is pushed into the query cache (`setQueryData`). WS can run
  browser↔engine directly (token-authed) or proxied via the BFF.
- **Styling: StyleX** (compile-time atomic CSS, typed). Implies:
  - No shadcn/ui (Tailwind-based). Use **Base UI** (`@base-ui/react`, the MUI/
    Radix/Floating UI team's unstyled v1 library) for headless primitives,
    styled with StyleX. (Not Uber's `baseui`/Base Web — that ships Styletron.)
  - Design tokens via StyleX `defineVars` (colors, spacing, tabular numerals),
    dark-first.
  - Requires the StyleX Vite/babel plugin.
- **Screens:**
  - Dashboard: per-account cards — wallet balance, owned-game count, badge
    progress ring.
  - Account view: flow launchers mirroring the current inquirer steps (the
    existing `src/index.js` flow logic is the spec).
  - Live job view: side panel/drawer with progress bar + streamed (virtualized)
    log lines, cancel, reconnect-on-disconnect.
- **Design:** dense-but-calm, dark-first, restrained accent, clean sans (Inter/
  Geist) with monospace/tabular numerals for all prices/counts so live updates
  don't jitter. Bespoke, not generic.

## 9. Tech stack & deployment

- **Runtime:** Node (LTS) + TypeScript + Effect (`@effect/platform` HTTP server).
- **Web tier:** TanStack Start (React/Vite) + StyleX + Base UI (@base-ui/react) primitives.
- **DB:** Turso (libSQL) via Drizzle ORM; local libSQL/SQLite file for dev.
- **Engine host:** a persistent container — Fly.io / Railway / VPS / Cloudflare
  Containers. NOT plain Workers (no raw TCP to Steam CM, CPU/wall-clock limits).
- **Crypto:** `argon2` (Argon2id) + Node `crypto` AES-256-GCM. No homegrown crypto.
- **Scaling (later):** horizontal replicas behind a shared queue + per-account
  lock. Because the in-memory session key can't move between instances, use
  sticky sessions (or re-derive on the owning instance). Split the engine into a
  dedicated worker service only when one process isn't enough.

## 10. Phased rollout

0. **Foundations** — new TS project skeleton (Effect HTTP server), pick
   set up Turso, CI + tests. (Frontend: TanStack Start + StyleX; ORM: Drizzle — both locked.)
1. **Engine extraction** — wrap `steam.js` flows behind a typed `SteamEngine`
   service emitting progress events (no behavior change). Migrate `util`,
   `constants`, `db/*`, `ssrParser` to TS first.
2. **Effect hardening** — replace manual sleeps/retries with RateLimiter/retry/
   typed errors; verify each flow.
3. **Auth + crypto** — User model, Argon2id + envelope encryption, register/login,
   add-account (QR/token) with encrypt-at-rest.
4. **Jobs + API** — job queue, per-account lock, concurrency cap, REST + WS.
5. **Web dashboard** — accounts overview + flow launchers + live job view.
6. **Deploy** — container for the Node service, Turso in prod, secrets/config,
   observability (Sentry on `SsrParseError` so a Valve UI change is loud).

The inquirer CLI (`src/index.js`) stays during the migration as the reference
implementation and a second client; remove it once the web app reaches parity.

## 11. Open questions / risks

- **`getMarketListings` parity** — verify the logged-in `/market/mylistings/render/`
  HTML still matches the cheerio selectors (esp. `.market_listing_item_name_link`)
  with one real cleanup run before relying on it.
- **Steam UI drift** — the SSR blob shape can change; keep parser sentinel errors
  loud (alert on parse failures).
- **Account safety** — automating purchases/market actions carries Steam ToS and
  rate-limit risk; conservative pacing + clear user consent.
- **Multi-instance key handling** — confirm sticky-session approach before scaling
  past one engine process.
```
