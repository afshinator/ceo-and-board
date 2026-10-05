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
Status: resolved in the design.
Notes:
- One active board-member subprocess per run is the design model.
- Each subprocess owns one persistent run-scoped private Pi session.
- The CEO remains in the parent Pi process.

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
- Board turns now launch member executions concurrently and resolve only after the round barrier; unavailable failures do not block successful participants, and only accepted outputs enter shared conversation history.
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
- Complete A5 verification against longer-lived real Pi processes; scripted failure/replacement and same-session subprocess startup are covered, but a full provider-backed crash/restart smoke test remains environment-dependent.
- A7 constraints and final-close integration are the next proposal phase.

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
