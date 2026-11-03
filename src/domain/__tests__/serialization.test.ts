import { describe, expect, it } from 'vitest';
import {
  draftFingerprint,
  emptyDraft,
  parseDraft,
  toBackendGraph,
} from '../serialization';
import { minimalValidDraft, unsupportedDefinition } from '@/demo/fixtures';
import { toEditorGraph, toJourneyDraft } from '@/journey/flowAdapter';

describe('parseDraft', () => {
  it('parses a valid graph and derives stable edge ids', () => {
    const result = parseDraft(minimalValidDraft());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.nodes).toHaveLength(3);
    expect(result.draft.edges[0].id).toBe('entry_1:next->sms_1');
  });

  it('rejects unsupported schema versions without dropping data', () => {
    const result = parseDraft(unsupportedDefinition());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0].code).toBe('SCHEMA_UNSUPPORTED');
    expect(result.raw).toBeDefined();
  });

  it('rejects unsupported node types', () => {
    const result = parseDraft({
      schemaVersion: 1,
      nodes: [{ id: 'push_1', type: 'action.push', typeVersion: 1, config: {} }],
      edges: [],
      layout: {},
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.code)).toContain('UNSUPPORTED_NODE_TYPE');
  });

  it('rejects unknown config fields instead of silently dropping them', () => {
    const result = parseDraft({
      schemaVersion: 1,
      nodes: [
        {
          id: 'entry_1',
          type: 'entry.static_list',
          typeVersion: 1,
          config: { listId: 'list_ps_all', futureField: true },
        },
      ],
      edges: [],
      layout: {},
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.code)).toContain('UNSUPPORTED_CONFIG_FIELD');
  });

  it('normalizes missing editor-only fields', () => {
    const result = parseDraft({
      schemaVersion: 1,
      nodes: [
        { id: 'entry_1', type: 'entry.static_list', typeVersion: 1, config: { listId: 'list_ps_all' } },
        { id: 'sms_1', type: 'action.sms', typeVersion: 1, config: { templateVersionId: 'tplv_ps_welcome_1' } },
        { id: 'end_1', type: 'end', typeVersion: 1, config: {} },
      ],
      edges: [],
      layout: {},
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.nodes[0].config.label).toBe('');
    expect(result.draft.nodes[1].config).toMatchObject({ variableMappings: {} });
    expect(result.draft.nodes[2].config).toMatchObject({ note: '' });
  });

  it('preserves node, edge, and journey metadata', () => {
    const draft = minimalValidDraft();
    draft.meta = { owner: 'growth', campaignId: 42 };
    draft.nodes[0].meta = { source: 'csv', tags: ['vip', '2026'] };
    draft.edges[0].meta = { note: 'primary path' };
    const result = parseDraft(draft);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.meta).toEqual({ owner: 'growth', campaignId: 42 });
    expect(result.draft.nodes[0].meta).toEqual({ source: 'csv', tags: ['vip', '2026'] });
    expect(result.draft.edges[0].meta).toEqual({ note: 'primary path' });
  });

  it('rejects non-JSON metadata instead of silently dropping it', () => {
    const result = parseDraft({
      schemaVersion: 1,
      nodes: [{ id: 'entry_1', type: 'entry.static_list', typeVersion: 1, config: { listId: 'x' }, meta: { bad: undefined } }],
      edges: [],
      layout: {},
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.code)).toContain('META_INVALID');
  });

  it('rejects oversized metadata', () => {
    const result = parseDraft({
      schemaVersion: 1,
      nodes: [],
      edges: [],
      layout: {},
      meta: { blob: 'x'.repeat(5000) },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.code)).toContain('META_TOO_LARGE');
  });

  it('rejects unknown node, edge, layout, and top-level fields', () => {
    const result = parseDraft({
      schemaVersion: 1,
      extra: true,
      nodes: [
        { id: 'entry_1', type: 'entry.static_list', typeVersion: 1, config: { listId: 'x' }, unexpected: 1 },
      ],
      edges: [{ source: 'entry_1', target: 'entry_1', sourcePort: 'next', unexpected: 1 }],
      layout: { entry_1: { x: 0, y: 0, z: 1 } },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const codes = result.issues.map((issue) => issue.code);
    expect(codes).toContain('UNSUPPORTED_DOCUMENT_FIELD');
    expect(codes).toContain('UNSUPPORTED_NODE_FIELD');
    expect(codes).toContain('UNSUPPORTED_EDGE_FIELD');
    expect(codes).toContain('UNSUPPORTED_LAYOUT_FIELD');
  });
});

describe('toBackendGraph', () => {
  it('reports editor-only fields instead of silently stripping them', () => {
    const draft = minimalValidDraft();
    draft.nodes[0].config.label = 'Audience';
    draft.nodes[0].meta = { owner: 'growth' };
    draft.meta = { campaign: 'q4' };
    draft.edges[0].meta = { primary: true };
    const { graph, unsupportedFields } = toBackendGraph(draft);
    expect(unsupportedFields).toContain('entry_1.config.label');
    expect(unsupportedFields).toContain('sms_1.config.variableMappings');
    expect(unsupportedFields).toContain('entry_1.meta');
    expect(unsupportedFields).toContain('edges[0].meta');
    expect(unsupportedFields).toContain('meta');
    expect(graph.nodes[0].config).toEqual({ listId: 'list_ps_all' });
    expect(graph.edges[0]).toEqual({ source: 'entry_1', target: 'sms_1', sourcePort: 'next' });
  });
});

describe('draftFingerprint', () => {
  it('is stable across object key order and changes with content', () => {
    const a = minimalValidDraft();
    const b = minimalValidDraft();
    expect(draftFingerprint(a, 'Journey')).toBe(draftFingerprint(b, 'Journey'));
    b.nodes[0].config.label = 'Changed';
    expect(draftFingerprint(a, 'Journey')).not.toBe(draftFingerprint(b, 'Journey'));
  });

  it('does not include React Flow internals because they are not in the draft', () => {
    const draft = emptyDraft();
    expect(draftFingerprint(draft, 'Empty')).toBe(draftFingerprint(emptyDraft(), 'Empty'));
  });
});

describe('React Flow adapter round trip', () => {
  it('preserves nodes, edges, and layout', () => {
    const draft = minimalValidDraft();
    const { nodes, edges } = toEditorGraph(draft, {
      summaryFor: () => [],
      issues: [],
      readOnly: false,
    });
    const roundTripped = toJourneyDraft(nodes, edges);
    expect(roundTripped.nodes).toEqual(draft.nodes);
    expect(roundTripped.edges).toEqual(draft.edges);
    expect(roundTripped.layout).toEqual(draft.layout);
  });

  it('preserves metadata through the React Flow round trip', () => {
    const draft = minimalValidDraft();
    draft.meta = { campaign: 'q4' };
    draft.nodes[0].meta = { owner: 'growth' };
    draft.edges[0].meta = { primary: true };
    const { nodes, edges } = toEditorGraph(draft, {
      summaryFor: () => [],
      issues: [],
      readOnly: false,
    });
    expect(nodes[0].data.meta).toEqual({ owner: 'growth' });
    expect(edges[0].data?.meta).toEqual({ primary: true });
    const roundTripped = toJourneyDraft(nodes, edges, { meta: draft.meta });
    expect(roundTripped.meta).toEqual({ campaign: 'q4' });
    expect(roundTripped.nodes[0].meta).toEqual({ owner: 'growth' });
    expect(roundTripped.edges[0].meta).toEqual({ primary: true });
  });

  it('does not persist selection or measured dimensions', () => {
    const draft = minimalValidDraft();
    const { nodes, edges } = toEditorGraph(draft, {
      summaryFor: () => [],
      issues: [],
      readOnly: false,
      selectedNodeIds: ['entry_1'],
    });
    const roundTripped = toJourneyDraft(nodes, edges);
    expect(JSON.stringify(roundTripped)).not.toContain('selected');
    expect(JSON.stringify(roundTripped)).not.toContain('measured');
  });
});
