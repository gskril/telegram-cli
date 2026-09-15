import assert from 'node:assert/strict'
import { beforeEach, mock, test } from 'node:test'
import { getMarkedPeerId, Long, type tl } from '@mtcute/node'

let folders: tl.TypeDialogFilter[] = []
let dialogs: tl.RawDialog[] = []
let users: tl.TypeUser[] = []
let chats: tl.TypeChat[] = []
let calls: string[] = []

const client = {
  async call(request: {
    _: string
    offsetId?: number
    limit?: number
    folderId?: number
    peers?: { peer: tl.TypeInputPeer }[]
  }) {
    calls.push(request._)
    if (request._ === 'messages.getDialogFilters') return { filters: folders }
    let selected = dialogs
    if (request._ === 'messages.getPeerDialogs') {
      const ids = new Set(
        request.peers?.map(({ peer }) => getMarkedPeerId(peer)),
      )
      selected = dialogs.filter((dialog) =>
        ids.has(getMarkedPeerId(dialog.peer)),
      )
    } else {
      assert.equal(request._, 'messages.getDialogs')
      const offset = request.offsetId
        ? dialogs.findIndex(
            (dialog) => dialog.topMessage === request.offsetId,
          ) + 1
        : 0
      selected = dialogs.slice(offset)
      if (request.folderId !== undefined) {
        selected = selected.filter(
          (dialog) => (dialog.folderId ?? 0) === request.folderId,
        )
      }
      selected = selected.slice(0, request.limit)
    }
    return {
      _: 'messages.dialogs',
      dialogs: selected.map((d) => ({ ...d })),
      users,
      chats,
      messages: [],
    }
  },
}

mock.module('../src/telegram/client.ts', {
  namedExports: { getClient: async () => client },
})
const { listChats } = await import('../src/telegram/chats.js')
const { listFolders } = await import('../src/telegram/folders.js')

function folder(
  id = 2,
  title = 'Important',
  options: Partial<tl.RawDialogFilter> = {},
): tl.RawDialogFilter {
  return {
    _: 'dialogFilter',
    id,
    title: { _: 'textWithEntities', text: title, entities: [] },
    pinnedPeers: [],
    includePeers: [],
    excludePeers: [],
    ...options,
  }
}

function addDialog(
  id: number,
  unreadCount = 0,
  options: Partial<tl.RawDialog> = {},
) {
  users.push({ _: 'user', id, accessHash: Long.ONE, firstName: `User ${id}` })
  dialogs.push({
    _: 'dialog',
    peer: { _: 'peerUser', userId: id },
    topMessage: id,
    readInboxMaxId: 0,
    readOutboxMaxId: 0,
    unreadCount,
    unreadMentionsCount: 0,
    unreadReactionsCount: 0,
    unreadPollVotesCount: 0,
    notifySettings: { _: 'peerNotifySettings' },
    ...options,
  })
}

beforeEach(() => {
  folders = []
  dialogs = []
  users = []
  chats = []
  calls = []
})

test('folders returns IDs and titles without fetching dialogs or counts', async () => {
  folders = [folder(), { _: 'dialogFilterDefault' }]
  assert.deepEqual(await listFolders(), {
    folders: [
      { id: 2, title: 'Important' },
      { id: 0, title: 'All chats' },
    ],
  })
  assert.deepEqual(calls, ['messages.getDialogFilters'])
})

test('unread-only scans beyond the first page and counts matches, including single unread and manual marks', async () => {
  for (let id = 1; id <= 105; id++) addDialog(id)
  addDialog(106, 1)
  addDialog(107, 0, { unreadMark: true })
  addDialog(108, 4)
  const result = await listChats({ unreadOnly: true, limit: 2 })
  assert.deepEqual(
    result.chats.map((chat) => chat.id),
    ['106', '107'],
  )
  assert.ok(result.chats.every((chat) => chat.isUnread))
  assert.equal(calls.filter((call) => call === 'messages.getDialogs').length, 2)
})

test('ordinary chats retains its limit and reports a single unread message correctly', async () => {
  addDialog(1, 1)
  addDialog(2)
  const result = await listChats({ limit: 1 })
  assert.equal(result.count, 1)
  assert.equal(result.chats[0]?.isUnread, true)
})

test('selects folders by exact title or ID and filters categories before the limit', async () => {
  folders = [folder(2, 'Important', { bots: true })]
  for (let id = 1; id <= 105; id++) addDialog(id)
  addDialog(106, 1)
  users[105] = {
    _: 'user',
    id: 106,
    accessHash: Long.ONE,
    firstName: 'Bot',
    bot: true,
    botInfoVersion: 1,
  }
  for (const selector of ['Important', '2']) {
    assert.deepEqual(
      (
        await listChats({ folder: selector, limit: 1, unreadOnly: true })
      ).chats.map((chat) => chat.id),
      ['106'],
    )
  }
})

test('rejects missing and ambiguous titles; ID disambiguates', async () => {
  folders = [folder(2), folder(3)]
  await assert.rejects(
    listChats({ folder: 'Important' }),
    /Use a folder ID: 2, 3/,
  )
  await assert.rejects(listChats({ folder: 'important' }), /not found/)
  assert.equal((await listChats({ folder: '3' })).count, 0)
})

test('folder exclusion rules respect explicit and pinned basic-group peers', async () => {
  folders = [
    folder(2, 'Important', {
      groups: true,
      excludeRead: true,
      excludeArchived: true,
      pinnedPeers: [{ _: 'inputPeerChat', chatId: 4 }],
      includePeers: [{ _: 'inputPeerChat', chatId: 3 }],
      excludePeers: [{ _: 'inputPeerChat', chatId: 2 }],
    }),
  ]
  for (let id = 1; id <= 5; id++) {
    chats.push({
      _: 'chat',
      id,
      title: `Group ${id}`,
      photo: { _: 'chatPhotoEmpty' },
      participantsCount: 2,
      date: 0,
      version: 1,
    })
    addDialog(id, id <= 2 ? 1 : 0, { peer: { _: 'peerChat', chatId: id } })
  }
  assert.deepEqual(
    (await listChats({ folder: '2' })).chats.map((chat) => chat.id),
    ['-4', '-1', '-3'],
  )
  assert.deepEqual(
    (await listChats({ folder: '2', unreadOnly: true })).chats.map(
      (chat) => chat.id,
    ),
    ['-1'],
  )
})

test('shared folders include channel peers and pinned basic groups', async () => {
  folders = [
    {
      _: 'dialogFilterChatlist',
      id: 3,
      title: { _: 'textWithEntities', text: 'Shared', entities: [] },
      pinnedPeers: [{ _: 'inputPeerChat', chatId: 1 }],
      includePeers: [
        { _: 'inputPeerChannel', channelId: 2, accessHash: Long.ONE },
      ],
    },
  ]
  chats.push({
    _: 'chat',
    id: 1,
    title: 'Group',
    photo: { _: 'chatPhotoEmpty' },
    participantsCount: 2,
    date: 0,
    version: 1,
  })
  chats.push({
    _: 'channel',
    id: 2,
    accessHash: Long.ONE,
    title: 'Channel',
    photo: { _: 'chatPhotoEmpty' },
    date: 0,
    broadcast: true,
  })
  addDialog(1, 1, { peer: { _: 'peerChat', chatId: 1 } })
  addDialog(2, 1, { peer: { _: 'peerChannel', channelId: 2 } })
  assert.deepEqual(
    (await listChats({ folder: 'Shared' })).chats.map((chat) => chat.id),
    ['-1', '-1000000000002'],
  )
})

test('empty results terminate normally', async () => {
  addDialog(1)
  assert.deepEqual(await listChats({ unreadOnly: true }), {
    count: 0,
    chats: [],
  })
})
