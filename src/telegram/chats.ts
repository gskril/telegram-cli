import { getMarkedPeerId } from '@mtcute/node'
import {
  getChat,
  getChatMembers,
  getMe,
  iterDialogs,
  iterHistory,
  readHistory,
} from '@mtcute/node/methods.js'

import { getClient } from './client.js'
import { resolvePeer } from './resolve.js'
import { resolveFolder } from './folders.js'

function isUnread(dialog: { unreadCount: number; isManuallyUnread: boolean }) {
  // mtcute 0.32.0's isUnread incorrectly checks unreadCount > 1.
  return dialog.unreadCount > 0 || Boolean(dialog.isManuallyUnread)
}

export async function listChats(options?: {
  limit?: number
  unreadOnly?: boolean
  folder?: string
}) {
  const tg = await getClient()
  const folder =
    options?.folder === undefined
      ? undefined
      : await resolveFolder(options.folder)
  const limit = options?.limit ?? 20
  // Normalize shared folders to the equivalent explicit-peer filter. mtcute's
  // InputDialogFolder type does not accept the shared-folder constructor.
  const dialogFolder =
    folder?._ === 'dialogFilterDefault'
      ? undefined
      : folder?._ === 'dialogFilterChatlist'
        ? { ...folder, _: 'dialogFilter' as const, excludePeers: [] }
        : folder
  // Apply excludeRead ourselves to include single-unread-message dialogs,
  // while preserving Telegram's explicit inclusion/pinning overrides.
  const excludeRead = folder?._ === 'dialogFilter' && folder.excludeRead
  const explicitPeers = new Set(
    folder && folder._ !== 'dialogFilterDefault'
      ? [...folder.includePeers, ...folder.pinnedPeers].map((peer) =>
          getMarkedPeerId(peer),
        )
      : [],
  )
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

  for await (const dialog of iterDialogs(tg, {
    folder:
      excludeRead && dialogFolder?._ === 'dialogFilter'
        ? { ...dialogFolder, excludeRead: false }
        : dialogFolder,
    limit: options?.unreadOnly || excludeRead ? Infinity : limit,
  })) {
    const unread = isUnread(dialog)
    if (options?.unreadOnly && !unread) continue
    if (excludeRead && !unread && !explicitPeers.has(dialog.peer.id)) continue

    chats.push({
      id: String(dialog.peer.id),
      name: dialog.peer.displayName,
      type: dialog.peer.type,
      unreadCount: dialog.unreadCount,
      isUnread: unread,
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
    if (!isUnread(dialog)) continue

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
