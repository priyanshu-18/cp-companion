# Contributing to CP Companion

1. Fork the repository and create a feature branch from `master`.
2. Keep changes focused and preserve the existing glassmorphism UI.
3. Never commit API keys, signing keys (`.key`), `.env` files, or personal usernames.
4. Before opening a PR, verify:
   ```bash
   npx tsc --noEmit
   cargo check --manifest-path src-tauri/Cargo.toml
   ```
