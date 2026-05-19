import { getMe, logOut } from '@mtcute/node/methods.js'

import {
  getConfigFile,
  getDataDir,
  getStorageFile,
  isReadOnly,
  setReadOnly,
} from './config.js'
import {
  authClient,
  clearCachedClient,
  createClient,
  getCachedClient,
  getClient,
} from './client.js'

export async function auth(options?: { force?: boolean; readOnly?: boolean }) {
  const tg = await authClient({ forceLogin: options?.force })
  const me = await getMe(tg)
  const readOnly = Boolean(options?.readOnly)
  await setReadOnly(readOnly)

  return {
    authenticated: true,
    id: me.id,
    displayName: me.displayName,
    username: me.username ?? null,
    readOnly,
    configFile: getConfigFile(),
    storageFile: getStorageFile(),
  }
}

export async function logout() {
  const tg = getCachedClient() ?? (await createClient())

  try {
    await logOut(tg)
  } catch {
    // Ignore missing session or network cleanup issues.
  } finally {
    clearCachedClient()
    await tg.destroy().catch(() => undefined)
    await setReadOnly(false)
  }

  return {
    authenticated: false,
    configFile: getConfigFile(),
    storageFile: getStorageFile(),
  }
}

export async function whoAmI() {
  const tg = await getClient()
  const me = await getMe(tg)
  const readOnly = await isReadOnly()

  return {
    authenticated: true,
    id: me.id,
    displayName: me.displayName,
    username: me.username ?? null,
    isPremium: me.isPremium,
    isBot: me.isBot,
    readOnly,
    configFile: getConfigFile(),
    storageFile: getStorageFile(),
    dataDir: getDataDir(),
  }
}
