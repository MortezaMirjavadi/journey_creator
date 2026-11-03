import type {
  JourneyStatus,
  PublishedVersionRef,
  SmsTemplateVersion,
  StaticList,
  Workspace,
} from '@/domain/types';

export type ApiErrorKind =
  | 'not_found'
  | 'forbidden'
  | 'network'
  | 'conflict'
  | 'validation'
  | 'unsupported'
  | 'unknown';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly code?: string;
  readonly details?: unknown;
  readonly currentRevision?: number;

  constructor(
    kind: ApiErrorKind,
    message: string,
    options: { status?: number; code?: string; details?: unknown; currentRevision?: number } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
    this.currentRevision = options.currentRevision;
  }
}

export interface ServerValidationIssue {
  code: string;
  message: string;
  nodeId?: string;
  field?: string;
}

export interface JourneyDetail {
  journeyId: string;
  workspaceId: string;
  name: string;
  description: string | null;
  status: JourneyStatus;
  revision: number;
  updatedAt: string | null;
  /** Raw graph envelope. Parsed by the editor, never trusted blindly. */
  definition: unknown;
  latestVersion: PublishedVersionRef | null;
  /** Server-side read-only hint (e.g. published snapshot or permission). */
  readOnly?: boolean;
}

export interface SaveDraftResult {
  revision: number;
  updatedAt: string;
}

export interface ValidateDraftResult {
  revision: number;
  valid: boolean;
  errors: ServerValidationIssue[];
  validatedAt: string;
}

export interface PublishResult {
  versionId: string;
  versionNumber: number;
  publishedAt: string;
  sourceDraftRevision: number;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface JourneyApi {
  readonly mode: 'mock' | 'http';
  listWorkspaces(options?: RequestOptions): Promise<Workspace[]>;
  getJourney(workspaceId: string, journeyId: string, options?: RequestOptions): Promise<JourneyDetail>;
  saveDraft(
    workspaceId: string,
    journeyId: string,
    definition: unknown,
    expectedRevision: number,
    options?: RequestOptions,
  ): Promise<SaveDraftResult>;
  validateDraft(
    workspaceId: string,
    journeyId: string,
    revision: number,
    options?: RequestOptions,
  ): Promise<ValidateDraftResult>;
  publishDraft(
    workspaceId: string,
    journeyId: string,
    revision: number,
    options?: RequestOptions,
  ): Promise<PublishResult>;
  listStaticLists(workspaceId: string, options?: RequestOptions): Promise<StaticList[]>;
  listSmsTemplates(workspaceId: string, options?: RequestOptions): Promise<SmsTemplateVersion[]>;
}
