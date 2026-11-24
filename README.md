# CP Companion

A lightweight, glassmorphic desktop widget for competitive programmers — built with **Tauri 2, React, TypeScript, and Rust**.

![Screenshots placeholder — add widget screenshots here](docs/screenshot-placeholder.png)

## Features
- **Real-time platform stats**: LeetCode (solved by difficulty, contest rating, streak), Codeforces (rating, max rating, rank, unique solved), and CodeChef (rating, stars, rank, problems solved when available).
- **Merged 365-day activity heatmap**: Combines real daily submission counts across all connected platforms.
- **Upcoming contests**: Live countdowns for Codeforces, LeetCode, and CodeChef.
- **macOS & Windows widget behavior**: Menu bar tray icon, no Dock icon on macOS, Pin-to-Desktop or Floating mode, resizable & movable with persisted bounds, launch at login, and silent auto-updates.

## Download
Download the latest installer for macOS (`.app` / `.dmg`) or Windows (`.msi` / `.exe`) from **[GitHub Releases](https://github.com/OWNER/REPO/releases/latest)**.

### Unsigned App Warnings (First Launch)
- **macOS (Gatekeeper)**: Right-click `CP Companion.app` → **Open** → **Open** (or run `xattr -cr "/Applications/CP Companion.app"`).
- **Windows (SmartScreen)**: Click **More info** → **Run anyway**.

## Build from Source
```bash
git clone https://github.com/OWNER/REPO.git
cd cp-companion
npm install
npm run tauri build
```

## Auto-Update
CP Companion checks `latest.json` from GitHub Releases on launch and every 24 hours. When an update is available, a non-intrusive banner lets you install and restart.

## Supported Platforms
- **macOS** (Apple Silicon & Intel)
- **Windows** (10/11 x64)

## Known Limitations
- **CodeChef**: CodeChef has no official unauthenticated public API; profile data is scraped from public HTML and may break if CodeChef changes its page structure. Unrated accounts do not expose rating/rank.
- **Windows `Win+D`**: Pressing `Win+D` ("Show Desktop") may minimize the widget on Windows.

## Disclaimer
CP Companion is not affiliated with, endorsed by, or sponsored by LeetCode, CodeChef, or Codeforces. All trademarks belong to their respective owners.

## License
Licensed under the **GNU General Public License v3.0 (GPL-3.0)**. See [LICENSE](LICENSE) for details.
