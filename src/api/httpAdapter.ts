import { toBackendGraph } from '@/domain/serialization';
import type { JourneyDraft, SmsTemplateVersion, StaticList, Workspace } from '@/domain/types';
import { MOCK_WORKSPACES } from './mockData';
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

const JSON_HEADERS = { 'content-type': 'application/json' };

interface BackendEnvelopeError {
  error?: { code?: string; message?: string; details?: { errors?: ServerValidationIssue[]; currentRevision?: number } };
}

/**
 * Adapter for the real Marco NestJS backend (`marco_event`).
 *
 * Implemented endpoints: get journey, get/save draft (If-Match), validate,
 * publish. The backend has no static-list or SMS-template catalog endpoints yet,
 * so those calls fail explicitly instead of fabricating data.
 *
 * Editor-only config fields (labels, variable mappings, end notes) are rejected
 * by the backend's `additionalProperties: false` schemas. This adapter refuses
 * to strip them silently and returns an `unsupported` error instead.
 */
export class HttpJourneyApi implements JourneyApi {
  readonly mode = 'http' as const;
  private readonly baseUrl: string;
  private readonly userId: string;

  constructor(baseUrl = import.meta.env.VITE_MARCO_API_BASE ?? '/api', userId = import.meta.env.VITE_MARCO_USER_ID ?? 'user_demo') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.userId = userId;
  }

  private async request<T>(path: string, init: RequestInit & { signal?: AbortSignal } = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { 'x-user-id': this.userId, accept: 'application/json', ...JSON_HEADERS, ...(init.headers ?? {}) },
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new ApiError('network', 'The server could not be reached.', { code: 'NETWORK_ERROR' });
    }
    if (response.status === 204) return undefined as T;
    const body = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) throw mapError(response.status, body);
    return body as T;
  }

  async listWorkspaces(options: RequestOptions = {}): Promise<Workspace[]> {
    // No workspace-directory endpoint exists yet. Permissions here are a UX hint
    // only; the backend remains the authorization boundary.
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return structuredClone(MOCK_WORKSPACES);
  }

  async getJourney(workspaceId: string, journeyId: string, options: RequestOptions = {}): Promise<JourneyDetail> {
    const raw = await this.request<Record<string, any>>(
      `/workspaces/${workspaceId}/journeys/${journeyId}`,
      { signal: options.signal },
    );
    const draft = raw.draft ?? raw;
    return {
      journeyId: String(raw.id ?? journeyId),
      workspaceId: String(raw.workspaceId ?? workspaceId),
      name: String(raw.name ?? 'Untitled journey'),
      description: raw.description ?? null,
      status: raw.status === 'PUBLISHED' ? 'published' : 'draft',
      revision: Number(draft.revision ?? 1),
      updatedAt: draft.updatedAt ?? raw.updatedAt ?? null,
      definition: draft.definition ?? draft,
      latestVersion: raw.latestVersion
        ? {
            id: String(raw.latestVersion.id),
            versionNumber: Number(raw.latestVersion.versionNumber ?? 0),
            publishedAt: String(raw.latestVersion.publishedAt ?? ''),
          }
        : null,
      readOnly: raw.status === 'PUBLISHED',
    };
  }

  async saveDraft(
    workspaceId: string,
    journeyId: string,
    definition: unknown,
    expectedRevision: number,
    options: RequestOptions = {},
  ): Promise<SaveDraftResult> {
    const draft = definition as JourneyDraft;
    const { graph, unsupportedFields } = toBackendGraph(draft);
    if (unsupportedFields.length > 0) {
      throw new ApiError(
        'unsupported',
        'The connected backend does not yet support display labels, SMS variable mappings, end notes, or meta objects. Remove them or use mock mode.',
        { code: 'BACKEND_UNSUPPORTED_FIELDS', details: { unsupportedFields } },
      );
    }
    const saved = await this.request<{ revision: number; updatedAt: string }>(
      `/workspaces/${workspaceId}/journeys/${journeyId}/draft`,
      {
        method: 'PUT',
        body: JSON.stringify({ definition: graph }),
        headers: { 'If-Match': `"revision-${expectedRevision}"` },
        signal: options.signal,
      },
    );
    return { revision: saved.revision, updatedAt: saved.updatedAt };
  }

  async validateDraft(
    workspaceId: string,
    journeyId: string,
    revision: number,
    options: RequestOptions = {},
  ): Promise<ValidateDraftResult> {
    return this.request<ValidateDraftResult>(`/workspaces/${workspaceId}/journeys/${journeyId}/validate`, {
      method: 'POST',
      body: JSON.stringify({ revision }),
      signal: options.signal,
    });
  }

  async publishDraft(
    workspaceId: string,
    journeyId: string,
    revision: number,
    options: RequestOptions = {},
  ): Promise<PublishResult> {
    const result = await this.request<{ id: string; versionNumber: number; publishedAt: string; sourceDraftRevision: number }>(
      `/workspaces/${workspaceId}/journeys/${journeyId}/publish`,
      {
        method: 'POST',
        body: JSON.stringify({ draftRevision: revision }),
        headers: { 'If-Match': `"revision-${revision}"`, 'Idempotency-Key': `publish-${journeyId}-${revision}` },
        signal: options.signal,
      },
    );
    return {
      versionId: result.id,
      versionNumber: result.versionNumber,
      publishedAt: result.publishedAt,
      sourceDraftRevision: result.sourceDraftRevision ?? revision,
    };
  }

  async listStaticLists(_workspaceId: string, _options: RequestOptions = {}): Promise<StaticList[]> {
    throw new ApiError('network', 'The connected backend does not expose a static-list catalog endpoint.', {
      status: 404,
      code: 'CATALOG_UNAVAILABLE',
    });
  }

  async listSmsTemplates(_workspaceId: string, _options: RequestOptions = {}): Promise<SmsTemplateVersion[]> {
    throw new ApiError('network', 'The connected backend does not expose an SMS-template catalog endpoint.', {
      status: 404,
      code: 'CATALOG_UNAVAILABLE',
    });
  }
}

function mapError(status: number, body: unknown): ApiError {
  const envelope = (body as BackendEnvelopeError | null)?.error;
  const code = envelope?.code;
  const message = envelope?.message ?? `Request failed with status ${status}.`;
  if (status === 401 || status === 403) {
    return new ApiError('forbidden', message, { status, code });
  }
  if (status === 404) return new ApiError('not_found', message, { status, code });
  if (status === 412 || status === 409) {
    return new ApiError('conflict', message, {
      status,
      code,
      currentRevision: envelope?.details?.currentRevision,
    });
  }
  if (status === 422) {
    return new ApiError('validation', message, { status, code, details: envelope?.details?.errors ?? envelope?.details });
  }
  return new ApiError('unknown', message, { status, code });
}
