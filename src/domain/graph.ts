import { NODE_REGISTRY, isNodeType } from './nodeRegistry';
import type { CatalogContext } from './nodeRegistry';
import type {
  IssueCode,
  JourneyDraft,
  JourneyEdge,
  JourneyNode,
  NodeType,
  ValidationIssue,
  ValidationResult,
} from './types';
import { GRAPH_SCHEMA_VERSION, MAX_EDGES, MAX_NODES, NODE_ID_PATTERN } from './types';

export function edgeId(source: string, sourcePort: string, target: string): string {
  return `${source}:${sourcePort}->${target}`;
}

export function makeEdge(source: string, sourcePort: string, target: string): JourneyEdge {
  return { id: edgeId(source, sourcePort, target), source, target, sourcePort };
}

export function outgoingEdges(draft: JourneyDraft, nodeId: string): JourneyEdge[] {
  return draft.edges.filter((edge) => edge.source === nodeId);
}

export function incomingEdges(draft: JourneyDraft, nodeId: string): JourneyEdge[] {
  return draft.edges.filter((edge) => edge.target === nodeId);
}

export function nodeById(draft: JourneyDraft, id: string): JourneyNode | undefined {
  return draft.nodes.find((node) => node.id === id);
}

export function nodesOfType<T extends NodeType>(
  draft: JourneyDraft,
  type: T,
): Extract<JourneyNode, { type: T }>[] {
  return draft.nodes.filter((node) => node.type === type) as Extract<JourneyNode, { type: T }>[];
}

export function adjacency(draft: JourneyDraft): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const node of draft.nodes) map.set(node.id, []);
  for (const edge of draft.edges) map.get(edge.source)?.push(edge.target);
  return map;
}

export function reachableFrom(draft: JourneyDraft, start: string): Set<string> {
  const adj = adjacency(draft);
  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const next of adj.get(current) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

/** Returns the ids of nodes that participate in a cycle, or an empty array. */
export function findCycleNodes(draft: JourneyDraft): string[] {
  const adj = adjacency(draft);
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const stack: string[] = [];
  const cycle = new Set<string>();

  for (const node of draft.nodes) color.set(node.id, WHITE);

  const visit = (id: string): void => {
    color.set(id, GRAY);
    stack.push(id);
    for (const next of adj.get(id) ?? []) {
      const c = color.get(next) ?? WHITE;
      if (c === GRAY) {
        const start = stack.indexOf(next);
        for (const member of stack.slice(start)) cycle.add(member);
      } else if (c === WHITE) {
        visit(next);
      }
    }
    stack.pop();
    color.set(id, BLACK);
  };

  for (const node of draft.nodes) {
    if ((color.get(node.id) ?? WHITE) === WHITE) visit(node.id);
  }
  return [...cycle];
}

export function wouldCreateCycle(draft: JourneyDraft, source: string, target: string): boolean {
  if (source === target) return true;
  // Adding source -> target creates a cycle iff source is reachable from target.
  return reachableFrom(draft, target).has(source);
}

export interface ConnectionCheck {
  allowed: boolean;
  code?: IssueCode;
  messageKey?: string;
}

/**
 * Interactive connection guard. This is a UX aid only — `validateGraph` remains
 * authoritative for loaded/imported documents and publication.
 */
export function checkConnection(
  draft: JourneyDraft,
  source: string,
  target: string,
  sourcePort: string,
): ConnectionCheck {
  const sourceNode = nodeById(draft, source);
  const targetNode = nodeById(draft, target);
  if (!sourceNode || !targetNode) {
    return { allowed: false, code: 'DANGLING_EDGE', messageKey: 'validation.danglingEdge' };
  }
  if (source === target) {
    return { allowed: false, code: 'SELF_CONNECTION', messageKey: 'validation.selfConnection' };
  }
  const sourceDef = NODE_REGISTRY[sourceNode.type];
  const targetDef = NODE_REGISTRY[targetNode.type];
  if (!sourceDef.outputPorts.some((port) => port.id === sourcePort)) {
    return { allowed: false, code: 'INVALID_HANDLE', messageKey: 'validation.invalidHandle' };
  }
  if (targetDef.inputPorts.length === 0) {
    return { allowed: false, code: 'INVALID_HANDLE', messageKey: 'validation.invalidHandle' };
  }
  if (draft.edges.some((edge) => edge.source === source && edge.sourcePort === sourcePort && edge.target === target)) {
    return { allowed: false, code: 'DUPLICATE_EDGE', messageKey: 'validation.duplicateEdge' };
  }
  if (draft.edges.some((edge) => edge.source === source && edge.sourcePort === sourcePort)) {
    return { allowed: false, code: 'OUTPUT_REQUIRED', messageKey: 'validation.tooManyOutputConnections' };
  }
  if (outgoingEdges(draft, source).length >= sourceDef.constraints.maxOutgoing) {
    return { allowed: false, code: 'BRANCHING', messageKey: 'validation.branching' };
  }
  if (incomingEdges(draft, target).length >= targetDef.constraints.maxIncoming) {
    return { allowed: false, code: 'MERGING', messageKey: 'validation.merging' };
  }
  if (wouldCreateCycle(draft, source, target)) {
    return { allowed: false, code: 'CYCLE_DETECTED', messageKey: 'validation.cycleDetected' };
  }
  return { allowed: true };
}

function issue(
  code: IssueCode,
  messageKey: string,
  extra: Partial<ValidationIssue> = {},
): ValidationIssue {
  return {
    code,
    severity: 'error',
    scope: 'graph',
    messageKey,
    ...extra,
  };
}

/**
 * Full graph + property validation. Used by the validation panel and before
 * publication. Drafts may be saved while this returns errors.
 */
export function validateGraph(draft: JourneyDraft, ctx: CatalogContext): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (draft.schemaVersion !== GRAPH_SCHEMA_VERSION) {
    issues.push(
      issue('SCHEMA_UNSUPPORTED', 'validation.schemaUnsupported', {
        params: { version: draft.schemaVersion },
      }),
    );
  }
  if (draft.nodes.length > MAX_NODES || draft.edges.length > MAX_EDGES) {
    issues.push(issue('GRAPH_TOO_LARGE', 'validation.graphTooLarge'));
  }

  const seenIds = new Set<string>();
  const validNodes = new Map<string, JourneyNode>();
  for (const node of draft.nodes) {
    if (!NODE_ID_PATTERN.test(node.id) || node.id.length > 64) {
      issues.push(
        issue('INVALID_NODE_ID', 'validation.invalidNodeId', { nodeId: node.id, params: { id: node.id } }),
      );
      continue;
    }
    if (seenIds.has(node.id)) {
      issues.push(
        issue('DUPLICATE_NODE_ID', 'validation.duplicateNodeId', {
          nodeId: node.id,
          params: { id: node.id },
        }),
      );
      continue;
    }
    seenIds.add(node.id);
    if (!isNodeType(node.type) || !NODE_REGISTRY[node.type]) {
      issues.push(
        issue('UNSUPPORTED_NODE_TYPE', 'validation.unsupportedNodeType', {
          nodeId: node.id,
          params: { type: String(node.type) },
        }),
      );
      continue;
    }
    validNodes.set(node.id, node);
    const def = NODE_REGISTRY[node.type];
    if (node.typeVersion !== def.version) {
      issues.push(
        issue('UNSUPPORTED_NODE_TYPE', 'validation.unsupportedNodeVersion', {
          nodeId: node.id,
          params: { type: node.type, version: node.typeVersion },
        }),
      );
    }
    issues.push(...def.validateShape(node));
  }

  const seenEdges = new Set<string>();
  for (const edge of draft.edges) {
    const source = validNodes.get(edge.source);
    const target = validNodes.get(edge.target);
    if (!source || !target) {
      issues.push(
        issue('DANGLING_EDGE', 'validation.danglingEdge', {
          edgeId: edge.id,
          params: { source: edge.source, target: edge.target },
        }),
      );
      continue;
    }
    if (edge.source === edge.target) {
      issues.push(
        issue('SELF_CONNECTION', 'validation.selfConnection', {
          nodeId: edge.source,
          edgeId: edge.id,
        }),
      );
      continue;
    }
    const sourceDef = NODE_REGISTRY[source.type];
    const targetDef = NODE_REGISTRY[target.type];
    if (!sourceDef.outputPorts.some((port) => port.id === edge.sourcePort)) {
      issues.push(
        issue('INVALID_HANDLE', 'validation.invalidHandle', {
          nodeId: edge.source,
          edgeId: edge.id,
          params: { port: edge.sourcePort },
        }),
      );
      continue;
    }
    if (targetDef.inputPorts.length === 0) {
      issues.push(
        issue('INVALID_HANDLE', 'validation.invalidHandle', {
          nodeId: edge.target,
          edgeId: edge.id,
          params: { port: 'in' },
        }),
      );
      continue;
    }
    const key = `${edge.source}|${edge.sourcePort}|${edge.target}`;
    if (seenEdges.has(key)) {
      issues.push(
        issue('DUPLICATE_EDGE', 'validation.duplicateEdge', {
          nodeId: edge.source,
          edgeId: edge.id,
        }),
      );
      continue;
    }
    seenEdges.add(key);
  }

  const entries = draft.nodes.filter(
    (node) => node.type === 'entry.static_list' || node.type === 'start',
  );
  const ends = draft.nodes.filter((node) => node.type === 'end');
  const smsNodes = draft.nodes.filter(
    (node) => node.type === 'action.sms' || node.type === 'sendSms',
  );

  if (entries.length === 0) {
    issues.push(issue('ENTRY_REQUIRED', 'validation.entryRequired'));
  } else if (entries.length > 1) {
    for (const entry of entries) {
      issues.push(
        issue('MULTIPLE_ENTRIES', 'validation.multipleEntries', { nodeId: entry.id }),
      );
    }
  }
  if (ends.length === 0) {
    issues.push(issue('END_REQUIRED', 'validation.endRequired'));
  }
  if (smsNodes.length === 0) {
    issues.push(issue('SMS_REQUIRED', 'validation.smsRequired'));
  }

  for (const node of draft.nodes) {
    const incoming = incomingEdges(draft, node.id).length;
    const outgoing = outgoingEdges(draft, node.id).length;
    if (node.type === 'entry.static_list') {
      if (incoming > 0) {
        issues.push(issue('ENTRY_HAS_INCOMING', 'validation.entryHasIncoming', { nodeId: node.id }));
      }
      if (outgoing === 0) {
        issues.push(issue('ENTRY_OUTPUT_REQUIRED', 'validation.entryOutputRequired', { nodeId: node.id }));
      } else if (outgoing > 1) {
        issues.push(issue('BRANCHING', 'validation.branching', { nodeId: node.id }));
      }
    } else if (node.type === 'action.sms') {
      if (incoming === 0) {
        issues.push(issue('SMS_INPUT_REQUIRED', 'validation.smsInputRequired', { nodeId: node.id }));
      } else if (incoming > 1) {
        issues.push(issue('MERGING', 'validation.merging', { nodeId: node.id }));
      }
      if (outgoing === 0) {
        issues.push(issue('SMS_OUTPUT_REQUIRED', 'validation.smsOutputRequired', { nodeId: node.id }));
      } else if (outgoing > 1) {
        issues.push(issue('BRANCHING', 'validation.branching', { nodeId: node.id }));
      }
    } else if (node.type === 'start') {
      if (incoming > 0) {
        issues.push(issue('ENTRY_HAS_INCOMING', 'validation.entryHasIncoming', { nodeId: node.id }));
      }
      if (outgoing === 0) {
        issues.push(issue('ENTRY_OUTPUT_REQUIRED', 'validation.entryOutputRequired', { nodeId: node.id }));
      }
      if (outgoing > 1) {
        issues.push(issue('BRANCHING', 'validation.branching', { nodeId: node.id }));
      }
    } else if (node.type === 'split' || node.type === 'sendSms' || node.type === 'waitForEvent') {
      const definition = NODE_REGISTRY[node.type];
      if (definition.inputPorts.some((port) => port.required) && incoming === 0) {
        issues.push(issue('INPUT_REQUIRED', 'validation.inputRequired', { nodeId: node.id }));
      }
      if (incoming > definition.constraints.maxIncoming) {
        issues.push(issue('MERGING', 'validation.merging', { nodeId: node.id }));
      }
      for (const port of definition.outputPorts.filter((item) => item.required)) {
        const count = draft.edges.filter(
          (edge) => edge.source === node.id && edge.sourcePort === port.id,
        ).length;
        if (count === 0) {
          issues.push(
            issue('OUTPUT_REQUIRED', 'validation.outputRequired', {
              nodeId: node.id,
              field: `ports.${port.id}`,
              params: { port: port.id },
            }),
          );
        } else if (count > 1) {
          issues.push(
            issue('TOO_MANY_OUTPUT_CONNECTIONS', 'validation.tooManyOutputConnections', {
              nodeId: node.id,
              field: `ports.${port.id}`,
              params: { port: port.id },
            }),
          );
        }
      }
      if (outgoing > definition.constraints.maxOutgoing) {
        issues.push(issue('BRANCHING', 'validation.branching', { nodeId: node.id }));
      }
    } else if (node.type === 'end') {
      if (incoming === 0) {
        issues.push(issue('END_INPUT_REQUIRED', 'validation.endInputRequired', { nodeId: node.id }));
      } else if (incoming > 1) {
        issues.push(issue('MERGING', 'validation.merging', { nodeId: node.id }));
      }
      if (outgoing > 0) {
        issues.push(issue('END_HAS_OUTGOING', 'validation.endHasOutgoing', { nodeId: node.id }));
      }
    }
  }

  for (const nodeId of findCycleNodes(draft)) {
    issues.push(issue('CYCLE_DETECTED', 'validation.cycleDetected', { nodeId }));
  }

  if (entries.length === 1) {
    const reachable = reachableFrom(draft, entries[0].id);
    for (const node of draft.nodes) {
      if (!reachable.has(node.id)) {
        issues.push(issue('DISCONNECTED_NODE', 'validation.disconnectedNode', { nodeId: node.id }));
      }
    }
    const reverse = new Map<string, string[]>();
    for (const node of draft.nodes) reverse.set(node.id, []);
    for (const edge of draft.edges) reverse.get(edge.target)?.push(edge.source);
    const canReachEnd = new Set<string>();
    for (const end of ends) {
      const queue = [end.id];
      canReachEnd.add(end.id);
      while (queue.length > 0) {
        const current = queue.shift() as string;
        for (const prev of reverse.get(current) ?? []) {
          if (!canReachEnd.has(prev)) {
            canReachEnd.add(prev);
            queue.push(prev);
          }
        }
      }
    }
    for (const node of draft.nodes) {
      if (ends.length > 0 && reachable.has(node.id) && !canReachEnd.has(node.id)) {
        issues.push(issue('UNREACHABLE_END', 'validation.unreachableEnd', { nodeId: node.id }));
      }
    }
    if (ends.length > 0 && !ends.some((end) => reachable.has(end.id))) {
      issues.push(issue('UNREACHABLE_END', 'validation.endUnreachable'));
    }
  }

  for (const node of draft.nodes) {
    if (!isNodeType(node.type) || !NODE_REGISTRY[node.type]) continue;
    issues.push(...NODE_REGISTRY[node.type].validateConfig(node, ctx));
  }

  const errors = issues.filter((item) => item.severity === 'error');
  const warnings = issues.filter((item) => item.severity === 'warning');
  return { valid: errors.length === 0, issues, errors, warnings };
}
