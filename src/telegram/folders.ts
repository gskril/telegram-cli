import { getFolders } from '@mtcute/node/methods.js'

import { getClient } from './client.js'

type Folder = Awaited<ReturnType<typeof getFolders>>['filters'][number]

export function folderSummary(folder: Folder) {
  return folder._ === 'dialogFilterDefault'
    ? { id: 0, title: 'All chats' }
    : { id: folder.id, title: folder.title.text }
}

export function selectFolder(folders: Folder[], selector: string) {
  // Numeric selectors always mean IDs; titles must match exactly.
  const id = /^\d+$/.test(selector) ? Number(selector) : undefined
  const matches = folders.filter((folder) => {
    const summary = folderSummary(folder)
    return id === undefined ? summary.title === selector : summary.id === id
  })
  if (matches.length === 0) {
    throw new Error(
      `Folder "${selector}" not found. Run "telegram folders" to list folders.`,
    )
  }
  if (matches.length > 1) {
    throw new Error(
      `Multiple folders named "${selector}". Use a folder ID: ${matches.map((folder) => folderSummary(folder).id).join(', ')}.`,
    )
  }
  return matches[0]!
}

export async function listFolders() {
  const tg = await getClient()
  const result = await getFolders(tg)
  return { folders: result.filters.map(folderSummary) }
}

export async function resolveFolder(selector: string) {
  const tg = await getClient()
  const result = await getFolders(tg)
  return selectFolder(result.filters, selector)
}
