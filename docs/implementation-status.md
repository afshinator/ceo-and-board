# Implementation Status

This file tracks implementation observations, blockers, and status notes for the CEO–Board decision system. It is intentionally separate from the architecture and proposal documents so evidence can accumulate without rewriting the main design docs.

## Review Checklist

### Architecture blockers addressed since v1.2

- [x] Pi contract uncertainty is now treated as a required gate before orchestration implementation.
- [x] Process/session ownership is explicit: one child Pi subprocess per active board member, each with one persistent private Pi session.
- [x] Evidence vs. architecture decision is clearer: the doc distinguishes reference-observed behavior from settled v1 architecture choices.
- [x] The design now acknowledges that `session.json`, lock files, and snapshot/archive behavior are v1 implementation decisions rather than purely recovered reference facts.

### Current status by concern

#### Pi API contract
Status: not yet proven, but now formally gated.
Notes:
- The v1.3 document adds A0, the Pi runtime contract gate.
- This is the correct place to verify actual package behavior before deeper orchestration relies on it.
- The open risk is not whether the design is conceptually sound, but whether the installed Pi package exposes the exact lifecycle and RPC semantics the design assumes.

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
Status: ready to begin deterministic work; not ready to build the full orchestration without A0 verification.
Notes:
- Schemas, brief validation, and related deterministic modules can proceed.
- The orchestration and Pi adapter layer should wait for the A0 runtime contract gate.

## Open items to track over time

- Verify the actual installed stable Pi package exports and session lifecycle semantics.
- Confirm the exact onEvent / settle / session-restore behavior used by the runtime.
- Revisit the design if the installed Pi package differs materially from the assumed process contract.
- Keep any future implementation decisions clearly marked as architecture decisions versus observed reference behavior.

## Decision log

### D1
The implementation plan is sound as a phased build plan, but the Pi runtime contract is the highest-likelihood blocker until the A0 gate is executed.

### D2
The design should continue to distinguish between what is evidence-backed and what is a v1 implementation choice.

### D3
Deterministic modules can proceed independently of Pi verification, but orchestration should not depend on unverified Pi API behavior.
