# BTC Accumulation App Prototype

A mobile-first prototype built from the uploaded Excel workbook.

## What it includes
- Goal-based BTC progress dashboard
- DCA page with cumulative BTC chart
- Futures journal with green/red PnL chart
- Dip Reserve and Grid Bot summary under More
- Add Entry modal for DCA, Dip, Futures, and Grid
- Local persistence with browser localStorage

## Run locally
Open `index.html` in a browser. For best results, serve the folder with a simple static server.

Examples:
- Python: `python3 -m http.server 8000`
- Then open `http://localhost:8000`

## Notes
- Seed data comes from `BTC Accumulation V7.xlsx`
- New entries are stored only in the browser unless wired to a backend later
