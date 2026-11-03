# Journey Builder — developer documentation

This document covers how to run the builder, extend the node registry, the
draft/editor data contract, supported graph rules, mocked integrations, the
implemented state matrix, and known limitations.

---

## 1. Running the page

```bash
pnpm install
pnpm dev
```

- `/` — workspace/journey directory.
- `/workspaces/ws_passenger_staging/journeys/journey_ps_onboarding` — editable mock draft.
- Add `/demo?scenario=<id>` to any builder URL for the isolated sandbox.
- `ws_driver_production` is intentionally `VIEWER` to demonstrate permission-based read-only mode.

Environment (`.env`, all optional):

```bash
VITE_MARCO_API_MODE=mock      # mock | http
VITE_MARCO_API_BASE=/api
VITE_MARCO_USER_ID=user_demo  # sent as x-user-id in http mode
```

In `http` mode Vite proxies `/api` to `http://localhost:3000`
(`VITE_PROXY_TARGET` overrides the proxy target).

---

## 2. Scenario gallery

The **Examples** menu in the header lists all 15 scenarios with their expected
result. Selecting one navigates to:

```
/workspaces/:workspaceId/journeys/:journeyId/demo?scenario=<scenarioId>
```

The demo route constructs a `SandboxJourneyApi` (in-memory) from
`src/demo/scenarios.ts`. It never touches the persisted mock journeys in
`localStorage`. Leaving a dirty sandbox prompts for confirmation.

The sandbox banner opens **Demo controls**, which can inject:

- latency;
- `failNextSave`, `conflictNextSave`, `failNextPublish`;
- catalog failure / empty catalogs;
- page load failure (`not_found`, `forbidden`, `network`);
- unsupported document response;
- reload of the current scenario.

Scenarios (`src/demo/scenarios.ts`):

| id | Purpose | Publishable |
| --- | --- | --- |
| `empty` | Empty draft / getting started | no |
| `minimal-valid` | Entry → SMS → End | yes |
| `multiple-sms` | Entry → SMS → SMS → End (no wait nodes) | yes |
| `pro-retention` | journey-dsl-1.0: Start → Split → inline SMS → Wait(event/timeout) → two Ends | yes |
| `unconfigured-sms` | Missing template | no |
| `missing-mapping` | Required variable unmapped | no |
| `empty-audience` | Empty list warning | yes (warning only) |
| `missing-end` | Incomplete path | no |
| `disconnected` | Orphan SMS node | no |
| `cycle` | Loaded invalid cycle | no |
| `multiple-entries` | Two Entry nodes merge | no |
| `branching-merging` | Branch + merge | no |
| `unavailable-refs` | Deleted list + foreign template | no |
| `published-readonly` | Published snapshot, read-only | already published |
| `unsupported` | schemaVersion 2 + `action.push` | no |

Fixture expectations are executable tests in
`src/demo/__tests__/scenarios.test.ts`.

---

## 3. Architecture

### Design system: web-engage

The presentation layer mirrors the existing Marco **web-engage** frontend
(`../marco_event/frontend/src/styles.css` and `components/Layout.tsx`):

- Arial typography, `#f5f8fc` page background, navy `#193955` ENGAGE side
  navigation, fixed 64px white topbar, `#3478d5` primary actions.
- The builder reproduces the ENGAGE layout: `.builder-top` toolbar, 190px
  palette, flexible canvas, 330px inspector.
- Node cards are 220×92 ENGAGE blocks with a 3px category top border, circular
  glyph icons, uppercase type eyebrow, summary line, node id, and top/bottom
  connector circles. React Flow supplies drag/connect/zoom mechanics under the
  same visual language.
- The inspector combines node properties and validation in one scrolling column,
  matching ENGAGE's `.node-inspector` / `.inspector-fields` / `.error-list`.
- Styles live in `src/engage.css`; Tailwind was removed to avoid a competing
  design system.

```
src/
  api/            JourneyApi interface, mock adapter, HTTP adapter, mock catalogs
  components/     ENGAGE UI primitives + Layout/topbar/nav
  demo/           IDs, fixtures, scenarios, sandbox adapter
  domain/         Journey contract, node registry, validator, serialization, SMS
  editor/         Framework-agnostic EditorSession + history + editor types
  i18n/           English + Persian resources (RTL)
  journey/        React Flow canvas, nodes/edges, palette, panels, header
  pages/          Landing, builder page shell, page states
```

Key boundaries:

- **Domain data is never React Flow state.** `JourneyDraft` stores semantic
  nodes/edges plus layout only. React Flow `selected`, `dragging`, measured
  dimensions and component references are never persisted.
- **`EditorSession`** (`src/editor/session.ts`) owns document state, dirty
  tracking, undo/redo, autosave, concurrency and publish state. React binds to it
  via `useSyncExternalStore`; tests drive it directly.
- **Node type switches are centralized** in `src/domain/nodeRegistry.ts` and the
  adapter/UI maps. Palette, canvas, properties and validation all read the
  registry.

---

## 4. Draft/editor data contract

Mirrors the backend envelope (`../marco_event/src/journeys/graph/types.ts`):

```ts
interface JourneyDraft {
  schemaVersion: 1;
  nodes: JourneyNode[];   // discriminated union
  edges: JourneyEdge[];   // explicit source port
  layout: Record<string, { x: number; y: number }>;
  meta?: JsonObject;      // journey-level metadata
}

type JourneyNode =
  | { id; type: 'entry.static_list'; typeVersion: 1; config: { label; listId }; meta?: JsonObject }
  | { id; type: 'action.sms'; typeVersion: 1;
      config: { label; templateVersionId; variableMappings: Record<string, VariableSource> };
      meta?: JsonObject }
  | { id; type: 'start'; typeVersion: 1; config: { label; mode: 'manual' | 'event' }; meta?: JsonObject }
  | { id; type: 'split'; typeVersion: 1; config: { label; controlPercentage }; meta?: JsonObject }
  | { id; type: 'sendSms'; typeVersion: 1;
      config: { label; channel: 'sms'; body; expiryHours }; meta?: JsonObject }
  | { id; type: 'waitForEvent'; typeVersion: 1;
      config: { label; event: { sourceName; venture }; maxWait: { value; unit: 'hours' | 'days' } };
      meta?: JsonObject }
  | { id; type: 'end'; typeVersion: 1; config: { label; note; result?: 'successful' | 'notSuccessful' };
      meta?: JsonObject };

interface JourneyEdge { id; source; target; sourcePort; meta?: JsonObject }
```

Ports:

| Type | Inputs | Outputs |
| --- | --- | --- |
| `entry.static_list` | — | `next` |
| `action.sms` | `in` | `success` |
| `start` | — | `next` |
| `split` | `in` | `next` |
| `sendSms` | `in` | `next` |
| `waitForEvent` | `in` | `event`, `timeout` |
| `end` | `in` | — |

- `JourneyEdge.id` is editor-only and derived as `source:port->target`; it is
  stripped by `toBackendGraph`.
- `variableMappings` values are either `{ kind: 'contact', field }` or
  `{ kind: 'literal', value }`.
- `meta` is optional JSON (max 4 KB) on nodes, edges, and the draft. It is
  preserved by parse/serialize/undo/save and editable in the inspector
  (node, connection, and journey metadata). Unknown fields are rejected with
  `UNSUPPORTED_*_FIELD`; non-JSON or oversized metadata fails with
  `META_INVALID` / `META_TOO_LARGE`.
- Selection and viewport are not part of the document and do not mark it dirty.
  Node positions are part of the document and are undoable/dirty.
- `draftFingerprint` (stable stringify of name + draft) drives dirty tracking.

Adapters:

| Function | Location | Purpose |
| --- | --- | --- |
| `toEditorGraph(draft, ctx)` | `src/journey/flowAdapter.ts` | domain → RF nodes/edges with summaries/issues |
| `toJourneyDraft(nodes, edges, { meta })` | same | RF → domain, strips RF internals, restores journey meta |
| `parseDraft(raw)` | `src/domain/serialization.ts` | strict load; unsupported data produces issues, never silent drops |
| `parseJourneyDsl(raw)` | `src/domain/journeyDsl.ts` | converts journey-dsl-1.0 (`start`/`split`/`sendSms`/`waitForEvent`) into `JourneyDraft` |
| `toBackendGraph(draft)` | same | backend-compatible graph + `unsupportedFields` |
| `buildCatalogContext(state)` | `src/editor/session.ts` | catalog readiness + foreign-reference sets |

Round-trip serialization is covered by tests.

### Backend compatibility note

The current `marco_event` node schemas use `additionalProperties: false` and only
know `listId` / `templateVersionId`. The editor adds `label`, `variableMappings`,
end `note`, and `meta` on nodes/edges/the draft. The HTTP adapter detects these
fields and **fails with `BACKEND_UNSUPPORTED_FIELDS`** rather than stripping them.
Until the backend schema is extended, use mock mode for full authoring. This is
an intentional, loud incompatibility.

---

## 5. Adding a node type

1. Add the type to `NODE_TYPES` and the node/config union in
   `src/domain/types.ts` (e.g. `action.email` + `EmailConfig`).
2. Add an entry to `NODE_REGISTRY` in `src/domain/nodeRegistry.ts` with:
   `type`, `version`, `category`, i18n `labelKey`/`descriptionKey`, `icon`,
   `accent`, `defaultConfig`, `configSchema`, input/output ports, constraints,
   `validateShape`, `validateConfig`, `summary`.
3. Add i18n strings under `nodes.*` in `src/i18n/en.ts` and `fa.ts`.
4. If the node needs a distinct canvas card, add a wrapper in
   `src/journey/nodes.tsx` and register it in `nodeTypes`; otherwise reuse the
   shared card. Add an editor component in `src/journey/properties/` and map it
   in `PropertiesPanel.tsx` (`EDITORS`).
5. If the node changes graph semantics (new handles, branches), extend
   `checkConnection` and `validateGraph` in `src/domain/graph.ts` with stable
   issue codes, and add fixture/tests.

The palette derives categories from the registry, so no palette switch is needed.

---

## 6. Graph rules

A publishable journey has exactly one entry (`entry.static_list` or `start`),
at least one SMS node (`action.sms` or `sendSms`), and one or more `end` nodes.
Nodes may branch **only through distinct required output ports** (e.g.
`waitForEvent.event` and `waitForEvent.timeout`). Each required output port must
have exactly one connection; each input accepts at most one.

| Rule | Code | Severity |
| --- | --- | --- |
| Exactly one entry | `ENTRY_REQUIRED`, `MULTIPLE_ENTRIES` | error |
| At least one end | `END_REQUIRED` | error |
| Multiple ends allowed (e.g. success/timeout) | — | — |
| At least one SMS node | `SMS_REQUIRED` | error |
| Entry: 0 in / 1 out | `ENTRY_HAS_INCOMING`, `ENTRY_OUTPUT_REQUIRED` | error |
| SMS (`action.sms`): 1 in / 1 out | `SMS_INPUT_REQUIRED`, `SMS_OUTPUT_REQUIRED` | error |
| New nodes: required input | `INPUT_REQUIRED` | error |
| New nodes: every required output connected exactly once | `OUTPUT_REQUIRED`, `TOO_MANY_OUTPUT_CONNECTIONS` | error |
| Degree limits per registry | `BRANCHING`, `MERGING` | error |
| End: 1 in / 0 out | `END_INPUT_REQUIRED`, `END_HAS_OUTGOING` | error |
| No cycles | `CYCLE_DETECTED` | error |
| No self-connections | `SELF_CONNECTION` | error |
| No disconnected nodes / path without an end | `DISCONNECTED_NODE`, `UNREACHABLE_END` | error |
| No dangling edges | `DANGLING_EDGE` | error |
| Valid handles / no duplicate edges | `INVALID_HANDLE`, `DUPLICATE_EDGE` | error |
| Supported node types/versions | `UNSUPPORTED_NODE_TYPE`, `UNSUPPORTED_NODE_VERSION` | error |
| Valid node ids | `INVALID_NODE_ID`, `DUPLICATE_NODE_ID` | error |
| List selected & available | `LIST_REQUIRED`, `LIST_NOT_FOUND`, `LIST_WRONG_WORKSPACE` | error |
| Empty list | `LIST_EMPTY` | **warning** |
| Template selected & available | `TEMPLATE_REQUIRED`, `TEMPLATE_NOT_FOUND`, `TEMPLATE_WRONG_WORKSPACE`, `TEMPLATE_EMPTY` | error |
| Variable mappings complete/valid | `VARIABLE_MAPPING_REQUIRED`, `VARIABLE_MAPPING_INVALID` | error |
| Unused mapping | `UNKNOWN_VARIABLE_MAPPING` | warning |
| Supported schema | `SCHEMA_UNSUPPORTED` | error |

Interactive `checkConnection` prevents invalid connections (per-port branching,
merging, cycles, duplicates, invalid handles). It is a UX aid only; full
validation runs for loaded documents, the validation panel, and publication.

Drafts may be saved while invalid. Publication is blocked by errors; warnings do
not block.

---

## 7. Editor state machine

### Save

`clean → dirty → saving → saved | dirty | error | conflict`

- Manual save + 1200 ms debounced autosave.
- Incomplete drafts save.
- Saves are serialized; a response never overwrites newer local edits (the
  fingerprint captured at request time is compared on return).
- Optimistic concurrency: expected revision is sent; conflicts surface as a
  banner with reload (no silent overwrite).
- After a conflict/error, autosave pauses until the user edits or retries.
- Unsaved-change confirmation on back / workspace switch / example navigation;
  `beforeunload` guard for tab close.

### Publish

`idle → validating → (save if dirty) → validation_failed | publishing → published | error`

- Local validation first, then server validation of the exact saved revision.
- Publishing saves first and publishes that revision.
- Mutations are blocked while validating/publishing, so edits cannot slip in.
- Duplicate submissions are disabled.
- Published documents become read-only in this UI (the backend keeps the draft;
  a “new draft from version” flow does not exist yet).
- Publication is simulated in mock mode: no SMS, no activation, no worker.

### Page

`loading | ready | not_found | forbidden | network_error | unsupported | error`

Unsupported documents show the raw JSON for diagnostics and never mutate or drop
data. Read-only is a flag with reasons `permission`, `published`, `sandbox`.

### Catalogs

Each of lists/templates has `idle | loading | ready | error`, plus selected
reference-missing/foreign states in the properties panel. While catalogs are
loading/failed, reference checks are skipped to avoid false “not found” errors.

---

## 8. Mocked vs real integrations

| Capability | Mock | Real backend |
| --- | --- | --- |
| Workspaces | deterministic (4) | No directory endpoint; mock list used as UX hint |
| Get journey | localStorage seed + revisions | `GET /workspaces/:ws/journeys/:id` |
| Save draft | localStorage, revision check | `PUT .../draft` with `If-Match: "revision-N"` |
| Validate | local validator | `POST .../validate` |
| Publish | simulated version | `POST .../publish` with `If-Match` + `Idempotency-Key` |
| Static lists catalog | deterministic, all workspaces | **Not implemented in backend** → visible failure + retry |
| SMS templates catalog | deterministic, all workspaces | **Not implemented in backend** → visible failure + retry |
| SMS delivery / runtime | never | out of scope |

Mock publication is clearly labeled as simulated in the header banner and success
dialog. No test sends SMS.

---

## 9. Implemented state coverage

| Area | States implemented |
| --- | --- |
| Page | loading, not found, forbidden, network failure (+retry), generic error, unsupported schema/node, ready, read-only (permission/published/sandbox) |
| Save | clean, dirty, saving, saved, failed (+retry), revision conflict (+reload), stale-response protection, newer-edits-remain-dirty |
| Publish | validation failed (local + server), publishing, published, failed (+dismiss), blocked by read-only/permission |
| Catalogs | loading, ready, empty, failure (+retry), selected reference missing, selected reference foreign, empty-list warning |
| Nodes | unconfigured, unavailable reference, wrong workspace, empty template, missing mapping, invalid literal mapping, unknown mapping, preview unresolved/missing values, valid |
| Selection | none, single node, multi-node, edge, read-only |
| Examples | each fixture with expected codes; sandbox isolation; dirty confirmation |
| Documents | valid, incomplete, cycle/branch/merge, unsupported schema/type/config field |

Reproduce any async state from the sandbox **Demo controls**. Production UI does
not expose demo controls.

---

## 10. Testing

```bash
pnpm test     # 101 tests, 10 files
pnpm typecheck
pnpm lint
pnpm build
```

Coverage highlights:

- node registry defaults/schemas/ports/constraints;
- every graph rule and fixture expected result;
- serialization + React Flow round trip; unsupported data handling;
- preview rendering and GSM-7/UCS-2 estimates;
- session happy path (load empty → add/connect/configure → validate → save →
  publish → read-only);
- save failure/retry, conflicts, stale async after disposal, newer edits during
  save, undo/redo, deletion atomicity, duplication constraints, read-only;
- properties panel: list/template/mapping editing, template-change warning,
  read-only fields.

The integration happy path is exercised through `EditorSession` +
`SandboxJourneyApi` + validation (not through React Flow). Canvas drag/drop,
connection gestures and keyboard deletion are implemented but **not covered by
jsdom tests**; they require a browser E2E suite (Playwright was not present in
this empty repo).

---

## 11. Accessibility & usability notes

- Icon-only buttons have `aria-label`; destructive delete uses a confirmation
  dialog (or is undoable); focus styles are global.
- Palette supports drag-and-drop **and** click-to-add; the empty canvas has
  click-to-add buttons.
- Drawers/modals use Radix Dialog for focus trapping; keyboard shortcuts ignore
  form fields.
- Errors use icon + text + code, not color alone.
- `dir="rtl"` switches logical layout, node handles and arrow directions; Persian
  translations are provided.
- Not formally audited with a screen reader or automated axe run. No claim of
  full WCAG compliance.

---

## 12. Remaining gaps / limitations

1. Backend `additionalProperties: false` rejects editor-only fields (`label`,
   `variableMappings`, `note`, `meta`); HTTP save fails loudly until the backend
   schema is extended.
2. The backend has no static-list/template catalog endpoints; HTTP mode shows a
   catalog failure state.
3. HTTP workspace directory/permissions are mocked UX hints; real authorization
   remains server-side.
4. Published journeys are read-only here; there is no “create new draft from
   published version” flow.
5. Node authoring supports start/split/inline SMS/wait-for-event with outcome
   ports and multiple ends, but there is **no runtime**: waits, splits, events,
   and SMS sends are not executed. `split` currently has a single `next` output
   (control percentage is metadata only); add treatment/control ports if the DSL
   is extended.
6. No journey rename/create/delete UI; the landing page lists deterministic
   seeded journeys.
7. Segment estimates are labeled estimates and may differ from provider
   segmentation at escape-character boundaries.
8. No canvas E2E tests; jsdom cannot exercise React Flow pointer gestures.
9. No i18n pluralization beyond i18next defaults; Persian copy is a translation,
   not user-tested.
10. Demo controls are mock/sandbox only; HTTP mode still uses the same UI state
    machine but cannot inject failures.