# Marco Journey Builder (frontend)

Production-quality SMS-focused Journey Builder for the Marco CRM panel, built with
React 19, TypeScript, Vite 8, and [@xyflow/react](https://reactflow.dev)
(React Flow 12). The UI is a faithful reskin of the Marco **web-engage** frontend
(`marco_event/frontend`): navy ENGAGE navigation, white topbar, ENGAGE builder
layout, node cards, inspector, typography, and color tokens.

The repository was empty when this work started. The existing Marco backend
(`../marco_event`, NestJS + Prisma) was inspected and its journey contract is
mirrored where practical — see [`docs/JOURNEY_BUILDER.md`](docs/JOURNEY_BUILDER.md).

## Quick start

```bash
pnpm install
pnpm dev
# http://localhost:5173
```

The app defaults to a deterministic in-browser mock adapter, so no backend or
database is required.

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Vite dev server (proxies `/api` → `localhost:3000`) |
| `pnpm build` | Typecheck + production build |
| `pnpm typecheck` | `tsc -b` |
| `pnpm lint` | ESLint (React hooks, refresh, TypeScript) |
| `pnpm test` | Vitest + Testing Library |
| `pnpm preview` | Preview the production build |

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Workspace + journey directory (deterministic mock data) |
| `/workspaces/:workspaceId/journeys/:journeyId` | Journey Builder (real mock draft) |
| `/workspaces/:workspaceId/journeys/:journeyId/demo?scenario=<id>` | Isolated sandbox / scenario gallery |

Use the **Examples** menu in the header to open any of the 15 scenarios. Examples
always load into the demo route; they never overwrite the persisted mock draft.
The same menu provides **Import journey JSON** and **Export journey JSON** for the
backend-facing `journey-dsl-1.0` contract. The **Demo controls** button in the
sandbox banner exposes failure injection controls for async states.

Try the sandbox directly:
`http://localhost:5173/workspaces/ws_passenger_staging/journeys/journey_ps_onboarding/demo?scenario=minimal-valid`

## Scope

Implemented: authoring, graph/property validation, draft saving with optimistic
concurrency, simulated publication, examples, read-only published view, RTL.
Node types now include the SMS MVP (`entry.static_list`, `action.sms`, `end`) and
the journey-dsl-1.0 set (`start`, `split`, `sendSms`, `waitForEvent`, outcome
ports, multiple ends), with a `parseJourneyDsl()` importer.

Not implemented (by design for this phase): runtime execution, activation,
background workers, real SMS delivery, push/email/A-B nodes. `waitForEvent`,
`split`, and branching are authorable/validated but do not execute.

## Documentation

Full developer documentation (data contract, node registry extension guide,
validation codes, state matrix, mocked/real integrations, limitations) lives in
[`docs/JOURNEY_BUILDER.md`](docs/JOURNEY_BUILDER.md). The backend-facing
React-Flow-native contract is documented separately in
[`docs/JOURNEY_DSL.md`](docs/JOURNEY_DSL.md).
