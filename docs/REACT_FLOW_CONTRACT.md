# React Flow contract

This app does **not** hand business JSON directly to React Flow. There are two
distinct shapes:

1. **`JourneyDraft`** — the persisted business document (also the backend graph
   envelope). This is what you save/load/validate.
2. **`JourneyFlowNode[]` / `JourneyFlowEdge[]`** — the React Flow view model.
   It is derived from the draft by `toEditorGraph()` and is never persisted.

The only supported bridge is `src/journey/flowAdapter.ts`:

```ts
toEditorGraph(draft: JourneyDraft, context: EditorGraphContext)
  : { nodes: JourneyFlowNode[]; edges: JourneyFlowEdge[] }

toJourneyDraft(
  nodes: JourneyFlowNode[],
  edges: JourneyFlowEdge[],
  metadata?: { schemaVersion?: number; meta?: JsonObject },
) : JourneyDraft
```

---

## 1. Input JSON: `JourneyDraft`

```json
{
  "schemaVersion": 1,
  "meta": { "campaign": "q4", "owner": "growth" },
  "nodes": [
    {
      "id": "entry_1",
      "type": "entry.static_list",
      "typeVersion": 1,
      "config": { "label": "", "listId": "list_ps_all" },
      "meta": { "source": "csv" }
    },
    {
      "id": "sms_1",
      "type": "action.sms",
      "typeVersion": 1,
      "config": {
        "label": "",
        "templateVersionId": "tplv_ps_welcome_1",
        "variableMappings": {
          "firstName": { "kind": "contact", "field": "firstName" }
        }
      },
      "meta": { "priority": "high" }
    },
    {
      "id": "end_1",
      "type": "end",
      "typeVersion": 1,
      "config": { "label": "", "note": "" }
    }
  ],
  "edges": [
    {
      "id": "entry_1:next->sms_1",
      "source": "entry_1",
      "target": "sms_1",
      "sourcePort": "next",
      "meta": { "primary": true }
    },
    { "id": "sms_1:success->end_1", "source": "sms_1", "target": "end_1", "sourcePort": "success" }
  ],
  "layout": {
    "entry_1": { "x": 320, "y": 40 },
    "sms_1": { "x": 320, "y": 190 },
    "end_1": { "x": 320, "y": 340 }
  }
}
```

### Node configs

| `type` | `typeVersion` | `config` |
| --- | --- | --- |
| `entry.static_list` | `1` | `{ label: string, listId: string }` |
| `action.sms` | `1` | `{ label: string, templateVersionId: string, variableMappings: Record<string, {kind:'contact',field:'firstName'\|'lastName'\|'phone'\|'email'} \| {kind:'literal',value:string}> }` |
| `start` | `1` | `{ label: string, mode: 'manual' \| 'event' }` |
| `split` | `1` | `{ label: string, controlPercentage: number }` |
| `sendSms` | `1` | `{ label: string, channel: 'sms', body: string, expiryHours: number }` |
| `waitForEvent` | `1` | `{ label: string, event: { sourceName: string, venture: string }, maxWait: { value: number, unit: 'hours' \| 'days' } }` |
| `end` | `1` | `{ label: string, note: string, result?: 'successful' \| 'notSuccessful' }` |

### Edge

`sourcePort` is the **source output handle id**:

- `entry.static_list` → `next`
- `action.sms` → `success`
- `start` → `next`
- `split` → `next`
- `sendSms` → `next`
- `waitForEvent` → `event` or `timeout`
- `end` → no outputs

`id` is optional when parsing raw backend data; `parseDraft()` derives it as
`${source}:${sourcePort}->${target}`. `JourneyEdge` in the app always carries it.

`layout` is `Record<nodeId, {x:number,y:number}>`. Missing positions fall back to
`{ x: 320, y: 40 + index * 150 }` for display.

### `meta`

`meta` is an optional JSON object on each node, each edge, and the document:

```ts
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

node.meta?:   JsonObject
edge.meta?:   JsonObject
draft.meta?:  JsonObject
```

Rules:

- Plain JSON only: no functions, `undefined`, `Date`, `Map`, `NaN`, `Infinity`, or cycles.
- Max **4096 bytes** per `meta` object.
- Empty objects are normalized away (`{}` is treated as absent).
- Preserved by `parseDraft`, `toJourneyDraft`, the mock adapter, undo/redo,
  dirty tracking, save, and reload.
- Editable in the inspector: node metadata, connection metadata, and journey
  metadata (when nothing is selected).
- The current `marco_event` backend rejects `meta`; HTTP save fails with
  `BACKEND_UNSUPPORTED_FIELDS` instead of dropping it.

Unknown fields are rejected loudly by `parseDraft`:

| Location | Error code |
| --- | --- |
| document top level | `UNSUPPORTED_DOCUMENT_FIELD` |
| node | `UNSUPPORTED_NODE_FIELD` |
| edge | `UNSUPPORTED_EDGE_FIELD` |
| layout position | `UNSUPPORTED_LAYOUT_FIELD` |
| `config` | `UNSUPPORTED_CONFIG_FIELD` |
| invalid meta | `META_INVALID` |
| oversized meta | `META_TOO_LARGE` |

---

## 2. Output JSON: what React Flow receives

```json
{
  "nodes": [    {
      "id": "entry_1",
      "type": "entry.static_list",
      "position": { "x": 320, "y": 40 },
      "data": {
        "node": {
          "id": "entry_1",
          "type": "entry.static_list",
          "typeVersion": 1,
          "config": { "label": "", "listId": "list_ps_all" }
        },
        "summary": [
          { "key": "summary.listName", "params": { "name": "All passengers" } },
          { "key": "summary.memberCount", "params": { "count": 1240 }, "tone": "muted" }
        ],
        "issues": [],
        "readOnly": false,
        "meta": { "source": "csv" }
      },
      "draggable": true,
      "connectable": true,
      "deletable": true,
      "selected": false
    }
  ],
  "edges": [
    {
      "id": "entry_1:next->sms_1",
      "type": "journey",
      "source": "entry_1",
      "target": "sms_1",
      "sourceHandle": "next",
      "targetHandle": "in",
      "data": {
        "sourcePort": "next",
        "labelKey": "ports.next",
        "readOnly": false,
        "meta": { "primary": true }
      },
      "deletable": true,
      "selectable": true,
      "selected": false
    }
  ]
}
```

React Flow adds `measured`, `dragging`, `width`, `height`, etc. at runtime. Those
are **not** part of this contract and are never persisted.

### TypeScript types

```ts
type JourneyNodeData = {
  node: JourneyNode;              // the domain node, unchanged (includes meta)
  summary: SummaryPart[];         // derived i18n keys + params for the card
  issues: ValidationIssue[];      // validation issues for this node
  readOnly: boolean;
  meta?: JsonObject;              // mirror of node.meta for custom rendering
};

type JourneyFlowNode = Node<
  JourneyNodeData,
  'entry.static_list' | 'action.sms' | 'end'
>;

type JourneyEdgeData = {
  sourcePort: string;
  labelKey: string;
  readOnly?: boolean;
  meta?: JsonObject;
};

type JourneyFlowEdge = Edge<JourneyEdgeData, 'journey'>;
```

`node.type` must match one of the `nodeTypes` keys in `src/journey/nodes.tsx`.
Edges must use `type: 'journey'` to get the ENGAGE edge component.

---

## 3. Convert and render

### 3.1 Inside the app (recommended)

Feed the JSON into the editor session, which parses/validates and owns all
mutations:

```ts
import { SandboxJourneyApi } from '@/demo/sandboxApi';
import { EditorSession } from '@/editor/session';

const api = new SandboxJourneyApi('ws_passenger_staging', 'sandbox_custom', {
  definition: myJourneyDraftJson,
});
const session = new EditorSession({
  api,
  workspaceId: 'ws_passenger_staging',
  journeyId: 'sandbox_custom',
  sandbox: true,
});
await session.load();
```

Wrap `<Canvas />` (and the rest of the builder) in `<EditorProvider session={session}>`.
The Canvas internally calls `toEditorGraph(state.draft, …)` and passes the arrays
to `<ReactFlow>`.

> Do not mutate `session.getState().draft` directly. Use session methods
> (`addNode`, `connect`, `updateNodeConfig`, `moveNodes`, …) so history, dirty
> tracking, autosave, and validation stay consistent.

### 3.2 Standalone React Flow

```tsx
import { ReactFlow, ReactFlowProvider, Background } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { toEditorGraph } from '@/journey/flowAdapter';
import { nodeTypes } from '@/journey/nodes';
import { edgeTypes } from '@/journey/edges';
import { NODE_REGISTRY } from '@/domain/nodeRegistry';
import { MOCK_LISTS, MOCK_TEMPLATES } from '@/api/mockData';

const catalog = {
  workspaceId: 'ws_passenger_staging',
  lists: MOCK_LISTS,
  templates: MOCK_TEMPLATES,
  catalogsReady: true,
};

const { nodes, edges } = toEditorGraph(myJourneyDraftJson, {
  summaryFor: (node) => NODE_REGISTRY[node.type].summary(node, catalog),
  issues: [],
  readOnly: false,
});

<ReactFlowProvider>
  <div style={{ height: 700 }}>
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView>
      <Background />
    </ReactFlow>
  </div>
</ReactFlowProvider>
```

Caveat: the custom edge component (`JourneyEdge`) calls `useEditorSession()` for
its × remove control, and the node card expects `data.node`. For a truly
read-only standalone viewer, either wrap the tree in `EditorProvider`, or use a
built-in edge type (`smoothstep`) instead of `edgeTypes`.

### 3.3 Direct raw React Flow JSON

You *can* pass raw arrays to `<ReactFlow>`:

```tsx
<ReactFlow nodes={rawNodes} edges={rawEdges} nodeTypes={nodeTypes} />
```

but every node must already have `data.node`, `data.summary`, `data.issues`,
and `data.readOnly`, because the custom node component reads them. Edge objects
must have `data.sourcePort`. This is why the adapter exists — prefer
`toEditorGraph()`.

---

## 4. Handles and connections

| Domain node | Input handle | Output handle(s) |
| --- | --- | --- |
| `entry.static_list` | none | `next` |
| `action.sms` | `in` | `success` |
| `start` | none | `next` |
| `split` | `in` | `next` |
| `sendSms` | `in` | `next` |
| `waitForEvent` | `in` | `event`, `timeout` |
| `end` | `in` | none |

- `JourneyFlowEdge.sourceHandle` = `JourneyEdge.sourcePort`.
- `JourneyFlowEdge.targetHandle` = `'in'` for every target.
- Required output ports may have exactly one connection each. Branching is
  allowed only across distinct ports (`waitForEvent.event` / `.timeout`).
- `isValidConnection` uses `checkConnection(draft, source, target, port)` before
  React Flow accepts a connection. It blocks self-links, invalid handles,
  duplicates, reusing a port, merging, and cycles.
- Full graph validation (`validateGraph`) still runs for loaded/imported JSON and
  before publish; interactive prevention is not authoritative.

---

## 5. What is and is not persisted

**Persisted (in `JourneyDraft`):** nodes/configs, node/edge/draft `meta`, edges +
source ports, node positions (`layout`).

**Not persisted:** React Flow `selected`, `dragging`, `measured`, `width`,
`height`, `positionAbsolute`, viewport (`zoom`/`pan`), component references, and
derived `data.summary` / `data.issues`.

`toJourneyDraft()` strips all React Flow internals and rebuilds only
`{ schemaVersion, nodes, edges, layout }`.

Selection and viewport changes never mark the draft dirty or enter undo history.
Node movement is committed on drag stop and does.

---

## 6. Edge ids

Deterministic and stable:

```ts
edgeId = `${source}:${sourcePort}->${target}`
// entry_1:next->sms_1
// sms_1:success->end_1
```

If your input JSON omits `id`, `parseDraft()` derives it. If you pass JSON
straight to `toEditorGraph`, include `id` because `JourneyEdge` requires it.

---

## 7. journey-dsl-1.0 importer

`src/domain/journeyDsl.ts` accepts the external envelope and converts it:

```ts
const result = parseJourneyDsl(rawDsl);
if (!result.ok) throw new Error(result.issues.map((i) => i.message).join('\n'));
const { draft, viewport } = result;
```

| DSL | JourneyDraft |
| --- | --- |
| `dslVersion: "1.0"` | validated; stored in `draft.meta.dslVersion` |
| `journey` | stored in `draft.meta.journey` |
| `$schema` | stored in `draft.meta.schema` |
| `nodes[].position` | `layout[nodeId]` |
| `nodes[].meta` | per-type `config`; unknown keys preserved in `node.meta.dslData` |
| `nodes[].data.ui` | `node.ui` (client-owned view state) |
| `edges[].data.outcome` | `sourcePort` (`next`, `event`, `timeout`) |
| `edges[].label` | `edge.meta.label` |
| `viewport` | returned separately (React Flow `defaultViewport`; not persisted) |

The importer also accepts `data.meta` and flat `data` variants for backwards
compatibility. `toJourneyDsl(draft, { journey, viewport })` exports the
React-Flow-native shape with top-level `meta` and `data.ui`.

Supported DSL node types: `start`, `split`, `sendSms`, `waitForEvent`, `end`.
The converted draft is run through `parseDraft()` before being returned, so it
still obeys the strict node/config/meta contract.

The sample is available in `src/demo/proRetentionDsl.ts` and the
`pro-retention` scenario, and is covered by `src/domain/__tests__/external-dsl.test.ts`.
