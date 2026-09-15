import { z } from 'incur'

const historyCursorSchema = z.object({
  version: z.literal(1),
  chatId: z.string().regex(/^-?\d+$/),
  offset: z.object({
    id: z.number().int().positive().max(2147483647),
    date: z.number().int().nonnegative().max(2147483647),
  }),
})

export function encodeHistoryCursor(
  chatId: string,
  offset: z.infer<typeof historyCursorSchema>['offset'],
) {
  return Buffer.from(JSON.stringify({ version: 1, chatId, offset })).toString(
    'base64url',
  )
}

export function decodeHistoryCursor(cursor: string) {
  try {
    if (cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
      throw new Error('Invalid encoding')
    }
    const decoded: unknown = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    )
    return historyCursorSchema.parse(decoded)
  } catch {
    throw new Error(
      'Invalid history cursor. Use nextCursor from a previous read response.',
    )
  }
}
