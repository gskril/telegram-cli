import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline/promises'

import dotenv from 'dotenv'
import { TelegramClient, type InputPeerLike, type Peer } from '@mtcute/node'

dotenv.config({ quiet: true })

const APP_NAME = 'telegram-cli'

const CONFIG_DIR = resolveConfigDir()
const STATE_DIR = resolveStateDir()
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')
const STORAGE_FILE = path.join(STATE_DIR, 'telegram.session')

let client: TelegramClient | null = null
const NEGATIVE_CHAT_ID_PREFIX = 'tg-chat-id:'

type StoredConfig = {
  apiId: string
  apiHash: string
}

export type ResolvedPeer = {
  id: number
  displayName: string
  inputPeer: InputPeerLike
  type: Peer['type']
}

function resolveConfigDir(): string {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', APP_NAME)
  }

  if (process.platform === 'win32') {
    return path.join(
      process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'),
      APP_NAME,
    )
  }

  return path.join(
    process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'),
    APP_NAME,
  )
}

function resolveStateDir(): string {
  if (process.platform === 'darwin') return resolveConfigDir()

  if (process.platform === 'win32') {
    return path.join(
      process.env.LOCALAPPDATA ??
        process.env.APPDATA ??
        path.join(os.homedir(), 'AppData', 'Local'),
      APP_NAME,
    )
  }

  return path.join(
    process.env.XDG_STATE_HOME ?? path.join(os.homedir(), '.local', 'state'),
    APP_NAME,
  )
}

export function getDataDir(): string {
  return STATE_DIR
}

export function getConfigFile(): string {
  return CONFIG_FILE
}

export function getStorageFile(): string {
  return STORAGE_FILE
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

async function writeSecureFile(
  filePath: string,
  contents: string,
): Promise<void> {
  await ensureDir(path.dirname(filePath))
  await writeFile(filePath, contents, { encoding: 'utf8', mode: 0o600 })
  await chmod(filePath, 0o600).catch(() => undefined)
}

async function ensureStorageDir(): Promise<void> {
  await ensureDir(STATE_DIR)
}

async function readConfigFile(): Promise<StoredConfig | undefined> {
  try {
    const raw = await readFile(CONFIG_FILE, 'utf8')
    const parsed = JSON.parse(raw) as Partial<StoredConfig>

    if (typeof parsed.apiId !== 'string' || typeof parsed.apiHash !== 'string')
      return undefined

    return {
      apiId: parsed.apiId,
      apiHash: parsed.apiHash,
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return undefined
    if (error instanceof SyntaxError) {
      throw new Error(
        `Invalid JSON in ${CONFIG_FILE}. Run "telegram setup --force" to rewrite it.`,
      )
    }
    throw error
  }
}

async function getCredentials() {
  const config = await readConfigFile()
  const apiId = process.env.TELEGRAM_API_ID ?? config?.apiId
  const apiHash = process.env.TELEGRAM_API_HASH ?? config?.apiHash

  if (!apiId || !apiHash) {
    throw new Error(
      'Missing Telegram API credentials. Run "telegram setup" or set TELEGRAM_API_ID and TELEGRAM_API_HASH.',
    )
  }

  const parsedApiId = Number.parseInt(apiId, 10)
  if (!Number.isFinite(parsedApiId)) {
    throw new Error('TELEGRAM_API_ID must be a valid integer.')
  }

  return { apiId: parsedApiId, apiHash }
}

async function createClient(): Promise<TelegramClient> {
  const { apiId, apiHash } = await getCredentials()
  await ensureStorageDir()

  return new TelegramClient({
    apiId,
    apiHash,
    storage: STORAGE_FILE,
  })
}

async function loginInteractive(tg: TelegramClient) {
  return tg.start({
    phone: () => tg.input('Phone number (include country code): '),
    code: () => tg.input('Login code: '),
    password: () => tg.input('2FA password (leave blank if none): '),
    invalidCodeCallback: async (type) => {
      console.error(`Invalid ${type}. Try again.`)
    },
    codeSentCallback: async (sentCode) => {
      console.error(`Code sent via ${sentCode.type}.`)
    },
  })
}

async function requireStoredSession(tg: TelegramClient): Promise<void> {
  await tg.prepare()
  const self = await tg.storage.self.fetch()

  if (!self) {
    throw new Error('No Telegram session found. Run "telegram auth" first.')
  }
}

export async function authClient(options?: {
  forceLogin?: boolean
}): Promise<TelegramClient> {
  if (options?.forceLogin && client) {
    await client.destroy().catch(() => undefined)
    client = null
  }

  if (client && !options?.forceLogin) return client

  const tg = await createClient()

  try {
    if (options?.forceLogin) {
      try {
        await tg.logOut()
      } catch {
        // Ignore if no active session is present.
      }
    }

    await loginInteractive(tg)
    client = tg
    return tg
  } catch (error) {
    await tg.destroy().catch(() => undefined)
    throw error
  }
}

export async function getClient(): Promise<TelegramClient> {
  if (client) return client

  const tg = await createClient()

  try {
    await requireStoredSession(tg)
    client = tg
    return tg
  } catch (error) {
    await tg.destroy().catch(() => undefined)
    throw error
  }
}

function redactApiHash(apiHash: string): string {
  if (apiHash.length <= 8) return '********'
  return `${apiHash.slice(0, 4)}…${apiHash.slice(-4)}`
}

async function promptWithInterface(
  rl: readline.Interface,
  question: string,
  options?: { hidden?: boolean },
): Promise<string> {
  const originalWrite = (
    rl as readline.Interface & {
      _writeToOutput?: (chunk: string) => void
    }
  )._writeToOutput

  try {
    if (options?.hidden) {
      ;(
        rl as readline.Interface & {
          _writeToOutput?: (chunk: string) => void
        }
      )._writeToOutput = function writeMuted(chunk: string) {
        // Preserve the prompt text, but suppress echoed answer characters.
        if (chunk.includes(question)) {
          process.stdout.write(chunk)
        }
      }
    }

    const answer = (await rl.question(question)).trim()
    if (options?.hidden) process.stdout.write('\n')
    return answer
  } finally {
    ;(
      rl as readline.Interface & {
        _writeToOutput?: (chunk: string) => void
      }
    )._writeToOutput = originalWrite
  }
}

export async function setupConfig(options?: { force?: boolean }) {
  const existing = await readConfigFile()

  if (existing && !options?.force) {
    return {
      configFile: CONFIG_FILE,
      storageFile: STORAGE_FILE,
      alreadyConfigured: true,
      apiId: existing.apiId,
      apiHashPreview: redactApiHash(existing.apiHash),
    }
  }

  console.error(
    'Create Telegram API credentials at https://my.telegram.org/apps',
  )
  console.error(
    'If you have not created an app yet, create one there and copy the API ID and API hash.\n',
  )

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  })

  let enteredApiId = ''
  let enteredApiHash = ''

  try {
    enteredApiId = await promptWithInterface(rl, 'Telegram API ID: ')
    enteredApiHash = await promptWithInterface(rl, 'Telegram API hash: ', {
      hidden: true,
    })
  } finally {
    rl.close()
  }

  if (!/^\d+$/.test(enteredApiId)) {
    throw new Error('Telegram API ID must be numeric.')
  }

  if (enteredApiHash.length < 8) {
    throw new Error('Telegram API hash looks too short.')
  }

  const config: StoredConfig = {
    apiId: enteredApiId,
    apiHash: enteredApiHash,
  }

  await writeSecureFile(CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`)

  return {
    configFile: CONFIG_FILE,
    storageFile: STORAGE_FILE,
    alreadyConfigured: false,
    apiId: config.apiId,
    apiHashPreview: redactApiHash(config.apiHash),
  }
}

export async function auth(options?: { force?: boolean }) {
  const tg = await authClient({ forceLogin: options?.force })
  const me = await tg.getMe()

  return {
    authenticated: true,
    id: me.id,
    displayName: me.displayName,
    username: me.username ?? null,
    configFile: CONFIG_FILE,
    storageFile: STORAGE_FILE,
  }
}

export async function logout() {
  const tg = client ?? (await createClient())

  try {
    await tg.logOut()
  } catch {
    // Ignore missing session or network cleanup issues.
  } finally {
    client = null
    await tg.destroy().catch(() => undefined)
  }

  return {
    authenticated: false,
    configFile: CONFIG_FILE,
    storageFile: STORAGE_FILE,
  }
}

export async function shutdownClient() {
  if (!client) return

  const tg = client
  client = null
  await tg.destroy().catch(() => undefined)
}

function parseChatId(chat: string): string | number {
  if (chat.startsWith(NEGATIVE_CHAT_ID_PREFIX)) {
    chat = chat.slice(NEGATIVE_CHAT_ID_PREFIX.length)
  }

  return /^-?\d+$/.test(chat) ? Number.parseInt(chat, 10) : chat
}

export async function resolvePeer(chat: string): Promise<ResolvedPeer> {
  const tg = await getClient()
  const parsed = parseChatId(chat)

  if (typeof parsed === 'number') {
    for await (const dialog of tg.iterDialogs({ limit: 200 })) {
      if (dialog.peer.id === parsed) {
        return {
          id: dialog.peer.id,
          displayName: dialog.peer.displayName,
          inputPeer: dialog.peer.inputPeer,
          type: dialog.peer.type,
        }
      }
    }
  }

  if (typeof parsed === 'number' && parsed > 0) {
    try {
      const user = await tg.getUser(parsed)
      return {
        id: user.id,
        displayName: user.displayName,
        inputPeer: user.inputPeer,
        type: user.type,
      }
    } catch {
      // Fall through to chat resolution.
    }
  }

  const peer = await tg.getChat(parsed)
  return {
    id: peer.id,
    displayName: peer.displayName,
    inputPeer: peer.inputPeer,
    type: peer.type,
  }
}

export async function whoAmI() {
  const tg = await getClient()
  const me = await tg.getMe()

  return {
    authenticated: true,
    id: me.id,
    displayName: me.displayName,
    username: me.username ?? null,
    isPremium: me.isPremium,
    isBot: me.isBot,
    configFile: CONFIG_FILE,
    storageFile: STORAGE_FILE,
    dataDir: STATE_DIR,
  }
}

export async function listChats(options?: {
  limit?: number
  unreadOnly?: boolean
}) {
  const tg = await getClient()
  const chats: Array<{
    id: string
    name: string
    type: string
    unreadCount: number
    isUnread: boolean
    isManuallyUnread: boolean
    draft?: string | null
    lastMessage?: string | null
    lastMessageDate?: string | null
  }> = []

  for await (const dialog of tg.iterDialogs({ limit: options?.limit ?? 20 })) {
    if (options?.unreadOnly && !dialog.isUnread) continue

    chats.push({
      id: String(dialog.peer.id),
      name: dialog.peer.displayName,
      type: dialog.peer.type,
      unreadCount: dialog.unreadCount,
      isUnread: dialog.isUnread,
      isManuallyUnread: dialog.isManuallyUnread,
      draft: dialog.draftMessage?.text ?? null,
      lastMessage: dialog.lastMessage?.text ?? null,
      lastMessageDate: dialog.lastMessage?.date?.toISOString() ?? null,
    })
  }

  return {
    count: chats.length,
    chats,
  }
}

export async function readChat(chat: string, options?: { limit?: number }) {
  const tg = await getClient()
  const peer = await resolvePeer(chat)
  const messages: Array<{
    id: number
    date: string
    sender: string
    senderId: string | null
    outgoing: boolean
    replyToMessageId: number | null
    text: string
    hasMedia: boolean
  }> = []

  for await (const message of tg.iterHistory(peer.inputPeer, {
    limit: options?.limit ?? 20,
  })) {
    messages.push({
      id: message.id,
      date: message.date.toISOString(),
      sender: message.sender.displayName,
      senderId: 'id' in message.sender ? String(message.sender.id) : null,
      outgoing: message.isOutgoing,
      replyToMessageId: message.replyToMessage?.id ?? null,
      text: message.text,
      hasMedia: message.media !== null,
    })
  }

  messages.reverse()

  return {
    chat: {
      id: String(peer.id),
      name: peer.displayName,
      type: peer.type,
    },
    count: messages.length,
    messages,
  }
}

export async function unreadChats(options?: {
  chatsLimit?: number
  messagesLimit?: number
}) {
  const tg = await getClient()
  const me = await tg.getMe()
  const results: Array<{
    chatId: string
    chatName: string
    chatType: string
    unreadCount: number
    isManuallyUnread: boolean
    messages: Array<{
      id: number
      date: string
      sender: string
      senderId: string | null
      text: string
      hasMedia: boolean
    }>
  }> = []

  for await (const dialog of tg.iterDialogs({
    limit: options?.chatsLimit ?? 20,
  })) {
    if (!dialog.isUnread) continue

    const unreadMessages: Array<{
      id: number
      date: string
      sender: string
      senderId: string | null
      text: string
      hasMedia: boolean
    }> = []

    for await (const message of tg.iterHistory(dialog.peer.inputPeer, {
      limit: Math.max(options?.messagesLimit ?? 5, dialog.unreadCount, 5),
    })) {
      const isUnreadMessage =
        message.id > dialog.lastReadIngoing ||
        (dialog.isManuallyUnread && message.id === dialog.lastMessage?.id)

      if (!isUnreadMessage || message.sender.id === me.id) continue

      unreadMessages.push({
        id: message.id,
        date: message.date.toISOString(),
        sender: message.sender.displayName,
        senderId: String(message.sender.id),
        text: message.text,
        hasMedia: message.media !== null,
      })

      if (unreadMessages.length >= (options?.messagesLimit ?? 5)) break
    }

    unreadMessages.reverse()

    results.push({
      chatId: String(dialog.peer.id),
      chatName: dialog.peer.displayName,
      chatType: dialog.peer.type,
      unreadCount: dialog.unreadCount,
      isManuallyUnread: dialog.isManuallyUnread,
      messages: unreadMessages,
    })
  }

  return {
    count: results.length,
    chats: results,
  }
}

export async function markRead(chat: string, options?: { maxId?: number }) {
  const tg = await getClient()
  const peer = await resolvePeer(chat)

  await tg.readHistory(peer.inputPeer, {
    maxId: options?.maxId,
    clearMentions: true,
  })

  return {
    success: true,
    chatId: String(peer.id),
    chatName: peer.displayName,
    maxId: options?.maxId ?? null,
  }
}

export async function setDraft(chat: string, text: string) {
  const tg = await getClient()
  const peer = await resolvePeer(chat)

  if (text.length === 0) {
    await tg.saveDraft(peer.inputPeer, null)
    return {
      success: true,
      action: 'cleared',
      chatId: String(peer.id),
      chatName: peer.displayName,
    }
  }

  await tg.saveDraft(peer.inputPeer, { message: text })

  return {
    success: true,
    action: 'saved',
    chatId: String(peer.id),
    chatName: peer.displayName,
    text,
  }
}

export async function sendMessage(
  chat: string,
  text: string,
  options?: {
    replyTo?: number
  },
) {
  const tg = await getClient()
  const peer = await resolvePeer(chat)
  const message = await tg.sendText(peer.inputPeer, text, {
    replyTo: options?.replyTo,
  })

  return {
    success: true,
    chatId: String(peer.id),
    chatName: peer.displayName,
    messageId: message.id,
    date: message.date.toISOString(),
    replyTo: options?.replyTo ?? null,
    text: message.text,
  }
}
