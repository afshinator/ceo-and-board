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
Status: deterministic milestones complete; Pi runtime adapter is implemented and verified.
Notes:
- The config/agent/brief layer and the run/session lock lifecycle are now coded and tested.
- The project now has an application-owned Pi adapter boundary around the verified runtime contract, with the required event and settle semantics in place.
- The next implementation step is board-process orchestration and member-specific execution flow, using the confirmed `RpcClient` boundary rather than unverified assumptions.

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
- Verified the adapter boundary with dedicated tests and a clean TypeScript compile.
- Committed and pushed the verified work to origin successfully.

## Open items to track over time

- Implement board-process orchestration on top of the verified adapter boundary.
- Confirm member-level run scoping and private Pi session behavior during actual board execution.
- Revisit the design if the runtime contract changes materially in a future pinned package upgrade.
- Keep any future implementation decisions clearly marked as architecture decisions versus observed reference behavior.

## Decision log

### D1
The repo has reached a stable deterministic preflight milestone; the remaining critical blocker is the Pi runtime contract gate before orchestration work is trusted.

### D2
The design should continue to distinguish between what is evidence-backed and what is a v1 implementation choice.

### D3
The config/agent/brief layer can proceed independently of Pi verification, but orchestration should not depend on unverified Pi API behavior.

### D4
The next implementation step is to build board-process orchestration on top of the verified Pi adapter contract, not to re-open the runtime API gate.
