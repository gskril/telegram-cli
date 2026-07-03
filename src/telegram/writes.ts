import { stat } from 'node:fs/promises'
import { basename, extname, resolve as resolvePath } from 'node:path'

import { InputMedia } from '@mtcute/node'
import {
  addChatMembers as mtcuteAddChatMembers,
  createGroup as mtcuteCreateGroup,
  createSupergroup as mtcuteCreateSupergroup,
  kickChatMember,
  leaveChat as mtcuteLeaveChat,
  saveDraft,
  sendMedia,
  sendText,
} from '@mtcute/node/methods.js'

import { getClient } from './client.js'
import { assertWritable } from './config.js'
import { normalizeInviteTargets, resolvePeer } from './resolve.js'

function inviteFailureReason(failure: {
  premiumWouldAllowInvite?: boolean
  premiumRequiredForPm?: boolean
}): string {
  return failure.premiumWouldAllowInvite
    ? 'premium_required'
    : failure.premiumRequiredForPm
      ? 'premium_required_for_pm'
      : 'privacy_restricted_invite_link_required'
}

// Telegram cloud drafts are text-only: messages.saveDraft rejects uploaded
// and external media with MEDIA_INVALID (only webpage previews are honored),
// so drafts deliberately have no attachment support.
export async function setDraft(
  chat: string,
  options: {
    text?: string
  },
) {
  const text = options.text
  if (text === undefined) {
    throw new Error(
      'Provide draft text, or an empty string to clear the draft.',
    )
  }

  const tg = await getClient()
  const peer = await resolvePeer(chat)

  if (text.length === 0) {
    await saveDraft(tg, peer.inputPeer, null)
    return {
      success: true,
      action: 'cleared',
      chatId: String(peer.id),
      chatName: peer.displayName,
    }
  }

  await saveDraft(tg, peer.inputPeer, { message: text })

  return {
    success: true,
    action: 'saved',
    chatId: String(peer.id),
    chatName: peer.displayName,
    text,
  }
}

export async function createChatGroup(
  title: string,
  options?: {
    users?: Array<string | number>
    supergroup?: boolean
    about?: string
  },
) {
  await assertWritable()
  const tg = await getClient()
  const users = normalizeInviteTargets(options?.users ?? [])
  const supergroup = options?.supergroup ?? false

  if (!title.trim()) {
    throw new Error('Group title is required.')
  }

  if (!supergroup && users.length === 0) {
    throw new Error(
      'Legacy groups require at least one other user. Pass --user, or use --supergroup to create an empty supergroup.',
    )
  }

  if (!supergroup && options?.about) {
    throw new Error(
      'Legacy groups do not support --about. Use --supergroup to set a description.',
    )
  }

  if (supergroup) {
    const chat = await mtcuteCreateSupergroup(tg, {
      title,
      description: options?.about,
    })

    let missing: Array<{ userId: string; reason: string }> = []
    if (users.length > 0) {
      const failures = await mtcuteAddChatMembers(tg, chat.inputPeer, users, {})
      missing = failures.map((f) => ({
        userId: String(f.userId),
        reason: inviteFailureReason(f),
      }))
    }

    return {
      success: true,
      chatId: String(chat.id),
      chatName: chat.displayName,
      chatType: chat.chatType,
      username: chat.username ?? null,
      missing,
    }
  }

  const { chat, missing } = await mtcuteCreateGroup(tg, { title, users })

  return {
    success: true,
    chatId: String(chat.id),
    chatName: chat.displayName,
    chatType: chat.chatType,
    username: chat.username ?? null,
    missing: missing.map((f) => ({
      userId: String(f.userId),
      reason: inviteFailureReason(f),
    })),
  }
}

export async function removeChatMembers(
  chat: string,
  options: {
    users: Array<string | number>
  },
) {
  await assertWritable()
  const tg = await getClient()
  const peer = await resolvePeer(chat)
  const users = normalizeInviteTargets(options.users)

  if (users.length === 0) {
    throw new Error('At least one user is required. Pass --user.')
  }

  const removed: Array<{
    user: string
    messageId: number | null
    date: string | null
  }> = []

  for (const user of users) {
    const message = await kickChatMember(tg, {
      chatId: peer.inputPeer,
      userId: user,
    })

    removed.push({
      user: String(user),
      messageId: message?.id ?? null,
      date: message?.date.toISOString() ?? null,
    })
  }

  return {
    success: true,
    chatId: String(peer.id),
    chatName: peer.displayName,
    removed,
  }
}

export async function addChatMembers(
  chat: string,
  options: {
    users: Array<string | number>
  },
) {
  await assertWritable()
  const tg = await getClient()
  const peer = await resolvePeer(chat)
  const users = normalizeInviteTargets(options.users)

  if (users.length === 0) {
    throw new Error('At least one user is required. Pass --user.')
  }

  const added: Array<{ userId: string }> = []
  const missing: Array<{ userId: string; reason: string }> = []

  for (const user of users) {
    // mtcute returns invite restrictions as missingInvitees instead of throwing.
    // Invite one target at a time so we can report each original input precisely.
    const missingInvitees = await mtcuteAddChatMembers(
      tg,
      peer.inputPeer,
      [user],
      {},
    )
    const missingInvitee = missingInvitees[0]

    if (missingInvitee) {
      missing.push({
        userId: String(user),
        reason: inviteFailureReason(missingInvitee),
      })
      continue
    }

    added.push({ userId: String(user) })
  }

  if (added.length === 0 && missing.length > 0) {
    const summary = missing.map((f) => `${f.userId}: ${f.reason}`).join(', ')
    throw new Error(`Failed to add all members — ${summary}.`)
  }

  return {
    success: true,
    chatId: String(peer.id),
    chatName: peer.displayName,
    added,
    missing,
  }
}

export async function leaveChatGroup(
  chat: string,
  options?: { clear?: boolean },
) {
  await assertWritable()
  const tg = await getClient()
  const peer = await resolvePeer(chat)

  await mtcuteLeaveChat(tg, peer.inputPeer, { clear: options?.clear })

  return {
    success: true,
    chatId: String(peer.id),
    chatName: peer.displayName,
    leftSelf: true,
    clearedHistory: options?.clear ?? false,
  }
}

export type AttachmentType =
  | 'auto'
  | 'photo'
  | 'video'
  | 'animation'
  | 'audio'
  | 'voice'
  | 'document'

export type AttachmentOptions = {
  file?: string
  fileType?: AttachmentType
  fileName?: string
}

const PHOTO_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv'])
const ANIMATION_EXTENSIONS = new Set(['.gif'])
const AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.m4a',
  '.ogg',
  '.oga',
  '.opus',
  '.flac',
  '.wav',
])

function inferMediaType(fileName: string): Exclude<AttachmentType, 'auto'> {
  const extension = extname(fileName).toLowerCase()

  if (PHOTO_EXTENSIONS.has(extension)) return 'photo'
  if (VIDEO_EXTENSIONS.has(extension)) return 'video'
  if (ANIMATION_EXTENSIONS.has(extension)) return 'animation'
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio'

  return 'document'
}

async function prepareAttachment(
  file: string,
  options: {
    fileType?: AttachmentType
    fileName?: string
    caption?: string
  },
) {
  const isRemote = /^https?:\/\//i.test(file)
  const requested = options.fileType ?? 'auto'
  let input: string
  let sourceName: string
  let sourcePath: string

  if (isRemote) {
    // Telegram fetches URLs server-side as external media, which only
    // supports photos and documents and ignores custom file names.
    if (
      requested !== 'auto' &&
      requested !== 'photo' &&
      requested !== 'document'
    ) {
      throw new Error(
        `File type "${requested}" is not supported for URL attachments; only photo and document are. Download the file first to send it as ${requested}.`,
      )
    }
    if (options.fileName !== undefined) {
      throw new Error('--file-name is not supported for URL attachments.')
    }

    let url: URL
    try {
      url = new URL(file)
    } catch {
      throw new Error(`Invalid file URL: ${file}`)
    }

    input = file
    sourcePath = file
    sourceName = basename(url.pathname) || file
  } else {
    const absolutePath = resolvePath(file)
    const stats = await stat(absolutePath).catch(() => null)

    if (!stats?.isFile()) {
      throw new Error(`File not found: ${absolutePath}`)
    }

    // mtcute treats a bare string as a file ID or URL; the file: prefix
    // marks a local filesystem path.
    input = `file:${absolutePath}`
    sourcePath = absolutePath
    sourceName = basename(absolutePath)
  }

  let mediaType = requested === 'auto' ? inferMediaType(sourceName) : requested
  if (isRemote && mediaType !== 'photo') mediaType = 'document'
  const params = {
    caption: options.caption,
    fileName: options.fileName ?? sourceName,
  }

  const media =
    mediaType === 'photo'
      ? InputMedia.photo(input, params)
      : mediaType === 'video'
        ? InputMedia.video(input, params)
        : mediaType === 'animation'
          ? InputMedia.animation(input, params)
          : mediaType === 'audio'
            ? InputMedia.audio(input, params)
            : mediaType === 'voice'
              ? InputMedia.voice(input, params)
              : InputMedia.document(input, params)

  return {
    media,
    mediaType,
    file: sourcePath,
  }
}

export async function sendMessage(
  chat: string,
  options: AttachmentOptions & {
    text?: string
    replyTo?: number
  },
) {
  await assertWritable()

  if (!options.file && !options.text) {
    throw new Error('Provide message text, a file, or both.')
  }

  const attachment = options.file
    ? await prepareAttachment(options.file, {
        fileType: options.fileType,
        fileName: options.fileName,
        caption: options.text,
      })
    : null

  const tg = await getClient()
  const peer = await resolvePeer(chat)

  const message = attachment
    ? await sendMedia(tg, peer.inputPeer, attachment.media, {
        replyTo: options.replyTo,
      })
    : await sendText(tg, peer.inputPeer, options.text ?? '', {
        replyTo: options.replyTo,
      })

  return {
    success: true,
    chatId: String(peer.id),
    chatName: peer.displayName,
    messageId: message.id,
    date: message.date.toISOString(),
    replyTo: options.replyTo ?? null,
    text: message.text,
    ...(attachment && {
      mediaType: attachment.mediaType,
      file: attachment.file,
    }),
  }
}
