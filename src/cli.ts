#!/usr/bin/env node
import { Cli, z } from 'incur'

import {
  auth,
  listContacts,
  createChatGroup,
  listChats,
  logout,
  markRead,
  readChat,
  resolveTarget,
  sendMessage,
  shutdownClient,
  setupConfig,
  setDraft,
  unreadChats,
  whoAmI,
} from './telegram.js'

const NEGATIVE_CHAT_ID_PREFIX = 'tg-chat-id:'
const CHAT_ARG_COMMANDS = new Set(['read', 'mark-read', 'draft', 'send'])
const CHAT_TARGET_DESCRIPTION =
  'Prefer numeric chat ID from "telegram chats". Treat @username as an exact username; if you only have a rough name like "pavel", search with "telegram contacts" first. Use your numeric ID from "telegram whoami" for Saved Messages/self.'

const cli = Cli.create('telegram', {
  version: '0.1.0',
  description: 'Telegram CLI for personal account workflows.',
  sync: {
    suggestions: [
      'authenticate with Telegram',
      'show my unread Telegram chats',
      'send a reply to a Telegram chat',
    ],
  },
})

cli.command('auth', {
  description: 'Authenticate this CLI against your personal Telegram account.',
  options: z.object({
    force: z
      .boolean()
      .optional()
      .describe('Ignore the saved session and log in again'),
    readOnly: z
      .boolean()
      .optional()
      .describe(
        'Mark this session read-only: block send/create-group at the CLI layer (local guard only; session file itself still has full account access)',
      ),
  }),
  alias: {
    force: 'f',
    readOnly: 'r',
  },
  examples: [
    { description: 'Log in using the saved session or interactive prompts' },
    { options: { force: true }, description: 'Force a fresh login flow' },
    {
      options: { readOnly: true },
      description: 'Log in and block write commands locally',
    },
  ],
  run: async (c) =>
    auth({ force: c.options.force, readOnly: c.options.readOnly }),
})

cli.command('setup', {
  description:
    'Interactively store Telegram API credentials in a user-scoped config file.',
  options: z.object({
    force: z
      .boolean()
      .optional()
      .describe('Rewrite the config even if it already exists'),
  }),
  alias: {
    force: 'f',
  },
  examples: [
    { description: 'Create config on first install' },
    { options: { force: true }, description: 'Rewrite existing config' },
  ],
  run: async (c) => setupConfig({ force: c.options.force }),
})

cli.command('whoami', {
  aliases: ['status'],
  description: 'Show the authenticated account and local session status.',
  run: async () => whoAmI(),
})

cli.command('logout', {
  description: 'Log out of Telegram and clear the active local session.',
  run: async () => logout(),
})

cli.command('chats', {
  description: 'List recent chats and basic dialog metadata.',
  options: z.object({
    limit: z.coerce
      .number()
      .min(1)
      .max(200)
      .default(20)
      .describe('Maximum chats to return'),
    unreadOnly: z.boolean().optional().describe('Only show unread chats'),
  }),
  alias: {
    limit: 'l',
    unreadOnly: 'u',
  },
  examples: [
    { description: 'List recent chats' },
    { options: { unreadOnly: true }, description: 'Only list unread chats' },
  ],
  run: async (c) =>
    listChats({
      limit: c.options.limit,
      unreadOnly: c.options.unreadOnly,
    }),
})

cli.command('contacts', {
  description:
    'Search Telegram contacts live by name, username, or phone. Use this before send/draft when you only have a rough name; only @username is treated as an exact username.',
  args: z.object({
    query: z
      .string()
      .describe('Contact search query, like "pavel" for a rough match or "@durov" for an exact username'),
  }),
  options: z.object({
    limit: z.coerce
      .number()
      .min(1)
      .max(100)
      .default(20)
      .describe('Maximum contacts to return'),
  }),
  alias: {
    limit: 'l',
  },
  examples: [
    {
      args: { query: 'pavel' },
      description: 'Search contacts by nickname or display name fragment',
    },
    {
      args: { query: '@durov' },
      description: 'Search contacts by username',
    },
  ],
  run: async (c) => listContacts(c.args.query, { limit: c.options.limit }),
})

cli.command('read', {
  description:
    'Read recent messages from a chat. Prefer numeric chat ID; usernames also work when Telegram can resolve them.',
  args: z.object({
    chat: z.string().describe(CHAT_TARGET_DESCRIPTION),
  }),
  options: z.object({
    limit: z.coerce
      .number()
      .min(1)
      .max(200)
      .default(20)
      .describe('Maximum messages to return'),
  }),
  alias: {
    limit: 'l',
  },
  examples: [
    { args: { chat: '@durov' }, description: 'Read a username-based chat' },
    {
      args: { chat: '-1001234567890' },
      description: 'Read a chat by numeric ID',
    },
  ],
  run: async (c) => readChat(c.args.chat, { limit: c.options.limit }),
})

cli.command('resolve', {
  description:
    'Look up a Telegram identifier (username, numeric ID, or "me") and return its canonical metadata: numeric ID, display name, type, username, isSelf.',
  args: z.object({
    chat: z
      .string()
      .describe(
        'The identifier to resolve: @username, numeric user/chat ID, or "me" for your own account.',
      ),
  }),
  examples: [
    {
      args: { chat: '@durov' },
      description: 'Resolve a user by username',
    },
    {
      args: { chat: '500894395' },
      description: 'Resolve a user by numeric ID',
    },
  ],
  run: async (c) => resolveTarget(c.args.chat),
})

cli.command('unread', {
  description: 'Show unread chats and a small unread-message preview per chat.',
  options: z.object({
    chatsLimit: z.coerce
      .number()
      .min(1)
      .max(200)
      .default(20)
      .describe('Maximum chats to scan'),
    messagesLimit: z.coerce
      .number()
      .min(1)
      .max(50)
      .default(5)
      .describe('Maximum unread messages to return per chat'),
  }),
  alias: {
    chatsLimit: 'c',
    messagesLimit: 'm',
  },
  run: async (c) =>
    unreadChats({
      chatsLimit: c.options.chatsLimit,
      messagesLimit: c.options.messagesLimit,
    }),
})

cli.command('mark-read', {
  description: 'Mark a chat history as read.',
  args: z.object({
    chat: z.string().describe(CHAT_TARGET_DESCRIPTION),
  }),
  options: z.object({
    maxId: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .describe('Only mark history up to this message ID'),
  }),
  run: async (c) => markRead(c.args.chat, { maxId: c.options.maxId }),
})

cli.command('draft', {
  description:
    'Save a cloud draft for a chat. Prefer numeric chat ID. If you only have a rough name, use contacts first; only @username is exact. Pass an empty string to clear it.',
  args: z.object({
    chat: z.string().describe(CHAT_TARGET_DESCRIPTION),
    text: z
      .string()
      .describe('Draft text. Wrap in quotes. Use "" to clear the draft'),
  }),
  run: async (c) => setDraft(c.args.chat, c.args.text),
})

cli.command('create-group', {
  description:
    'Create a new Telegram group or supergroup. Prints the new chat ID so you can pipe it into send/draft. This performs a real write action.',
  args: z.object({
    title: z.string().describe('Group title. Wrap in quotes if it has spaces'),
  }),
  options: z.object({
    user: z
      .array(z.string())
      .default([])
      .describe(
        'User to invite. Repeat the flag for multiple users. Accepts usernames (@alice) or numeric user IDs; comma-separated values are also accepted. Required for legacy groups.',
      ),
    supergroup: z
      .boolean()
      .optional()
      .describe('Create a supergroup instead of a legacy group'),
    about: z
      .string()
      .optional()
      .describe('Description text. Supergroups only'),
  }),
  alias: {
    user: 'u',
    supergroup: 's',
    about: 'a',
  },
  examples: [
    {
      args: { title: 'Team Sync' },
      options: { user: ['@alice', '500894395'] },
      description: 'Create a legacy group with two members',
    },
    {
      args: { title: 'Announcements' },
      options: { supergroup: true, about: 'Product updates' },
      description: 'Create an empty supergroup with a description',
    },
  ],
  run: async (c) =>
    createChatGroup(c.args.title, {
      users: c.options.user,
      supergroup: c.options.supergroup,
      about: c.options.about,
    }),
})

cli.command('send', {
  description:
    'Send a plain-text Telegram message, optionally as a reply. Prefer numeric chat ID. If you only have a rough name, use contacts first; only @username is exact. This performs a real write action, so agents should prefer read/draft flows unless they are confident a message should actually be sent.',
  args: z.object({
    chat: z.string().describe(CHAT_TARGET_DESCRIPTION),
    text: z
      .string()
      .describe('Message text. Wrap in quotes if it contains spaces'),
  }),
  options: z.object({
    replyTo: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .describe('Reply to this message ID'),
  }),
  alias: {
    replyTo: 'r',
  },
  examples: [
    { args: { chat: '@durov', text: 'hello' }, description: 'Send a message' },
    {
      args: { chat: '@durov', text: 'following up here' },
      options: { replyTo: 42 },
      description: 'Reply to a specific message',
    },
  ],
  run: async (c) =>
    sendMessage(c.args.chat, c.args.text, {
      replyTo: c.options.replyTo,
    }),
})

function normalizeArgv(argv: string[]): string[] {
  let normalized = [...argv]

  // `pnpm dev -- ...` forwards a leading separator token into process.argv.
  if (normalized[0] === '--') normalized = normalized.slice(1)

  const command = normalized[0]
  if (!command || !CHAT_ARG_COMMANDS.has(command)) return normalized

  const rest = normalized.slice(1)

  // Allow `telegram send -- -100... "hello"` as an escape hatch for agents.
  if (rest[0] === '--') rest.shift()

  const chat = rest[0]
  if (chat && /^-\d+$/.test(chat)) {
    rest[0] = `${NEGATIVE_CHAT_ID_PREFIX}${chat}`
  }

  return [command, ...rest]
}

async function main() {
  try {
    await cli.serve(normalizeArgv(process.argv.slice(2)))
  } finally {
    await shutdownClient()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})

export default cli
