# film-and-music

Monorepo combining **Trailer Vision** (movies) and **Soundings** (music), with the **Constellations** collaboration graph embedded in the music app.

## Layout

| Path | App | Former repo name |
|------|-----|------------------|
| `apps/film-music` | **Unified shell** (Soundings + Trailer Vision under one Next app) | — |
| `packages/film-music-platform` | **Shared types + tab chrome** (`AppShell`, extension configs) | — |
| `apps/trailer-vision` | Trailer Vision (legacy standalone) | `movie-recs` |
| `apps/soundings` | Soundings (legacy standalone) | `earprint` |
| `packages/constellations` | Shared graph UI + logic | `Constellations` |

### Unified app (`apps/film-music`)

One Next.js app with a **unified** shell (`unifiedPlatformConfig` in [`@film-music/platform`](packages/film-music-platform/src/config/unified.ts)) so the same top nav works everywhere, including under `/m/...` and `/v/...` (no separate “music vs movie” chrome).

- **`/channels`** — **one list** for [music and movie channels at the same time](packages/film-music-platform/src/types.ts) (`ChannelKind`, `UnifiedChannel`). Pick an **active** channel; the [player](apps/film-music/app/(shell)/player/page.tsx) is meant to branch on `activeChannel.kind` (Spotify/YouTube vs trailers), not on `/m` vs `/v`.
- **`/player`**, **`/settings`** — shared routes under the `(shell)` group.
- **`/m/...`**, **`/v/...`** — namespaces for porting the legacy UIs (graph, help, etc.). `/m/channels` and `/v/channels` **redirect to `/channels`**.
- **State** — [`ActiveChannelContext`](apps/film-music/app/lib/ActiveChannelContext.tsx) holds the mixed channel list and active id (localStorage for now).

`musicPlatformConfig` and `moviesPlatformConfig` remain in the platform package for documentation / tooling; the running app uses **`unifiedPlatformConfig`**.

Run: **`npm run dev:unified`** → `http://127.0.0.1:3001`.

Install once at the repo root:

```bash
npm install
```

### Scripts

- `npm run dev:unified` — single app: `/` hub, `/m/*` music, `/v/*` movies
- `npm run dev` / `npm run dev:soundings` (alias: `dev:sounding`) — legacy Soundings (includes `/constellations` graph)
- `npm run dev:trailer-vision` — legacy Trailer Vision
- `npm run dev:constellations` — Constellations Vite app only (standalone)

### Spotify (Soundings)

Login uses **`SPOTIFY_CLIENT_ID`**, **`SPOTIFY_CLIENT_SECRET`**, and **`SPOTIFY_REDIRECT_URI`**. Put them in **`apps/soundings/.env.local`** *or* **`.env.local` at the monorepo root** (both are loaded; see [`apps/soundings/.env.example`](apps/soundings/.env.example) and [`.env.example`](.env.example)). Restart `npm run dev` after changing env files.

Use **`http://127.0.0.1:8000/callback`**, not `http://localhost:...` — Spotify rejects **`localhost` as an unsafe redirect URI** ([migration guide](https://developer.spotify.com/documentation/web-api/tutorials/migration-insecure-redirect-uri)). The same string must be listed in the [dashboard](https://developer.spotify.com/dashboard) redirect URIs. Open the app at **`http://127.0.0.1:8000`** so the host matches the OAuth redirect.

### Constellations inside Soundings

- Route: **`/constellations`**
- With a **`?q=Artist%20Name`** query, search starts on that name (Constellations’ normal URL behavior).
- Without `q`, the graph seeds from the **current track’s artist** stored in `sessionStorage` (updated while the player runs).
- **`?expand=title1,title2`** adds titles to try to **auto-expand** when matching nodes appear; the **current track title** is always merged into that list.
- For Gemini, set e.g. `NEXT_PUBLIC_GEMINI_API_KEY` in `apps/soundings/.env.local` (forwarded in `next.config.ts` as `VITE_GEMINI_API_KEY` for the embedded package). Optional: cache server via `VITE_CACHE_URL` / `NEXT_PUBLIC_VITE_CACHE_URL`.

## Next steps

1. **Flesh out `PlatformAdapter`** in `@film-music/platform` and implement `music` / `movies` providers (Spotify, YouTube, movie LLM) behind that interface.
2. **Move** real pages from `apps/soundings` → `apps/film-music/app/m/...` and `apps/trailer-vision` → `apps/film-music/app/v/...`, re-point imports and API routes into the unified app.
3. **Retire** the legacy `apps/soundings` and `apps/trailer-vision` apps once parity is there, or keep them for A/B.

