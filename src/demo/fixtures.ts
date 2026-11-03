import type {
  EndConfig,
  EntryStaticListConfig,
  JourneyDraft,
  JourneyEdge,
  JourneyNode,
  SmsConfig,
} from '@/domain/types';
import { GRAPH_SCHEMA_VERSION } from '@/domain/types';
import { makeEdge } from '@/domain/graph';
import { LIST_IDS, TEMPLATE_IDS } from './ids';

export function entryNode(id: string, config: Partial<EntryStaticListConfig> = {}): JourneyNode {
  return {
    id,
    type: 'entry.static_list',
    typeVersion: 1,
    config: { label: '', listId: '', ...config },
  };
}

export function smsNode(id: string, config: Partial<SmsConfig> = {}): JourneyNode {
  return {
    id,
    type: 'action.sms',
    typeVersion: 1,
    config: { label: '', templateVersionId: '', variableMappings: {}, ...config },
  };
}

export function endNode(id: string, config: Partial<EndConfig> = {}): JourneyNode {
  return {
    id,
    type: 'end',
    typeVersion: 1,
    config: { label: '', note: '', ...config },
  };
}

export function draftOf(
  nodes: JourneyNode[],
  edges: JourneyEdge[],
  layout?: Record<string, { x: number; y: number }>,
): JourneyDraft {
  return {
    schemaVersion: GRAPH_SCHEMA_VERSION,
    nodes,
    edges,
    layout:
      layout ??
      Object.fromEntries(nodes.map((node, index) => [node.id, { x: 320, y: 40 + index * 150 }])),
  };
}

export const WELCOME_MAPPINGS = {
  firstName: { kind: 'contact', field: 'firstName' },
} as const;

export const REMINDER_MAPPINGS = {
  firstName: { kind: 'contact', field: 'firstName' },
  driverName: { kind: 'contact', field: 'lastName' },
} as const;

export const minimalValidDraft = (): JourneyDraft =>
  draftOf(
    [
      entryNode('entry_1', { listId: LIST_IDS.psAll }),
      smsNode('sms_1', {
        templateVersionId: TEMPLATE_IDS.psWelcome,
        variableMappings: structuredClone(WELCOME_MAPPINGS),
      }),
      endNode('end_1'),
    ],
    [makeEdge('entry_1', 'next', 'sms_1'), makeEdge('sms_1', 'success', 'end_1')],
  );

export const multipleSmsDraft = (): JourneyDraft =>
  draftOf(
    [
      entryNode('entry_1', { listId: LIST_IDS.psVip }),
      smsNode('sms_1', {
        templateVersionId: TEMPLATE_IDS.psWelcome,
        variableMappings: structuredClone(WELCOME_MAPPINGS),
      }),
      smsNode('sms_2', {
        templateVersionId: TEMPLATE_IDS.psPromo,
        variableMappings: structuredClone(WELCOME_MAPPINGS),
      }),
      endNode('end_1'),
    ],
    [
      makeEdge('entry_1', 'next', 'sms_1'),
      makeEdge('sms_1', 'success', 'sms_2'),
      makeEdge('sms_2', 'success', 'end_1'),
    ],
  );

export const unconfiguredSmsDraft = (): JourneyDraft =>
  draftOf(
    [
      entryNode('entry_1', { listId: LIST_IDS.psAll }),
      smsNode('sms_1'),
      endNode('end_1'),
    ],
    [makeEdge('entry_1', 'next', 'sms_1'), makeEdge('sms_1', 'success', 'end_1')],
  );

export const missingMappingDraft = (): JourneyDraft =>
  draftOf(
    [
      entryNode('entry_1', { listId: LIST_IDS.psAll }),
      smsNode('sms_1', {
        templateVersionId: TEMPLATE_IDS.psReminder,
        variableMappings: { firstName: { kind: 'contact', field: 'firstName' } },
      }),
      endNode('end_1'),
    ],
    [makeEdge('entry_1', 'next', 'sms_1'), makeEdge('sms_1', 'success', 'end_1')],
  );

export const emptyAudienceDraft = (): JourneyDraft =>
  draftOf(
    [
      entryNode('entry_1', { listId: LIST_IDS.psEmpty }),
      smsNode('sms_1', {
        templateVersionId: TEMPLATE_IDS.psWelcome,
        variableMappings: structuredClone(WELCOME_MAPPINGS),
      }),
      endNode('end_1'),
    ],
    [makeEdge('entry_1', 'next', 'sms_1'), makeEdge('sms_1', 'success', 'end_1')],
  );

export const missingEndDraft = (): JourneyDraft =>
  draftOf(
    [
      entryNode('entry_1', { listId: LIST_IDS.psAll }),
      smsNode('sms_1', {
        templateVersionId: TEMPLATE_IDS.psWelcome,
        variableMappings: structuredClone(WELCOME_MAPPINGS),
      }),
    ],
    [makeEdge('entry_1', 'next', 'sms_1')],
  );

export const disconnectedNodeDraft = (): JourneyDraft =>
  draftOf(
    [
      entryNode('entry_1', { listId: LIST_IDS.psAll }),
      smsNode('sms_1', {
        templateVersionId: TEMPLATE_IDS.psWelcome,
        variableMappings: structuredClone(WELCOME_MAPPINGS),
      }),
      smsNode('sms_orphan', {
        templateVersionId: TEMPLATE_IDS.psPromo,
        variableMappings: structuredClone(WELCOME_MAPPINGS),
      }),
      endNode('end_1'),
    ],
    [makeEdge('entry_1', 'next', 'sms_1'), makeEdge('sms_1', 'success', 'end_1')],
    {
      entry_1: { x: 0, y: 0 },
      sms_1: { x: 0, y: 170 },
      sms_orphan: { x: 320, y: 170 },
      end_1: { x: 0, y: 340 },
    },
  );

export const cycleDraft = (): JourneyDraft =>
  draftOf(
    [
      entryNode('entry_1', { listId: LIST_IDS.psAll }),
      smsNode('sms_1', {
        templateVersionId: TEMPLATE_IDS.psWelcome,
        variableMappings: structuredClone(WELCOME_MAPPINGS),
      }),
      smsNode('sms_2', {
        templateVersionId: TEMPLATE_IDS.psPromo,
        variableMappings: structuredClone(WELCOME_MAPPINGS),
      }),
      endNode('end_1'),
    ],
    [
      makeEdge('entry_1', 'next', 'sms_1'),
      makeEdge('sms_1', 'success', 'sms_2'),
      makeEdge('sms_2', 'success', 'sms_1'),
    ],
  );

export const multipleEntriesDraft = (): JourneyDraft =>
  draftOf(
    [
      entryNode('entry_1', { listId: LIST_IDS.psAll }),
      entryNode('entry_2', { listId: LIST_IDS.psVip }),
      smsNode('sms_1', {
        templateVersionId: TEMPLATE_IDS.psWelcome,
        variableMappings: structuredClone(WELCOME_MAPPINGS),
      }),
      endNode('end_1'),
    ],
    [
      makeEdge('entry_1', 'next', 'sms_1'),
      makeEdge('entry_2', 'next', 'sms_1'),
      makeEdge('sms_1', 'success', 'end_1'),
    ],
  );

export const branchingMergingDraft = (): JourneyDraft =>
  draftOf(
    [
      entryNode('entry_1', { listId: LIST_IDS.psAll }),
      smsNode('sms_1', {
        templateVersionId: TEMPLATE_IDS.psWelcome,
        variableMappings: structuredClone(WELCOME_MAPPINGS),
      }),
      smsNode('sms_a', {
        templateVersionId: TEMPLATE_IDS.psPromo,
        variableMappings: structuredClone(WELCOME_MAPPINGS),
      }),
      smsNode('sms_b', {
        templateVersionId: TEMPLATE_IDS.psPromo,
        variableMappings: structuredClone(WELCOME_MAPPINGS),
      }),
      endNode('end_1'),
    ],
    [
      makeEdge('entry_1', 'next', 'sms_1'),
      makeEdge('sms_1', 'success', 'sms_a'),
      makeEdge('sms_1', 'success', 'sms_b'),
      makeEdge('sms_a', 'success', 'end_1'),
      makeEdge('sms_b', 'success', 'end_1'),
    ],
  );

export const unavailableReferencesDraft = (): JourneyDraft =>
  draftOf(
    [
      entryNode('entry_1', { listId: LIST_IDS.psArchived }),
      smsNode('sms_1', {
        templateVersionId: TEMPLATE_IDS.dsWelcome,
        variableMappings: {},
      }),
      endNode('end_1'),
    ],
    [makeEdge('entry_1', 'next', 'sms_1'), makeEdge('sms_1', 'success', 'end_1')],
  );

export const publishedDraft = (): JourneyDraft => minimalValidDraft();

export const unsupportedDefinition = (): unknown => ({
  schemaVersion: 2,
  nodes: [
    { id: 'entry_1', type: 'entry.static_list', typeVersion: 1, config: { listId: LIST_IDS.psAll } },
    { id: 'push_1', type: 'action.push', typeVersion: 1, config: { title: 'Hello' } },
    { id: 'end_1', type: 'end', typeVersion: 1, config: {} },
  ],
  edges: [
    { source: 'entry_1', target: 'push_1', sourcePort: 'next' },
    { source: 'push_1', target: 'end_1', sourcePort: 'success' },
  ],
  layout: {},
});
