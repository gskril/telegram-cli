import readline from 'node:readline/promises'

import { BaseTelegramClient } from '@mtcute/node'
import { logOut, start } from '@mtcute/node/methods.js'

import {
  ensureStorageDir,
  getCredentials,
  getStorageFile,
  promptWithInterface,
} from './config.js'

let client: BaseTelegramClient | null = null

export function getCachedClient(): BaseTelegramClient | null {
  return client
}

export function clearCachedClient(): void {
  client = null
}

export async function createClient(): Promise<BaseTelegramClient> {
  const { apiId, apiHash } = await getCredentials()
  await ensureStorageDir()

  return new BaseTelegramClient({
    apiId,
    apiHash,
    storage: getStorageFile(),
  })
}

async function loginInteractive(tg: BaseTelegramClient) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  })

  try {
    return await start(tg, {
      phone: () =>
        promptWithInterface(rl, 'Phone number (include country code): '),
      code: () => promptWithInterface(rl, 'Login code: '),
      password: () =>
        promptWithInterface(rl, '2FA password (leave blank if none): ', {
          hidden: true,
        }),
      invalidCodeCallback: async (type) => {
        console.error(`Invalid ${type}. Try again.`)
      },
      codeSentCallback: async (sentCode) => {
        console.error(`Code sent via ${sentCode.type}.`)
      },
    })
  } finally {
    rl.close()
  }
}

async function requireStoredSession(tg: BaseTelegramClient): Promise<void> {
  await tg.prepare()
  const self = await tg.storage.self.fetch()

  if (!self) {
    throw new Error('No Telegram session found. Run "telegram auth" first.')
  }
}

export async function authClient(options?: {
  forceLogin?: boolean
}): Promise<BaseTelegramClient> {
  if (options?.forceLogin && client) {
    await client.destroy().catch(() => undefined)
    client = null
  }

  if (client && !options?.forceLogin) return client

  const tg = await createClient()

  try {
    if (options?.forceLogin) {
      try {
        await logOut(tg)
      } catch {
        // Ignore if no active session is present.
      }
    }

    await loginInteractive(tg)
    client = tg
    return tg
  } catch (error) {
    await tg.destroy().catch(() => undefined)
    throw error
  }
}

export async function getClient(): Promise<BaseTelegramClient> {
  if (client) return client

  const tg = await createClient()

  try {
    await requireStoredSession(tg)
    client = tg
    return tg
  } catch (error) {
    await tg.destroy().catch(() => undefined)
    throw error
  }
}

export async function shutdownClient() {
  if (!client) return

  const tg = client
  client = null
  await tg.destroy().catch(() => undefined)
}
