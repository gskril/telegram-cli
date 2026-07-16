import type { InputPeerLike, Peer } from '@mtcute/node'
import { MtPeerNotFoundError } from '@mtcute/node'
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

async function resolveUserOrChat(parsed: string | number): Promise<Peer> {
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

// Bounds the fallback dialog scan below. Each page of 100 dialogs costs one
// sequential messages.getDialogs RPC, an endpoint Telegram flood-limits
// aggressively, so an unbounded scan on a large account risks multi-second
// lookups and FLOOD_WAIT stalls. 200 keeps a miss to two round-trips.
const DIALOG_SCAN_LIMIT = 200

async function findPeerInDialogs(id: number): Promise<Peer | null> {
  const tg = await getClient()

  for await (const dialog of iterDialogs(tg, { limit: DIALOG_SCAN_LIMIT })) {
    if (dialog.peer.id === id) {
      return dialog.peer
    }
  }

  return null
}

// Shared resolution path for both resolvePeer and resolveTarget: try a direct
// lookup, then fall back to a bounded dialog scan for bare numeric IDs.
async function resolveUserOrChatWithFallback(
  parsed: string | number,
): Promise<Peer> {
  try {
    return await resolveUserOrChat(parsed)
  } catch (error) {
    // Bare numeric IDs fail direct resolution when the peer's access_hash
    // isn't in the local cache; scanning recent dialogs can still find it.
    // Only retry on a genuine "not found" — a FLOOD_WAIT / network / auth
    // failure won't be fixed by firing more getDialogs RPCs while throttled.
    if (typeof parsed === 'number' && error instanceof MtPeerNotFoundError) {
      try {
        const fromDialogs = await findPeerInDialogs(parsed)
        if (fromDialogs) return fromDialogs
      } catch {
        // If the scan itself throws, surface the original, more diagnostic
        // resolution error rather than the transient scan failure.
        throw error
      }
    }

    throw error
  }
}

export async function resolvePeer(chat: string): Promise<ResolvedPeer> {
  const parsed = parseChatId(chat)

  try {
    const peer = await resolveUserOrChatWithFallback(parsed)
    return {
      id: peer.id,
      displayName: peer.displayName,
      inputPeer: peer.inputPeer,
      type: peer.type,
    }
  } catch (error) {
    if (typeof parsed === 'string') {
      const tg = await getClient()
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
  const peer = await resolveUserOrChatWithFallback(parsed)

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
