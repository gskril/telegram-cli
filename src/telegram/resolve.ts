import type { InputPeerLike, Peer } from '@mtcute/node'
import { getChat, getMe, getUser, iterDialogs } from '@mtcute/node/methods.js'

import { getClient } from './client.js'

const NEGATIVE_CHAT_ID_PREFIX = 'tg-chat-id:'

export type ResolvedPeer = {
  id: number
  displayName: string
  inputPeer: InputPeerLike
  type: Peer['type']
}

export type ResolvedTarget = {
  input: string
  id: string
  displayName: string
  peerType: string
  username: string | null
  isSelf: boolean | null
}

function parsePeerTarget(target: string | number): string | number {
  if (typeof target === 'number') return target

  return /^-?\d+$/.test(target) ? Number.parseInt(target, 10) : target
}

function parseChatId(chat: string): string | number {
  if (chat.startsWith(NEGATIVE_CHAT_ID_PREFIX)) {
    chat = chat.slice(NEGATIVE_CHAT_ID_PREFIX.length)
  }

  return parsePeerTarget(chat)
}

export function normalizeInviteTargets(
  targets: ReadonlyArray<string | number>,
): Array<string | number> {
  return targets.flatMap((target) => {
    if (typeof target === 'number') return [target]

    return target
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .map(parsePeerTarget)
  })
}

function normalizeUsername(value: string): string {
  return value.startsWith('@') ? value.slice(1) : value
}

async function resolveUserOrChat(parsed: string | number) {
  const tg = await getClient()

  if (typeof parsed === 'string' || parsed > 0) {
    try {
      return await getUser(tg, parsed)
    } catch {
      // Fall through to chat resolution.
    }
  }

  return await getChat(tg, parsed)
}

export async function resolvePeer(chat: string): Promise<ResolvedPeer> {
  const tg = await getClient()
  const parsed = parseChatId(chat)

  if (typeof parsed === 'number') {
    for await (const dialog of iterDialogs(tg, { limit: 200 })) {
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

  try {
    const peer = await resolveUserOrChat(parsed)
    return {
      id: peer.id,
      displayName: peer.displayName,
      inputPeer: peer.inputPeer,
      type: peer.type,
    }
  } catch (error) {
    if (typeof parsed === 'string') {
      const me = await getMe(tg)
      const normalizedChat = normalizeUsername(parsed)
      const normalizedMe = me.username ? normalizeUsername(me.username) : null

      if (normalizedMe && normalizedChat === normalizedMe) {
        throw new Error(
          `Provided identifier "${chat}" is your account username, not your Saved Messages chat. Use your numeric ID ${me.id} from "telegram whoami" instead.`,
        )
      }
    }

    throw error
  }
}

export async function resolveTarget(chat: string): Promise<ResolvedTarget> {
  const parsed = parseChatId(chat)
  const peer = await resolveUserOrChat(parsed)

  if (peer.type === 'user') {
    return {
      input: chat,
      id: String(peer.id),
      displayName: peer.displayName,
      peerType: peer.type,
      username: peer.username ?? null,
      isSelf: peer.isSelf,
    }
  }

  return {
    input: chat,
    id: String(peer.id),
    displayName: peer.displayName,
    peerType: peer.chatType,
    username: peer.username ?? null,
    isSelf: null,
  }
}
