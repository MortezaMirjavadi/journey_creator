import { validateGraph } from '@/domain/graph';
import type { CatalogContext } from '@/domain/nodeRegistry';
import type { JourneyDraft } from '@/domain/types';
import {
  MOCK_LISTS,
  MOCK_TEMPLATES,
  MOCK_WORKSPACES,
} from '@/api/mockData';
import { getMockBehavior, setMockBehavior } from '@/api/mockBehavior';
import { localIssuesToServer } from '@/api/mockAdapter';
import { unsupportedDefinition } from './fixtures';
import {
  ApiError,
  type JourneyApi,
  type JourneyDetail,
  type PublishResult,
  type RequestOptions,
  type SaveDraftResult,
  type ValidateDraftResult,
} from '@/api/types';

/**
 * In-memory adapter for the isolated demo/sandbox route. Never touches the
 * persisted mock journeys, so loading an example cannot overwrite a real draft.
 */
export class SandboxJourneyApi implements JourneyApi {
  readonly mode = 'mock' as const;
  private readonly workspaceId: string;
  private readonly journeyId: string;
  private definition: unknown;
  private revision = 1;
  private status: 'draft' | 'published';
  private latestVersion: { id: string; versionNumber: number; publishedAt: string } | null;
  private readonly readOnlyFixture: boolean;

  constructor(
    workspaceId: string,
    journeyId: string,
    initial: { definition: unknown; status?: 'draft' | 'published'; readOnly?: boolean },
  ) {
    this.workspaceId = workspaceId;
    this.journeyId = journeyId;
    this.definition = structuredClone(initial.definition);
    this.status = initial.status ?? 'draft';
    this.readOnlyFixture = Boolean(initial.readOnly);
    this.latestVersion =
      initial.status === 'published'
        ? { id: `ver_${journeyId}_1`, versionNumber: 1, publishedAt: '2026-10-20T09:00:00.000Z' }
        : null;
  }

  private delay(signal?: AbortSignal, cap = 600): Promise<void> {
    const ms = Math.min(getMockBehavior().latencyMs, cap);
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

  private ctx(): CatalogContext {
    return {
      workspaceId: this.workspaceId,
      lists: MOCK_LISTS,
      templates: MOCK_TEMPLATES,
      foreignListIds: new Set(
        MOCK_LISTS.filter((list) => list.workspaceId !== this.workspaceId).map((list) => list.id),
      ),
      foreignTemplateIds: new Set(
        MOCK_TEMPLATES.filter((template) => template.workspaceId !== this.workspaceId).map(
          (template) => template.id,
        ),
      ),
    };
  }

  async listWorkspaces(options: RequestOptions = {}) {
    await this.delay(options.signal, 250);
    return structuredClone(MOCK_WORKSPACES);
  }

  async getJourney(
    workspaceId: string,
    journeyId: string,
    options: RequestOptions = {},
  ): Promise<JourneyDetail> {
    const behavior = getMockBehavior();
    await this.delay(options.signal);
    if (behavior.pageFailure === 'not_found') {
      throw new ApiError('not_found', 'Journey not found.', { status: 404 });
    }
    if (behavior.pageFailure === 'forbidden') {
      throw new ApiError('forbidden', 'You do not have access to this journey.', { status: 403 });
    }
    if (behavior.pageFailure === 'network') {
      throw new ApiError('network', 'The server could not be reached.', { code: 'NETWORK_ERROR' });
    }
    return {
      journeyId,
      workspaceId,
      name: 'Sandbox journey',
      description: 'Ephemeral demo draft. Nothing here is persisted to your real journeys.',
      status: this.status,
      revision: this.revision,
      updatedAt: null,
      definition: behavior.unsupportedDocument
        ? unsupportedDefinition()
        : structuredClone(this.definition),
      latestVersion: this.latestVersion,
      readOnly: this.readOnlyFixture || this.status === 'published',
    };
  }

  async saveDraft(
    _workspaceId: string,
    _journeyId: string,
    definition: unknown,
    expectedRevision: number,
    options: RequestOptions = {},
  ): Promise<SaveDraftResult> {
    const behavior = getMockBehavior();
    await this.delay(options.signal);
    if (behavior.failNextSave) {
      setMockBehavior({ failNextSave: false });
      throw new ApiError('network', 'Saving failed. The server could not be reached.', {
        code: 'NETWORK_ERROR',
      });
    }
    if (behavior.conflictNextSave) {
      setMockBehavior({ conflictNextSave: false });
      throw new ApiError('conflict', 'The draft was modified by another editor.', {
        status: 412,
        code: 'STALE_REVISION',
        currentRevision: this.revision,
      });
    }
    if (expectedRevision !== this.revision) {
      throw new ApiError('conflict', 'The draft was modified by another editor.', {
        status: 412,
        code: 'STALE_REVISION',
        currentRevision: this.revision,
      });
    }
    this.definition = structuredClone(definition);
    this.revision += 1;
    return { revision: this.revision, updatedAt: new Date().toISOString() };
  }

  async validateDraft(
    _workspaceId: string,
    _journeyId: string,
    revision: number,
    options: RequestOptions = {},
  ): Promise<ValidateDraftResult> {
    await this.delay(options.signal, 250);
    if (revision !== this.revision) {
      throw new ApiError('conflict', 'The requested revision is not current.', {
        status: 409,
        code: 'DRAFT_REVISION_MISMATCH',
        currentRevision: this.revision,
      });
    }
    const result = validateGraph(this.definition as JourneyDraft, this.ctx());
    return {
      revision,
      valid: result.valid,
      errors: localIssuesToServer(result.errors),
      validatedAt: new Date().toISOString(),
    };
  }

  async publishDraft(
    _workspaceId: string,
    _journeyId: string,
    revision: number,
    options: RequestOptions = {},
  ): Promise<PublishResult> {
    const behavior = getMockBehavior();
    await this.delay(options.signal);
    if (behavior.failNextPublish) {
      setMockBehavior({ failNextPublish: false });
      throw new ApiError('network', 'Publishing failed. The server could not be reached.', {
        code: 'NETWORK_ERROR',
      });
    }
    if (revision !== this.revision) {
      throw new ApiError('conflict', 'The published revision is no longer current.', {
        status: 412,
        code: 'STALE_REVISION',
        currentRevision: this.revision,
      });
    }
    const result = validateGraph(this.definition as JourneyDraft, this.ctx());
    if (!result.valid) {
      throw new ApiError('validation', 'The journey is not publishable.', {
        status: 422,
        code: 'PUBLISH_VALIDATION_FAILED',
        details: localIssuesToServer(result.errors),
      });
    }
    const number = (this.latestVersion?.versionNumber ?? 0) + 1;
    const publishedAt = new Date().toISOString();
    this.status = 'published';
    this.latestVersion = { id: `ver_${this.journeyId}_${number}`, versionNumber: number, publishedAt };
    return {
      versionId: this.latestVersion.id,
      versionNumber: number,
      publishedAt,
      sourceDraftRevision: revision,
    };
  }

  async listStaticLists(_workspaceId: string, options: RequestOptions = {}) {
    const behavior = getMockBehavior();
    await this.delay(options.signal);
    if (behavior.failCatalogs) {
      throw new ApiError('network', 'Static lists could not be loaded.', { code: 'NETWORK_ERROR' });
    }
    return behavior.emptyCatalogs ? [] : structuredClone(MOCK_LISTS);
  }

  async listSmsTemplates(_workspaceId: string, options: RequestOptions = {}) {
    const behavior = getMockBehavior();
    await this.delay(options.signal);
    if (behavior.failCatalogs) {
      throw new ApiError('network', 'SMS templates could not be loaded.', { code: 'NETWORK_ERROR' });
    }
    return behavior.emptyCatalogs ? [] : structuredClone(MOCK_TEMPLATES);
  }
}