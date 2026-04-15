#!/usr/bin/env node
import { Cli, z } from 'incur'

import {
  auth,
  listChats,
  logout,
  markRead,
  readChat,
  sendMessage,
  shutdownClient,
  setupConfig,
  setDraft,
  unreadChats,
  whoAmI,
} from './telegram.js'

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
  }),
  alias: {
    force: 'f',
  },
  examples: [
    { description: 'Log in using the saved session or interactive prompts' },
    { options: { force: true }, description: 'Force a fresh login flow' },
  ],
  run: async (c) => auth({ force: c.options.force }),
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

cli.command('read', {
  description: 'Read recent messages from a chat by numeric ID or username.',
  args: z.object({
    chat: z.string().describe('Chat ID or username such as @username'),
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
    chat: z.string().describe('Chat ID or username such as @username'),
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
    'Save a cloud draft for a chat. Pass an empty string to clear it.',
  args: z.object({
    chat: z.string().describe('Chat ID or username such as @username'),
    text: z
      .string()
      .describe('Draft text. Wrap in quotes. Use "" to clear the draft'),
  }),
  run: async (c) => setDraft(c.args.chat, c.args.text),
})

cli.command('send', {
  description:
    'Send a plain-text Telegram message, optionally as a reply. This performs a real write action, so agents should prefer read/draft flows unless they are confident a message should actually be sent.',
  args: z.object({
    chat: z.string().describe('Chat ID or username such as @username'),
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

async function main() {
  try {
    await cli.serve()
  } finally {
    await shutdownClient()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})

export default cli
