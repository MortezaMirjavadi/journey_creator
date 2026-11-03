import { ApiError, type JourneyApi, type ServerValidationIssue } from '@/api/types';
import { checkConnection, makeEdge, validateGraph } from '@/domain/graph';
import { createNode, NODE_REGISTRY } from '@/domain/nodeRegistry';
import type { CatalogContext } from '@/domain/nodeRegistry';
import { cloneDraft, draftFingerprint, emptyDraft, normalizeMeta, parseDraft } from '@/domain/serialization';
import type {
  GraphPosition,
  IssueCode,
  JourneyDraft,
  JourneyNode,
  JsonObject,
  NodeType,
  ValidationIssue,
  ValidationResult,
} from '@/domain/types';
import { computeAutoLayout } from './layout';
import {
  createHistory,
  pushHistory,
  redoHistory,
  undoHistory,
  type HistoryState,
} from './history';
import {
  EMPTY_VALIDATION,
  type EditorNotice,
  type EditorState,
  type PageState,
} from './types';

export interface EditorSessionOptions {
  api: JourneyApi;
  workspaceId: string;
  journeyId: string;
  sandbox?: boolean;
  scenarioId?: string;
  autosaveDelayMs?: number;
}

const ID_PREFIX: Record<NodeType, string> = {
  'entry.static_list': 'entry',
  'action.sms': 'sms',
  start: 'start',
  split: 'split',
  sendSms: 'sendSms',
  waitForEvent: 'wait',
  end: 'end',
};

export function buildCatalogContext(state: EditorState): CatalogContext {
  const workspaceId = state.workspace?.id ?? state.document?.workspaceId ?? '';
  const lists = state.catalogs.lists.data;
  const templates = state.catalogs.templates.data;
  return {
    workspaceId,
    lists,
    templates,
    catalogsReady:
      state.catalogs.lists.status === 'ready' && state.catalogs.templates.status === 'ready',
    foreignListIds: new Set(
      lists.filter((list) => list.workspaceId !== workspaceId).map((list) => list.id),
    ),
    foreignTemplateIds: new Set(
      templates.filter((template) => template.workspaceId !== workspaceId).map((t) => t.id),
    ),
  };
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function pageFromError(error: unknown): { page: PageState; pageError: string } {
  if (error instanceof ApiError) {
    if (error.kind === 'not_found') return { page: 'not_found', pageError: error.message };
    if (error.kind === 'forbidden') return { page: 'forbidden', pageError: error.message };
    if (error.kind === 'network') return { page: 'network_error', pageError: error.message };
    return { page: 'error', pageError: error.message };
  }
  return { page: 'error', pageError: errorMessage(error, 'The journey could not be loaded.') };
}

function mapServerIssues(issues: ServerValidationIssue[]): ValidationIssue[] {
  return issues.map((issue) => ({
    code: issue.code as IssueCode,
    severity: 'error',
    scope: issue.nodeId || issue.field ? 'property' : 'graph',
    messageKey: 'validation.serverIssue',
    params: { code: issue.code },
    nodeId: issue.nodeId,
    field: issue.field,
    serverMessage: issue.message,
  }));
}

/** Removes an empty meta object so clearing metadata produces a clean document. */
function withMeta<T extends { meta?: JsonObject }>(value: T, meta: JsonObject | undefined): T {
  const normalized = normalizeMeta(meta);
  const next = { ...value };
  if (normalized) next.meta = normalized;
  else delete next.meta;
  return next;
}

/**
 * Framework-agnostic editor session. React binds to it with
 * `useSyncExternalStore`; tests drive it directly.
 */
export class EditorSession {
  private state: EditorState;
  private readonly listeners = new Set<() => void>();
  private readonly api: JourneyApi;
  private readonly workspaceId: string;
  private readonly journeyId: string;
  private readonly autosaveDelayMs: number;
  private history: HistoryState<JourneyDraft> = createHistory();
  private savedFingerprint = '';
  private revision = 1;
  private epoch = 0;
  private saveRequestId = 0;
  private validationRequestId = 0;
  private focusNonce = 0;
  private metaSeq = 0;
  private abortController: AbortController | null = null;
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(options: EditorSessionOptions) {
    this.api = options.api;
    this.workspaceId = options.workspaceId;
    this.journeyId = options.journeyId;
    this.autosaveDelayMs = options.autosaveDelayMs ?? 1200;
    this.state = {
      page: 'loading',
      workspaces: [],
      workspace: null,
      document: null,
      draft: emptyDraft(),
      name: '',
      readOnly: true,
      readOnlyReason: null,
      dirty: false,
      saveState: 'clean',
      publishState: 'idle',
      validation: EMPTY_VALIDATION,
      catalogs: {
        lists: { status: 'idle', data: [] },
        templates: { status: 'idle', data: [] },
      },
      selection: { nodeIds: [], edgeIds: [] },
      history: { canUndo: false, canRedo: false },
      notice: null,
      sandbox: Boolean(options.sandbox),
      scenarioId: options.scenarioId,
    };
  }

  getState = (): EditorState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private setState(patch: Partial<EditorState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  private setNotice(notice: EditorNotice | null): void {
    if (this.noticeTimer) {
      clearTimeout(this.noticeTimer);
      this.noticeTimer = null;
    }
    this.setState({ notice });
    if (notice) {
      this.noticeTimer = setTimeout(() => {
        this.noticeTimer = null;
        if (!this.disposed) this.setState({ notice: null });
      }, 6000);
    }
  }

  private computeValidation(draft: JourneyDraft): ValidationResult {
    return validateGraph(draft, buildCatalogContext(this.state));
  }

  private isEditable(): boolean {
    return this.state.page === 'ready' && !this.state.readOnly;
  }

  private canMutate(): boolean {
    return (
      this.isEditable() &&
      this.state.publishState !== 'validating' &&
      this.state.publishState !== 'publishing'
    );
  }

  private syncHistoryFlags(): void {
    this.setState({
      history: { canUndo: this.history.past.length > 0, canRedo: this.history.future.length > 0 },
    });
  }

  private pushHistory(snapshot: JourneyDraft, key?: string): void {
    this.history = pushHistory(this.history, cloneDraft(snapshot), key);
    this.syncHistoryFlags();
  }

  private applyDraft(next: JourneyDraft): void {
    const fingerprint = draftFingerprint(next, this.state.name);
    const dirty = fingerprint !== this.savedFingerprint;
    let saveState = this.state.saveState;
    if (dirty) {
      if (saveState === 'saving') saveState = 'saving';
      else if (saveState === 'conflict') saveState = 'conflict';
      else saveState = 'dirty';
    } else {
      saveState = 'clean';
    }
    const publishState =
      this.state.publishState === 'validation_failed' || this.state.publishState === 'error'
        ? 'idle'
        : this.state.publishState;
    this.setState({
      draft: next,
      dirty,
      saveState,
      publishState,
      validation: this.computeValidation(next),
    });
    if (dirty) this.scheduleAutosave();
  }

  private mutate(
    updater: (draft: JourneyDraft) => JourneyDraft | null,
    historyKey?: string,
  ): boolean {
    if (!this.canMutate()) return false;
    const before = this.state.draft;
    const next = updater(before);
    if (!next) return false;
    this.pushHistory(before, historyKey);
    this.applyDraft(next);
    return true;
  }

  private scheduleAutosave(): void {
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    if (!this.isEditable() || !this.state.dirty) return;
    if (this.state.saveState === 'conflict' || this.state.saveState === 'error') return;
    if (this.state.publishState === 'validating' || this.state.publishState === 'publishing') return;
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      void this.save(false);
    }, this.autosaveDelayMs);
  }

  async load(): Promise<void> {
    const epoch = ++this.epoch;
    this.abortController?.abort();
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    this.setState({ page: 'loading', pageError: undefined, unsupported: undefined });
    try {
      const [workspaces, detail] = await Promise.all([
        this.api.listWorkspaces({ signal }),
        this.api.getJourney(this.workspaceId, this.journeyId, { signal }),
      ]);
      if (this.disposed || epoch !== this.epoch) return;
      const workspace = workspaces.find((item) => item.id === this.workspaceId) ?? null;
      const parsed = parseDraft(detail.definition);
      if (!parsed.ok) {
        this.setState({
          page: 'unsupported',
          workspaces,
          workspace,
          unsupported: { issues: parsed.issues, raw: parsed.raw },
          readOnly: true,
          readOnlyReason: 'published',
        });
        return;
      }
      let readOnlyReason: EditorState['readOnlyReason'] = null;
      if (!workspace?.canEdit) readOnlyReason = 'permission';
      else if (detail.status === 'published') readOnlyReason = 'published';
      else if (detail.readOnly) readOnlyReason = this.state.sandbox ? 'sandbox' : 'published';

      this.revision = detail.revision;
      this.savedFingerprint = draftFingerprint(parsed.draft, detail.name);
      this.history = createHistory();
      this.setState({
        page: 'ready',
        workspaces,
        workspace,
        document: {
          journeyId: detail.journeyId,
          workspaceId: detail.workspaceId || this.workspaceId,
          name: detail.name,
          description: detail.description,
          status: detail.status,
          draft: parsed.draft,
          revision: detail.revision,
          updatedAt: detail.updatedAt,
          latestVersion: detail.latestVersion,
        },
        draft: parsed.draft,
        name: detail.name,
        readOnly: readOnlyReason !== null,
        readOnlyReason,
        dirty: false,
        saveState: 'clean',
        saveError: undefined,
        conflict: undefined,
        publishState: 'idle',
        publishError: undefined,
        publishedVersion: detail.latestVersion ?? undefined,
        validation: this.computeValidation(parsed.draft),
        selection: { nodeIds: [], edgeIds: [] },
        history: { canUndo: false, canRedo: false },
        focusRequest: undefined,
        notice: null,
      });
      void this.loadCatalogs(epoch);
    } catch (error) {
      if (this.disposed || epoch !== this.epoch || isAbort(error)) return;
      const { page, pageError } = pageFromError(error);
      this.setState({ page, pageError, readOnly: true });
    }
  }

  async loadCatalogs(epoch = this.epoch): Promise<void> {
    this.setState({
      catalogs: {
        lists: { status: 'loading', data: this.state.catalogs.lists.data },
        templates: { status: 'loading', data: this.state.catalogs.templates.data },
      },
    });
    const signal = this.abortController?.signal;
    const [lists, templates] = await Promise.allSettled([
      this.api.listStaticLists(this.workspaceId, { signal }),
      this.api.listSmsTemplates(this.workspaceId, { signal }),
    ]);
    if (this.disposed || epoch !== this.epoch) return;
    const nextCatalogs: EditorState['catalogs'] = {
      lists:
        lists.status === 'fulfilled'
          ? { status: 'ready', data: lists.value }
          : { status: 'error', data: [], error: errorMessage(lists.reason, 'Static lists failed to load.') },
      templates:
        templates.status === 'fulfilled'
          ? { status: 'ready', data: templates.value }
          : {
              status: 'error',
              data: [],
              error: errorMessage(templates.reason, 'SMS templates failed to load.'),
            },
    };
    this.setState({
      catalogs: nextCatalogs,
      validation: validateGraph(this.state.draft, {
        ...buildCatalogContext({ ...this.state, catalogs: nextCatalogs }),
      }),
    });
  }

  async reload(): Promise<void> {
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    await this.load();
  }

  setSelection(nodeIds: string[], edgeIds: string[] = []): void {
    const current = this.state.selection;
    if (
      current.nodeIds.length === nodeIds.length &&
      current.edgeIds.length === edgeIds.length &&
      current.nodeIds.every((id, index) => id === nodeIds[index]) &&
      current.edgeIds.every((id, index) => id === edgeIds[index])
    ) {
      return;
    }
    this.setState({ selection: { nodeIds, edgeIds } });
  }

  selectNode(nodeId: string | null): void {
    this.setSelection(nodeId ? [nodeId] : [], []);
  }

  clearSelection(): void {
    this.setSelection([], []);
  }

  focusIssue(issue: ValidationIssue): void {
    this.focusNonce += 1;
    if (issue.nodeId) {
      this.setState({
        selection: { nodeIds: [issue.nodeId], edgeIds: [] },
        focusRequest: { nodeId: issue.nodeId, field: issue.field, nonce: this.focusNonce },
      });
    } else if (issue.edgeId) {
      this.setState({ selection: { nodeIds: [], edgeIds: [issue.edgeId] } });
    }
  }

  private nextNodeId(type: NodeType): string {
    const prefix = ID_PREFIX[type];
    const pattern = new RegExp(`^${prefix}_(\\d+)$`);
    let max = 0;
    for (const node of this.state.draft.nodes) {
      const match = node.id.match(pattern);
      if (match) max = Math.max(max, Number(match[1]));
    }
    return `${prefix}_${max + 1}`;
  }

  addNode(type: NodeType, position: GraphPosition): string | null {
    if (!this.canMutate()) return null;
    const definition = NODE_REGISTRY[type];
    if (definition.constraints.singleton) {
      const existing = this.state.draft.nodes.find((node) => node.type === type);
      if (existing) {
        this.setNotice({ key: 'notices.singleton', tone: 'warning', params: { type } });
        this.selectNode(existing.id);
        return null;
      }
    }
    const id = this.nextNodeId(type);
    const node = createNode(type, id);
    const applied = this.mutate((draft) => ({
      ...draft,
      nodes: [...draft.nodes, node],
      layout: { ...draft.layout, [id]: position },
    }));
    if (!applied) return null;
    this.selectNode(id);
    return id;
  }

  removeNodes(ids: string[]): void {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const applied = this.mutate((draft) => {
      const nodes = draft.nodes.filter((node) => !idSet.has(node.id));
      if (nodes.length === draft.nodes.length) return null;
      const edges = draft.edges.filter(
        (edge) => !idSet.has(edge.source) && !idSet.has(edge.target),
      );
      const layout = { ...draft.layout };
      for (const id of idSet) delete layout[id];
      return { ...draft, nodes, edges, layout };
    });
    if (applied) {
      const selection = this.state.selection;
      this.setSelection(
        selection.nodeIds.filter((id) => !idSet.has(id)),
        selection.edgeIds.filter((id) => this.state.draft.edges.some((edge) => edge.id === id)),
      );
    }
  }

  removeEdges(ids: string[]): void {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const applied = this.mutate((draft) => {
      const edges = draft.edges.filter((edge) => !idSet.has(edge.id));
      if (edges.length === draft.edges.length) return null;
      return { ...draft, edges };
    });
    if (applied) {
      this.setSelection(
        this.state.selection.nodeIds,
        this.state.selection.edgeIds.filter((id) => !idSet.has(id)),
      );
    }
  }

  connect(source: string, target: string, sourcePort: string): boolean {
    if (!this.canMutate()) return false;
    const check = checkConnection(this.state.draft, source, target, sourcePort);
    if (!check.allowed) {
      this.setNotice({ key: check.messageKey ?? 'validation.invalidHandle', tone: 'warning' });
      return false;
    }
    const edge = makeEdge(source, sourcePort, target);
    const applied = this.mutate((draft) => ({ ...draft, edges: [...draft.edges, edge] }));
    if (applied) this.setSelection([], [edge.id]);
    return applied;
  }

  updateNodeConfig(id: string, config: JourneyNode['config']): boolean {
    return this.mutate(
      (draft) => {
        const index = draft.nodes.findIndex((node) => node.id === id);
        if (index < 0) return null;
        const nodes = [...draft.nodes];
        nodes[index] = { ...nodes[index], config } as JourneyNode;
        return { ...draft, nodes };
      },
      `config:${id}`,
    );
  }

  updateNodeMeta(id: string, meta: JsonObject | undefined): boolean {
    return this.mutate(
      (draft) => {
        const index = draft.nodes.findIndex((node) => node.id === id);
        if (index < 0) return null;
        const nodes = [...draft.nodes];
        nodes[index] = withMeta(nodes[index], meta);
        return { ...draft, nodes };
      },
      `meta:node:${id}:${++this.metaSeq}`,
    );
  }

  updateEdgeMeta(id: string, meta: JsonObject | undefined): boolean {
    return this.mutate(
      (draft) => {
        const index = draft.edges.findIndex((edge) => edge.id === id);
        if (index < 0) return null;
        const edges = [...draft.edges];
        edges[index] = withMeta(draft.edges[index], meta);
        return { ...draft, edges };
      },
      `meta:edge:${id}:${++this.metaSeq}`,
    );
  }

  updateDraftMeta(meta: JsonObject | undefined): boolean {
    return this.mutate((draft) => withMeta(draft, meta), `meta:draft:${++this.metaSeq}`);
  }

  moveNodes(positions: Record<string, GraphPosition>): boolean {
    return this.mutate(
      (draft) => {
        let changed = false;
        const layout = { ...draft.layout };
        for (const [id, position] of Object.entries(positions)) {
          if (!draft.nodes.some((node) => node.id === id)) continue;
          const current = layout[id];
          if (!current || current.x !== position.x || current.y !== position.y) {
            layout[id] = { x: position.x, y: position.y };
            changed = true;
          }
        }
        return changed ? { ...draft, layout } : null;
      },
      `move:${Object.keys(positions).sort().join(',')}`,
    );
  }

  duplicateNode(id: string): string | null {
    if (!this.canMutate()) return null;
    const source = this.state.draft.nodes.find((node) => node.id === id);
    if (!source) return null;
    if (!NODE_REGISTRY[source.type].constraints.duplicateable) {
      this.setNotice({ key: 'notices.duplicateUnsupported', tone: 'warning' });
      return null;
    }
    const newId = this.nextNodeId(source.type);
    const position = this.state.draft.layout[id] ?? { x: 0, y: 0 };
    const copy = {
      ...structuredClone(source),
      id: newId,
    } as JourneyNode;
    const applied = this.mutate((draft) => ({
      ...draft,
      nodes: [...draft.nodes, copy],
      layout: { ...draft.layout, [newId]: { x: position.x + 48, y: position.y + 48 } },
    }));
    if (!applied) return null;
    this.selectNode(newId);
    return newId;
  }

  autoLayout(): void {
    const positions = computeAutoLayout(this.state.draft);
    if (Object.keys(positions).length === 0) return;
    this.mutate((draft) => ({ ...draft, layout: { ...draft.layout, ...positions } }));
  }

  undo(): void {
    if (!this.canMutate()) return;
    const result = undoHistory(this.history, this.state.draft);
    if (!result.snapshot) return;
    this.history = result.history;
    this.syncHistoryFlags();
    this.applyDraft(result.snapshot);
  }

  redo(): void {
    if (!this.canMutate()) return;
    const result = redoHistory(this.history, this.state.draft);
    if (!result.snapshot) return;
    this.history = result.history;
    this.syncHistoryFlags();
    this.applyDraft(result.snapshot);
  }

  async save(manual = true): Promise<void> {
    if (!this.isEditable() || this.state.page !== 'ready') return;
    if (this.state.saveState === 'saving') return;
    if (!this.state.dirty) {
      if (manual) this.setNotice({ key: 'notices.noChanges', tone: 'info' });
      return;
    }
    const requestId = ++this.saveRequestId;
    const epoch = this.epoch;
    const fingerprint = draftFingerprint(this.state.draft, this.state.name);
    const revision = this.revision;
    const draft = cloneDraft(this.state.draft);
    this.setState({ saveState: 'saving', saveError: undefined });
    try {
      const result = await this.api.saveDraft(this.workspaceId, this.journeyId, draft, revision, {
        signal: this.abortController?.signal,
      });
      if (this.disposed || epoch !== this.epoch || requestId !== this.saveRequestId) return;
      this.revision = result.revision;
      const stillDirty = draftFingerprint(this.state.draft, this.state.name) !== fingerprint;
      if (!stillDirty) this.savedFingerprint = fingerprint;
      this.setState({
        saveState: stillDirty ? 'dirty' : 'saved',
        dirty: stillDirty,
        saveError: undefined,
        conflict: undefined,
        lastSavedAt: result.updatedAt,
        document: this.state.document
          ? { ...this.state.document, revision: result.revision, updatedAt: result.updatedAt }
          : this.state.document,
      });
      if (stillDirty) this.scheduleAutosave();
    } catch (error) {
      if (this.disposed || epoch !== this.epoch || isAbort(error)) return;
      if (error instanceof ApiError && error.kind === 'conflict') {
        this.setState({
          saveState: 'conflict',
          saveError: error.message,
          conflict: { currentRevision: error.currentRevision ?? this.revision },
        });
      } else {
        this.setState({
          saveState: 'error',
          saveError: errorMessage(error, 'The draft could not be saved.'),
        });
      }
    }
  }

  retrySave(): void {
    void this.save(true);
  }

  async validate(): Promise<ValidationResult> {
    const local = this.computeValidation(this.state.draft);
    this.setState({ validation: local });
    if (this.state.page !== 'ready') return local;
    if (this.state.dirty) {
      this.setNotice({ key: 'notices.saveBeforeValidate', tone: 'info' });
      return local;
    }
    const requestId = ++this.validationRequestId;
    const epoch = this.epoch;
    try {
      const result = await this.api.validateDraft(this.workspaceId, this.journeyId, this.revision, {
        signal: this.abortController?.signal,
      });
      if (this.disposed || epoch !== this.epoch || requestId !== this.validationRequestId) return local;
      const errors = mapServerIssues(result.errors);
      const merged: ValidationResult = {
        valid: result.valid,
        errors,
        warnings: local.warnings,
        issues: [...errors, ...local.warnings],
      };
      this.setState({ validation: merged, lastValidatedAt: result.validatedAt });
      return merged;
    } catch (error) {
      if (this.disposed || epoch !== this.epoch || isAbort(error)) return local;
      this.setNotice({ key: 'notices.serverValidationFailed', tone: 'warning' });
      return local;
    }
  }

  async publish(): Promise<void> {
    if (!this.isEditable()) return;
    if (!this.state.workspace?.canPublish) {
      this.setNotice({ key: 'notices.publishForbidden', tone: 'error' });
      return;
    }
    if (this.state.publishState === 'validating' || this.state.publishState === 'publishing') return;
    const epoch = this.epoch;
    this.setState({ publishState: 'validating', publishError: undefined });

    if (this.state.dirty) {
      await this.save(true);
      if (this.disposed || epoch !== this.epoch) return;
      if (this.state.saveState === 'error' || this.state.saveState === 'conflict') {
        this.setState({
          publishState: 'error',
          publishError: this.state.saveError ?? 'The draft could not be saved before publishing.',
        });
        return;
      }
      if (this.state.dirty) {
        this.setState({
          publishState: 'error',
          publishError: 'The draft still has unsaved changes.',
        });
        return;
      }
    }

    const local = this.computeValidation(this.state.draft);
    this.setState({ validation: local });
    if (!local.valid) {
      this.setState({ publishState: 'validation_failed' });
      if (local.errors[0]) this.focusIssue(local.errors[0]);
      return;
    }

    try {
      const server = await this.api.validateDraft(this.workspaceId, this.journeyId, this.revision, {
        signal: this.abortController?.signal,
      });
      if (this.disposed || epoch !== this.epoch) return;
      if (!server.valid) {
        const errors = mapServerIssues(server.errors);
        this.setState({
          publishState: 'validation_failed',
          validation: { valid: false, errors, warnings: local.warnings, issues: [...errors, ...local.warnings] },
          lastValidatedAt: server.validatedAt,
        });
        return;
      }
      this.setState({ publishState: 'publishing' });
      const result = await this.api.publishDraft(this.workspaceId, this.journeyId, this.revision, {
        signal: this.abortController?.signal,
      });
      if (this.disposed || epoch !== this.epoch) return;
      const publishedVersion = {
        id: result.versionId,
        versionNumber: result.versionNumber,
        publishedAt: result.publishedAt,
      };
      this.history = createHistory();
      this.setState({
        publishState: 'published',
        publishedVersion,
        readOnly: true,
        readOnlyReason: 'published',
        dirty: false,
        saveState: 'clean',
        history: { canUndo: false, canRedo: false },
        document: this.state.document
          ? { ...this.state.document, status: 'published', latestVersion: publishedVersion }
          : this.state.document,
      });
    } catch (error) {
      if (this.disposed || epoch !== this.epoch || isAbort(error)) return;
      if (error instanceof ApiError && error.kind === 'validation') {
        const details = Array.isArray(error.details) ? (error.details as ServerValidationIssue[]) : [];
        const errors = mapServerIssues(details);
        this.setState({
          publishState: 'validation_failed',
          validation: { valid: false, errors, warnings: local.warnings, issues: [...errors, ...local.warnings] },
        });
        return;
      }
      if (error instanceof ApiError && error.kind === 'conflict') {
        this.setState({
          publishState: 'error',
          publishError: error.message,
          conflict: { currentRevision: error.currentRevision ?? this.revision },
        });
        return;
      }
      this.setState({
        publishState: 'error',
        publishError: errorMessage(error, 'The journey could not be published.'),
      });
    }
  }

  clearNotice(): void {
    this.setNotice(null);
  }

  dismissPublishError(): void {
    this.setState({
      publishState: this.state.publishState === 'error' ? 'idle' : this.state.publishState,
      publishError: undefined,
    });
  }

  dispose(): void {
    this.disposed = true;
    this.epoch += 1;
    this.abortController?.abort();
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.autosaveTimer = null;
    this.noticeTimer = null;
    this.listeners.clear();
  }
}
