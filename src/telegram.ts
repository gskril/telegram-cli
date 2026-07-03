export {
  getConfigFile,
  getDataDir,
  getStorageFile,
  isReadOnly,
  setupConfig,
} from './telegram/config.js'
export { authClient, getClient, shutdownClient } from './telegram/client.js'
export { auth, logout, whoAmI } from './telegram/auth.js'
export type { ResolvedPeer, ResolvedTarget } from './telegram/resolve.js'
export { resolvePeer, resolveTarget } from './telegram/resolve.js'
export { listContacts } from './telegram/contacts.js'
export {
  getMemberCount,
  listChats,
  markRead,
  readChat,
  unreadChats,
} from './telegram/chats.js'
export type { AttachmentOptions, AttachmentType } from './telegram/writes.js'
export {
  addChatMembers,
  createChatGroup,
  leaveChatGroup,
  removeChatMembers,
  sendMessage,
  setDraft,
} from './telegram/writes.js'
