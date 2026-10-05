# Implementation Status

This file tracks implementation observations, blockers, and status notes for the CEO–Board decision system. It is intentionally separate from the architecture and proposal documents so evidence can accumulate without rewriting the main design docs.

## Review Checklist

### Architecture blockers addressed since v1.2

- [x] Pi contract uncertainty is now treated as a required gate before orchestration implementation.
- [x] Process/session ownership is explicit: one child Pi subprocess per active board member, each with one persistent private Pi session.
- [x] Evidence vs. architecture decision is clearer: the doc distinguishes reference-observed behavior from settled v1 architecture choices.
- [x] The design now acknowledges that `session.json`, lock files, and snapshot/archive behavior are v1 implementation decisions rather than purely recovered reference facts.

### Current status by concern

#### Repo bootstrap
Status: complete.
Notes:
- The project now has a pnpm-based Node TypeScript scaffold with a working Vitest + TypeScript setup.
- The repo is configured for a clean dev workflow and uses the current stable manifest.
- The bootstrap state was verified and committed in the repo history.

#### Deterministic preflight modules
Status: complete and verified.
Notes:
- Config loading and schema validation now exist for the canonical project configuration.
- Agent frontmatter parsing and runtime variable extraction are implemented and tested against the sample CEO definition.
- Brief discovery and required-section validation are implemented and tested against the example brief.
- The implementation is verified by passing unit tests and a clean TypeScript compile.

#### Run/session lifecycle
Status: complete and verified.
Notes:
- The repo now creates project-scoped deliberation directories and checkpoint files for each run.
- It writes a session checkpoint with board state and persists the expected `.pi/ceo-agents` structure.
- Each run now creates append-oriented `conversation.jsonl` and `tool-use.jsonl` files; the conversation begins with a `meeting_start` record and the tool-use stream stays empty until a real tool invocation occurs.
- Shared conversation records contain accepted board responses, final board statements before synthesis, and the CEO conclusion; they do not contain synthetic harness narration.
- Tool-use records are written only for Pi `tool_execution_start` events and contain the observed agent, timestamp, and `tool_name`; lifecycle, update, and completion events are excluded.
- Project-lock recovery now checks the recorded PID rather than treating age as proof of a dead owner, associates the lock with its active session, and marks a recovered nonterminal run `FAILED` with `failure_reason: interrupted`.
- Recovery preserves complete JSONL records and removes an incomplete unterminated tail from both run logs before marking the session interrupted.
- Project-lock acquisition is implemented and rejects a second live owner while allowing stale-lock recovery.
- This milestone is covered by direct tests and passes under the repo’s TypeScript baseline.

#### Pi API contract
Status: complete and verified.
Notes:
- The installed stable package `@earendil-works/pi-coding-agent` exposes the expected `RpcClient` runtime contract, including `start()`, `onEvent()`, `prompt()`, `waitForIdle()`, `getLastAssistantText()`, and `setAutoRetry()`.
- The app-owned adapter boundary is now implemented in the repo and is validated against the actual runtime API rather than assumptions from the design docs alone.
- This resolves the A0 gate: orchestration can now depend on the verified lifecycle and event semantics without building on an unproven abstraction.

#### Process/session model
Status: implemented; one-member real-process lifecycle verified.
Notes:
- One active board-member subprocess per active member per run is the design model.
- Each subprocess owns one persistent run-scoped private Pi session.
- The CEO remains in the parent Pi process.
- The A12 smoke verified one member session across two real turns and a subprocess replacement against the same persisted session.
- Longer-lived and multi-member real-process verification remains open.

#### Snapshot/checkpoint design
Status: accepted as v1 architecture choice, not direct evidence.
Notes:
- The implementation doc now explicitly states that these mechanisms are settled architecture requirements.
- This avoids the earlier confusion in v1.2 where they were presented as if they were directly recovered from the reference evidence.

#### Implementation readiness
Status: board orchestration, state persistence, recovery, CEO synthesis, and lifecycle-state tracking are implemented and verified.
Notes:
- The config/agent/brief layer, run/session lock lifecycle, Pi adapter boundary, and board process orchestration are now coded and tested.
- The project now includes a board orchestrator that runs each member in its own run-scoped Pi session and records the member outcome back into the session checkpoint.
- Retry ownership remains harness-owned: the orchestrator applies the exactly-one retry loop, while the Pi client is not treated as the authority for native auto-retry behavior.
- The orchestrator now explicitly calls `setAutoRetry(false)` for board and CEO Pi sessions, including retried sessions; harness retries remain controlled by the orchestrator option.
- Pi session statistics now preserve the installed runtime's cumulative cost, token counts, and optional `contextUsage`; accepted board turns measure before/after deltas and persist cost, token, and remaining-context usage to `session.json`.
- Missing Pi telemetry is persisted as unavailable (`null`) rather than estimated; remaining context is calculated only from Pi-reported context tokens and window size.
- Board-member and CEO turns now run behind an inactivity watchdog; Pi message and tool execution events reset the deadline, and expiry aborts the client and fails the attempt.
- Each production `RpcPiAgentClient` now starts Pi with the configured `--session-id` and `--session-dir`; orchestrator retries recreate the subprocess with the same member session identity and storage directory.
- Board turns now launch member executions concurrently and resolve only after the round barrier; exhausted member failures are returned as failed results without blocking available members, and only completed responses are appended to shared conversation history.
- A7 constraint enforcement now persists configured min/max thresholds, treats min_budget as display-only, gates voluntary close and CEO synthesis on min_time, completes active rounds before activating max-time/max-budget forced close, and rejects further rounds once forced closing begins.
- A8 final closing now executes every remaining available member concurrently, retries each once in the same session, excludes unavailable members, persists only accepted final statements before synthesis, and supplies the Contrarian statement to the CEO last.
- A9 memo synthesis now writes YAML frontmatter from deterministic harness state, validates it with Zod, validates Markdown structure/content with remark AST parsing, retries once with concrete validator errors, and preserves final statements plus partial memo on terminal synthesis failure.
- A11 now has a tested runtime view-model, centralized lifecycle/member labels, latest activity selection, accepted-response counts, unavailable telemetry rendering, and full-range time/budget progress. A persistent Pi widget adapter supports collapsed rows, selected-member expansion, keyboard navigation, updates/disposal, and non-TUI mode guarding.
- Added `apps/ceo/extensions/ceo-and-board.ts` to mount the runtime widget only in TUI mode. It derives the view from the latest persisted run, polls state while mounted, clears when no run is available, and disposes the timer/widget on session shutdown.
- The parent Pi extension now registers `/ceo-begin` plus CEO-callable `converse` and `end_deliberation` tools. Begin validates/selects a brief, acquires and associates the project lock, seeds the CEO parent turn with the full brief and constraints, streams round responses back to the CEO, then closes/synthesizes and releases the lock.
- `BoardOrchestrator` now retains one healthy Pi client per member/session across deliberation rounds and final closing, replaces an unhealthy process against the same persisted session, and exposes `closeRun()` for terminal cleanup from the controller and parent extension.
- The A12 opt-in real-Pi smoke has passed against Command Code DeepSeek V4 Flash; see the [2026-10-05 A12 smoke report](test-run-2026-10-05-a12-real-pi-smoke.md).
- The run checkpoint now tracks a concrete lifecycle state through `INITIALIZING`, `DELIBERATING`, `FINAL_CLOSING`, `CEO_SYNTHESIS`, `COMPLETED`, and `FAILED`, making the runtime state machine explicit instead of implicit.
- The runtime lifecycle is intentionally a simplified v1 model: broader conceptual v1.3 states such as `VALIDATING` and `CEO_FRAMING` are not currently represented as active persisted states in the implementation.
- Added an `InactivityWatchdog` primitive and a `markForcedClose()` checkpoint update so the run persists timeout-driven and max-time/max-budget control state in a durable, observable form.
- Added `evaluateConstraintState()` to enforce `max_time` and `max_budget` as hard closure gates and to disable voluntary close once those thresholds are reached.
- Added `finalizeForcedClose()` so a pending forced-close run transitions into the explicit `FINAL_CLOSING` lifecycle before synthesis/close continues.
- Added `finalizeRun()` so a closing board round persists final member statements and then immediately transitions through the normal CEO synthesis flow without bypassing the memo validation path.
- The board member result now exposes explicit `status`, `attempts`, and `error` metadata, making failure and retry visibility part of the runtime contract instead of an implicit side effect.
- The run state now persists per-member telemetry in `session.json`, including `status`, `response_count`, `attempts`, and `last_output`/`last_error` so the UI or runtime can render the live board state without reconstructing it from raw logs.
- The CEO synthesis step now goes through a dedicated CEO Pi session, synthesizes a conclusion from the board outputs, writes the final memo to the run output path, and updates the board member telemetry plus `ceo_conclusion` in `session.json` once the board turn has settled.
- The memo validator now treats a blank or structurally invalid `Final Decision` section as a synthesis failure and triggers the required single retry; a second invalid memo marks the run `FAILED` while preserving the accepted board statements.
- The final close-through-synthesis handoff is now implemented: final board statements are persisted before the CEO synthesis memo is generated, and lifecycle state normalization keeps the active runtime vocabulary aligned with the architecture even when older session files use the legacy naming.
- The status/UI layer is now implemented as a small runtime summary module that renders member-level completion states and the active board lifecycle without re-deriving the state from raw logs.

## Verified accomplishments
- Bootstrapped the Node + pnpm + TypeScript project.
- Added a smoke test and a real preflight test suite.
- Implemented config loading with Zod validation.
- Resolved agent path semantics relative to project root and configured agent directories.
- Parsed YAML frontmatter and extracted runtime variables from the CEO persona definition.
- Validated real Markdown briefs against the required section structure.
- Added run/session lifecycle support: project-scoped directories, checkpoint persistence, and lock acquisition with stale-lock recovery.
- Verified the repo with: `pnpm test && pnpm typecheck`.
- Implemented the app-owned Pi adapter layer using the actual `RpcClient` runtime contract.
- Added a board orchestrator for member-scoped Pi sessions and board-turn execution.
- Added the CEO synthesis memo step that writes the final deliberation result to the run memo path and persists member state in the run checkpoint.
- Added a same-session retry path for a failed member execution when the orchestrator is configured to auto-retry.
- Added explicit member execution metadata (`status`, `attempts`, `error`) so board runtime failures are visible in the orchestration result and saved checkpoint state.
- Added persisted board telemetry in `session.json` with `status`, `response_count`, `attempts`, and last-output/error snapshots for the current run state.
- Added a dedicated CEO Pi session to synthesize the final conclusion from the board outputs, rather than accepting a raw, external conclusion value.
- Added a deterministic memo validator that rejects blank or structurally invalid `Final Decision` sections and triggers the single allowed synthesis retry before failing the run.
- Added a board status summary renderer that exposes the live lifecycle and per-member completion states in a compact, UI-friendly report.
- The summary now reads the persisted `lifecycle_state` from the run checkpoint and normalizes legacy values, rather than hardcoding the lifecycle to `DELIBERATING`.
- The CLI can now list persisted runs and display a direct status report from the saved checkpoint directory, allowing a board run to be inspected without re-running the deliberation.
- The CLI can also read the persisted CEO memo from the saved run output directory, making the final board recommendation available for inspection without re-running the board or reconstructing the run from logs.
- The CLI now supports exporting a persisted run snapshot to a portable directory, making the saved `session.json`, prompt archive, and memo available for archival or offline inspection without leaving the project’s active runtime tree.
- The run snapshot now captures the saved brief and rendered board-member prompts in `deliberations/<session_name>/snapshot/`, so the archived run preserves the effective inputs that generated the decision rather than only the final memo and checkpoint.
- Added persistent `conversation.jsonl` and `tool-use.jsonl` run streams with a tested separation contract; tool-use rows reflect actual Pi tool-start events rather than inferred reads or synthetic `converse` calls.
- Added dead-owner recovery that protects locks held by live processes, marks the associated nonterminal run interrupted, and repairs incomplete trailing JSONL records without discarding completed lines.
- Explicitly disabled Pi-native automatic retry for every board and CEO client attempt so the harness remains the sole retry owner.
- Added before/after Pi stats capture for board responses and persisted measured cost/token deltas plus Pi-reported remaining context.
- Integrated an activity-resetting inactivity watchdog into board execution and CEO synthesis, with fake-timer coverage for abort-on-timeout and message/tool activity resets.
- Configured production Pi subprocesses to reopen the exact run-scoped session on restart, with adapter-level CLI argument verification and retry-level session identity assertions.
- Completed A6 round orchestration with `runBoardRound()`: supports `all`, single, and subset recipients; rejects unknown names; excludes unavailable members from execution while returning explicit statuses; waits for the slowest participant; and returns ordered semantic responses plus persisted constraint state.
- Round prompts use a snapshot of accepted conversation history from before the round, so peers cannot see current-round responses. CEO recipient targets and accepted responses are persisted in `conversation.jsonl`, while failed responses remain excluded.
- Added private per-member workspaces and barrier-time artifact promotion. Peers cannot see same-round artifacts; successful artifacts become available next round, failed-attempt files remain private, harness-owned files are excluded, and collisions do not overwrite shared artifacts.
- Completed A7–A9: enforced time/budget close rules at board-round boundaries; implemented real parallel final statements with one retry, unavailable filtering, persistence-before-synthesis, and Contrarian-last synthesis context; added strict deterministic memo frontmatter/Markdown validation and one feedback-driven CEO retry.
- Implemented A10 lifecycle control: a controller runs a supplied sequence of board rounds through final closing and validated synthesis, stops queued rounds after forced close, leaves pre-min_time deliberation open, and records unrecoverable failures in the checkpoint. The CLI run path now composes through this controller.
- Added A10 fake-Pi lifecycle coverage for multi-round completion, forced max-budget closure, min_time continuation, transient CEO recovery, synthesis terminal failure, and stale-lock recovery.
- Added A11 view-model and widget tests for centralized presentation, activity/response semantics, min/max progress and unclamped values, unavailable telemetry, keyboard selection/expansion, and non-interactive mode guarding.
- Added host-adapter tests for reading latest checkpoint, conversation, tool activity, and unavailable telemetry into the Pi widget model, plus polling/empty-state/disposal behavior; typechecked the entrypoint against the installed ExtensionAPI.
- Added a fake-Pi extension integration test covering `/ceo-begin`, brief validation, CEO framing injection, `converse`, `end_deliberation`, memo completion, and project-lock release.
- Added coverage proving board member Pi clients are reused across multiple CEO rounds and final closing, then closed once at run termination.
- Added and executed the A12 opt-in full-decision real-Pi smoke: selects `CEO_BOARD_PI_MODEL`, executes one board member through two rounds and final closing, verifies a write-tool event/artifact and validated CEO memo, checks session stats, reopens the same member session after process replacement, and closes all RPC processes cleanly. On 2026-10-05 it passed against `commandcode/deepseek/deepseek-v4-flash`; the first run exposed a CEO synthesis heading-contamination defect, which was reproduced, fixed, and retested. Normal CI still skips this test.
- The status summary now includes a compact memo preview extracted from the saved final-decision section, so the newest recommendation is visible in the run summary without opening the memo file itself.
- Added the final-close lifecycle transition for forced-close runs, so the checkpoint can intentionally advance into `FINAL_CLOSING` before synthesis or terminal completion.
- Added the final close-through-synthesis handoff so board final statements are persisted before the CEO memo is generated, matching the control-flow architecture around `endDeliberation()` and memo synthesis.
- Verified the orchestration, recovery, synthesis, telemetry, runtime-status, and hard-constraint/final-close control layer with dedicated tests and a clean TypeScript compile.
- Committed and pushed the verified work to origin successfully.

## Open items to track over time

- Validate real board execution against the pinned Pi runtime under longer-lived repeated runs.
- Confirm member-level run scoping and private Pi session behavior during actual multi-member execution.
- Add richer final memo formatting polish beyond the persisted board-state and retry baseline.
- Deeper UI/runtime status polish remains the next constructive phase if the team wants a more interactive board display beyond the compact summary layer.
- Revisit the design if the runtime contract changes materially in a future pinned package upgrade.
- Keep any future implementation decisions clearly marked as architecture decisions versus observed reference behavior.
- Complete longer-lived and multi-member real-process verification against configured Pi models. The A12 smoke now proves the minimal one-member full-decision path and same-session process replacement, but broader A5-style repeated-run behavior remains open.
- The CLI controller still supports a supplied round-request sequence for deterministic runs. A12 remains opt-in and excluded from normal CI.

## Implementation v1.4 conformance program

The [implementation-1.4](implementation-1.4.md) corrective plan is in execution. Open fix findings: F1 prompt renderer, F2 agent-defined models, F3 entrypoint composition, F4 config strictness, F5 brief packages, F6 config-driven run paths, F7 watchdog activity taxonomy.

- Phase 0 complete: negative-test backlog N1–N8 written and confirmed RED (15 failing tests, 86 passing).
- B1 complete: Vitest upgraded to 5.0.3, Zod to 4.6.5. No API breakage; the suite runs clean apart from the intended N-series failures. Pi remains 1.0.2 per the v1.4 baseline.
- B2 complete: the documented app entrypoint [apps/ceo/extensions/ceo-and-board.ts](../apps/ceo/extensions/ceo-and-board.ts) now composes `registerCeoBoardExtension` (commands/tools) plus the runtime widget, and the double widget registration inside [src/pi/extension.ts](../src/pi/extension.ts) is removed. N7 is green.
- B3 complete: agent frontmatter `model` is now required (N2), `createRun` resolves each board member's agent definition and records `boardModels`/`boardAgentPaths` on the run session, `PiAgentStartConfig.model` threads into `RpcPiAgentClient`, and the Pi extension passes resolved agent paths at run creation. The smoke test documents `CEO_BOARD_PI_MODEL` as a test-only override. N2/N8 green; `AgentDefinition` now carries `provenance`.
- B4 complete: [src/prompt-renderer.ts](../src/prompt-renderer.ts) implements `renderAgentPrompt` with the recovered `{{VARIABLE}}` form, rejects unknown variables, and centralizes `FINAL_STATEMENT_PROMPT`. CEO framing and synthesis prompts render from the CEO agent definition (with minimal fallback), and the extension stores `ceoAgentPath`/`ceoModel` on the run. N4 green; A12 smoke re-run passed (31.4s).
- B5 complete: budgets are numeric-only (Zod 4 `finite().nonnegative()`), `min_time > max_time` and `min_budget > max_budget` rejected via `.check`, empty board and duplicate member names rejected. Sample config and fixtures converted to numeric budgets; the sample's string-union accommodation is removed. N1 green. Recorded decision D2 stands: currency display is presentation-layer.
- B6 complete: the brief validator rejects duplicate required sections (N3), and supporting sibling file contents are read and appended to the CEO framing request under a Supporting Context block. N3 green; sibling-content flow covered by a new extension test.
- B7 complete: `CreateRunOptions.paths` drives deliberation/memo directories; the Pi extension passes `config.paths`, and the `.pi/ceo-agents` constant is now only the default. N5 green.
- Conformance checklist status after B7: C1–C8 pass; C9–C10 pending their milestones; C12 holds for pre-Phase-0 code only (the suite is intentionally RED until fixes land).

## Decision log

### D1
The repo has reached a stable deterministic preflight milestone and the verified Pi runtime contract gate is now closed; orchestration can proceed without re-opening the runtime-risk question.

### D2
The design should continue to distinguish between what is evidence-backed and what is a v1 implementation choice.

### D3
The config/agent/brief layer can proceed independently of Pi verification, but orchestration should not depend on unverified Pi API behavior.

### D4
The next implementation step is runtime polish and richer board execution semantics on top of the verified adapter, retry-aware orchestration, and established session checkpoints.

### D5
The current implementation intentionally uses a simplified runtime lifecycle model instead of the broader conceptual v1.3 state names. The code is the source of truth for the active state machine until the design is intentionally widened again.
