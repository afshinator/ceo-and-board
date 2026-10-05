# CEO–Board Decision System

## Implementation — v1.4

### 1. Purpose

Implementation v1.3 produced a working system that passed its milestone tests but failed full contract conformance. The audit against [proposed-implementation-1.3.md](proposed-implementation-1.3.md) surfaced eight findings (F1–F8) and four root causes (R1–R4). This document is the corrective implementation plan. It supersedes v1.3 as the active implementation baseline.

This document does not reopen settled architecture. It repairs process failures, removes stop-gap code, and completes the v1.3 contract.

### 2. Root-Cause Fixes

The root causes are process defects. They are fixed here as standing rules, not one-time actions.

#### R1 — Proposal was executed as a milestone checklist, not a full contract

**Fix:** Every proposal section is an acceptance criterion. Sections 2–8 of v1.3 (versions, module layout, schema strictness, renderer, fixtures) carry the same weight as milestones A0–A12. Section 7 of this document contains the conformance checklist. No fix milestone in this document is complete until its checklist rows pass.

#### R2 — Status doc recorded accomplishments, not non-conformances

**Fix:** [implementation-status.md](implementation-status.md) must record every discovered gap as an open item at the time it is discovered. Deferring a requirement without logging it is a process failure. Each fix in this document ends with a status-doc update in the same commit.

#### R3 — TDD covered milestone behaviors but skipped enumerated negative cases

**Fix:** Negative tests are written before any fix implementation. Section 5 defines the negative-test backlog; it is the first execution phase. A fix milestone that passes happy-path tests but has no failing-first negative coverage is not done.

#### R4 — Conformance was audited once instead of continuously

**Fix:** The conformance checklist in Section 7 is re-run at the end of every fix milestone, and the result is recorded in the status doc. The checklist is repeatable, not a one-time audit.

### 3. Dependency Baseline

| Package | v1.3 stated | Installed | v1.4 target | Disposition |
|---|---|---|---|---|
| `@earendil-works/pi-coding-agent` | 1.0.0 | 1.0.2 | 1.0.2 | Accepted. 1.0.2 is the current stable line and supersedes the 1.0.0 pin. Proposal text is amended by this document. |
| `vitest` | 5.x | 3.2.7 | latest 5.x | Upgrade. No justification exists for 3.x. |
| `zod` | 4 | 3.25.76 | latest 4.x | Upgrade. Required before F4 schema tightening. |

Scripts in [package.json](../package.json) are updated as needed by the upgrades (test invocation, type compatibility, any renamed flags). The `check` script remains the single validation entrypoint.

### 4. Execution Protocol

1. Execution order is the priority order in Section 6. No reordering without a recorded reason.
2. Every fix follows RED → GREEN → REFACTOR → CHECK → COMMIT.
3. One fix per commit. The commit includes the production change, its tests, the status-doc update, and the conformance checklist result.
4. `pnpm check` must pass before every commit. The A12 smoke remains opt-in and is re-run after F2 and F1 because they change runtime model/prompt behavior.
5. Stop-gap code is removed, not left behind: hard-coded prompts, hard-coded paths, the string-budget union, and any test that only exists to accommodate them are deleted when their replacement lands.

### 5. Phase 0 — Negative-Test Backlog (RED first)

All tests below are written and confirmed failing before any fix implementation begins. This phase contains no production changes.

- N1. Config: string budget rejected; `min_time_minutes > max_time_minutes` rejected; `min_budget > max_budget` rejected; empty board rejected; duplicate member names rejected. (Currently the schema accepts all of these.)
- N2. Agent: missing `model` rejected; malformed expertise entry rejected; malformed skill entry rejected.
- N3. Brief: missing each of Situation/Stakes/Constraints/Key Question rejected; duplicate required section rejected; non-directory entries ignored during discovery; package without `brief.md` ignored.
- N4. Prompt renderer: every known CEO runtime variable substituted; unknown `{{VARIABLE}}` left visible or rejected per renderer contract; recovered prompt body preserved verbatim.
- N5. Paths: run creation honors configured `paths.deliberations` and `paths.memos` when they differ from `.pi/ceo-agents` defaults.
- N6. Watchdog: lifecycle, file, and artifact events reset the inactivity deadline; an event type outside the accepted set does not.
- N7. Entrypoint: loading [apps/ceo/extensions/ceo-and-board.ts](../apps/ceo/extensions/ceo-and-board.ts) registers `/ceo-begin`, `converse`, `end_deliberation`, and the widget.
- N8. Model wiring: `RpcPiAgentClient` receives the model from the member's agent frontmatter; an agent without a model fails preflight with a naming error.

### 6. Fix Milestones in Priority Order

#### B1 — F8: Dependency upgrades

Upgrade Vitest to 5.x and Zod to 4.x. Fix all call-site breakage from the Zod 4 API. Update scripts as needed. Pi stays at 1.0.2.

Tests: existing suite must pass unchanged except where the Zod 4 API requires test updates.

#### B2 — F3: Entrypoint composition

[apps/ceo/extensions/ceo-and-board.ts](../apps/ceo/extensions/ceo-and-board.ts) composes the full extension: command/tools from [src/pi/extension.ts](../src/pi/extension.ts) plus the widget. The N7 test proves the loaded entrypoint registers everything. Remove duplicate widget registration inside `registerCeoBoardExtension` if composition makes it redundant.

#### B3 — F2: Agent-defined models

`createRun`/`runBoardRound` load each member's agent definition and pass `frontmatter.model` through `PiAgentStartConfig` into `RpcPiAgentClient`. Missing model fails preflight (N2, N8). `CEO_BOARD_PI_MODEL` remains a test-only override and is documented as such in the smoke test.

#### B4 — F1: Prompt renderer

Implement `renderAgentPrompt(agent, runtime)` per v1.3 §6.4 with the recovered `{{VARIABLE}}` form. Board prompts, CEO framing, and synthesis setup move out of [src/orchestrator.ts](../src/orchestrator.ts) and [src/pi/extension.ts](../src/pi/extension.ts) into rendered agent definitions. Rendered prompts are archived in the run snapshot. Each member Pi process starts with the rendered prompt via `--system-prompt` or `--append-system-prompt` (A0-verified flags). Delete the hard-coded prompt strings; `FINAL_STATEMENT_PROMPT` stays centralized but moves into the renderer module. Add `provenance` to `AgentDefinition` per v1.3 §6.2. N4 tests gate completion.

#### B5 — F4: Config strictness

After Zod 4 is in place: budgets become numeric-only, min/max inversion rejected, empty board rejected, duplicate member names rejected. The sample config's `"$1"`/`"$5"` strings are converted to numbers; currency formatting moves to the TUI display layer. N1 tests gate completion.

Decision recorded: numeric budgets are canonical in configuration; display formatting is presentation-layer responsibility. This resolves the schema-versus-sample conflict in favor of the v1.3 spec.

#### B6 — F5: Brief packages

Add the synthetic sibling-context fixture and negative cases from N3. Supporting sibling file contents are read and included in the rendered runtime context (`supportingFiles` in `PromptRuntimeContext`), not just collected as names.

#### B7 — F6: Config-driven run paths

`CreateRunOptions` carries resolved deliberation/memo paths from `loadConfig`. The `.pi/ceo-agents` constant becomes the default, not a hard-coded destination. N5 tests gate completion.

#### B8 — F7: Watchdog event coverage

Enumerate the installed Pi event taxonomy and extend the activity filter to lifecycle, file, and artifact events per v1.3 §13. N6 tests gate completion.

### 7. Conformance Checklist

Run after every fix milestone. Record the result in [implementation-status.md](implementation-status.md).

| Row | Requirement | Verified by |
|---|---|---|
| C1 | Dependency baseline matches Section 3 | `pnpm list` output |
| C2 | Documented app entrypoint registers full extension | N7 |
| C3 | Agent frontmatter model reaches `RpcPiAgentClient` | N8 + adapter test |
| C4 | No hard-coded prompt strings in orchestrator/extension | grep + N4 |
| C5 | Rendered prompts archived in run snapshot | snapshot test |
| C6 | Config rejects N1 cases | N1 |
| C7 | Brief negatives and sibling context | N3 + fixture test |
| C8 | Run paths honor config | N5 |
| C9 | Watchdog resets on full activity taxonomy | N6 |
| C10 | A12 smoke passes after F2/F1 | opt-in run |
| C11 | Status doc lists any newly discovered gap as open | doc review |
| C12 | `pnpm check` green | run output |

### 8. Remaining Open Items After This Plan

- O1. Multi-member real-Pi execution and longer repeated runs (carried from v1.3).
- O2. Broader real-process replacement-under-failure verification beyond the A12 minimal path.
- O3. Optional SVG/TTS/editor post-actions remain optional and out of scope for v1 conformance.

### 9. Decision Log

- D1. Pi 1.0.2 replaces the 1.0.0 pin; v1.3 text is amended by this document.
- D2. Budgets are numeric in configuration; currency display is presentation-layer.
- D3. `CEO_BOARD_PI_MODEL` is a test-only override; production model authority is agent frontmatter.
- D4. The conformance checklist is a standing gate, not a one-time audit.
