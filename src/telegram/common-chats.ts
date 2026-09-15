import type { Chat } from '@mtcute/node'

type CommonChatsPageLoader = (params: {
  maxId: number
  limit: number
}) => Promise<Chat[]>

export async function* iterCommonChats(
  loadPage: CommonChatsPageLoader,
  options?: { limit?: number },
): AsyncGenerator<Chat> {
  const limit = options?.limit ?? Infinity
  if (
    options?.limit !== undefined &&
    (!Number.isSafeInteger(limit) || limit < 1)
  ) {
    throw new Error('Common chats limit must be a positive safe integer.')
  }

  let count = 0
  const seen = new Set<number>()
  const cursors = new Set<number>([0])
  let maxId = 0

  while (count < limit) {
    const page = await loadPage({
      maxId,
      limit: Math.min(100, limit - count),
    })
    if (page.length === 0) break

    for (const chat of page) {
      if (seen.has(chat.id)) continue
      seen.add(chat.id)
      count++
      yield chat
      if (count === limit) return
    }

    // Telegram expects the last raw ID, not mtcute's negative marked peer ID.
    // Continue even after a short page: only an empty page proves exhaustion.
    maxId = page[page.length - 1].raw.id
    if (cursors.has(maxId)) {
      throw new Error(
        'Common chats pagination did not advance; results may be incomplete.',
      )
    }
    cursors.add(maxId)
  }
}
