import type { Edge, Node } from '@xyflow/react';
import type { SummaryPart } from '@/domain/nodeRegistry';
import type {
  JourneyDraft,
  JourneyEdge,
  JourneyNode,
  JsonObject,
  ValidationIssue,
} from '@/domain/types';
import { GRAPH_SCHEMA_VERSION } from '@/domain/types';

export type JourneyNodeData = {
  node: JourneyNode;
  summary: SummaryPart[];
  issues: ValidationIssue[];
  readOnly: boolean;
  /** Convenience mirror of `node.meta` for custom node rendering. */
  meta?: JsonObject;
  /** Client-owned view state (`data.ui` in the DSL contract). */
  ui?: JsonObject;
};

export type JourneyFlowNode = Node<
  JourneyNodeData,
  'entry.static_list' | 'action.sms' | 'start' | 'split' | 'sendSms' | 'waitForEvent' | 'end'
>;

export type JourneyEdgeData = {
  sourcePort: string;
  labelKey: string;
  readOnly?: boolean;
  meta?: JsonObject;
};

export type JourneyFlowEdge = Edge<JourneyEdgeData, 'journey'>;

export interface EditorGraphContext {
  summaryFor: (node: JourneyNode) => SummaryPart[];
  issues: ValidationIssue[];
  readOnly: boolean;
  selectedNodeIds?: string[];
  selectedEdgeIds?: string[];
}

/**
 * Domain -> React Flow. Positions come from persisted layout; missing positions
 * fall back to a deterministic vertical stack (never persisted implicitly).
 */
export function toEditorGraph(
  draft: JourneyDraft,
  context: EditorGraphContext,
): { nodes: JourneyFlowNode[]; edges: JourneyFlowEdge[] } {
  const nodes: JourneyFlowNode[] = draft.nodes.map((node, index) => ({
    id: node.id,
    type: node.type,
    position: draft.layout[node.id] ?? { x: 320, y: 40 + index * 150 },
    data: {
      node,
      summary: context.summaryFor(node),
      issues: context.issues.filter((issue) => issue.nodeId === node.id),
      readOnly: context.readOnly,
      ...(node.meta ? { meta: node.meta } : {}),
      ...(node.ui ? { ui: node.ui } : {}),
    },
    draggable: !context.readOnly,
    connectable: !context.readOnly,
    deletable: !context.readOnly,
    selected: context.selectedNodeIds?.includes(node.id) ?? false,
  }));

  const edges: JourneyFlowEdge[] = draft.edges.map((edge) => ({
    id: edge.id,
    type: 'journey',
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourcePort,
    targetHandle: 'in',
    data: {
      sourcePort: edge.sourcePort,
      labelKey: portLabelKey(edge.sourcePort),
      readOnly: context.readOnly,
      ...(edge.meta ? { meta: edge.meta } : {}),
    },
    deletable: !context.readOnly,
    selectable: true,
    selected: context.selectedEdgeIds?.includes(edge.id) ?? false,
  }));

  return { nodes, edges };
}

function portLabelKey(port: string): string {
  if (port === 'next') return 'ports.next';
  if (port === 'success') return 'ports.success';
  if (port === 'event') return 'ports.event';
  if (port === 'timeout') return 'ports.timeout';
  return 'ports.in';
}

/**
 * React Flow -> domain. Strips selection, dragging, measured dimensions, and
 * component references. Only meaningful positions are persisted.
 */
export function toJourneyDraft(
  editorNodes: JourneyFlowNode[],
  editorEdges: JourneyFlowEdge[],
  metadata: { schemaVersion?: number; meta?: JsonObject } = {},
): JourneyDraft {
  const nodes = editorNodes.map((node) => node.data.node);
  const edges: JourneyEdge[] = editorEdges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourcePort: edge.data?.sourcePort ?? edge.sourceHandle ?? 'next',
    ...(edge.data?.meta ? { meta: edge.data.meta } : {}),
  }));
  const layout: JourneyDraft['layout'] = {};
  for (const node of editorNodes) {
    layout[node.id] = { x: node.position.x, y: node.position.y };
  }
  return {
    schemaVersion: metadata.schemaVersion ?? GRAPH_SCHEMA_VERSION,
    nodes,
    edges,
    layout,
    ...(metadata.meta ? { meta: metadata.meta } : {}),
  };
}
