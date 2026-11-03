import { describe, expect, it } from 'vitest';
import { validateGraph, makeEdge } from '../graph';
import type { CatalogContext } from '../nodeRegistry';
import type { JourneyDraft } from '../types';
import { MOCK_LISTS, MOCK_TEMPLATES } from '@/api/mockData';
import { WORKSPACE_IDS } from '@/demo/ids';
import {
  branchingMergingDraft,
  cycleDraft,
  disconnectedNodeDraft,
  draftOf,
  emptyAudienceDraft,
  minimalValidDraft,
  missingEndDraft,
  missingMappingDraft,
  multipleEntriesDraft,
  multipleSmsDraft,
  unavailableReferencesDraft,
  unconfiguredSmsDraft,
} from '@/demo/fixtures';

const ctx: CatalogContext = {
  workspaceId: WORKSPACE_IDS.passengerStaging,
  lists: MOCK_LISTS,
  templates: MOCK_TEMPLATES,
  catalogsReady: true,
  foreignListIds: new Set(
    MOCK_LISTS.filter((list) => list.workspaceId !== WORKSPACE_IDS.passengerStaging).map((l) => l.id),
  ),
  foreignTemplateIds: new Set(
    MOCK_TEMPLATES.filter((t) => t.workspaceId !== WORKSPACE_IDS.passengerStaging).map((t) => t.id),
  ),
};

function codes(draft: JourneyDraft): string[] {
  return validateGraph(draft, ctx).issues.map((issue) => issue.code);
}

describe('validateGraph', () => {
  it('accepts a fully configured linear journey', () => {
    const result = validateGraph(minimalValidDraft(), ctx);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts multiple SMS steps', () => {
    expect(validateGraph(multipleSmsDraft(), ctx).valid).toBe(true);
  });

  it('treats an empty static list as a warning, not an error', () => {
    const result = validateGraph(emptyAudienceDraft(), ctx);
    expect(result.valid).toBe(true);
    expect(result.warnings.map((issue) => issue.code)).toContain('LIST_EMPTY');
  });

  it('requires a template on SMS nodes', () => {
    const result = validateGraph(unconfiguredSmsDraft(), ctx);
    expect(result.valid).toBe(false);
    expect(result.errors.map((issue) => issue.code)).toContain('TEMPLATE_REQUIRED');
  });

  it('requires every template variable to be mapped', () => {
    const result = validateGraph(missingMappingDraft(), ctx);
    expect(result.valid).toBe(false);
    const issue = result.errors.find((item) => item.code === 'VARIABLE_MAPPING_REQUIRED');
    expect(issue?.params?.variable).toBe('driverName');
    expect(issue?.field).toBe('config.variableMappings.driverName');
  });

  it('requires an end node and a connected SMS output', () => {
    const result = validateGraph(missingEndDraft(), ctx);
    const found = result.errors.map((issue) => issue.code);
    expect(found).toContain('END_REQUIRED');
    expect(found).toContain('SMS_OUTPUT_REQUIRED');
    expect(found).not.toContain('UNREACHABLE_END');
  });

  it('detects disconnected nodes', () => {
    const found = codes(disconnectedNodeDraft());
    expect(found).toContain('DISCONNECTED_NODE');
    expect(found).toContain('SMS_INPUT_REQUIRED');
    expect(found).toContain('SMS_OUTPUT_REQUIRED');
  });

  it('detects cycles', () => {
    const found = codes(cycleDraft());
    expect(found).toContain('CYCLE_DETECTED');
    expect(found).toContain('UNREACHABLE_END');
  });

  it('detects multiple entry nodes', () => {
    const found = codes(multipleEntriesDraft());
    expect(found).toContain('MULTIPLE_ENTRIES');
    expect(found).toContain('MERGING');
  });

  it('detects branching and merging', () => {
    const found = codes(branchingMergingDraft());
    expect(found).toContain('BRANCHING');
    expect(found).toContain('MERGING');
  });

  it('detects deleted and cross-workspace references', () => {
    const found = codes(unavailableReferencesDraft());
    expect(found).toContain('LIST_NOT_FOUND');
    expect(found).toContain('TEMPLATE_WRONG_WORKSPACE');
  });

  it('detects self connections', () => {
    const draft = minimalValidDraft();
    draft.edges.push({ id: 'self', source: 'sms_1', target: 'sms_1', sourcePort: 'success' });
    expect(codes(draft)).toContain('SELF_CONNECTION');
  });

  it('detects dangling edges', () => {
    const draft = minimalValidDraft();
    draft.edges.push({ id: 'ghost', source: 'sms_1', target: 'ghost', sourcePort: 'success' });
    expect(codes(draft)).toContain('DANGLING_EDGE');
  });

  it('detects invalid handles', () => {
    const draft = minimalValidDraft();
    draft.edges[0] = { ...draft.edges[0], sourcePort: 'bogus' };
    expect(codes(draft)).toContain('INVALID_HANDLE');
  });

  it('detects duplicate edges', () => {
    const draft = minimalValidDraft();
    draft.edges.push({ ...draft.edges[0], id: 'duplicate' });
    expect(codes(draft)).toContain('DUPLICATE_EDGE');
  });

  it('detects unsupported node types without dropping them', () => {
    const draft = minimalValidDraft();
    draft.nodes.push({
      id: 'push_1',
      type: 'action.push',
      typeVersion: 1,
      config: {},
    } as unknown as JourneyDraft['nodes'][number]);
    expect(codes(draft)).toContain('UNSUPPORTED_NODE_TYPE');
  });

  it('detects duplicate node ids', () => {
    const draft = minimalValidDraft();
    draft.nodes.push({ ...draft.nodes[0] });
    expect(codes(draft)).toContain('DUPLICATE_NODE_ID');
  });

  it('skips reference checks while catalogs are loading', () => {
    const draft = minimalValidDraft();
    draft.nodes[0] = {
      ...draft.nodes[0],
      config: { ...draft.nodes[0].config, listId: 'unknown_list' },
    } as JourneyDraft['nodes'][number];
    const result = validateGraph(draft, { ...ctx, catalogsReady: false });
    expect(result.issues.map((issue) => issue.code)).not.toContain('LIST_NOT_FOUND');
  });

  it('validates journey-dsl nodes and multiple ends', () => {
    const draft = draftOf(
      [
        { id: 'start', type: 'start', typeVersion: 1, config: { label: '', mode: 'manual' } },
        { id: 'split', type: 'split', typeVersion: 1, config: { label: '', controlPercentage: 10 } },
        {
          id: 'sms',
          type: 'sendSms',
          typeVersion: 1,
          config: { label: '', channel: 'sms', body: 'Hello', expiryHours: 2 },
        },
        {
          id: 'wait',
          type: 'waitForEvent',
          typeVersion: 1,
          config: {
            label: '',
            event: { sourceName: 'purchase', venture: 'pro' },
            maxWait: { value: 1, unit: 'days' },
          },
        },
        { id: 'end_ok', type: 'end', typeVersion: 1, config: { label: '', note: '', result: 'successful' } },
        {
          id: 'end_timeout',
          type: 'end',
          typeVersion: 1,
          config: { label: '', note: '', result: 'notSuccessful' },
        },
      ],
      [
        makeEdge('start', 'next', 'split'),
        makeEdge('split', 'next', 'sms'),
        makeEdge('sms', 'next', 'wait'),
        makeEdge('wait', 'event', 'end_ok'),
        makeEdge('wait', 'timeout', 'end_timeout'),
      ],
    );
    const result = validateGraph(draft, ctx);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('requires every output port on branching nodes', () => {
    const draft = draftOf(
      [
        { id: 'start', type: 'start', typeVersion: 1, config: { label: '', mode: 'manual' } },
        {
          id: 'sms',
          type: 'sendSms',
          typeVersion: 1,
          config: { label: '', channel: 'sms', body: 'Hello', expiryHours: 2 },
        },
        {
          id: 'wait',
          type: 'waitForEvent',
          typeVersion: 1,
          config: {
            label: '',
            event: { sourceName: 'purchase', venture: 'pro' },
            maxWait: { value: 1, unit: 'days' },
          },
        },
        { id: 'end_ok', type: 'end', typeVersion: 1, config: { label: '', note: '' } },
      ],
      [
        makeEdge('start', 'next', 'sms'),
        makeEdge('sms', 'next', 'wait'),
        makeEdge('wait', 'event', 'end_ok'),
      ],
    );
    const result = validateGraph(draft, ctx);
    const codes = result.errors.map((issue) => issue.code);
    expect(codes).toContain('OUTPUT_REQUIRED');
    expect(result.errors.find((issue) => issue.code === 'OUTPUT_REQUIRED')?.params?.port).toBe('timeout');
  });

  it('validates DSL property values', () => {
    const draft = draftOf(
      [
        { id: 'start', type: 'start', typeVersion: 1, config: { label: '', mode: 'manual' } },
        { id: 'split', type: 'split', typeVersion: 1, config: { label: '', controlPercentage: 150 } },
        {
          id: 'sms',
          type: 'sendSms',
          typeVersion: 1,
          config: { label: '', channel: 'sms', body: '', expiryHours: -1 },
        },
        {
          id: 'wait',
          type: 'waitForEvent',
          typeVersion: 1,
          config: {
            label: '',
            event: { sourceName: '', venture: '' },
            maxWait: { value: 0, unit: 'days' },
          },
        },
        { id: 'end', type: 'end', typeVersion: 1, config: { label: '', note: '' } },
      ],
      [
        makeEdge('start', 'next', 'split'),
        makeEdge('split', 'next', 'sms'),
        makeEdge('sms', 'next', 'wait'),
        makeEdge('wait', 'event', 'end'),
        makeEdge('wait', 'timeout', 'end'),
      ],
    );
    const codes = validateGraph(draft, ctx).errors.map((issue) => issue.code);
    expect(codes).toContain('INVALID_CONFIG');
  });

  it('reports entry incoming and end outgoing connections', () => {
    const draft = minimalValidDraft();
    draft.edges.push({ id: 'into-entry', source: 'sms_1', target: 'entry_1', sourcePort: 'success' });
    draft.edges.push({ id: 'out-of-end', source: 'end_1', target: 'sms_1', sourcePort: 'next' });
    const found = codes(draft);
    expect(found).toContain('ENTRY_HAS_INCOMING');
    expect(found).toContain('END_HAS_OUTGOING');
  });
});
