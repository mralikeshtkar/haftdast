# هفت‌دست · HaftDast

بازی **حکم** با Next.js: دو، سه یا چهار نفره، با ربات (کاملاً آفلاین) یا آنلاین با دوستان. نسخه‌ی PWA، دو زبانه (فارسی راست‌چین / English)، با تم ایران باستان.

Hokm card game built with Next.js 16: 2, 3 or 4 players, vs bots (fully offline) or online with friends. Installable PWA, Persian (RTL) and English.

## اجرا / Run

```bash
npm install
npm run dev        # http://localhost:3000  (custom server: Next + Socket.IO)
```

```bash
npm run build
npm start          # production
```

Other scripts: `npm run simulate` (plays 90 bot games across all variants and checks engine invariants), `npm run typecheck`, `npm run lint`, `npm run icons`.

## ساختار / Structure

| Path | What |
| --- | --- |
| `src/game/engine.ts` | Pure, serialisable game engine: dealing, trump, legal moves, tricks, kot scoring, hakem rotation, 2/3/4-player variant rules |
| `src/game/bot.ts` | Heuristic bot; only sees a `PlayerView` (no peeking) |
| `src/components/Table.tsx` | The table UI, shared by local and online games |
| `src/components/LocalGame.tsx` | Single-device game vs bots (runs offline) |
| `src/components/OnlineGame.tsx` + `src/server/rooms.ts` | Rooms over Socket.IO; the server is authoritative and only sends redacted views |
| `server.ts` | Custom Node server: Next request handler + Socket.IO on one port |
| `src/i18n/` | `fa` / `en` dictionaries; `/[locale]` routing; `src/proxy.ts` redirects `/` by cookie or Accept-Language |
| `src/app/manifest.ts`, `public/sw.js` | PWA manifest and service worker (bot games work offline; cards and assets are cached) |
| `public/cards/` | Card faces (public domain, via hayeah/playing-cards-assets) + custom girih card back |
| `src/fonts/` | YekanBakh (Persian UI); Inter is loaded from Google Fonts for English |

## قوانین پیاده‌شده / Rules

- **4 players**: two teams, 13 cards each, hakem picks trump after 5 cards, first team to 7 tricks wins the hand. 7–0 is *kot* (2 points), 3 points if the hakem's team is kotted. Hakem stays while their team wins, otherwise passes clockwise.
- **3 players** (Pagat rules): one deuce removed, 17 cards each, everyone for themselves. Taking the first 7 tricks is a kot (2 points for the hakem, 3 for anyone else). Otherwise the hand ends as soon as one player's lead can no longer be matched; if the top two tie when the cards run out, the third player wins. Hakem stays on a win, otherwise passes to the next player.
- **2 players** (Pagat rules): 5 cards each, hakem picks trump, then hakem discards 3 and the opponent 2. They alternate drawing from the 42-card stock, hakem first: keep the top card (the next is burned, unseen) or burn it and take the next unseen. Burned cards are never shown to anyone. Each ends with 13 cards. First to 7 tricks. Winner becomes hakem.

## بازی آنلاین بدون سرور / Play online without a server

Double-click `play-online.cmd` (or run `npm run online`). It builds the app, starts it on your PC and opens a free
Cloudflare quick tunnel, then prints an `https://….trycloudflare.com` link (also copied to your clipboard). Send the
link to a friend, create a room, share the 4-letter code. Keep the window open while playing; Ctrl+C stops it.
The first run offers to download `cloudflared` into `.\tools` (official binary, ~40 MB). `-Tunnel localtunnel` uses
localtunnel instead (no download, but visitors must enter your public IP once as a password).

## استقرار / Deploy

The online mode needs a long-lived Node process (WebSockets), so it cannot run on serverless hosts such as Vercel.

**Free option: Render.** `render.yaml` is included. Push the repo to GitHub, sign in to render.com, choose
*New → Blueprint*, pick the repo and deploy. The free plan sleeps after 15 minutes without traffic and takes
about a minute to wake on the next visit; open the link a minute before you start playing.

**Any VPS / PaaS:** `npm ci --include=dev && npm run build` then `npm start` (reads `PORT`). Rooms live in memory on a single
instance; a restart clears them.
