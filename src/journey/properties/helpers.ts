import type { TFunction } from 'i18next';
import type { CatalogContext } from '@/domain/nodeRegistry';
import type {
  JourneyNode,
  JourneyNodeConfig,
  ValidationIssue,
  Workspace,
} from '@/domain/types';
import type { EditorSession } from '@/editor/session';
import type { EditorState } from '@/editor/types';

export interface PropertyEditorProps {
  node: JourneyNode;
  disabled: boolean;
  issues: ValidationIssue[];
  catalog: CatalogContext;
  catalogState: EditorState['catalogs'];
  workspaces: Workspace[];
  onConfig: (config: JourneyNodeConfig) => void;
  session: EditorSession;
}

export function issueText(issue: ValidationIssue, t: TFunction): string {
  return t(issue.messageKey, {
    ...(issue.params ?? {}),
    message: issue.serverMessage,
    defaultValue: issue.serverMessage ?? issue.code,
  } as never) as unknown as string;
}

export function issueForField(issues: ValidationIssue[], field: string): ValidationIssue | undefined {
  return issues.find((issue) => issue.field === field);
}

export function workspaceName(workspaces: Workspace[], id: string): string {
  return workspaces.find((workspace) => workspace.id === id)?.name ?? id;
}

export function formatCount(value: number, language: string): string {
  return new Intl.NumberFormat(language).format(value);
}