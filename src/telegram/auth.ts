import { getMe, logOut } from '@mtcute/node/methods.js'

import {
  getConfigFile,
  getDataDir,
  getReadOnlySource,
  getStorageFile,
  isReadOnlyEnvSet,
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

  if (isReadOnlyEnvSet() && options?.readOnly === false) {
    console.error(
      'Warning: ignoring --read-only=false because TELEGRAM_READONLY=1 is set in the environment.',
    )
  }

  await setReadOnly(Boolean(options?.readOnly))

  const readOnlySource = await getReadOnlySource()

  return {
    authenticated: true,
    id: me.id,
    displayName: me.displayName,
    username: me.username ?? null,
    readOnly: readOnlySource !== null,
    readOnlySource,
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
  const readOnlySource = await getReadOnlySource()

  return {
    authenticated: true,
    id: me.id,
    displayName: me.displayName,
    username: me.username ?? null,
    isPremium: me.isPremium,
    isBot: me.isBot,
    readOnly: readOnlySource !== null,
    readOnlySource,
    configFile: getConfigFile(),
    storageFile: getStorageFile(),
    dataDir: getDataDir(),
  }
}
