import type { DraftParseIssue } from '@/domain/serialization';
import type {
  JourneyDocument,
  JourneyDraft,
  PublishedVersionRef,
  SmsTemplateVersion,
  StaticList,
  ValidationResult,
  Workspace,
} from '@/domain/types';

export type PageState =
  | 'loading'
  | 'ready'
  | 'not_found'
  | 'forbidden'
  | 'network_error'
  | 'unsupported'
  | 'error';

export type SaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict';

export type PublishState =
  | 'idle'
  | 'validating'
  | 'validation_failed'
  | 'publishing'
  | 'published'
  | 'error';

export type ReadOnlyReason = 'permission' | 'published' | 'sandbox' | null;

export interface CatalogState<T> {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: T;
  error?: string;
}

export interface SelectionState {
  nodeIds: string[];
  edgeIds: string[];
}

export interface FocusRequest {
  nodeId: string;
  field?: string;
  nonce: number;
}

export interface EditorNotice {
  key: string;
  params?: Record<string, string | number>;
  tone: 'info' | 'warning' | 'error';
}

export interface EditorState {
  page: PageState;
  pageError?: string;
  unsupported?: { issues: DraftParseIssue[]; raw: unknown };
  workspaces: Workspace[];
  workspace: Workspace | null;
  document: JourneyDocument | null;
  draft: JourneyDraft;
  name: string;
  readOnly: boolean;
  readOnlyReason: ReadOnlyReason;
  dirty: boolean;
  saveState: SaveState;
  saveError?: string;
  conflict?: { currentRevision: number };
  lastSavedAt?: string;
  publishState: PublishState;
  publishError?: string;
  publishedVersion?: PublishedVersionRef;
  validation: ValidationResult;
  lastValidatedAt?: string;
  catalogs: {
    lists: CatalogState<StaticList[]>;
    templates: CatalogState<SmsTemplateVersion[]>;
  };
  selection: SelectionState;
  history: { canUndo: boolean; canRedo: boolean };
  focusRequest?: FocusRequest;
  notice: EditorNotice | null;
  sandbox: boolean;
  scenarioId?: string;
}

export const EMPTY_VALIDATION: ValidationResult = {
  valid: true,
  issues: [],
  errors: [],
  warnings: [],
};
