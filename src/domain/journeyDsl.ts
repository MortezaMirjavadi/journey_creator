import { parseDraft, type DraftParseIssue } from './serialization';
import type {
  JourneyDraft,
  JourneyEdge,
  JourneyNode,
  JsonObject,
  JsonValue,
  NodeType,
} from './types';

export interface JourneyDslViewport {
  x: number;
  y: number;
  zoom: number;
}

export type JourneyDslResult =
  | {
      ok: true;
      draft: JourneyDraft;
      viewport?: JourneyDslViewport;
      issues: DraftParseIssue[];
    }
  | { ok: false; issues: DraftParseIssue[]; raw: unknown };

const DSL_NODE_TYPES = new Set<string>(['start', 'split', 'sendSms', 'waitForEvent', 'end']);
const KNOWN_FIELDS: Record<string, Set<string>> = {
  start: new Set(['label', 'mode']),
  split: new Set(['label', 'controlPercentage']),
  sendSms: new Set(['label', 'channel', 'body', 'expiryHours']),
  waitForEvent: new Set(['label', 'event', 'maxWait']),
  end: new Set(['label', 'result', 'note']),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function labelOf(data: Record<string, unknown>): string {
  return typeof data.label === 'string' ? data.label : '';
}

function extras(data: Record<string, unknown>, type: string): JsonObject | undefined {
  const known = KNOWN_FIELDS[type] ?? new Set<string>();
  const result: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!known.has(key)) result[key] = value as JsonValue;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function nodeConfig(type: string, data: Record<string, unknown>): Record<string, unknown> {
  if (type === 'start') {
    return { label: labelOf(data), mode: data.mode === 'event' ? 'event' : 'manual' };
  }
  if (type === 'split') {
    return {
      label: labelOf(data),
      controlPercentage: typeof data.controlPercentage === 'number' ? data.controlPercentage : 10,
    };
  }
  if (type === 'sendSms') {
    return {
      label: labelOf(data),
      channel: 'sms',
      body: typeof data.body === 'string' ? data.body : '',
      expiryHours: typeof data.expiryHours === 'number' ? data.expiryHours : 2,
    };
  }
  if (type === 'waitForEvent') {
    const event = isRecord(data.event) ? data.event : {};
    const maxWait = isRecord(data.maxWait) ? data.maxWait : {};
    return {
      label: labelOf(data),
      event: {
        sourceName: typeof event.sourceName === 'string' ? event.sourceName : '',
        venture: typeof event.venture === 'string' ? event.venture : '',
      },
      maxWait: {
        value: typeof maxWait.value === 'number' ? maxWait.value : 2,
        unit: maxWait.unit === 'hours' ? 'hours' : 'days',
      },
    };
  }
  return {
    label: labelOf(data),
    note: typeof data.note === 'string' ? data.note : '',
    ...(data.result === 'successful' || data.result === 'notSuccessful'
      ? { result: data.result }
      : {}),
  };
}

/**
 * Converts the external journey-dsl-1.0 envelope into the editor's
 * `JourneyDraft`. Viewport is returned separately because React Flow owns it.
 */
export function parseJourneyDsl(raw: unknown): JourneyDslResult {
  const issues: DraftParseIssue[] = [];
  if (!isRecord(raw)) {
    return { ok: false, raw, issues: [{ code: 'DSL_INVALID', message: 'DSL document must be an object.' }] };
  }
  if (raw.dslVersion !== '1.0') {
    return {
      ok: false,
      raw,
      issues: [
        {
          code: 'DSL_VERSION_UNSUPPORTED',
          message: `Unsupported dslVersion ${String(raw.dslVersion)}. Expected "1.0".`,
        },
      ],
    };
  }
  if (!Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) {
    return {
      ok: false,
      raw,
      issues: [{ code: 'DSL_INVALID', message: 'DSL nodes and edges must be arrays.' }],
    };
  }

  const nodes: JourneyNode[] = [];
  const layout: JourneyDraft['layout'] = {};
  for (const [index, rawNode] of raw.nodes.entries()) {
    if (!isRecord(rawNode) || typeof rawNode.id !== 'string' || typeof rawNode.type !== 'string') {
      issues.push({ code: 'DSL_NODE_INVALID', message: `nodes[${index}] is missing id/type.` });
      continue;
    }
    if (!DSL_NODE_TYPES.has(rawNode.type)) {
      issues.push({
        code: 'UNSUPPORTED_NODE_TYPE',
        message: `Unsupported DSL node type "${rawNode.type}" on node "${rawNode.id}".`,
        nodeId: rawNode.id,
      });
      continue;
    }
    const data = isRecord(rawNode.data) ? rawNode.data : {};
    // Contract variants in the wild:
    //   { meta: {...} }            (top-level business meta — current contract)
    //   { data: { meta: {...} } }  (previous variant)
    //   { data: {...} }            (legacy flat variant)
    const business = isRecord(rawNode.meta)
      ? rawNode.meta
      : isRecord(data.meta)
        ? data.meta
        : data;
    const ui = isRecord(data.ui) ? data.ui : isRecord(rawNode.ui) ? rawNode.ui : undefined;
    const position = isRecord(rawNode.position) ? rawNode.position : {};
    const meta = extras(business, rawNode.type);
    nodes.push({
      id: rawNode.id,
      type: rawNode.type as NodeType,
      typeVersion: 1,
      config: nodeConfig(rawNode.type, business),
      ...(meta ? { meta: { dslData: meta } } : {}),
      ...(ui ? { ui } : {}),
    } as unknown as JourneyNode);
    if (typeof position.x === 'number' && typeof position.y === 'number') {
      layout[rawNode.id] = { x: position.x, y: position.y };
    }
  }

  const edges: JourneyEdge[] = [];
  for (const [index, rawEdge] of raw.edges.entries()) {
    if (
      !isRecord(rawEdge) ||
      typeof rawEdge.source !== 'string' ||
      typeof rawEdge.target !== 'string'
    ) {
      issues.push({ code: 'DSL_EDGE_INVALID', message: `edges[${index}] is missing source/target.` });
      continue;
    }
    const data = isRecord(rawEdge.data) ? rawEdge.data : {};
    const sourcePort = typeof data.outcome === 'string' ? data.outcome : 'next';
    const edgeMeta = {
      ...(isRecord(data.meta) ? data.meta : {}),
      ...(isRecord(rawEdge.meta) ? rawEdge.meta : {}),
      ...(typeof rawEdge.label === 'string' ? { label: rawEdge.label } : {}),
    };
    edges.push({
      id:
        typeof rawEdge.id === 'string' && rawEdge.id
          ? rawEdge.id
          : `${rawEdge.source}:${sourcePort}->${rawEdge.target}`,
      source: rawEdge.source,
      target: rawEdge.target,
      sourcePort,
      ...(Object.keys(edgeMeta).length > 0 ? { meta: edgeMeta as JsonObject } : {}),
    });
  }

  const journeyMeta: Record<string, JsonValue> = { dslVersion: '1.0' };
  if (isRecord(raw.journey)) journeyMeta.journey = raw.journey as JsonValue;
  if (typeof raw.$schema === 'string') journeyMeta.schema = raw.$schema;

  const viewport =
    isRecord(raw.viewport) &&
    typeof raw.viewport.x === 'number' &&
    typeof raw.viewport.y === 'number' &&
    typeof raw.viewport.zoom === 'number'
      ? { x: raw.viewport.x, y: raw.viewport.y, zoom: raw.viewport.zoom }
      : undefined;

  const draft: JourneyDraft = {
    schemaVersion: 1,
    nodes,
    edges,
    layout,
    meta: journeyMeta,
  };
  const parsed = parseDraft(draft);
  if (!parsed.ok) return { ok: false, issues: [...issues, ...parsed.issues], raw };
  return { ok: true, draft: parsed.draft, viewport, issues };
}

export interface JourneyDslDocument {
  $schema: string;
  dslVersion: '1.0';
  journey: JsonObject;
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: JsonObject;
    meta: JsonObject;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    type: 'smoothstep';
    label?: string;
    data: JsonObject;
  }>;
  viewport?: JourneyDslViewport;
}

function configToMeta(node: JourneyNode): JsonObject {
  if (node.type === 'start') {
    return { label: node.config.label, mode: node.config.mode };
  }
  if (node.type === 'split') {
    return { label: node.config.label, controlPercentage: node.config.controlPercentage };
  }
  if (node.type === 'sendSms') {
    return {
      label: node.config.label,
      channel: node.config.channel,
      body: node.config.body,
      expiryHours: node.config.expiryHours,
    };
  }
  if (node.type === 'waitForEvent') {
    return {
      label: node.config.label,
      event: node.config.event as unknown as JsonValue,
      maxWait: node.config.maxWait as unknown as JsonValue,
    };
  }
  if (node.type === 'entry.static_list') {
    return { label: node.config.label, listId: node.config.listId };
  }
  if (node.type === 'action.sms') {
    return {
      label: node.config.label,
      templateVersionId: node.config.templateVersionId,
      variableMappings: node.config.variableMappings as unknown as JsonValue,
    };
  }
  return {
    label: node.config.label,
    note: node.config.note,
    ...(node.config.result ? { result: node.config.result } : {}),
  };
}

function metaForNode(node: JourneyNode): JsonObject {
  const extras: Record<string, JsonValue> = {};
  if (node.meta) {
    for (const [key, value] of Object.entries(node.meta)) {
      if (key !== 'dslData') extras[key] = value;
    }
    if (isRecord(node.meta.dslData)) {
      for (const [key, value] of Object.entries(node.meta.dslData)) {
        if (!(key in extras)) extras[key] = value as JsonValue;
      }
    }
  }
  return { ...extras, ...configToMeta(node) };
}

/** Emits the React-Flow-native journey-dsl-1.0 envelope for backend teams. */
export function toJourneyDsl(
  draft: JourneyDraft,
  options: { journey?: JsonObject; viewport?: JourneyDslViewport } = {},
): JourneyDslDocument {
  const journey =
    options.journey ??
    (isRecord(draft.meta?.journey) ? (draft.meta.journey as JsonObject) : {
      id: 'journey',
      name: 'Journey',
      workspace: 'passenger_staging',
      version: 1,
      status: 'draft',
    });
  return {
    $schema:
      typeof draft.meta?.schema === 'string'
        ? draft.meta.schema
        : 'https://marco.snapp.ir/schemas/journey-dsl-1.0.json',
    dslVersion:
      draft.meta?.dslVersion === '1.0' ? '1.0' : '1.0',
    journey,
    nodes: draft.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: draft.layout[node.id] ?? { x: 320, y: 40 },
      data: { ...(node.ui ? { ui: node.ui } : {}) },
      meta: metaForNode(node),
    })),
    edges: draft.edges.map((edge) => {
      const edgeMeta = { ...(edge.meta ?? {}) };
      const label = typeof edgeMeta.label === 'string' ? edgeMeta.label : undefined;
      delete edgeMeta.label;
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'smoothstep' as const,
        ...(label ? { label } : {}),
        data: {
          outcome: edge.sourcePort,
          ...(Object.keys(edgeMeta).length > 0 ? { meta: edgeMeta } : {}),
        },
      };
    }),
    ...(options.viewport ? { viewport: options.viewport } : {}),
  };
}
