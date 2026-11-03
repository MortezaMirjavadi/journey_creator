import { NODE_REGISTRY, isNodeType } from './nodeRegistry';
import type {
  ContactField,
  EndConfig,
  EntryStaticListConfig,
  JourneyDocument,
  JourneyDraft,
  JourneyEdge,
  JourneyNode,
  JsonObject,
  JsonValue,
  SendSmsConfig,
  SmsConfig,
  SplitConfig,
  StartConfig,
  VariableSource,
  WaitForEventConfig,
} from './types';
import { CONTACT_FIELDS, GRAPH_SCHEMA_VERSION } from './types';
import { edgeId } from './graph';

export const MAX_META_BYTES = 4096;
const RESERVED_META_KEY = '__proto__';

export interface DraftParseIssue {
  code: string;
  message: string;
  nodeId?: string;
}

export type DraftParseResult =
  | { ok: true; draft: JourneyDraft; issues: DraftParseIssue[] }
  | { ok: false; issues: DraftParseIssue[]; raw: unknown };

export function emptyDraft(): JourneyDraft {
  return { schemaVersion: GRAPH_SCHEMA_VERSION, nodes: [], edges: [], layout: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true;
  if (typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (isRecord(value)) {
    return Object.keys(value).every((key) => key !== RESERVED_META_KEY && isJsonValue(value[key]));
  }
  return false;
}

/**
 * Validates a `meta` object: plain JSON, no functions/cycles/undefined, bounded
 * size. Returns `undefined` and records an issue when invalid.
 */
export function readMeta(
  raw: unknown,
  issues: DraftParseIssue[],
  path: string,
  nodeId?: string,
): JsonObject | undefined {
  if (raw === undefined) return undefined;
  if (!isRecord(raw) || !Object.values(raw).every(isJsonValue)) {
    issues.push({
      code: 'META_INVALID',
      message: `${path} must be a JSON object containing only strings, numbers, booleans, null, arrays, and plain objects.`,
      nodeId,
    });
    return undefined;
  }
  const serialized = JSON.stringify(raw);
  const bytes = new TextEncoder().encode(serialized).length;
  if (bytes > MAX_META_BYTES) {
    issues.push({
      code: 'META_TOO_LARGE',
      message: `${path} exceeds the ${MAX_META_BYTES}-byte metadata limit.`,
      nodeId,
    });
    return undefined;
  }
  return raw as JsonObject;
}

/** Drops an empty `meta` object so absent and `{}` produce the same document. */
export function normalizeMeta(meta: JsonObject | undefined): JsonObject | undefined {
  if (!meta) return undefined;
  return Object.keys(meta).length > 0 ? meta : undefined;
}

function normalizeVariableSource(value: unknown): VariableSource | null {
  if (!isRecord(value)) return null;
  if (value.kind === 'contact' && typeof value.field === 'string') {
    if ((CONTACT_FIELDS as readonly string[]).includes(value.field)) {
      return { kind: 'contact', field: value.field as ContactField };
    }
    return null;
  }
  if (value.kind === 'literal' && typeof value.value === 'string') {
    return { kind: 'literal', value: value.value };
  }
  return null;
}

function normalizeConfig(
  type: JourneyNode['type'],
  raw: unknown,
  issues: DraftParseIssue[],
  nodeId: string,
): JourneyNode['config'] | null {
  if (!isRecord(raw)) {
    issues.push({ code: 'INVALID_CONFIG', message: 'Node config must be an object.', nodeId });
    return null;
  }
  const allowed = new Set<string>(['label']);
  if (type === 'entry.static_list') allowed.add('listId');
  if (type === 'action.sms') {
    allowed.add('templateVersionId');
    allowed.add('variableMappings');
  }
  if (type === 'end') {
    allowed.add('note');
    allowed.add('result');
  }
  if (type === 'start') allowed.add('mode');
  if (type === 'split') allowed.add('controlPercentage');
  if (type === 'sendSms') {
    allowed.add('channel');
    allowed.add('body');
    allowed.add('expiryHours');
  }
  if (type === 'waitForEvent') {
    allowed.add('event');
    allowed.add('maxWait');
  }
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      issues.push({
        code: 'UNSUPPORTED_CONFIG_FIELD',
        message: `Unsupported config field "${key}" on node "${nodeId}".`,
        nodeId,
      });
    }
  }
  const label = typeof raw.label === 'string' ? raw.label : '';
  if (type === 'entry.static_list') {
    const config: EntryStaticListConfig = {
      label,
      listId: typeof raw.listId === 'string' ? raw.listId : '',
    };
    return config;
  }
  if (type === 'action.sms') {
    const mappings: Record<string, VariableSource> = {};
    if (raw.variableMappings !== undefined) {
      if (!isRecord(raw.variableMappings)) {
        issues.push({
          code: 'INVALID_CONFIG',
          message: 'variableMappings must be an object.',
          nodeId,
        });
      } else {
        for (const [variable, source] of Object.entries(raw.variableMappings)) {
          const normalized = normalizeVariableSource(source);
          if (!normalized) {
            issues.push({
              code: 'INVALID_CONFIG',
              message: `Invalid variable mapping for "${variable}".`,
              nodeId,
            });
          } else {
            mappings[variable] = normalized;
          }
        }
      }
    }
    const config: SmsConfig = {
      label,
      templateVersionId: typeof raw.templateVersionId === 'string' ? raw.templateVersionId : '',
      variableMappings: mappings,
    };
    return config;
  }
  if (type === 'start') {
    if (raw.mode !== undefined && raw.mode !== 'manual' && raw.mode !== 'event') {
      issues.push({ code: 'INVALID_CONFIG', message: 'Start mode must be "manual" or "event".', nodeId });
    }
    const config: StartConfig = {
      label,
      mode: raw.mode === 'event' ? 'event' : 'manual',
    };
    return config;
  }
  if (type === 'split') {
    if (raw.controlPercentage !== undefined && typeof raw.controlPercentage !== 'number') {
      issues.push({ code: 'INVALID_CONFIG', message: 'controlPercentage must be a number.', nodeId });
    }
    const config: SplitConfig = {
      label,
      controlPercentage: typeof raw.controlPercentage === 'number' ? raw.controlPercentage : 10,
    };
    return config;
  }
  if (type === 'sendSms') {
    if (raw.channel !== undefined && raw.channel !== 'sms') {
      issues.push({ code: 'INVALID_CONFIG', message: 'Only the "sms" channel is supported.', nodeId });
    }
    if (raw.body !== undefined && typeof raw.body !== 'string') {
      issues.push({ code: 'INVALID_CONFIG', message: 'SMS body must be a string.', nodeId });
    }
    if (raw.expiryHours !== undefined && typeof raw.expiryHours !== 'number') {
      issues.push({ code: 'INVALID_CONFIG', message: 'expiryHours must be a number.', nodeId });
    }
    const config: SendSmsConfig = {
      label,
      channel: 'sms',
      body: typeof raw.body === 'string' ? raw.body : '',
      expiryHours: typeof raw.expiryHours === 'number' ? raw.expiryHours : 2,
    };
    return config;
  }
  if (type === 'waitForEvent') {
    const rawEvent = isRecord(raw.event) ? raw.event : {};
    const rawWait = isRecord(raw.maxWait) ? raw.maxWait : {};
    for (const key of Object.keys(rawEvent)) {
      if (key !== 'sourceName' && key !== 'venture') {
        issues.push({
          code: 'UNSUPPORTED_CONFIG_FIELD',
          message: `Unsupported config field "event.${key}" on node "${nodeId}".`,
          nodeId,
        });
      }
    }
    for (const key of Object.keys(rawWait)) {
      if (key !== 'value' && key !== 'unit') {
        issues.push({
          code: 'UNSUPPORTED_CONFIG_FIELD',
          message: `Unsupported config field "maxWait.${key}" on node "${nodeId}".`,
          nodeId,
        });
      }
    }
    const config: WaitForEventConfig = {
      label,
      event: {
        sourceName: typeof rawEvent.sourceName === 'string' ? rawEvent.sourceName : '',
        venture: typeof rawEvent.venture === 'string' ? rawEvent.venture : '',
      },
      maxWait: {
        value: typeof rawWait.value === 'number' ? rawWait.value : 2,
        unit: rawWait.unit === 'hours' ? 'hours' : 'days',
      },
    };
    return config;
  }
  if (raw.result !== undefined && raw.result !== 'successful' && raw.result !== 'notSuccessful') {
    issues.push({
      code: 'INVALID_CONFIG',
      message: 'End result must be "successful" or "notSuccessful".',
      nodeId,
    });
  }
  const config: EndConfig = {
    label,
    note: typeof raw.note === 'string' ? raw.note : '',
    ...(raw.result === 'successful' || raw.result === 'notSuccessful'
      ? { result: raw.result }
      : {}),
  };
  return config;
}

/**
 * Parses a persisted graph envelope. Never drops unsupported nodes or fields:
 * anything the editor cannot represent is reported and the document is rejected
 * so the UI can show a compatibility screen instead of silently losing data.
 */
export function parseDraft(raw: unknown): DraftParseResult {
  const issues: DraftParseIssue[] = [];
  if (!isRecord(raw)) {
    return {
      ok: false,
      issues: [{ code: 'DOCUMENT_ENVELOPE_INVALID', message: 'Journey definition must be an object.' }],
      raw,
    };
  }
  if (raw.schemaVersion !== GRAPH_SCHEMA_VERSION) {
    return {
      ok: false,
      issues: [
        {
          code: 'SCHEMA_UNSUPPORTED',
          message: `Unsupported graph schemaVersion ${String(raw.schemaVersion)}. This editor supports version ${GRAPH_SCHEMA_VERSION}.`,
        },
      ],
      raw,
    };
  }
  if (!Array.isArray(raw.nodes) || !Array.isArray(raw.edges) || !isRecord(raw.layout)) {
    return {
      ok: false,
      issues: [{ code: 'DOCUMENT_ENVELOPE_INVALID', message: 'nodes, edges, and layout are required.' }],
      raw,
    };
  }

  const allowedTopLevel = new Set(['schemaVersion', 'nodes', 'edges', 'layout', 'meta']);
  for (const key of Object.keys(raw)) {
    if (!allowedTopLevel.has(key)) {
      issues.push({
        code: 'UNSUPPORTED_DOCUMENT_FIELD',
        message: `Unsupported top-level field "${key}". Allowed: schemaVersion, nodes, edges, layout, meta.`,
      });
    }
  }
  const draftMeta = readMeta(raw.meta, issues, 'meta');

  const nodes: JourneyNode[] = [];
  for (const [index, rawNode] of raw.nodes.entries()) {
    if (!isRecord(rawNode)) {
      issues.push({ code: 'INVALID_NODE', message: `nodes[${index}] must be an object.` });
      continue;
    }
    const id = typeof rawNode.id === 'string' ? rawNode.id : '';
    const allowedNodeFields = new Set(['id', 'type', 'typeVersion', 'config', 'meta', 'ui']);
    for (const key of Object.keys(rawNode)) {
      if (!allowedNodeFields.has(key)) {
        issues.push({
          code: 'UNSUPPORTED_NODE_FIELD',
          message: `Unsupported field "${key}" on node "${id || index}". Allowed: id, type, typeVersion, config, meta, ui.`,
          nodeId: id,
        });
      }
    }
    const type = rawNode.type;
    if (!isNodeType(type)) {
      issues.push({
        code: 'UNSUPPORTED_NODE_TYPE',
        message: `Unsupported node type "${String(type)}" on node "${id}".`,
        nodeId: id,
      });
      continue;
    }
    const definition = NODE_REGISTRY[type];
    if (rawNode.typeVersion !== definition.version) {
      issues.push({
        code: 'UNSUPPORTED_NODE_VERSION',
        message: `Unsupported version ${String(rawNode.typeVersion)} for node type "${type}".`,
        nodeId: id,
      });
      continue;
    }
    const config = normalizeConfig(type, rawNode.config, issues, id);
    if (!config) continue;
    const meta = readMeta(rawNode.meta, issues, `nodes[${index}].meta`, id);
    const ui = readMeta(rawNode.ui, issues, `nodes[${index}].ui`, id);
    nodes.push({
      id,
      type,
      typeVersion: definition.version,
      config,
      ...(meta ? { meta } : {}),
      ...(ui ? { ui } : {}),
    } as JourneyNode);
  }

  const edges: JourneyEdge[] = [];
  for (const [index, rawEdge] of raw.edges.entries()) {
    if (!isRecord(rawEdge)) {
      issues.push({ code: 'INVALID_EDGE', message: `edges[${index}] must be an object.` });
      continue;
    }
    const allowedEdgeFields = new Set(['id', 'source', 'target', 'sourcePort', 'meta']);
    for (const key of Object.keys(rawEdge)) {
      if (!allowedEdgeFields.has(key)) {
        issues.push({
          code: 'UNSUPPORTED_EDGE_FIELD',
          message: `Unsupported field "${key}" on edges[${index}]. Allowed: id, source, target, sourcePort, meta.`,
        });
      }
    }
    const source = typeof rawEdge.source === 'string' ? rawEdge.source : '';
    const target = typeof rawEdge.target === 'string' ? rawEdge.target : '';
    const sourcePort = typeof rawEdge.sourcePort === 'string' ? rawEdge.sourcePort : '';
    if (!source || !target || !sourcePort) {
      issues.push({ code: 'INVALID_EDGE', message: `edges[${index}] is missing source, target, or sourcePort.` });
      continue;
    }
    const meta = readMeta(rawEdge.meta, issues, `edges[${index}].meta`);
    edges.push({
      id: typeof rawEdge.id === 'string' && rawEdge.id ? rawEdge.id : edgeId(source, sourcePort, target),
      source,
      target,
      sourcePort,
      ...(meta ? { meta } : {}),
    });
  }

  const layout: JourneyDraft['layout'] = {};
  for (const [nodeId, position] of Object.entries(raw.layout)) {
    if (isRecord(position) && typeof position.x === 'number' && typeof position.y === 'number') {
      const layoutExtras = Object.keys(position).filter((key) => key !== 'x' && key !== 'y');
      if (layoutExtras.length > 0) {
        issues.push({
          code: 'UNSUPPORTED_LAYOUT_FIELD',
          message: `Unsupported layout field(s) "${layoutExtras.join(', ')}" for node "${nodeId}".`,
          nodeId,
        });
      }
      layout[nodeId] = { x: position.x, y: position.y };
    } else {
      issues.push({ code: 'INVALID_LAYOUT', message: `Invalid layout for node "${nodeId}".`, nodeId });
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues, raw };
  }
  return {
    ok: true,
    draft: {
      schemaVersion: GRAPH_SCHEMA_VERSION,
      nodes,
      edges,
      layout,
      ...(draftMeta ? { meta: draftMeta } : {}),
    },
    issues: [],
  };
}

export function parseJourneyDocument(raw: unknown): JourneyDocument | null {
  if (!isRecord(raw)) return null;
  const definition = isRecord(raw.draft) ? raw.draft.definition : raw.definition;
  const parsed = parseDraft(definition);
  if (!parsed.ok) return null;
  return {
    journeyId: String(raw.journeyId ?? raw.id ?? ''),
    workspaceId: String(raw.workspaceId ?? ''),
    name: typeof raw.name === 'string' ? raw.name : 'Untitled journey',
    description: typeof raw.description === 'string' ? raw.description : null,
    status: raw.status === 'published' ? 'published' : 'draft',
    draft: parsed.draft,
    revision: typeof raw.revision === 'number' ? raw.revision : 1,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
    latestVersion: isRecord(raw.latestVersion)
      ? {
          id: String(raw.latestVersion.id ?? ''),
          versionNumber: Number(raw.latestVersion.versionNumber ?? 0),
          publishedAt: String(raw.latestVersion.publishedAt ?? ''),
        }
      : null,
  };
}

/** Strips editor-only fields for the current backend contract. */
export function toBackendGraph(draft: JourneyDraft): {
  graph: {
    schemaVersion: number;
    nodes: { id: string; type: string; typeVersion: number; config: Record<string, unknown> }[];
    edges: { source: string; target: string; sourcePort: string }[];
    layout: Record<string, { x: number; y: number }>;
  };
  unsupportedFields: string[];
} {
  const unsupportedFields: string[] = [];
  const nodes = draft.nodes.map((node) => {
    const config: Record<string, unknown> = {};
    if (node.type === 'entry.static_list') {
      config.listId = node.config.listId;
      if (node.config.label) unsupportedFields.push(`${node.id}.config.label`);
    } else if (node.type === 'action.sms') {
      config.templateVersionId = node.config.templateVersionId;
      if (node.config.label) unsupportedFields.push(`${node.id}.config.label`);
      if (Object.keys(node.config.variableMappings).length > 0) {
        unsupportedFields.push(`${node.id}.config.variableMappings`);
      }
    } else if (node.type === 'end') {
      if (node.config.label) unsupportedFields.push(`${node.id}.config.label`);
      if (node.config.note) unsupportedFields.push(`${node.id}.config.note`);
      if (node.config.result) unsupportedFields.push(`${node.id}.config.result`);
    } else {
      // start / split / sendSms / waitForEvent are only supported in mock mode.
      unsupportedFields.push(`${node.id}.type`);
      if (node.config.label) unsupportedFields.push(`${node.id}.config.label`);
    }
    if (node.meta && Object.keys(node.meta).length > 0) unsupportedFields.push(`${node.id}.meta`);
    if (node.ui && Object.keys(node.ui).length > 0) unsupportedFields.push(`${node.id}.ui`);
    return { id: node.id, type: node.type, typeVersion: node.typeVersion, config };
  });
  if (draft.meta && Object.keys(draft.meta).length > 0) unsupportedFields.push('meta');
  draft.edges.forEach((edge, index) => {
    if (edge.meta && Object.keys(edge.meta).length > 0) unsupportedFields.push(`edges[${index}].meta`);
  });
  return {
    graph: {
      schemaVersion: draft.schemaVersion,
      nodes,
      edges: draft.edges.map(({ source, target, sourcePort }) => ({ source, target, sourcePort })),
      layout: draft.layout,
    },
    unsupportedFields,
  };
}

export function cloneDraft(draft: JourneyDraft): JourneyDraft {
  return structuredClone(draft);
}

/** Stable fingerprint used for dirty tracking. Excludes selection/viewport. */
export function draftFingerprint(draft: JourneyDraft, name: string): string {
  return stableStringify({ name, draft });
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isRecord(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
