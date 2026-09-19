export {
  CI_BRIDGE_SOURCE,
  CI_PAGE_MESSAGE,
  isCiPageMessage,
  type CiPageMessage,
  type ExtensionHandoffPayload,
} from '@compareintel/core'

export interface CiAuthExternalMessage {
  type: 'CI_AUTH'
  access_token: string
  refresh_token: string
}

export interface CiLogoutExternalMessage {
  type: 'CI_LOGOUT'
}

export interface CiGetHandoffMessage {
  type: 'GET_HANDOFF'
}

export interface CiStoreHandoffMessage {
  type: 'STORE_HANDOFF'
  payload: import('@compareintel/core').ExtensionHandoffPayload
}

export interface CiBroadcastLogoutMessage {
  type: 'BROADCAST_LOGOUT'
}

export type CiExternalMessage = CiAuthExternalMessage | CiLogoutExternalMessage

export type CiBackgroundMessage =
  | CiGetHandoffMessage
  | CiStoreHandoffMessage
  | CiBroadcastLogoutMessage
