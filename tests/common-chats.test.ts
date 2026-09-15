import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Chat } from '@mtcute/node'

import { collectCommonChats } from '../src/telegram/common-chats.js'

const chat = (id: number) =>
  new Chat({ _: 'chatForbidden', id, title: `Group ${id}` })

test('fetches beyond 100, uses raw cursors, and continues after short pages', async () => {
  const requests: Array<{ maxId: number; limit: number }> = []
  const pages = [
    Array.from({ length: 100 }, (_, i) => chat(i + 1)),
    [chat(101), chat(102)],
    [chat(103)],
    [],
  ]
  const result = await collectCommonChats(async (request) => {
    requests.push(request)
    return pages.shift() ?? []
  })
  assert.equal(result.length, 103)
  assert.deepEqual(
    requests.map((r) => r.maxId),
    [0, 100, 102, 103],
  )
  assert.ok(requests.every((r) => r.limit === 100))
})

test('honors a limit spanning pages without an extra request', async () => {
  const requests: Array<{ maxId: number; limit: number }> = []
  const result = await collectCommonChats(
    async (request) => {
      requests.push(request)
      return Array.from({ length: request.limit }, (_, i) =>
        chat(request.maxId + i + 1),
      )
    },
    { limit: 125 },
  )
  assert.equal(result.length, 125)
  assert.deepEqual(requests, [
    { maxId: 0, limit: 100 },
    { maxId: 100, limit: 25 },
  ])
})

test('handles empty results', async () => {
  assert.deepEqual(await collectCommonChats(async () => []), [])
})

test('deduplicates overlapping pages', async () => {
  const pages = [[chat(1), chat(2)], [chat(2), chat(3)], []]
  const result = await collectCommonChats(async () => pages.shift() ?? [])
  assert.deepEqual(
    result.map((c) => c.raw.id),
    [1, 2, 3],
  )
})

test('fails instead of silently returning partial results when a cursor repeats', async () => {
  await assert.rejects(
    collectCommonChats(async () => [chat(1)]),
    /did not advance/,
  )
})

test('propagates later-page errors rather than returning a partial success', async () => {
  let calls = 0
  await assert.rejects(
    collectCommonChats(async () => {
      if (calls++ === 0) return [chat(1)]
      throw new Error('network failure')
    }),
    /network failure/,
  )
})

test('rejects invalid limits before making a request', async () => {
  for (const limit of [
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    await assert.rejects(
      collectCommonChats(
        async () => {
          assert.fail('must not request a page')
        },
        { limit },
      ),
      /positive safe integer/,
    )
  }
})
