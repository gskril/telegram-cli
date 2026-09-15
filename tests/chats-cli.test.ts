import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

function run(...args: string[]) {
  return spawnSync(
    process.execPath,
    ['--import', 'tsx/esm', 'src/cli.ts', ...args],
    {
      encoding: 'utf8',
    },
  )
}

test('shared groups are exposed as chats options, not a separate command', () => {
  const help = run('chats', '--help')
  assert.equal(help.status, 0)
  assert.match(help.stdout, /--with/)
  assert.match(help.stdout, /--all/)
  assert.match(help.stdout, /default: 20/)
  const root = run('--help')
  assert.equal(root.status, 0)
  assert.doesNotMatch(root.stdout, /common-chats/)
})

test('rejects conflicting all and limit options before opening a session', () => {
  const result = run('chats', '--all', '--limit', '5', '--format', 'json')
  assert.notEqual(result.status, 0)
  assert.match(result.stdout, /VALIDATION_ERROR/)
  assert.match(result.stdout, /--all cannot be combined with --limit/)
})

test('rejects fractional and zero result limits before opening a session', () => {
  for (const limit of ['0', '1.5']) {
    const result = run(
      'chats',
      '--with',
      '@someone',
      '--limit',
      limit,
      '--format',
      'json',
    )
    assert.notEqual(result.status, 0)
    assert.match(result.stdout, /VALIDATION_ERROR/)
  }
})
