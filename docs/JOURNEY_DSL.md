# journey-dsl-1.0 — React-Flow-native contract

This is the contract to share with backend teams. It is intentionally shaped like
React Flow: every node has `id`, `type`, `position`, and `data`; every edge has
`source`/`target`; the optional `viewport` maps directly to React Flow.

The difference from generic React Flow JSON is one addition: **business fields
live in `node.meta`**, while `node.data` is reserved for React Flow/client data
(currently `data.ui`).

```json
{
  "id": "start",
  "type": "start",
  "position": { "x": 0, "y": 120 },
  "data": { "ui": { "collapsed": false } },
  "meta": { "label": "Start: Manual pilot", "mode": "manual" }
}
```

- `meta` — business configuration; **backend-owned**, validated.
- `data.ui` — client view state (collapsed, etc.); **frontend-owned**, ignorable
  by the backend.
- `position` — canvas coordinates; frontend-owned layout data.

The editor also accepts two older variants (`data.meta` and flat `data`) for
backward compatibility, but new documents should use the shape above.

---

## 1. Envelope

```ts
interface JourneyDslDocument {
  $schema: 'https://marco.snapp.ir/schemas/journey-dsl-1.0.json';
  dslVersion: '1.0';
  journey: {
    id: string;
    name: string;
    workspace: string;
    version: number;
    status: 'draft' | 'published';
  };
  nodes: JourneyDslNode[];
  edges: JourneyDslEdge[];
  viewport?: { x: number; y: number; zoom: number };
}

interface JourneyDslNode {
  id: string;
  type: JourneyNodeType;
  position: { x: number; y: number };
  data: { ui?: Record<string, unknown> };
  meta: Record<string, unknown>; // type-specific, see below
}

interface JourneyDslEdge {
  id: string;
  source: string;
  target: string;
  type: 'smoothstep';
  label?: string;          // display label, e.g. "Event" / "Timeout"
  data: {
    outcome: string;       // source port id
    meta?: Record<string, unknown>;
  };
}
```

`viewport` is not persisted by the editor; it is returned by the importer and
can be passed to React Flow as `defaultViewport`.

---

## 2. Node types and `meta`

| `type` | `meta` | Outputs |
| --- | --- | --- |
| `start` | `{ label, mode: 'manual' \| 'event' }` | `next` |
| `split` | `{ label, controlPercentage: number }` | `next` |
| `sendSms` | `{ label, channel: 'sms', body: string, expiryHours: number }` | `next` |
| `waitForEvent` | `{ label, event: { sourceName, venture }, maxWait: { value, unit: 'hours' \| 'days' } }` | `event`, `timeout` |
| `end` | `{ label, result?: 'successful' \| 'notSuccessful', note?: string }` | — |

All nodes accept an optional `meta` object; unknown keys are rejected by the
editor's strict parser unless preserved in `meta.dslData` by the importer.
`label` is optional; it defaults to the node type name.

`split` currently has a single `next` output. `controlPercentage` is authoring
metadata; add explicit `treatment`/`control` outputs if the DSL grows.

---

## 3. Edge outcomes

`data.outcome` is the **source output port id**:

| Source type | Valid outcomes |
| --- | --- |
| `start`, `split`, `sendSms` | `next` |
| `waitForEvent` | `event`, `timeout` |
| `end` | none (no outgoing edges) |

Each required output port must have exactly one outgoing edge. Branching is
allowed only across different ports (e.g. `event` and `timeout`). Each node input
accepts at most one incoming edge.

---

## 4. Graph rules

- Exactly one entry node (`start`).
- At least one `end`; multiple ends are allowed.
- At least one SMS node (`sendSms`).
- All nodes reachable from the entry.
- Every path must be able to reach an end.
- No cycles, self-connections, duplicate edges, dangling references, or invalid
  handles.
- Required output ports must be connected exactly once.
- `end` has no outputs; entries have no inputs.

Stable error codes: `ENTRY_REQUIRED`, `MULTIPLE_ENTRIES`, `END_REQUIRED`,
`INPUT_REQUIRED`, `OUTPUT_REQUIRED`, `TOO_MANY_OUTPUT_CONNECTIONS`,
`BRANCHING`, `MERGING`, `CYCLE_DETECTED`, `DISCONNECTED_NODE`,
`UNREACHABLE_END`, `DANGLING_EDGE`, `INVALID_HANDLE`, `DUPLICATE_EDGE`,
`UNSUPPORTED_NODE_TYPE`, `UNSUPPORTED_NODE_VERSION`, `SMS_REQUIRED`,
`INVALID_CONFIG`, `SCHEMA_UNSUPPORTED`.

The backend remains authoritative; the frontend runs the same rules before
publish.

---

## 5. Frontend usage

```ts
import { parseJourneyDsl, toJourneyDsl } from '@/domain/journeyDsl';

const parsed = parseJourneyDsl(jsonFromBackend);
if (!parsed.ok) {
  console.error(parsed.issues); // codes + messages, never silently dropped
} else {
  // parsed.draft is the editor's JourneyDraft
  // parsed.viewport -> <ReactFlow defaultViewport={...} />
}

const jsonForBackend = toJourneyDsl(parsed.draft, {
  journey: {
    id: 'jrny_pro_retention',
    name: 'Pro retention',
    workspace: 'passenger_production',
    version: 1,
    status: 'draft',
  },
  viewport: parsed.viewport,
});
```

`toJourneyDsl()` emits exactly the React-Flow-native shape above:

- `meta` = node config (flattened) plus any preserved extra metadata.
- `data.ui` = client view state.
- `edges[].data.outcome` = source port.
- `edges[].label` = display label.
- top-level `journey`, `$schema`, `dslVersion`, and optional `viewport`.

Round-trip is covered by `src/domain/__tests__/external-dsl.test.ts`.

### Import / Export in the UI

The builder header → **Examples** menu contains:

- **Import journey JSON** — paste either this DSL envelope or an editor
  `JourneyDraft`. The document is parsed strictly and opened in an isolated
  sandbox (`?scenario=imported`); the real draft is never overwritten.
- **Export journey JSON** — renders the current document with `toJourneyDsl()`,
  including `node.meta`, `node.data.ui`, edges with `data.outcome`, `journey`,
  and the live viewport. Copy or download the `.json`.

This gives backend teams a direct, round-trippable handoff from the UI.

---

## 6. Sample journey in the UI

The exact document in this contract is shipped as a scenario:

```
/workspaces/ws_passenger_production/journeys/journey_pp_reactivation/demo?scenario=pro-retention
```

It renders Start → Split → inline SMS → Wait(event/timeout) → two End nodes,
with 6 nodes and 5 edges and no validation errors. The raw sample lives in
`src/demo/proRetentionDsl.ts`.

---

## 7. Backend integration notes

- Store/publish the envelope as-is, or map it to your own persistence schema; the
  frontend only requires the shape above.
- Treat `data.ui` as opaque frontend state. It can be dropped without affecting
  execution.
- Validate `meta` per node type on the server and reject unknown fields, matching
  the table above.
- Keep `dslVersion` immutable; introduce `1.1` for breaking changes and let the
  frontend reject unknown versions with `DSL_VERSION_UNSUPPORTED`.
- `position`/`viewport` are layout hints, not execution data.
- Publication is a snapshot of this document; it does not imply activation.
- The current `marco_event` API still exposes `schemaVersion`/`config` graphs.
  This contract requires a backend adapter or a new DSL endpoint; the frontend
  mock/sandbox path supports it today.
