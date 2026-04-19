# BTC Stacking App

A mobile-first Bitcoin accumulation tracker. Built for long-term stackers who want one place to track DCA, dip buys, futures PnL, and grid bot results — all in Thai Baht and USD.

## Features

- **Home** — Total BTC holdings, USD/THB portfolio value, live BTC price pill, cash-flow-to-BTC tracker, monthly summary, and recent activity
- **DCA** — DCA-only projection to your BTC goal with interactive assumptions, scenarios, and entry log
- **Futures** — Cumulative PnL chart, win rate, and full trade log with mistake tags
- **More** — Live BTC/USD & BTC/THB price (auto-refresh via CoinGecko), Dip Reserve summary, Grid Bot runs
- **Triggers** — Buy trigger levels (L1–L4) with drop %, deploy amount in THB, estimated BTC, and avg cost vs market comparison

## Run locally

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Or use any static file server (Live Server, Vite, Netlify, etc.).

## Tech stack

- Vanilla HTML / CSS / JS — no build step, no dependencies
- Fonts: Space Grotesk + Space Mono (Google Fonts)
- Price feed: CoinGecko public API (free tier)
- Local persistence: browser `localStorage`

## Data

Edit `data.json` to update your seed data. New entries added via the `+` button are stored only in `localStorage` until you export them back to `data.json`.

## File structure

```
index.html   — UI structure and dialogs
styles.css   — Design system (CSS variables, all components)
app.js       — State, rendering, price fetch, DCA projection math
data.json    — Seed data (DCA, Dip, Futures, Grid, Triggers, Settings)
```
