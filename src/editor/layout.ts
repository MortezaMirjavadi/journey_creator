import dagre from '@dagrejs/dagre';
import type { JourneyDraft, GraphPosition } from '@/domain/types';

export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 92;

export function nextFreePosition(draft: JourneyDraft): GraphPosition {
  const positions = Object.values(draft.layout);
  if (positions.length === 0) return { x: 320, y: 40 };
  return { x: 320, y: Math.max(...positions.map((position) => position.y)) + 150 };
}

/** Deterministic top-to-bottom layout. Only runs on explicit user action. */
export function computeAutoLayout(draft: JourneyDraft): Record<string, GraphPosition> {
  if (draft.nodes.length === 0) return {};
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: 'TB', nodesep: 64, ranksep: 96, marginx: 24, marginy: 24 });

  for (const node of draft.nodes) {
    graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of draft.edges) {
    if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
      graph.setEdge(edge.source, edge.target);
    }
  }
  dagre.layout(graph);

  const positions: Record<string, GraphPosition> = {};
  for (const node of draft.nodes) {
    const laidOut = graph.node(node.id) as { x: number; y: number } | undefined;
    if (laidOut) {
      positions[node.id] = {
        x: Math.round(laidOut.x - NODE_WIDTH / 2),
        y: Math.round(laidOut.y - NODE_HEIGHT / 2),
      };
    }
  }
  return positions;
}
