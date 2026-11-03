import { validateGraph } from '@/domain/graph';
import { parseDraft } from '@/domain/serialization';
import type { CatalogContext } from '@/domain/nodeRegistry';
import type { JourneyDraft, ValidationIssue } from '@/domain/types';
import { unsupportedDefinition } from '@/demo/fixtures';
import {
  MOCK_JOURNEY_SEEDS,
  MOCK_LISTS,
  MOCK_TEMPLATES,
  MOCK_WORKSPACES,
  type MockJourneySeed,
} from './mockData';
import { getMockBehavior, setMockBehavior } from './mockBehavior';
import {
  ApiError,
  type JourneyApi,
  type JourneyDetail,
  type PublishResult,
  type RequestOptions,
  type SaveDraftResult,
  type ServerValidationIssue,
  type ValidateDraftResult,
} from './types';

const STORE_KEY = 'marco.mock.journeys.v1';

type StoredJourney = MockJourneySeed;

export function resetMockStore(): void {
  localStorage.removeItem(STORE_KEY);
}

function seedFromFixtures(): Record<string, StoredJourney> {
  return structuredClone(MOCK_JOURNEY_SEEDS) as Record<string, StoredJourney>;
}

function readStore(): Record<string, StoredJourney> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) {
      const seeded = seedFromFixtures();
      localStorage.setItem(STORE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    return JSON.parse(raw) as Record<string, StoredJourney>;
  } catch {
    const seeded = seedFromFixtures();
    localStorage.setItem(STORE_KEY, JSON.stringify(seeded));
    return seeded;
  }
}

function writeStore(store: Record<string, StoredJourney>): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

function catalogContext(workspaceId: string): CatalogContext {
  return {
    workspaceId,
    lists: MOCK_LISTS,
    templates: MOCK_TEMPLATES,
    foreignListIds: new Set(
      MOCK_LISTS.filter((list) => list.workspaceId !== workspaceId).map((list) => list.id),
    ),
    foreignTemplateIds: new Set(
      MOCK_TEMPLATES.filter((template) => template.workspaceId !== workspaceId).map(
        (template) => template.id,
      ),
    ),
  };
}

export function localIssuesToServer(issues: ValidationIssue[]): ServerValidationIssue[] {
  return issues.map((issue) => ({
    code: issue.code,
    message: issue.messageKey,
    nodeId: issue.nodeId,
    field: issue.field,
  }));
}

function findWorkspace(workspaceId: string) {
  return MOCK_WORKSPACES.find((workspace) => workspace.id === workspaceId);
}

function requireWorkspace(workspaceId: string) {
  const workspace = findWorkspace(workspaceId);
  if (!workspace) throw new ApiError('not_found', 'Workspace not found.', { status: 404 });
  return workspace;
}

function requireJourney(workspaceId: string, journeyId: string): [StoredJourney, string] {
  const store = readStore();
  const journey = store[journeyId];
  if (!journey || journey.workspaceId !== workspaceId) {
    throw new ApiError('not_found', 'Journey not found.', { status: 404, code: 'JOURNEY_NOT_FOUND' });
  }
  return [journey, journeyId];
}

function parseOrThrow(definition: unknown): JourneyDraft {
  const parsed = parseDraft(definition);
  if (!parsed.ok) {
    throw new ApiError('validation', 'The journey definition is not compatible with this editor.', {
      status: 422,
      code: 'UNSUPPORTED_DOCUMENT',
      details: parsed.issues,
    });
  }
  return parsed.draft;
}

/**
 * Deterministic in-browser adapter. Persists to localStorage and enforces the
 * same optimistic-concurrency rule as the real backend (revision must match).
 */
export class MockJourneyApi implements JourneyApi {
  readonly mode = 'mock' as const;

  async listWorkspaces(options: RequestOptions = {}) {
    const behavior = getMockBehavior();
    await delay(Math.min(behavior.latencyMs, 250), options.signal);
    return structuredClone(MOCK_WORKSPACES);
  }

  async getJourney(workspaceId: string, journeyId: string, options: RequestOptions = {}) {
    const behavior = getMockBehavior();
    await delay(behavior.latencyMs, options.signal);
    if (behavior.pageFailure === 'not_found') {
      throw new ApiError('not_found', 'Journey not found.', { status: 404, code: 'JOURNEY_NOT_FOUND' });
    }
    if (behavior.pageFailure === 'forbidden') {
      throw new ApiError('forbidden', 'You do not have access to this journey.', {
        status: 403,
        code: 'FORBIDDEN',
      });
    }
    if (behavior.pageFailure === 'network') {
      throw new ApiError('network', 'The server could not be reached.', { code: 'NETWORK_ERROR' });
    }
    const workspace = requireWorkspace(workspaceId);
    const [journey] = requireJourney(workspaceId, journeyId);
    const detail: JourneyDetail = {
      journeyId,
      workspaceId,
      name: journey.name,
      description: journey.description,
      status: journey.status,
      revision: journey.revision,
      updatedAt: journey.updatedAt,
      definition: behavior.unsupportedDocument ? unsupportedDefinition() : journey.definition,
      latestVersion: journey.latestVersion,
      readOnly: !workspace.canEdit || journey.status === 'published',
    };
    return structuredClone(detail);
  }

  async saveDraft(
    workspaceId: string,
    journeyId: string,
    definition: unknown,
    expectedRevision: number,
    options: RequestOptions = {},
  ): Promise<SaveDraftResult> {
    const behavior = getMockBehavior();
    await delay(behavior.latencyMs, options.signal);
    const workspace = requireWorkspace(workspaceId);
    if (!workspace.canEdit) {
      throw new ApiError('forbidden', 'You do not have edit permission in this workspace.', {
        status: 403,
        code: 'FORBIDDEN',
      });
    }
    if (behavior.failNextSave) {
      setMockBehavior({ failNextSave: false });
      throw new ApiError('network', 'Saving failed. The server could not be reached.', {
        code: 'NETWORK_ERROR',
      });
    }
    if (behavior.conflictNextSave) {
      setMockBehavior({ conflictNextSave: false });
      const [journey] = requireJourney(workspaceId, journeyId);
      throw new ApiError('conflict', 'The draft was modified by another editor.', {
        status: 412,
        code: 'STALE_REVISION',
        currentRevision: journey.revision,
      });
    }
    parseOrThrow(definition);
    const [journey] = requireJourney(workspaceId, journeyId);
    if (journey.revision !== expectedRevision) {
      throw new ApiError('conflict', 'The draft was modified by another editor.', {
        status: 412,
        code: 'STALE_REVISION',
        currentRevision: journey.revision,
      });
    }
    const store = readStore();
    const updatedAt = new Date().toISOString();
    store[journeyId] = {
      ...store[journeyId],
      definition: structuredClone(definition) as JourneyDraft,
      revision: journey.revision + 1,
      updatedAt,
    };
    writeStore(store);
    return { revision: store[journeyId].revision, updatedAt };
  }

  async validateDraft(
    workspaceId: string,
    journeyId: string,
    revision: number,
    options: RequestOptions = {},
  ): Promise<ValidateDraftResult> {
    const behavior = getMockBehavior();
    await delay(Math.min(behavior.latencyMs, 250), options.signal);
    requireWorkspace(workspaceId);
    const [journey] = requireJourney(workspaceId, journeyId);
    if (journey.revision !== revision) {
      throw new ApiError('conflict', 'The requested revision is not current.', {
        status: 409,
        code: 'DRAFT_REVISION_MISMATCH',
        currentRevision: journey.revision,
      });
    }
    const draft = parseOrThrow(journey.definition);
    const result = validateGraph(draft, catalogContext(workspaceId));
    return {
      revision,
      valid: result.valid,
      errors: localIssuesToServer(result.errors),
      validatedAt: new Date().toISOString(),
    };
  }

  async publishDraft(
    workspaceId: string,
    journeyId: string,
    revision: number,
    options: RequestOptions = {},
  ): Promise<PublishResult> {
    const behavior = getMockBehavior();
    await delay(behavior.latencyMs, options.signal);
    const workspace = requireWorkspace(workspaceId);
    if (!workspace.canPublish) {
      throw new ApiError('forbidden', 'You do not have permission to publish.', {
        status: 403,
        code: 'FORBIDDEN',
      });
    }
    if (behavior.failNextPublish) {
      setMockBehavior({ failNextPublish: false });
      throw new ApiError('network', 'Publishing failed. The server could not be reached.', {
        code: 'NETWORK_ERROR',
      });
    }
    const [journey] = requireJourney(workspaceId, journeyId);
    if (journey.revision !== revision) {
      throw new ApiError('conflict', 'The published revision is no longer current.', {
        status: 412,
        code: 'STALE_REVISION',
        currentRevision: journey.revision,
      });
    }
    const draft = parseOrThrow(journey.definition);
    const validation = validateGraph(draft, catalogContext(workspaceId));
    if (!validation.valid) {
      throw new ApiError('validation', 'The journey is not publishable.', {
        status: 422,
        code: 'PUBLISH_VALIDATION_FAILED',
        details: localIssuesToServer(validation.errors),
      });
    }
    const store = readStore();
    const nextVersion = (journey.latestVersion?.versionNumber ?? 0) + 1;
    const publishedAt = new Date().toISOString();
    const versionId = `ver_${journeyId}_${nextVersion}`;
    store[journeyId] = {
      ...store[journeyId],
      status: 'published',
      latestVersion: { id: versionId, versionNumber: nextVersion, publishedAt },
    };
    writeStore(store);
    return { versionId, versionNumber: nextVersion, publishedAt, sourceDraftRevision: revision };
  }

  async listStaticLists(workspaceId: string, options: RequestOptions = {}) {
    const behavior = getMockBehavior();
    await delay(behavior.latencyMs, options.signal);
    requireWorkspace(workspaceId);
    if (behavior.failCatalogs) {
      throw new ApiError('network', 'Static lists could not be loaded.', { code: 'NETWORK_ERROR' });
    }
    if (behavior.emptyCatalogs) return [];
    return structuredClone(MOCK_LISTS);
  }

  async listSmsTemplates(workspaceId: string, options: RequestOptions = {}) {
    const behavior = getMockBehavior();
    await delay(behavior.latencyMs, options.signal);
    requireWorkspace(workspaceId);
    if (behavior.failCatalogs) {
      throw new ApiError('network', 'SMS templates could not be loaded.', { code: 'NETWORK_ERROR' });
    }
    if (behavior.emptyCatalogs) return [];
    return structuredClone(MOCK_TEMPLATES);
  }
}
