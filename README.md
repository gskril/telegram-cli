# telegram

Small personal-account Telegram CLI built with TypeScript, `pnpm`, [`incur`](https://github.com/wevm/incur), and [`mtcute`](https://mtcute.dev).

## Commands

- `auth`: log in interactively and persist a local session
- `setup`: interactively store `TELEGRAM_API_ID` and `TELEGRAM_API_HASH`
- `whoami` / `status`: show the authenticated account and local session info
- `logout`: clear the active local session
- `chats`: list recent dialogs
- `read <chat>`: read recent messages from a dialog
- `unread`: show unread chats with a small message preview
- `mark-read <chat>`: mark a dialog as read
- `draft <chat> <text>`: save a Telegram cloud draft
- `send <chat> <text> [-r <messageId>]`: send a text message, optionally as a reply

## Setup

1. Create Telegram API credentials at [my.telegram.org](https://my.telegram.org).
2. Install dependencies:

```bash
pnpm install
```

3. Run interactive setup:

```bash
pnpm dev -- setup
pnpm dev -- auth
pnpm dev -- whoami
```

`auth` is the explicit interactive login step. Other commands require an existing local Telegram session and will tell you to run `telegram auth` first if you have not logged in yet.

## Usage

Run the CLI in dev mode:

```bash
pnpm dev -- --help
```

Build the CLI:

```bash
pnpm build
node dist/cli.js --help
```

Once published under an available npm package name, users will be able to install it globally and run:

```bash
npm install -g <your-package-name>
telegram setup
telegram auth
```

Examples:

```bash
pnpm dev -- setup
pnpm dev -- auth
pnpm dev -- whoami
pnpm dev -- chats --unread-only
pnpm dev -- read @username --limit 10
pnpm dev -- draft @username "I will reply later"
pnpm dev -- draft @username ""
pnpm dev -- send @username "hello there" --reply-to 42
```

## Notes

- This CLI targets a personal Telegram account, not bot-token auth.
- Telegram API credentials are stored in a user-scoped config file.
- Telegram session and cache state are stored in a user-scoped SQLite file managed by mtcute.
- Environment variables still work and override the stored credentials, so `.env` remains available for advanced or CI-style usage.
- This uses mtcute's default SQLite-backed storage instead of custom exported session files.
