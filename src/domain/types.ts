/**
 * Application-owned journey document model.
 *
 * Mirrors the Marco backend graph envelope (`marco_event/src/journeys/graph/types.ts`)
 * and extends node config with editor fields that the current backend schema does
 * not yet accept (display labels, SMS variable mappings, end notes). The HTTP
 * adapter refuses to silently drop those fields — see `docs/JOURNEY_BUILDER.md`.
 */
export const GRAPH_SCHEMA_VERSION = 1;

export const NODE_TYPES = [
  'entry.static_list',
  'action.sms',
  'start',
  'split',
  'sendSms',
  'waitForEvent',
  'end',
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export type NodeCategory = 'entry' | 'action' | 'terminal';

export const CONTACT_FIELDS = ['firstName', 'lastName', 'phone', 'email'] as const;
export type ContactField = (typeof CONTACT_FIELDS)[number];

/** JSON-serializable values allowed in `meta`. No functions, dates, or cycles. */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type VariableSource =
  | { kind: 'contact'; field: ContactField }
  | { kind: 'literal'; value: string };

/** entry.static_list */
export interface EntryStaticListConfig {
  label: string;
  listId: string;
}

/** action.sms */
export interface SmsConfig {
  label: string;
  templateVersionId: string;
  /**
   * Template variable name -> contact field or literal. Required for every
   * `{{ variable }}` in the selected template body.
   */
  variableMappings: Record<string, VariableSource>;
}

/** end */
export interface EndConfig {
  label: string;
  note: string;
  /** Optional outcome used by the journey-dsl-1.0 format. */
  result?: 'successful' | 'notSuccessful';
}

/** start (journey-dsl-1.0) */
export interface StartConfig {
  label: string;
  mode: 'manual' | 'event';
}

/** split (journey-dsl-1.0) — treatment/control split metadata. */
export interface SplitConfig {
  label: string;
  controlPercentage: number;
}

/** sendSms (journey-dsl-1.0) — inline SMS body, not a template reference. */
export interface SendSmsConfig {
  label: string;
  channel: 'sms';
  body: string;
  expiryHours: number;
}

export interface WaitEventRef {
  sourceName: string;
  venture: string;
}

export interface WaitDuration {
  value: number;
  unit: 'hours' | 'days';
}

/** waitForEvent (journey-dsl-1.0) */
export interface WaitForEventConfig {
  label: string;
  event: WaitEventRef;
  maxWait: WaitDuration;
}

interface NodeBase<TType extends NodeType, TConfig> {
  id: string;
  type: TType;
  typeVersion: number;
  config: TConfig;
  /**
   * Free-form, JSON-serializable metadata. Preserved by the editor and mock
   * adapter. The current backend rejects it (see `toBackendGraph`), so HTTP mode
   * fails loudly rather than dropping it.
   */
  meta?: JsonObject;
  /**
   * Optional client-owned view state from the React-Flow-native contract
   * (`data.ui`). Preserved for round-trip, never interpreted by business logic.
   */
  ui?: JsonObject;
}

export type EntryStaticListNode = NodeBase<'entry.static_list', EntryStaticListConfig>;
export type SmsNode = NodeBase<'action.sms', SmsConfig>;
export type EndNode = NodeBase<'end', EndConfig>;
export type StartNode = NodeBase<'start', StartConfig>;
export type SplitNode = NodeBase<'split', SplitConfig>;
export type SendSmsNode = NodeBase<'sendSms', SendSmsConfig>;
export type WaitForEventNode = NodeBase<'waitForEvent', WaitForEventConfig>;

export type JourneyNode =
  | EntryStaticListNode
  | SmsNode
  | EndNode
  | StartNode
  | SplitNode
  | SendSmsNode
  | WaitForEventNode;
export type JourneyNodeConfig = JourneyNode['config'];

export interface JourneyEdge {
  /** Editor-only stable id. Derived deterministically from source/port/target. */
  id: string;
  source: string;
  target: string;
  sourcePort: string;
  /** Free-form JSON metadata, preserved by the editor and mock adapter. */
  meta?: JsonObject;
}

export interface GraphPosition {
  x: number;
  y: number;
}

export const MAX_NODES = 100;
export const MAX_EDGES = 200;
export const MAX_NODE_ID_LENGTH = 64;
export const NODE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Persisted business document. Contains no React Flow internals. */
export interface JourneyDraft {
  schemaVersion: number;
  nodes: JourneyNode[];
  edges: JourneyEdge[];
  layout: Record<string, GraphPosition>;
  /** Journey-level JSON metadata, preserved by the editor and mock adapter. */
  meta?: JsonObject;
}

export type JourneyStatus = 'draft' | 'published';

export interface PublishedVersionRef {
  id: string;
  versionNumber: number;
  publishedAt: string;
}

export interface JourneyDocument {
  journeyId: string;
  workspaceId: string;
  name: string;
  description: string | null;
  status: JourneyStatus;
  draft: JourneyDraft;
  revision: number;
  updatedAt: string | null;
  latestVersion: PublishedVersionRef | null;
}

export interface Workspace {
  id: string;
  name: string;
  /** Informational only. Never inferred from the name or used for permissions. */
  role: 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER';
  canEdit: boolean;
  canPublish: boolean;
}

export interface StaticList {
  id: string;
  workspaceId: string;
  name: string;
  memberCount: number;
  updatedAt: string;
}

export interface SmsTemplateVersion {
  /** Immutable template-version id referenced by action.sms config. */
  id: string;
  templateId: string;
  workspaceId: string;
  name: string;
  versionNumber: number;
  body: string;
  /** Variables declared by the template author, without braces. */
  variables: string[];
  updatedAt: string;
}

// --- Validation ---------------------------------------------------------

export type IssueSeverity = 'error' | 'warning';
export type IssueScope = 'graph' | 'property';

export type IssueCode =
  | 'ENTRY_REQUIRED'
  | 'MULTIPLE_ENTRIES'
  | 'END_REQUIRED'
  | 'MULTIPLE_ENDS'
  | 'SMS_REQUIRED'
  | 'CYCLE_DETECTED'
  | 'SELF_CONNECTION'
  | 'DISCONNECTED_NODE'
  | 'UNREACHABLE_END'
  | 'DANGLING_EDGE'
  | 'INVALID_HANDLE'
  | 'DUPLICATE_EDGE'
  | 'BRANCHING'
  | 'MERGING'
  | 'ENTRY_HAS_INCOMING'
  | 'ENTRY_OUTPUT_REQUIRED'
  | 'END_HAS_OUTGOING'
  | 'END_INPUT_REQUIRED'
  | 'SMS_INPUT_REQUIRED'
  | 'SMS_OUTPUT_REQUIRED'
  | 'SMS_DEGREE_INVALID'
  | 'INPUT_REQUIRED'
  | 'OUTPUT_REQUIRED'
  | 'TOO_MANY_OUTPUT_CONNECTIONS'
  | 'UNSUPPORTED_NODE_TYPE'
  | 'DUPLICATE_NODE_ID'
  | 'INVALID_NODE_ID'
  | 'INVALID_CONFIG'
  | 'LIST_REQUIRED'
  | 'LIST_NOT_FOUND'
  | 'LIST_WRONG_WORKSPACE'
  | 'LIST_EMPTY'
  | 'TEMPLATE_REQUIRED'
  | 'TEMPLATE_NOT_FOUND'
  | 'TEMPLATE_WRONG_WORKSPACE'
  | 'TEMPLATE_EMPTY'
  | 'VARIABLE_MAPPING_REQUIRED'
  | 'VARIABLE_MAPPING_INVALID'
  | 'UNKNOWN_VARIABLE_MAPPING'
  | 'SCHEMA_UNSUPPORTED'
  | 'DOCUMENT_ENVELOPE_INVALID'
  | 'GRAPH_TOO_LARGE';

export interface ValidationIssue {
  code: IssueCode;
  severity: IssueSeverity;
  scope: IssueScope;
  /** i18n key. UI translates with `params`; tests assert codes. */
  messageKey: string;
  params?: Record<string, string | number>;
  nodeId?: string;
  edgeId?: string;
  /** Property field path, e.g. `config.listId`. Used to focus the form field. */
  field?: string;
  /** Present when the issue came from the server. */
  serverMessage?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}
