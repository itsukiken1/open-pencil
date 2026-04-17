// Prototyping connection — source element triggers a navigation/interaction to a target.
//
// Data model aligned with the Figma prototyping primitives already declared in
// kiwi/schema.ts (ConnectionType / InteractionType / NavigationType) plus a
// `metadata` field for downstream AI-codegen pipelines (e.g. Rostar→Kola 换皮
// carries `rostar_ref` here to link a button to the business logic it should
// re-use from the Rostar backend).

export type ConnectionKind =
  | 'NONE'
  | 'INTERNAL_NODE'
  | 'URL'
  | 'BACK'
  | 'CLOSE'
  | 'SET_VARIABLE'

export type InteractionTrigger =
  | 'ON_CLICK'
  | 'AFTER_TIMEOUT'
  | 'MOUSE_IN'
  | 'MOUSE_OUT'
  | 'ON_HOVER'
  | 'MOUSE_DOWN'
  | 'MOUSE_UP'
  | 'ON_PRESS'

export type NavigationKind =
  | 'NAVIGATE'
  | 'OVERLAY'
  | 'SWAP'
  | 'SWAP_STATE'
  | 'SCROLL_TO'

export interface ConnectionMetadata {
  /** Reference into a source-of-truth backend codebase the AI should port logic from. */
  rostarRef?: string
  /** Human-readable note for designers/PMs. */
  note?: string
  /** Trigger semantic: "onTap", "onSubmit", "onApiSuccess(createPost)" etc. */
  triggerSemantic?: string
  [key: string]: unknown
}

export interface Connection {
  id: string
  /** Node ID of the element that initiates the transition (button, frame, …). */
  sourceNodeId: string
  /** Node ID of the target frame/node (for INTERNAL_NODE) or empty for URL/BACK/CLOSE. */
  targetNodeId: string
  kind: ConnectionKind
  interaction: InteractionTrigger
  navigation?: NavigationKind
  /** External URL when kind === 'URL'. */
  url?: string
  /** Free-form metadata carried for downstream AI / codegen tools. */
  metadata?: ConnectionMetadata
}

export function createConnection(input: {
  id: string
  sourceNodeId: string
  targetNodeId?: string
  kind?: ConnectionKind
  interaction?: InteractionTrigger
  navigation?: NavigationKind
  url?: string
  metadata?: ConnectionMetadata
}): Connection {
  return {
    id: input.id,
    sourceNodeId: input.sourceNodeId,
    targetNodeId: input.targetNodeId ?? '',
    kind: input.kind ?? 'INTERNAL_NODE',
    interaction: input.interaction ?? 'ON_CLICK',
    navigation: input.navigation ?? 'NAVIGATE',
    url: input.url,
    metadata: input.metadata,
  }
}
