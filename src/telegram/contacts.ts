import { getContacts } from '@mtcute/node/methods.js'

import { getClient } from './client.js'

function normalizeContactQuery(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[@_]+/g, ' ')
    .replace(/[^\p{L}\p{N}+]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function searchTokens(value: string): string[] {
  const normalized = normalizeContactQuery(value)
  return normalized.length > 0 ? normalized.split(' ') : []
}

function contactSearchScore(
  query: string,
  contact: {
    displayName: string
    username: string | null
    phoneNumber: string | null
  },
): number {
  const normalizedQuery = normalizeContactQuery(query)
  if (!normalizedQuery) return 0

  const displayName = normalizeContactQuery(contact.displayName)
  const username = contact.username
    ? normalizeContactQuery(contact.username)
    : null
  const phoneNumber = contact.phoneNumber
    ? normalizeContactQuery(contact.phoneNumber)
    : null
  const fields = [displayName, username, phoneNumber].filter(
    (value): value is string => Boolean(value),
  )

  let score = 0

  if (username === normalizedQuery) score = Math.max(score, 250)
  else if (username?.startsWith(normalizedQuery)) score = Math.max(score, 220)
  else if (username?.includes(normalizedQuery)) score = Math.max(score, 170)

  if (displayName === normalizedQuery) score = Math.max(score, 240)
  else if (displayName.startsWith(normalizedQuery)) score = Math.max(score, 210)
  else if (displayName.includes(normalizedQuery)) score = Math.max(score, 160)

  if (phoneNumber === normalizedQuery) score = Math.max(score, 230)
  else if (phoneNumber?.includes(normalizedQuery)) score = Math.max(score, 180)

  for (const token of searchTokens(normalizedQuery)) {
    let matchedToken = false
    for (const field of fields) {
      if (field === token) {
        score += 30
        matchedToken = true
        break
      }

      const fieldTokens = field.split(' ')
      if (fieldTokens.some((fieldToken) => fieldToken.startsWith(token))) {
        score += 22
        matchedToken = true
        break
      }

      if (field.includes(token)) {
        score += 12
        matchedToken = true
        break
      }
    }

    if (!matchedToken) return 0
  }

  return score
}

export async function listContacts(
  query: string,
  options?: { limit?: number },
) {
  const tg = await getClient()
  const normalizedQuery = normalizeContactQuery(query)

  if (!normalizedQuery) {
    throw new Error('Search query must contain at least one letter or number.')
  }

  const contacts = await getContacts(tg)
  const matches = contacts
    .map((contact) => ({
      id: String(contact.id),
      displayName: contact.displayName,
      username: contact.username ?? null,
      phoneNumber: contact.phoneNumber ?? null,
      isMutualContact: contact.isMutualContact,
      score: contactSearchScore(query, contact),
    }))
    .filter((contact) => contact.score > 0)
    .sort(
      (a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName),
    )
    .slice(0, options?.limit ?? 20)
    .map(({ score: _score, ...contact }) => contact)

  return {
    query,
    count: matches.length,
    contacts: matches,
  }
}
