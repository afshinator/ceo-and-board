# CEO–Board Decision System

## Implementation — v1.5

### 1. Purpose

Implementation v1.4 (B1–B8) is complete. This document is the audit result against [proposed-implementation-1.3.md](proposed-implementation-1.3.md) and the corrective plan in [implementation-1.4.md](implementation-1.4.md). It records what is done, what has strayed from the settled v1 contract, what is broken, and the prioritized work to close the remaining gaps. It supersedes v1.4 as the active work plan.

This document does not reopen settled architecture. It fixes regressions and drift, and completes unimplemented contract sections.

### 2. Baseline

- `pnpm check` green: 103 tests pass, 1 skipped (the opt-in A12 real-Pi smoke). No red tests.
- v1.4 fix milestones B1–B8 complete. Conformance rows C1–C12 pass.
- Milestones A0–A12 implemented; A12 is the minimal one-member full-decision real-Pi path and remains opt-in.

### 3. Audit Result

Findings are listed in priority order. P1 is correctness (do first). P2 is spec drift. P3 is hygiene. Each fix follows RED → GREEN → REFACTOR → CHECK, and each ends with an [implementation-status.md](implementation-status.md) update in the same commit, per the v1.4 protocol.

### 4. P1 — Correctness

#### F9 — Config-driven run paths are only half-wired

B7 made run creation honor `paths.deliberations` and `paths.memos`. Everything that reads persisted runs still hardcodes `.pi/ceo-agents/{deliberations,memos}`:

- `src/status.ts`: `listPersistedRuns`, `readPersistedMemo`, `summarizePersistedRunStatus`, `exportPersistedRunSnapshot`, `cleanupStalePersistedRuns` (8 hardcoded sites).
- `src/tui/extension.ts`: `loadLatestBoardRuntimeInput` derives the run from `listPersistedRuns`, so the runtime widget breaks under custom paths.
- `src/run.ts`: `recoverInterruptedRun` reconstructs the session path with the default deliberations dir, so stale-lock recovery marks the wrong run (or nothing) under custom paths.
- `src/run.ts`: `captureRunSnapshot` derives `projectRoot` by a fixed `..` depth that only holds for the default path.

Consequence: a run created with non-default `paths.deliberations`/`paths.memos` writes to the configured location but cannot be listed, inspected, exported, cleaned up, recovered, or shown in the TUI.

Fix: thread resolved deliberation/memo paths from `loadConfig` through `status.ts`, the TUI loader, `recoverInterruptedRun`, and `captureRunSnapshot`. The `.pi/ceo-agents` constant remains only the default.

Tests (RED first): create a run under custom paths, then assert `listPersistedRuns`, `summarizePersistedRunStatus`, `readPersistedMemo`, `exportPersistedRunSnapshot`, and `loadLatestBoardRuntimeInput` all resolve it. Add a stale-lock recovery test under custom paths.

#### F10 — Memo synthesis is boilerplate

`writeCEOConclusion` (`src/orchestrator.ts`) fills only `Final Decision` and `Board Stances` with real content. The other required sections are static strings:

- `Ranked Recommendations` is a single item duplicating the Final Decision.
- `Tensions & Dissent`, `Trade-offs & Risks`, `Next Actions`, `Deliberation Summary` are fixed prose.

v1.3 §18 requires these sections to carry the board's actual ranked recommendations, dissent, trade-offs, risks, and next actions. The validator checks structure only, so the boilerplate passes.

Fix: synthesize each section from the accepted board outputs and final statements (feed them to the CEO synthesis prompt and require the CEO to return the sections; keep the deterministic harness-owned heading scaffolding). Do not introduce a second model pass unless the CEO synthesis is restructured to produce the full body.

Tests (RED first): assert each required section is non-empty and differs from the static fallback text; assert `Ranked Recommendations` contains more than the Final Decision duplicated.

### 5. P2 — Spec drift

#### F11 — Reference configuration is not runnable

- The committed sample config references four board agent files that do not exist in the repo: `.pi/ceo-agents/agents/revenue.md`, `../product-strategist.md`, `../technical-architect.md`, `../contrarian.md`.
- The repo root has no `ceo-and-board-configuration.yaml`, so `/ceo-begin` fails at `findConfig` with "No CEO–Board configuration found".

Consequence: the only committed decision configuration cannot drive a real run, and the extension path has no runnable fixture.

Fix: add reconstructed board agent files (marked `reconstructed` per §24.3) plus a runnable minimal config fixture, and a test that `/ceo-begin` completes preflight against it. Keep recovered CEO/Compounder material distinguishable from reconstructed board material.

#### F12 — Lifecycle states VALIDATING and CEO_FRAMING are never persisted

The `RunLifecycleState` type and the TUI label map include `VALIDATING` and `CEO_FRAMING`, but no code path writes them. Status doc D5 records this as an accepted simplification.

Fix: either persist both states at their natural points (brief validation, CEO framing injection) in the extension flow, or formally remove them from the type and TUI map and record the narrowed state machine as a decision. Choose the former unless it forces unrelated rework.

#### F13 — Provenance is coarse and hardcoded

`loadAgentDefinition` always returns `{ frontmatter: 'recovered', body: 'recovered' }`. v1.3 §6.3 requires an explicit recovered-vs-reconstructed breakdown per section (e.g. CEO Instructions/Workflow are unrecovered; Compounder body is partially recovered).

Fix: derive provenance from a small frontmatter block or per-file manifest rather than a fixed constant. Preserve the exact recovered material verbatim; mark reconstructed material.

#### F14 — CEO prompt has empty Instructions and Workflow

The recovered `ceo.md` has empty `## Instructions` and `## Workflow` sections, so the rendered CEO framing carries Purpose and Variables but no operating instructions. This is provenance-marked but functionally thin.

Fix: reconstruct minimal Instructions/Workflow (marked reconstructed) or record an explicit decision that the thin CEO prompt is accepted for v1.

### 6. P3 — Hygiene

- F15. Module layout collapsed: `src/orchestrator.ts` (turn runner, converse, final closing, constraints, memo synthesis; 1011 lines) and `src/run.ts` (create-run, lock, checkpoint, snapshot, watchdog; 540 lines) do not reflect the v1.3 §3 proposed split (`execution/`, `orchestration/`, `run/`, `persistence/`, `pi/`). Split into the proposed modules or record a decision accepting the current layout.
- F16. No fixtures directory: v1.3 §24 requires `recovered`/`reconstructed`/`invalid` agent fixtures and a `synthetic-context` brief package; `tests/fixtures` is empty and tests inline their fixtures. Add the fixture tree.
- F17. No CI workflow: v1.3 §26 requires `typecheck` + unit + harness integration in normal CI. The repo has no workflow file. Add one running `pnpm check`.
- F18. Identity/state literal drift: `sessionId` is `Date.now().toString(36)` plus a UUID suffix (spec §8.1 is `Date.now().toString(36)` only), and `round_state` extends beyond the spec's `IDLE`/`IN_PROGRESS`. Accept both as decisions (collision safety, richer checkpoint) or align.

### 7. Open items carried forward

- O1. Multi-member real-Pi execution and longer repeated runs (carried from v1.4).
- O2. Broader real-process replacement-under-failure verification beyond the A12 minimal path.
- O3. Optional SVG/TTS/editor post-actions remain out of scope for v1 conformance.

### 8. Test status

- No failing tests. `pnpm check` passes (103 passed, 1 skipped).
- Coverage gaps that let the findings above through: no test asserts custom run paths are readable/exportable (F9); no test asserts memo section content (F10); no test runs `/ceo-begin` against a committed config (F11); no test covers provenance accuracy (F13) or persisted VALIDATING/CEO_FRAMING (F12); no test covers `captureRunSnapshot` under custom paths (F9).
- The A12 opt-in real-Pi smoke stays excluded from normal CI and must be re-run after F9 and F10 because they change runtime persistence and synthesis behavior.

### 9. Decision log

- D6. v1.4 corrective plan B1–B8 is closed; conformance C1–C12 pass.
- D7. Config-driven paths are canonical end to end. F9 is a B7 regression and is fixed before any other P1 work.
- D8. Memo sections must be synthesized from board outputs, not static fallback prose (F10).
- D9. Reconstructed board material must be marked `reconstructed` and kept distinguishable from the recovered CEO/Compounder material (F11, F13).
