# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

"Onde" is an IPTV app that streams live TV from a **Freebox** (French ISP router) on the local network. Only the backend exists so far (`backend/`). `design/` holds PNG mockups for the planned clients — Mobile, TV and Web, each with a home screen (Accueil) and a player (Lecteur). Use them as the reference for the shape of the API data (channel cards with current program, category, progress bar, next program).

Code comments and log messages are in French; keep that convention.

## Commands

All commands run from `backend/`:

```bash
npm install
npm run dev          # tsx watch src/server.ts (default port 3001, override via PORT in backend/.env)
npx tsc --noEmit     # type-check (no build/lint/test scripts are defined yet)
```

There is no test framework, linter, or production build configured. `tsx` does not type-check, so run `tsc --noEmit` to catch type errors.

## Architecture

Express 5 + TypeScript, ESM (`"type": "module"`, `module: nodenext`). Relative imports **must** use the `.js` extension (e.g. `'./routes/channel.routes.js'`), and type-only imports must use `import type` (`verbatimModuleSyntax` is on). `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are enabled.

Layers: `routes/` → `controllers/` → `services/`, with shared types in `models/Channel.model.ts` (`ChannelInfo`, `Program`). `ChannelInfo` is the response shape the clients consume.

Data flow, all from the Freebox local API at `http://mafreebox.freebox.fr`:

1. **Playlist**: `freebox.service.fetchAndParsePlaylist()` downloads the Freebox M3U (`FREEBOX_M3U_URL`) and parses it with `iptv-playlist-parser`. This gives stream URLs (RTSP).
2. **Channel UUID mapping**: `loadChannelsMapping()` joins `/api/latest/tv/bouquets/freeboxtv/channels/` (UUIDs + `available`, no names) with `/api/latest/tv/channels/` (object keyed by UUID with `name`, `logo_url`). The result maps normalized name to Freebox UUID (`uuid-webtv-NNN`) for available channels only, cached in memory for the process lifetime. M3U names (`"2 - France 2 (auto)"`) and API names (`"France 2"`) differ, so both sides go through `normalizeChannelName()` to match them. Change that function with care: it is the join key between the two sources.
3. **EPG**: `refreshAllEpg()` calls `/api/latest/tv/epg/by_time/{timestamp}/` for the current and the next hour. Each call returns one-hour slots for **all** channels, and the two slots are merged into an in-memory cache of raw programs per UUID. `startEpgWorker()` in `server.ts` runs it at startup and then every 5 minutes. `getCachedEPG(uuid)` works out the current/next `Program` and its progress at read time. Request handlers must read through it and not call the Freebox per request.

**Freebox rate limit:** the Freebox API returns HTTP 429 after roughly 80 requests in quick succession and then blocks for several seconds. Never fetch per-channel data (one request per channel × ~300+ channels) in a loop; use the bulk endpoints.

## Current state / gotchas

- `GET /api/channels` returns `{ success, count, channels: ChannelInfo[] }`. It is built from `loadFreeboxChannels()` (Freebox bouquet + channel names/logos, cached), **not** the M3U. The M3U has no groups and lists each channel once per quality, while the bouquet API already gives number, UUID and per-quality RTSP streams. Channels without streams are skipped. `id` is the Freebox UUID. `group` is `TNT` for numbers ≤ 27, otherwise `Freebox TV`. Regional variants (e.g. the France 3 regions) share a `number` and differ by `subNumber`.
- The HLS URLs the Freebox lists in `streams[].hls` (port 8765) return 503, so only `rtsp` is exposed. Browser playback will need RTSP → HLS/WebRTC transcoding (ffmpeg).
- `import 'dotenv/config'` must stay the **first** import in `server.ts`. Services read `process.env` at module load (e.g. `FREEBOX_M3U_URL`), and ESM imports are evaluated before the module body runs.
- `fluent-ffmpeg` / `@ffmpeg-installer/ffmpeg` are installed but not used yet. They are presumably meant for transcoding RTSP into HLS/WebRTC for browsers (`ChannelInfo.streams` has optional `hls`/`webrtc` fields). `xml2js` is also unused so far.
- The backend only works on a network that can reach `mafreebox.freebox.fr`. Elsewhere, Freebox calls fail and the services log an error, then return empty results.
