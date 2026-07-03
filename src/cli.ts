#!/usr/bin/env node
import { Cli, z } from 'incur'

import {
  addChatMembers,
  auth,
  createChatGroup,
  getMemberCount,
  listContacts,
  listChats,
  logout,
  leaveChatGroup,
  markRead,
  readChat,
  removeChatMembers,
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
const GROUP_CHAT_ARG_COMMANDS = new Set(['add', 'remove', 'count', 'leave'])
const LEGACY_GROUP_COMMAND_ALIASES = new Map<string, [string, string]>([
  ['create-group', ['group', 'create']],
  ['add-members', ['group', 'add']],
  ['remove-members', ['group', 'remove']],
  ['member-count', ['group', 'count']],
  ['leave', ['group', 'leave']],
])
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
        'Mark this session read-only: block send/group write commands at the CLI layer (local guard only; session file itself still has full account access)',
      ),
  }),
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
  examples: [
    { description: 'Create config on first install' },
    { options: { force: true }, description: 'Rewrite existing config' },
  ],
  run: async (c) => setupConfig({ force: c.options.force }),
})

cli.command('whoami', {
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
  description: 'Search Telegram contacts live by name, username, or phone.',
  hint: 'Use this before send/draft when you only have a rough name; only @username is treated as an exact username.',
  args: z.object({
    query: z
      .string()
      .describe(
        'Contact search query, like "pavel" for a rough match or "@durov" for an exact username',
      ),
  }),
  options: z.object({
    limit: z.coerce
      .number()
      .min(1)
      .max(100)
      .default(20)
      .describe('Maximum contacts to return'),
  }),
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
  description: 'Read recent messages from a chat.',
  hint: 'Prefer numeric chat IDs from "telegram chats"; usernames also work when Telegram can resolve them.',
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
    'Look up a Telegram identifier (username, numeric ID, or "me") and return its canonical metadata.',
  hint: 'Returns numeric ID, display name, type, username, and isSelf. Use it to turn a @username into a numeric ID before write actions.',
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

const attachmentOptionFields = {
  file: z
    .string()
    .optional()
    .describe(
      'Attach a media file: path to a local file, or an http(s) URL to a remote file',
    ),
  fileType: z
    .enum(['auto', 'photo', 'video', 'animation', 'audio', 'voice', 'document'])
    .default('auto')
    .describe(
      'How to send the attached file. "auto" infers from the file extension; "document" sends any file as-is without compression. Requires --file',
    ),
  fileName: z
    .string()
    .optional()
    .describe(
      'Override the attachment file name shown in Telegram. Requires --file',
    ),
}

function refineAttachmentOptions<
  T extends z.ZodObject<
    typeof attachmentOptionFields & Record<string, z.ZodType>
  >,
>(schema: T): T {
  return schema
    .refine((v) => v.fileType === 'auto' || v.file !== undefined, {
      message: '--file-type requires --file.',
      path: ['fileType'],
    })
    .refine((v) => v.fileName === undefined || v.file !== undefined, {
      message: '--file-name requires --file.',
      path: ['fileName'],
    }) as T
}

cli.command('draft', {
  description:
    'Save a cloud draft for a chat: text (--text), a media file (--file), or both.',
  hint: 'Text becomes the caption when a file is attached. Use --text "" with no --file to clear the draft. Prefer numeric chat IDs; if you only have a rough name, use contacts first — only @username is exact.',
  args: z.object({
    chat: z.string().describe(CHAT_TARGET_DESCRIPTION),
  }),
  options: refineAttachmentOptions(
    z.object({
      text: z
        .string()
        .optional()
        .describe(
          'Draft text, or the caption when --file is given. Wrap in quotes. Use "" (with no --file) to clear the draft',
        ),
      ...attachmentOptionFields,
    }),
  ).refine((v) => v.text !== undefined || v.file !== undefined, {
    message:
      'Provide --text, --file, or both. Use --text "" to clear the draft.',
  }),
  examples: [
    {
      args: { chat: '500894395' },
      options: { text: 'I will reply later' },
      description: 'Save a text draft',
    },
    {
      args: { chat: '500894395' },
      options: { file: './photo.jpg', text: 'sneak peek' },
      description: 'Draft a photo with a caption',
    },
    {
      args: { chat: '500894395' },
      options: { text: '' },
      description: 'Clear the draft',
    },
  ],
  run: async (c) =>
    setDraft(c.args.chat, {
      text: c.options.text,
      file: c.options.file,
      fileType: c.options.fileType,
      fileName: c.options.fileName,
    }),
})

const groupCreateArgs = z.object({
  title: z.string().describe('Group title. Wrap in quotes if it has spaces'),
})
const groupCreateOptions = z.object({
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
  about: z.string().optional().describe('Description text. Supergroups only'),
})
const groupCreateCommand = {
  description: 'Create a new Telegram group or supergroup.',
  hint: 'Prints the new chat ID so you can pipe it into send/draft. This performs a real write action.',
  args: groupCreateArgs,
  options: groupCreateOptions,
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
  run: async (c: {
    args: z.output<typeof groupCreateArgs>
    options: z.output<typeof groupCreateOptions>
  }) =>
    createChatGroup(c.args.title, {
      users: c.options.user,
      supergroup: c.options.supergroup,
      about: c.options.about,
    }),
}

const groupChatArgs = z.object({
  chat: z.string().describe(CHAT_TARGET_DESCRIPTION),
})
const groupAddOptions = z.object({
  user: z
    .array(z.string())
    .default([])
    .describe(
      'User to add. Repeat the flag for multiple users. Accepts usernames (@alice) or numeric user IDs; comma-separated values are also accepted.',
    ),
})
const groupAddCommand = {
  description: 'Add one or more people to a group or supergroup.',
  hint: 'This performs a real write action and requires sufficient rights in the target group.',
  args: groupChatArgs,
  options: groupAddOptions,
  examples: [
    {
      args: { chat: '-1001234567890' },
      options: { user: ['@alice', '500894395'] },
      description: 'Add two members to a group',
    },
  ],
  run: async (c: {
    args: z.output<typeof groupChatArgs>
    options: z.output<typeof groupAddOptions>
  }) =>
    addChatMembers(c.args.chat, {
      users: c.options.user,
    }),
}

const groupRemoveOptions = z.object({
  user: z
    .array(z.string())
    .default([])
    .describe(
      'User to remove. Repeat the flag for multiple users. Accepts usernames (@alice) or numeric user IDs; comma-separated values are also accepted.',
    ),
})
const groupRemoveCommand = {
  description: 'Remove one or more people from a group or supergroup.',
  hint: 'This performs a real write action and requires sufficient rights in the target group.',
  args: groupChatArgs,
  options: groupRemoveOptions,
  examples: [
    {
      args: { chat: '-1001234567890' },
      options: { user: ['@alice', '500894395'] },
      description: 'Remove two members from a group',
    },
  ],
  run: async (c: {
    args: z.output<typeof groupChatArgs>
    options: z.output<typeof groupRemoveOptions>
  }) =>
    removeChatMembers(c.args.chat, {
      users: c.options.user,
    }),
}

const groupCountCommand = {
  description: 'Show the number of people in a group, supergroup, or channel.',
  args: groupChatArgs,
  examples: [
    {
      args: { chat: '-1001234567890' },
      description: 'Check a group by numeric ID',
    },
    {
      args: { chat: '@publicgroup' },
      description: 'Check a public group or channel by username',
    },
  ],
  run: async (c: { args: z.output<typeof groupChatArgs> }) =>
    getMemberCount(c.args.chat),
}

const groupLeaveOptions = z.object({
  clear: z
    .boolean()
    .optional()
    .describe(
      'Clear local history after leaving. Only applies to legacy groups',
    ),
})
const groupLeaveCommand = {
  description: 'Leave a group, supergroup, or channel.',
  hint: 'This performs a real write action.',
  args: groupChatArgs,
  options: groupLeaveOptions,
  examples: [
    {
      args: { chat: '-1001234567890' },
      description: 'Leave a group by numeric ID',
    },
  ],
  run: async (c: {
    args: z.output<typeof groupChatArgs>
    options: z.output<typeof groupLeaveOptions>
  }) => leaveChatGroup(c.args.chat, { clear: c.options.clear }),
}

const group = Cli.create('group', {
  description: 'Manage Telegram groups, supergroups, and members.',
})

group.command('create', groupCreateCommand)
group.command('add', groupAddCommand)
group.command('remove', groupRemoveCommand)
group.command('count', groupCountCommand)
group.command('leave', groupLeaveCommand)
cli.command(group)

cli.command('send', {
  description:
    'Send a message to a chat: text (--text), a media file (--file), or both, optionally as a reply.',
  hint: 'Text becomes the caption when a file is attached. Files can be local paths or http(s) URLs; the media type is inferred from the file extension, and --file-type overrides it (e.g. --file-type document sends an image uncompressed). Prefer numeric chat IDs; if you only have a rough name, use contacts first — only @username is exact. This performs a real write action, so agents should prefer read/draft flows unless they are confident a message should actually be sent.',
  args: z.object({
    chat: z.string().describe(CHAT_TARGET_DESCRIPTION),
  }),
  options: refineAttachmentOptions(
    z.object({
      text: z
        .string()
        .optional()
        .describe(
          'Message text, or the caption when --file is given. Wrap in quotes',
        ),
      ...attachmentOptionFields,
      replyTo: z.coerce
        .number()
        .int()
        .positive()
        .optional()
        .describe('Reply to this message ID'),
    }),
  ).refine((v) => Boolean(v.text) || v.file !== undefined, {
    message: 'Provide --text, --file, or both.',
  }),
  examples: [
    {
      args: { chat: '@durov' },
      options: { text: 'hello' },
      description: 'Send a text message',
    },
    {
      args: { chat: '@durov' },
      options: { text: 'following up here', replyTo: 42 },
      description: 'Reply to a specific message',
    },
    {
      args: { chat: '@durov' },
      options: { file: './photo.jpg', text: 'check this out' },
      description: 'Send an image as a compressed photo with a caption',
    },
    {
      args: { chat: '-1001234567890' },
      options: { file: './report.html' },
      description: 'Send any file (e.g. HTML) as a document',
    },
    {
      args: { chat: '@durov' },
      options: { file: './screenshot.png', fileType: 'document' },
      description: 'Send an image uncompressed, as a file attachment',
    },
  ],
  run: async (c) =>
    sendMessage(c.args.chat, {
      text: c.options.text,
      file: c.options.file,
      fileType: c.options.fileType,
      fileName: c.options.fileName,
      replyTo: c.options.replyTo,
    }),
})

function normalizeArgv(argv: string[]): string[] {
  let normalized = [...argv]

  // `pnpm dev -- ...` forwards a leading separator token into process.argv.
  if (normalized[0] === '--') normalized = normalized.slice(1)

  let command = normalized[0]
  if (!command) return normalized

  const groupAlias = LEGACY_GROUP_COMMAND_ALIASES.get(command)
  if (groupAlias) {
    normalized = [...groupAlias, ...normalized.slice(1)]
    command = normalized[0]
  }

  if (command === 'group') {
    const subcommand = normalized[1]
    if (!subcommand || !GROUP_CHAT_ARG_COMMANDS.has(subcommand)) {
      return normalized
    }

    const rest = normalizeChatArg(normalized.slice(2))
    return [command, subcommand, ...rest]
  }

  if (!CHAT_ARG_COMMANDS.has(command)) return normalized

  return [command, ...normalizeChatArg(normalized.slice(1))]
}

function normalizeChatArg(rest: string[]): string[] {
  const normalized = [...rest]

  // Allow `telegram send -- -100... "hello"` as an escape hatch for agents.
  if (normalized[0] === '--') normalized.shift()

  const chat = normalized[0]
  if (chat && /^-\d+$/.test(chat)) {
    normalized[0] = `${NEGATIVE_CHAT_ID_PREFIX}${chat}`
  }

  return normalized
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
