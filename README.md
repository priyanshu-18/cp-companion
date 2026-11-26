# CP Companion

A lightweight desktop widget for competitive programmers showing live stats, a 365-day activity heatmap, and upcoming contests from LeetCode, Codeforces, and CodeChef.

[![Downloads](https://img.shields.io/github/downloads/priyanshu-18/cp-companion/total)](https://github.com/priyanshu-18/cp-companion/releases)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/priyanshu-18/cp-companion)](https://github.com/priyanshu-18/cp-companion/releases/latest)

![CP Companion](docs/screenshot.png)
![CP Companion Demo](docs/demo.gif)

## Why
Checking three separate competitive programming sites every day just to track your streak, rating, and next contest gets repetitive. CP Companion puts all three into one small desktop widget that stays out of your way.

## Features
- **Live platform stats**:
  - **LeetCode**: Total solved, contest rating, current streak, and 365-day submission calendar.
  - **Codeforces**: Current/max rating, rank, unique solved count, and 365-day submission heatmap.
  - **CodeChef**: Rating, stars, global rank, problems solved, and daily submission stats (when available).
- **Merged 365-day heatmap & streak badge**: Combines real daily activity across all connected platforms and tracks whether you have solved a problem today.
- **Upcoming contests**: Live countdowns for Codeforces, LeetCode, and CodeChef, with notifications (24h, 5h, 3h, 1h), a 10-minute sound alarm, and optional auto-open at start time.
- **Daily streak reminder**: Optional evening reminder (default `20:00`) and late nudge (`22:30`) if you haven't solved a problem yet today.
- **Widget controls**: Resizable & movable with saved bounds, background opacity slider, menu bar / system tray icon, launch at login, and Pin-to-Desktop or Floating mode.
- **Auto-updates**: Checks GitHub Releases on launch and every 24h; installs only when you click.

## Download
> **Do NOT download "Source code (zip/tar.gz)"** — that is only for developers. No terminal or coding setup is needed to run the app.

| Platform | Installer | First-launch steps (unsigned app) |
|---|---|---|
| **macOS** | `.dmg` from [Releases](https://github.com/priyanshu-18/cp-companion/releases/latest) | Open `.dmg`, drag **CP Companion** to **Applications**, then **right-click → Open → Open** (or **System Settings → Privacy & Security → Open Anyway**). |
| **Windows** | `.exe` or `.msi` from [Releases](https://github.com/priyanshu-18/cp-companion/releases/latest) | Run the installer. If SmartScreen appears, click **More info → Run anyway**. |

## Quick Start
1. Launch CP Companion (it lives in the macOS menu bar / Windows system tray).
2. Open **Settings → Accounts**, enter your handles, and click **Verify**.

## How It Works
- **Backend (Tauri 2 + Rust)**: Fetches public profile and contest data directly from LeetCode's GraphQL API, Codeforces' official REST API, and CodeChef's public profile HTML/contests endpoint using `reqwest`.
- **Frontend (React + TypeScript + Zustand)**: Renders the widget and caches your settings and last fetched stats locally on your machine.
- **Privacy**: No user account required, no backend server, and no analytics or telemetry.

## Known Limitations
- **CodeChef**: CodeChef has no official unauthenticated public API; profile data is scraped from public HTML and may break if CodeChef changes its markup. Unrated accounts do not expose rating or rank.
- **Windows**: Lightly tested compared to macOS; pressing `Win+D` ("Show Desktop") may minimize the widget.
- **LeetCode calendar**: LeetCode's submission calendar uses UTC day boundaries rather than your local timezone.
- **Unsigned binaries**: Both macOS Gatekeeper and Windows SmartScreen will show a warning on first launch until you allow the app.

## Build from Source
```bash
git clone https://github.com/priyanshu-18/cp-companion.git
cd cp-companion
npm install
npm run tauri build
```

## Contributing
See [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports and PRs are welcome at [Issues](https://github.com/priyanshu-18/cp-companion/issues).

## Support
If you find CP Companion useful, you can [star the repo](https://github.com/priyanshu-18/cp-companion) or [support on Ko-fi](https://ko-fi.com/impropriyanshu).

## License
Copyright (C) 2026 Priyanshu Pandey

Licensed under the **GNU General Public License v3.0 (GPL-3.0)**. See [LICENSE](LICENSE).

## Disclaimer
CP Companion is not affiliated with, endorsed by, or sponsored by LeetCode, CodeChef, or Codeforces. All trademarks belong to their respective owners.
