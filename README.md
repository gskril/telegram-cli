# telegram

[![pkg.pr.new](https://pkg.pr.new/badge/gskril/telegram-cli)](https://pkg.pr.new/~/gskril/telegram-cli)

Small personal-account Telegram CLI built with TypeScript, `pnpm`, [`incur`](https://github.com/wevm/incur), and [`mtcute`](https://mtcute.dev).

## Preview Install

Try the latest preview build from `pkg.pr.new` without waiting for a full npm release:

```bash
npx https://pkg.pr.new/gskril/telegram-cli/telegram@main
```

## Commands

- `auth [--read-only]`: log in interactively and persist a local session; `--read-only` blocks write commands at the CLI layer
- `setup`: interactively store `TELEGRAM_API_ID` and `TELEGRAM_API_HASH`
- `whoami`: show the authenticated account and local session info
- `logout`: clear the active local session
- `chats`: list recent dialogs
- `contacts <query>`: search Telegram contacts live by name, username, or phone; use this before `send`/`draft` when you only have a rough name
- `resolve <chat>`: resolve a username or chat target to its numeric Telegram ID
- `member-count <chat>`: show the number of people in a group, supergroup, or channel
- `read <chat>`: read recent messages from a dialog
- `unread`: show unread chats with a small message preview
- `mark-read <chat>`: mark a dialog as read
- `draft <chat> <text>`: save a Telegram cloud draft; if the target is a rough name, resolve it with `contacts` first
- `send <chat> <text> [--reply-to <messageId>]`: send a text message, optionally as a reply; if the target is a rough name, resolve it with `contacts` first
- `create-group <title> [--user <user>]... [--supergroup] [--about <about>]`: create a new legacy group (default) or supergroup (`--supergroup`); repeat `--user` to invite members, and use `--about` to set a supergroup description. `--user` accepts `@username` or numeric user IDs from `contacts`/`resolve`.
- `add-members <chat> [--user <user>]...`: add people to a group or supergroup. `--user` accepts `@username` or numeric user IDs from `contacts`/`resolve`.
- `remove-members <chat> [--user <user>]...`: remove people from a group or supergroup. `--user` accepts `@username` or numeric user IDs from `contacts`/`resolve`.
- `leave <chat>`: leave a group, supergroup, or channel.

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
node dist/cli.mjs --help
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
pnpm dev -- contacts pavel
pnpm dev -- contacts @durov
pnpm dev -- resolve @username
pnpm dev -- member-count -1001234567890
pnpm dev -- read @username --limit 10
pnpm dev -- draft 500894395 "I will reply later"
pnpm dev -- draft 500894395 ""
pnpm dev -- send 500894395 "hello there" --reply-to 42
pnpm dev -- create-group "Team Sync" --user @alice --user 500894395
# Comma-separated invitees are also accepted for convenience
pnpm dev -- create-group "Team Sync" --user @alice,500894395
pnpm dev -- create-group "Announcements" --supergroup --about "Product updates"
pnpm dev -- add-members -1001234567890 --user @alice --user 500894395
pnpm dev -- add-members -1001234567890 --user @alice,500894395
pnpm dev -- remove-members -1001234567890 --user @alice --user 500894395
pnpm dev -- remove-members -1001234567890 --user @alice,500894395
pnpm dev -- leave -1001234567890
```

## Notes

- This CLI targets a personal Telegram account, not bot-token auth.
- `auth --read-only` enables a local guard that blocks write commands such as `send`, `create-group`, `add-members`, `remove-members`, and `leave`, so read-only agent flows can't accidentally fire writes. Telegram's MTProto does not support scoped user sessions, so this is a CLI-layer check only: the stored session file itself still has full account access, and anything that uses the session file outside this CLI bypasses the guard. `auth` without the flag (or `logout`) clears the marker.
- `contacts <query>` searches only Telegram contacts. It does not search group names, message text, or arbitrary dialogs. Use it before `send` or `draft` when you only have a rough name like `pavel`.
- Treat `@username` as an exact username. If you omit the `@`, the input should be treated as a rough contact search term, not an exact username.
- Use `telegram resolve @username` to look up a numeric user or chat ID before write actions.
- Prefer numeric chat IDs from `telegram chats` for `member-count`, `read`, `draft`, `send`, and `mark-read`.
- `create-group --user` accepts either `@username` or numeric user IDs. For multiple invitees, prefer repeating `--user`; comma-separated values are also supported.
- `add-members --user` accepts either `@username` or numeric user IDs. For multiple members, prefer repeating `--user`; comma-separated values are also supported. You must have sufficient admin rights in the target group.
- `remove-members --user` accepts either `@username` or numeric user IDs. For multiple members, prefer repeating `--user`; comma-separated values are also supported. You must have sufficient admin rights in the target group.
- Use `leave` to remove yourself from a group. It supports `--clear` for clearing local history after leaving legacy groups.
- For your own Saved Messages/self chat, use your numeric ID from `telegram whoami`; your account username may not resolve as a writable chat target.
- Telegram API credentials are stored in a user-scoped config file.
- Telegram session and cache state are stored in a user-scoped SQLite file managed by mtcute.
- Environment variables still work and override the stored credentials, so `.env` remains available for advanced or CI-style usage.
- This uses mtcute's default SQLite-backed storage instead of custom exported session files.
