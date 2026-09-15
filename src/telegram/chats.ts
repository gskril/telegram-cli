import { Chat, type Dialog } from '@mtcute/node'

import {
  getChat,
  getChatMembers,
  getMe,
  getPeerDialogs,
  iterDialogs,
  iterHistory,
  readHistory,
  resolveUser,
} from '@mtcute/node/methods.js'

import { getClient } from './client.js'
import { iterCommonChats } from './common-chats.js'
import { resolvePeer } from './resolve.js'

export async function listChats(options?: {
  limit?: number
  unreadOnly?: boolean
  with?: string
  all?: boolean
}) {
  if (options?.all && options.limit !== undefined) {
    throw new Error('--all cannot be combined with --limit.')
  }
  const limit = options?.all ? Infinity : (options?.limit ?? 20)
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

  const dialogs = options?.with
    ? iterSharedDialogs(options.with, options.unreadOnly ? undefined : limit)
    : iterDialogs(tg, { limit: options?.unreadOnly ? Infinity : limit })

  for await (const dialog of dialogs) {
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
    if (chats.length >= limit) break
  }

  return {
    count: chats.length,
    chats,
  }
}

export async function getMemberCount(chat: string) {
  const tg = await getClient()
  const peer = await resolvePeer(chat)

  if (peer.type === 'user') {
    throw new Error(
      'Member count is only available for groups, supergroups, and channels.',
    )
  }

  const fullChat = await getChat(tg, peer.inputPeer)
  let memberCount = fullChat.membersCount

  if (memberCount === null && fullChat.chatType !== 'group') {
    const members = await getChatMembers(tg, peer.inputPeer, { limit: 1 })
    memberCount = members.total
  }

  if (memberCount === null) {
    const members = await getChatMembers(tg, peer.inputPeer)
    memberCount = members.total
  }

  return {
    chat: {
      id: String(fullChat.id),
      name: fullChat.displayName,
      type: fullChat.chatType,
      username: fullChat.username ?? null,
    },
    memberCount,
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

  for await (const message of iterHistory(tg, peer.inputPeer, {
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
  const me = await getMe(tg)
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

  for await (const dialog of iterDialogs(tg, {
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

    for await (const message of iterHistory(tg, dialog.peer.inputPeer, {
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

async function* iterSharedDialogs(
  user: string,
  limit?: number,
): AsyncGenerator<Dialog> {
  const tg = await getClient()
  const peer = await resolvePeer(user)
  if (peer.type !== 'user') {
    throw new Error('--with requires a user ID, @username, or phone number.')
  }

  const userId = await resolveUser(tg, peer.inputPeer)
  const shared = iterCommonChats(
    async ({ maxId, limit }) => {
      const page = await tg.call({
        _: 'messages.getCommonChats',
        userId,
        maxId,
        limit,
      })
      return page.chats.map((chat) => new Chat(chat))
    },
    { limit: Number.isFinite(limit) ? limit : undefined },
  )

  // Fetch dialog metadata for shared peers directly, including groups outside
  // the recent-dialog window. Hydrate in batches instead of one RPC per group.
  let batch: Chat[] = []
  for await (const chat of shared) {
    batch.push(chat)
    if (batch.length === 100) {
      yield* hydrateSharedDialogs(batch)
      batch = []
    }
  }
  if (batch.length > 0) yield* hydrateSharedDialogs(batch)
}

async function* hydrateSharedDialogs(chats: Chat[]): AsyncGenerator<Dialog> {
  const tg = await getClient()
  const dialogs = await getPeerDialogs(
    tg,
    chats.map((chat) => chat.inputPeer),
  )
  for (const dialog of dialogs) {
    if (!dialog) {
      throw new Error(
        'Unable to load a shared chat; results may be incomplete. Retry the command.',
      )
    }
    yield dialog
  }
}

export async function markRead(chat: string, options?: { maxId?: number }) {
  const tg = await getClient()
  const peer = await resolvePeer(chat)

  await readHistory(tg, peer.inputPeer, {
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
