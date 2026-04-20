# telegram

[![pkg.pr.new](https://pkg.pr.new/badge/gskril/telegram-cli)](https://pkg.pr.new/~/gskril/telegram-cli)

Small personal-account Telegram CLI built with TypeScript, `pnpm`, [`incur`](https://github.com/wevm/incur), and [`mtcute`](https://mtcute.dev).

## Preview Install

Try the latest preview build from `pkg.pr.new` without waiting for a full npm release:

```bash
npx https://pkg.pr.new/gskril/telegram-cli/telegram@main
```

## Commands

- `auth`: log in interactively and persist a local session
- `setup`: interactively store `TELEGRAM_API_ID` and `TELEGRAM_API_HASH`
- `whoami` / `status`: show the authenticated account and local session info
- `logout`: clear the active local session
- `chats`: list recent dialogs
- `resolve <chat>`: resolve a username or chat target to its numeric Telegram ID
- `read <chat>`: read recent messages from a dialog
- `unread`: show unread chats with a small message preview
- `mark-read <chat>`: mark a dialog as read
- `draft <chat> <text>`: save a Telegram cloud draft
- `send <chat> <text> [-r <messageId>]`: send a text message, optionally as a reply
- `create-group <title> [-u <user>]... [-s] [-a <about>]`: create a new legacy group (default) or supergroup (`--supergroup`); repeat `--user` to invite members, and use `--about` to set a supergroup description

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
pnpm dev -- resolve @username
pnpm dev -- read @username --limit 10
pnpm dev -- draft 500894395 "I will reply later"
pnpm dev -- draft 500894395 ""
pnpm dev -- send 500894395 "hello there" --reply-to 42
pnpm dev -- create-group "Team Sync" --user @alice --user 500894395
pnpm dev -- create-group "Announcements" --supergroup --about "Product updates"
```

## Notes

- This CLI targets a personal Telegram account, not bot-token auth.
- Use `telegram resolve @username` to look up a numeric user or chat ID before write actions.
- Prefer numeric chat IDs from `telegram chats` for `read`, `draft`, `send`, and `mark-read`.
- For your own Saved Messages/self chat, use your numeric ID from `telegram whoami`; your account username may not resolve as a writable chat target.
- Telegram API credentials are stored in a user-scoped config file.
- Telegram session and cache state are stored in a user-scoped SQLite file managed by mtcute.
- Environment variables still work and override the stored credentials, so `.env` remains available for advanced or CI-style usage.
- This uses mtcute's default SQLite-backed storage instead of custom exported session files.
