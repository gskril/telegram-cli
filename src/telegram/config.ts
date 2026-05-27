import { chmod, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline/promises'

import dotenv from 'dotenv'

dotenv.config({ quiet: true })

const APP_NAME = 'telegram-cli'

const CONFIG_DIR = resolveConfigDir()
const STATE_DIR = resolveStateDir()
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')
const STORAGE_FILE = path.join(STATE_DIR, 'telegram.session')
const READONLY_MARKER_FILE = path.join(STATE_DIR, 'session.readonly')

type StoredConfig = {
  apiId: string
  apiHash: string
}

function resolveConfigDir(): string {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', APP_NAME)
  }

  if (process.platform === 'win32') {
    return path.join(
      process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'),
      APP_NAME,
    )
  }

  return path.join(
    process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'),
    APP_NAME,
  )
}

function resolveStateDir(): string {
  if (process.platform === 'darwin') return resolveConfigDir()

  if (process.platform === 'win32') {
    return path.join(
      process.env.LOCALAPPDATA ??
        process.env.APPDATA ??
        path.join(os.homedir(), 'AppData', 'Local'),
      APP_NAME,
    )
  }

  return path.join(
    process.env.XDG_STATE_HOME ?? path.join(os.homedir(), '.local', 'state'),
    APP_NAME,
  )
}

export function getDataDir(): string {
  return STATE_DIR
}

export function getConfigFile(): string {
  return CONFIG_FILE
}

export function getStorageFile(): string {
  return STORAGE_FILE
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

export type ReadOnlySource = 'env' | 'marker' | null

export function isReadOnlyEnvSet(): boolean {
  return process.env.TELEGRAM_READONLY === '1'
}

export async function getReadOnlySource(): Promise<ReadOnlySource> {
  if (isReadOnlyEnvSet()) return 'env'
  if (await fileExists(READONLY_MARKER_FILE)) return 'marker'
  return null
}

export async function isReadOnly(): Promise<boolean> {
  return (await getReadOnlySource()) !== null
}

export async function setReadOnly(readOnly: boolean): Promise<void> {
  if (isReadOnlyEnvSet()) {
    // Read-only is enforced by the environment; leave the marker file alone.
    return
  }

  if (readOnly) {
    await ensureDir(STATE_DIR)
    await writeFile(READONLY_MARKER_FILE, '', { encoding: 'utf8', mode: 0o600 })
    await chmod(READONLY_MARKER_FILE, 0o600).catch(() => undefined)
    return
  }

  await rm(READONLY_MARKER_FILE, { force: true })
}

export async function assertWritable(): Promise<void> {
  const source = await getReadOnlySource()
  if (source === null) return

  if (source === 'env') {
    throw new Error(
      'Read-only mode is enforced via the TELEGRAM_READONLY environment variable. Write commands are disabled.',
    )
  }

  throw new Error(
    'Read-only mode is enabled for this session. Write commands are disabled. Re-run "telegram auth" without --read-only to allow writes.',
  )
}

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}

async function writeSecureFile(
  filePath: string,
  contents: string,
): Promise<void> {
  await ensureDir(path.dirname(filePath))
  await writeFile(filePath, contents, { encoding: 'utf8', mode: 0o600 })
  await chmod(filePath, 0o600).catch(() => undefined)
}

export async function ensureStorageDir(): Promise<void> {
  await ensureDir(STATE_DIR)
}

async function readConfigFile(): Promise<StoredConfig | undefined> {
  try {
    const raw = await readFile(CONFIG_FILE, 'utf8')
    const parsed = JSON.parse(raw) as Partial<StoredConfig>

    if (typeof parsed.apiId !== 'string' || typeof parsed.apiHash !== 'string')
      return undefined

    return {
      apiId: parsed.apiId,
      apiHash: parsed.apiHash,
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return undefined
    if (error instanceof SyntaxError) {
      throw new Error(
        `Invalid JSON in ${CONFIG_FILE}. Run "telegram setup --force" to rewrite it.`,
      )
    }
    throw error
  }
}

export async function getCredentials() {
  const config = await readConfigFile()
  const apiId = process.env.TELEGRAM_API_ID ?? config?.apiId
  const apiHash = process.env.TELEGRAM_API_HASH ?? config?.apiHash

  if (!apiId || !apiHash) {
    throw new Error(
      'Missing Telegram API credentials. Run "telegram setup" or set TELEGRAM_API_ID and TELEGRAM_API_HASH.',
    )
  }

  const parsedApiId = Number.parseInt(apiId, 10)
  if (!Number.isFinite(parsedApiId)) {
    throw new Error('TELEGRAM_API_ID must be a valid integer.')
  }

  return { apiId: parsedApiId, apiHash }
}

function redactApiHash(apiHash: string): string {
  if (apiHash.length <= 8) return '********'
  return `${apiHash.slice(0, 4)}…${apiHash.slice(-4)}`
}

export async function promptWithInterface(
  rl: readline.Interface,
  question: string,
  options?: { hidden?: boolean },
): Promise<string> {
  const originalWrite = (
    rl as readline.Interface & {
      _writeToOutput?: (chunk: string) => void
    }
  )._writeToOutput

  try {
    if (options?.hidden) {
      ;(
        rl as readline.Interface & {
          _writeToOutput?: (chunk: string) => void
        }
      )._writeToOutput = function writeMuted(chunk: string) {
        // Preserve the prompt text, but suppress echoed answer characters.
        if (chunk.includes(question)) {
          process.stdout.write(chunk)
        }
      }
    }

    const answer = (await rl.question(question)).trim()
    if (options?.hidden) process.stdout.write('\n')
    return answer
  } finally {
    ;(
      rl as readline.Interface & {
        _writeToOutput?: (chunk: string) => void
      }
    )._writeToOutput = originalWrite
  }
}

export async function setupConfig(options?: { force?: boolean }) {
  const existing = await readConfigFile()

  if (existing && !options?.force) {
    return {
      configFile: CONFIG_FILE,
      storageFile: STORAGE_FILE,
      alreadyConfigured: true,
      apiId: existing.apiId,
      apiHashPreview: redactApiHash(existing.apiHash),
    }
  }

  console.error(
    'Create Telegram API credentials at https://my.telegram.org/apps',
  )
  console.error(
    'If you have not created an app yet, create one there and copy the API ID and API hash.\n',
  )

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  })

  let enteredApiId = ''
  let enteredApiHash = ''

  try {
    enteredApiId = await promptWithInterface(rl, 'Telegram API ID: ')
    enteredApiHash = await promptWithInterface(rl, 'Telegram API hash: ', {
      hidden: true,
    })
  } finally {
    rl.close()
  }

  if (!/^\d+$/.test(enteredApiId)) {
    throw new Error('Telegram API ID must be numeric.')
  }

  if (enteredApiHash.length < 8) {
    throw new Error('Telegram API hash looks too short.')
  }

  const config: StoredConfig = {
    apiId: enteredApiId,
    apiHash: enteredApiHash,
  }

  await writeSecureFile(CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`)

  return {
    configFile: CONFIG_FILE,
    storageFile: STORAGE_FILE,
    alreadyConfigured: false,
    apiId: config.apiId,
    apiHashPreview: redactApiHash(config.apiHash),
  }
}
