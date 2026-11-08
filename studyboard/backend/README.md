# StudyBoard: Telegram + synchronization server

The static UI remains on GitHub Pages. This directory is an **optional, separately deployed** FastAPI + PostgreSQL service with a Telegram bot and once-per-day scheduler.

## Security

- Never add .env, tokens, DB dumps or chat IDs to GitHub. The repository is public.
- HTTPS is mandatory for the public API; only local loopback port 8765 is published by Docker.
- Telegram pairing: /connect creates a one-use 10-minute random code. The browser trades it for a 256-bit per-device bearer token (stored only in browser localStorage), which can be revoked with Disconnect.
- Use a private device; anyone with access to your browser profile can access its sync token.
- Local data stays usable offline. Export a JSON backup before the first pairing. The frontend stores conflict-recovery snapshots locally and never deletes local tasks automatically on sync failure.
- The API CORS allowlist is restricted by CORS_ORIGINS. CORS is **not** authentication. Do not widen to *.
- PostgreSQL storage is unencrypted at the application level; secure the VPS and backups.

## Deploy on your own VPS

1. Register a bot via Telegram **@BotFather**; save the token privately.
2. Use a separate HTTPS hostname for the StudyBoard API (for example, `study-api.example.com`) with DNS pointing to your VPS.
3. Copy this directory to the VPS and run `cp .env.example .env`. Set TELEGRAM_BOT_TOKEN, a random PAIRING_SECRET (for example `openssl rand -hex 32`), a strong database password and matching DATABASE_URL password. Set CORS_ORIGINS to exactly `https://apestalina-byte.github.io`. Protect .env with `chmod 600 .env`.
4. In the existing Caddy setup, add an isolated route:
   ```caddyfile
   study-api.example.com {
       reverse_proxy 127.0.0.1:8765
   }
   ```
   Ensure this doesn't interfere with any existing websites. Caddy will manage TLS. Do not open port 8765 publicly.
5. From this directory, `docker compose up -d --build`. Check `docker compose ps`, `docker compose logs --tail=100 api bot scheduler` and `curl -f https://study-api.example.com/health`.
6. Open the existing StudyBoard GitHub Pages page, choose **Синхронизация**, enter the API URL and the code received by sending `/connect` in your bot. Confirm the initial migration.
7. Repeat on the other device using a new code. Each device has its own revocable token.

**Do not expose the Telegram token or pairing secret in the static site, GitHub actions, URLs or chats.**

## Bot

Commands: `/start`, `/connect`, `/today`, `/week`, `/overdue`, `/progress`, `/mute`, `/unmute`.
At **08:00 Europe/Moscow** every day, the scheduler sends a daily report and, when applicable, reminders due today, tomorrow, and in 3 days. On Mondays it additionally sends the week summary. In case of brief restarts, messages can be sent within the 08:00 hour, once each per day. All times are in Moscow regardless of VPS time zone.

The scheduler and bot require continuous runtime. GitHub Pages alone cannot send notifications. The bot must receive /start first and the user must connect the site to upload tasks.

## API

- POST /api/v1/pair — exchange a code for a device token
- GET /api/v1/snapshot — authorized data + revision
- PUT /api/v1/snapshot — authorized write with required expected revision (409 means conflict)
- POST /api/v1/revoke — revoke this device token
- GET /health — liveness

The UI always writes its local copy first; server sync requires network. If concurrent changes are detected, the browser preserves a recovery copy and merges by task ID and update timestamp where possible. Deletions may reappear after a true two-device editing conflict, to prevent silent data loss.

This implementation is designed for personal use and does not replace production security audits, hardened backup policies, or distributed rate limiting.
