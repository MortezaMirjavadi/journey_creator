import { describe, expect, it } from 'vitest';
import { validateGraph } from '../graph';
import { parseJourneyDsl, toJourneyDsl } from '../journeyDsl';
import type { CatalogContext } from '../nodeRegistry';
import { PRO_RETENTION_DSL } from '@/demo/proRetentionDsl';
import { MOCK_LISTS, MOCK_TEMPLATES } from '@/api/mockData';
import { WORKSPACE_IDS } from '@/demo/ids';
import { toEditorGraph } from '@/journey/flowAdapter';
import { NODE_REGISTRY } from '../nodeRegistry';

const ctx: CatalogContext = {
  workspaceId: WORKSPACE_IDS.passengerProduction,
  lists: MOCK_LISTS,
  templates: MOCK_TEMPLATES,
  catalogsReady: true,
};

describe('journey-dsl-1.0 conversion', () => {
  it('converts the Pro retention sample into a JourneyDraft', () => {
    const result = parseJourneyDsl(PRO_RETENTION_DSL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.draft.nodes).toHaveLength(6);
    expect(result.draft.edges).toHaveLength(5);
    expect(result.draft.nodes.map((node) => node.type)).toEqual([
      'start',
      'split',
      'sendSms',
      'waitForEvent',
      'end',
      'end',
    ]);
    expect(result.draft.layout.start).toEqual({ x: 0, y: 120 });
    expect(result.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(result.draft.meta).toMatchObject({ dslVersion: '1.0' });

    const wait = result.draft.nodes.find((node) => node.id === 'wait_purchase');
    expect(wait?.config).toMatchObject({
      event: { sourceName: 'pro_purchase', venture: 'pro' },
      maxWait: { value: 2, unit: 'days' },
    });
    expect(result.draft.edges.map((edge) => edge.sourcePort)).toEqual([
      'next',
      'next',
      'next',
      'event',
      'timeout',
    ]);

    const start = result.draft.nodes.find((node) => node.id === 'start');
    expect(start?.ui).toEqual({ collapsed: false });
  });

  it('round-trips through the React-Flow-native DSL envelope', () => {
    const parsed = parseJourneyDsl(PRO_RETENTION_DSL);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const exported = toJourneyDsl(parsed.draft, { viewport: parsed.viewport });
    expect(exported.dslVersion).toBe('1.0');
    expect(exported.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(exported.nodes[0]).toMatchObject({
      id: 'start',
      type: 'start',
      position: { x: 0, y: 120 },
      data: { ui: { collapsed: false } },
      meta: { label: 'Start: Manual pilot', mode: 'manual' },
    });
    expect(exported.edges.find((edge) => edge.id === 'e:wait_purchase:event:end_success')?.label).toBe(
      'Event',
    );
    expect(exported.edges.find((edge) => edge.id === 'e:wait_purchase:event:end_success')?.data).toEqual({
      outcome: 'event',
    });

    const reparsed = parseJourneyDsl(exported);
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;
    expect(reparsed.draft.nodes).toEqual(parsed.draft.nodes);
    expect(reparsed.draft.edges).toEqual(parsed.draft.edges);
  });

  it('validates the converted graph as publishable', () => {
    const result = parseJourneyDsl(PRO_RETENTION_DSL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const validation = validateGraph(result.draft, ctx);
    expect(validation.errors).toEqual([]);
    expect(validation.valid).toBe(true);
  });

  it('maps the converted draft into React Flow nodes and edges', () => {
    const result = parseJourneyDsl(PRO_RETENTION_DSL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { nodes, edges } = toEditorGraph(result.draft, {
      summaryFor: (node) => NODE_REGISTRY[node.type].summary(node, ctx),
      issues: [],
      readOnly: false,
    });
    expect(nodes).toHaveLength(6);
    expect(edges).toHaveLength(5);
    const waitNode = nodes.find((node) => node.id === 'wait_purchase');
    expect(waitNode?.type).toBe('waitForEvent');
    expect(waitNode?.data.summary).toEqual([{ key: 'summary.waitEvent', params: { event: 'pro_purchase', value: 2, unit: 'days' } }]);
    expect(edges.filter((edge) => edge.source === 'wait_purchase').map((edge) => edge.sourceHandle)).toEqual([
      'event',
      'timeout',
    ]);
  });
});
