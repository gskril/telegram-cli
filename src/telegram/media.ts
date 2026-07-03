import { stat } from 'node:fs/promises'
import { basename, extname, resolve as resolvePath } from 'node:path'

import { InputMedia } from '@mtcute/node'

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

export async function prepareAttachment(
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
