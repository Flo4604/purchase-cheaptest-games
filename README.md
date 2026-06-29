# purchase-cheaptest-games

Multi-user web app around the Steam purchase/market engine. pnpm + Turborepo
monorepo (`@psg/*`): an Effect-based engine (HTTP + WebSocket), a TanStack Start
dashboard, and shared `db` / `core` / `crypto` packages.

## Run everything

```bash
pnpm install
pnpm dev
```

That's it — `pnpm dev` starts both apps and needs **no database setup**: the
engine embeds Postgres (pglite) and auto-migrates on boot.

- Web dashboard → http://localhost:3100
- Engine HTTP → http://localhost:3101 · WebSocket → ws://localhost:3102
  (the web dev server proxies `/api` and `/ws` to the engine, so cookies just work)

Open the dashboard, register, and add a Steam account (paste a refresh token).

## Production database

Dev uses embedded pglite. For real Postgres, set `DATABASE_URL` and the same
schema/migrations apply automatically:

```bash
DATABASE_URL="postgres://user:pass@host:5432/db" pnpm dev
```

## Other commands

```bash
pnpm test          # vitest (+ @effect/vitest)
pnpm typecheck     # all packages
pnpm --filter @psg/db db:generate   # regenerate migrations after schema changes
```

## Ports

| Service        | Port | Override      |
|----------------|------|---------------|
| Web dashboard  | 3100 | (vite.config) |
| Engine HTTP    | 3101 | `PORT`        |
| Engine WS      | 3102 | `WS_PORT`     |
