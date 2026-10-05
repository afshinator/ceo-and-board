# CEO--Board Decision System

## Technical Architecture --- v0.70

**Scope:** Pi extension architecture, run/session persistence,
deliberation state machine, and agent/brief contracts

------------------------------------------------------------------------

# 1. Scope

This document defines the current technical architecture for the
CEO-Board Decision System. It covers project structure, run identity,
conversation and tool-use persistence, the deliberation state machine,
Pi extension responsibilities, brief packaging, and agent-definition
contracts.

Where the available reference material does not establish an exact
mechanism or schema, the item is explicitly marked TBD rather than
inferred.

------------------------------------------------------------------------

# 3. Identity Model

## 3.1 `session_id`

`session_id` is the compact machine/session identifier recorded by the
reference conversation log.

Observed example:

``` text
9xfmor
```

The harness generates `session_id` immediately after the selected brief has been validated and the run is initialized, before CEO framing begins. The v1 generation algorithm is the base-36 representation of Unix epoch milliseconds at run creation (`Date.now().toString(36)` in JavaScript/TypeScript). The same CEO/Board `session_id` applies to the CEO and all board members for that run.

## 3.2 `session_name`

`session_name` is the human-readable directory name derived from
brief/session information and associated with the session.

Observed screenshot example:

``` text
2026-03-18-acquisition-offer-9xfmor
```

The v1 `session_name` is:

``` text
<brief-directory-name>-<session_id>
```

The selected brief directory name is already a filesystem-safe project identifier and is preserved as written; no second timestamp or additional sanitization layer is added. Before creating the run directory, the harness verifies that the resulting `session_name` is unused. If a collision exists, it generates a new `session_id` and recomputes `session_name`.

The existing product decision that memo storage uses:

``` text
.pi/ceo-agents/memos/<session_name>/memo.md
```

remains unchanged.

## 3.3 Relationship

A run therefore has at least:

``` text
session_id   = compact identity
session_name = human-readable storage/archive name
```

The CEO/Board run and memo archive therefore use the same `session_name` derived from the selected brief directory and the shared harness-generated `session_id`.

------------------------------------------------------------------------

# 4. Project and Run Layout

The reference project uses project-local CEO/Board data beneath
`.pi/ceo-agents/` and an application extension beneath `apps/ceo/`.

``` text
.pi/
└── ceo-agents/
    ├── agents/
    │   ├── ceo.md
    │   └── <board-member>.md
    ├── briefs/
    │   └── <brief-directory>/
    │       ├── brief.md
    │       └── <supporting-context>.md
    ├── deliberations/
    │   └── <session_name>/
    │       ├── session.json
    │       ├── conversation.jsonl
    │       ├── tool-use.jsonl
    │       ├── snapshot/
    │       │   ├── ceo-and-board-configuration.yaml
    │       │   ├── agents/
    │       │   │   ├── ceo.md
    │       │   │   └── <active-board-member>.md
    │       │   └── rendered-prompts/
    │       │       ├── ceo.md
    │       │       └── <active-board-member>.md
    │       ├── pi-sessions/
    │       │   └── <agent>/
    │       │       └── <pi-session>.jsonl
    │       └── <generated artifacts>
    ├── expertise/
    │   └── <expertise files>
    ├── memos/
    │   └── <session_name>/
    │       └── memo.md
    └── ceo-and-board-configuration.yaml

apps/
└── ceo/
    └── extensions/
        └── ceo-and-board.ts
```

Generated SVG artifacts are directly observed alongside the JSONL files
inside a deliberation session directory.

The product decision for final memo storage is:

``` text
.pi/ceo-agents/memos/<session_name>/memo.md
```

This memo directory lives under the project-local `.pi/ceo-agents/` tree,
alongside the agents, briefs, deliberations, and expertise directories.

`session.json`, `snapshot/`, and the `pi-sessions/` subtree are implementation decisions for this system rather than reference-evidence requirements. They are run-scoped and retained with the archived deliberation. The selected brief package is not copied into the run because used brief packages are project-history inputs and become immutable once referenced by a run.

------------------------------------------------------------------------

# 5. Persistence Responsibilities

## 5.1 `conversation.jsonl`

Purpose:

> Persist what was communicated as part of the shared board
> deliberation.

It is the history agents may reread in later rounds.  It can also be used for observability.

It is **not** the general execution log.

## 5.2 `tool-use.jsonl`

Purpose:

> Persist observable tool activity performed by agents.

It provides execution observability without polluting shared
deliberation context.

## 5.3 Generated artifacts

Run-scoped deliberation artifacts such as SVGs are stored directly in the session directory beneath `deliberations/<session_name>/`.

No separate durable artifact manifest or `register_artifact()` tool is required in v1. A successful agent file creation/modification inside the run directory is sufficient for runtime artifact registration, excluding harness-owned files/directories such as `conversation.jsonl`, `tool-use.jsonl`, `session.json`, `pi-sessions/`, and `snapshot/`.

Artifacts created during an active board round obey the same current-round isolation rule as board responses: the creating agent and harness may access them immediately, but peers do not receive them as shared context until that round's barrier completes. A file from a failed attempt is preserved for diagnostics but is not promoted to shared deliberation context unless a subsequent accepted response explicitly references/promotes it.

Artifact creation does not require a synthetic record in `conversation.jsonl`. If an artifact is semantically relevant, the creating agent references it naturally in its accepted board response. `tool-use.jsonl` records the actual `write`, `edit`, `bash`, or other tool invocation according to the narrow tool-use contract; it does not become an artifact metadata registry.

A file is eligible to become a shared artifact only after its creating tool operation completes successfully and the file exists as a complete regular file. Partial/corrupt files left by aborted execution remain archival debris, not shared context.

Board-deliberation artifact filenames may be descriptive and agent-chosen. Creation must be collision-safe; existing files shall not be silently overwritten. CEO memo-specific artifacts are stored beside the memo as defined in the synthesis section.

## 5.4 `session.json`

`session.json` is the run-scoped authoritative checkpoint of the latest CEO/Board harness control state. It is an implementation decision, not a reference-evidence requirement.

It is a mutable snapshot, not an append-only event log. Historical deliberation remains in `conversation.jsonl`; historical tool activity remains in `tool-use.jsonl`; private Pi execution history remains in the per-agent Pi session files.

At minimum, `session.json` persists:

- `session_id` and `session_name`;
- selected brief reference;
- run creation/update timestamps;
- workflow `status`;
- current `round` and `round_state` (`IDLE` or `IN_PROGRESS`);
- forced-close state and reason (`max_time`, `max_budget`, or `null`);
- active board membership;
- per-agent control state (`ACTIVE`, `RUNNING`, `RETRYING`, or `UNAVAILABLE` as applicable);
- per-agent current attempt number;
- per-agent Pi session identifier;
- optional per-agent `last_activity_at` for diagnostics.

The normal workflow status values are `INITIALIZING`, `VALIDATING`, `CEO_FRAMING`, `DELIBERATING`, `FINAL_CLOSING`, `SYNTHESIS`, `COMPLETED`, and `FAILED`. If an owning harness process disappears while the checkpoint is in a nonterminal state, the archived run may be marked `INTERRUPTED` for inspection. `INTERRUPTED` is an archival/run condition, not a normal workflow phase.

`session.json` shall not duplicate prompts, board responses, tool-call history, token/cost history, or retry-event history. It records only latest authoritative control state.

The checkpoint is written using temporary-file plus atomic-replace semantics after meaningful control-state mutations, including run initialization, workflow-state changes, round start/barrier completion, retry transitions, `UNAVAILABLE`, forced-close activation, and terminal status changes. It is retained with both completed and failed/interrupted runs.

v1 does not resume failed or interrupted runs from this checkpoint.

## 5.5 Project-level active-run lock

v1 permits only one active CEO/Board run per project. This prevents concurrent runs from racing while updating shared cross-run expertise files.

The harness acquires a project-local operational lock before creating/starting a run, conceptually:

``` text
.pi/ceo-agents/.active-run.lock
```

The lock records enough ownership information to detect staleness, including `session_id`, process ID, and creation timestamp. If the owning process is alive, a second `/ceo-begin` is rejected. If the owning process is gone, the prior nonterminal run is classified as interrupted for archive/diagnostic purposes, the stale lock is cleared, and a new run may start.

The lock is released on normal `COMPLETED`/`FAILED` termination and during interrupted-process cleanup. It is operational state rather than part of the permanent run archive.

------------------------------------------------------------------------

# 6. `conversation.jsonl`

## 6.1 Observed record model

The supplied sample establishes three record categories.

### Meeting start

Observed shape includes:

``` json
{
  "type": "meeting_start",
  "session_id": "9xfmor",
  "timestamp": "2026-03-19T16:37:31.629Z",
  "brief": "..."
}
```

The supplied copy truncates the `brief` value, its the path to the brief being referenced in the run.

### Deliberation message

Observed shape:

``` json
{
  "from": "CEO",
  "to": "all",
  "message": "..."
}
```

Board messages use the same shape with the board member in `from`.

Notably, the observed ordinary message records do **not** show a `type`,
`event_id`, `seq`, `phase`, `round_id`, `actor`, or `caused_by` field.

behavior.

### Meeting end

Observed shape includes:

``` json
{
  "type": "meeting_end",
  "timestamp": "2026-03-19T16:46:09.081Z",
  "elapsed_minutes": 8.6,
  "total_cost": 4.61,
  "end_reason": "max_time_constraint"
}
```

The supplied copy is truncated after the visible `end_reason` value, so
no additional fields are asserted.

## 6.2 Conversation semantics

The conversation stream contains:

``` text
meeting_start
CEO → all
board member → all
CEO → all
board member → all
...
meeting_end
```

Current-round isolation is enforced by the harness even though persisted
board responses use `to: "all"`.

## 6.3 Shared-context rule

Only the appropriate persisted conversation history becomes shared
conversational context.

A tool call, file read, file write, or other execution detail does not
become peer-visible simply because it appears in `tool-use.jsonl`.

------------------------------------------------------------------------

# 7. `tool-use.jsonl`

## 7.1 Observed fields

The screenshot establishes records with at least:

``` json
{
  "agent": "Moonshot",
  "timestamp": "2026-03-19T16:38:10.664Z",
  "tool_name": "read"
}
```

The screenshot cuts off the right side of the records. Therefore we do
**not** currently know the complete schema; but probably it should also include what was read and succinctly why.

## 7.2 Observed tool names

The visible sample includes:

``` text
read
write
edit
bash
converse
```

Other tool names may exist; the sample is not exhaustive.

## 7.3 Agent attribution

Tool-use records identify the agent performing the operation.  These include the ceo and other board members.

Visible examples include:

``` text
CEO
Product Strategist
Technical Architect
Compounder
Revenue
Contrarian
Moonshot
```

## 7.4 Unknown fields

The screenshot visibly continues beyond `tool_name`, but those fields
are cropped.

We therefore do not currently specify:

-   tool arguments;
-   tool result;
-   file path;
-   success/failure status;
-   duration;
-   tool-call identifier;
-   parent turn;
-   cost;
-   token usage.

Any of these may exist in the hidden portion, but asserting them now
would be guessing.

## 7.5 Writer contract for v1

The recovered sample supports a narrow run-scoped tool-use record with `agent`, `timestamp`, and, when known, `tool_name`. Our writer shall emit those fields for actual tool invocations and shall not mirror the complete Pi RPC event stream.

``` json
{"agent":"Compounder","timestamp":"...","tool_name":"read"}
```

Known tool invocations include normal Pi tools such as `read`, `write`, `edit`, and `bash`, plus CEO/Board custom tools such as `converse` and `end_deliberation` when invoked.

Pi lifecycle/message events, token/cost/context telemetry, constraint transitions, retry transitions, and harness state changes are not tool-use records and shall not be copied into `tool-use.jsonl` merely because they are observable over RPC. Reference records without a visible `tool_name` may be tolerated when reading historical fixtures, but our writer should provide `tool_name` for known tool events.

------------------------------------------------------------------------

# 8. Separation Contract

The architectural boundary is:

``` text
conversation.jsonl
    shared deliberation protocol

tool-use.jsonl
    execution/tool observability
```

This boundary is functional, not merely organizational.

## 8.1 Visibility

`conversation.jsonl` may become model context in subsequent rounds.

`tool-use.jsonl` shall **not** automatically become model context for
peer agents.

## 8.2 No duplication requirement

A tool invocation should not be copied into `conversation.jsonl` merely
so the UI can display it.

The UI should obtain tool telemetry from the tool-use stream or runtime
state.

## 8.3 `converse`

The reference tool-use sample records the CEO using a tool named:

``` text
converse
```

This is a pi-extension we're going to develop as part of this project.

The resulting CEO/board communications are persisted separately in
`conversation.jsonl`.

This is a useful concrete example of the boundary:

``` text
tool-use.jsonl: CEO invoked converse
conversation.jsonl: messages produced by that deliberation action
```

------------------------------------------------------------------------

# 9. Ordering

Each JSONL file is append-oriented.

The supplied samples do not establish:

-   explicit sequence numbers;
-   event IDs;
-   causal IDs;
-   round IDs.

Therefore those fields are not required.

Ordering within each file is represented by line order and timestamps
where present.

Cross-file total ordering is not yet guaranteed by the architecture.

Whether we need explicit correlation IDs between conversation and
tool-use records should be decided only if implementation requirements
demand them.

------------------------------------------------------------------------

# 10. Crash-Safe Persistence

The implementation should preserve already-written complete JSONL lines
across interruption.

For each JSONL stream:

1.  append one complete JSON object per line;
2.  flush committed lines appropriately;
3.  never rewrite historical committed lines during an active run;
4.  on recovery, ignore/discard an incomplete trailing line.

The exact fsync/atomic-write strategy is implementation-specific.

`session.json` shall be written using temporary-file plus atomic-replace semantics.

------------------------------------------------------------------------

# 11. Immutable Session Inputs

A selected brief package remains in its original `briefs/<brief-directory>/` location and is not copied into the run directory. Once a brief package has been used by a run, that directory is immutable project history: `brief.md` and its sibling supporting-context files shall not be edited or removed. A materially changed decision input is represented by a new brief directory.

Configuration and agent instructions can legitimately evolve between runs. Therefore each run snapshots the effective execution inputs that govern agent behavior under:

``` text
deliberations/<session_name>/snapshot/
```

The snapshot contains:

- the effective `ceo-and-board-configuration.yaml`;
- the source `ceo.md`;
- source definitions for active board members only;
- the fully rendered runtime system prompt actually supplied to the CEO;
- the fully rendered runtime system prompt actually supplied to each active board member.

Inactive/unconfigured agent definitions are not snapshotted. The snapshots are archival evidence and are not edited during the run.

------------------------------------------------------------------------

# 12. Unassigned Persistence Concerns

The following might want to be recorded in the run log, but not defined as part of the system from the reference video:

-   retry events;
-   failure records;

Failed attempts must not create synthetic shared-deliberation messages in `conversation.jsonl`. Their exact durable observability/persistence schema remains unresolved.

The following should **not** be forced into either JSONL file merely for observability:

-   lifecycle-transition history;
-   constraint-detection event history;
-   agent-turn start/completion history;
-   provider request metadata;
-   token/context telemetry;
-   cost telemetry beyond the observed `meeting_end.total_cost`;
-   artifact metadata.

`session.json` stores the latest lifecycle/constraint/agent control state where required, but it does not preserve those changes as an event history. Any future need for historical lifecycle/retry/failure events should be satisfied by an explicitly designed execution/event log rather than by overloading the existing shared-conversation or tool-use streams.

------------------------------------------------------------------------

# 13. Persistence Architecture Decisions

**TD-01 --- Separate identity and storage name**\
Use distinct `session_id` and `session_name` concepts.

**TD-02 --- Separate conversation and tool-use streams**\
`conversation.jsonl` and `tool-use.jsonl` have different
responsibilities.

**TD-03 --- Conversation is shared deliberation**\
The conversation stream is eligible to become subsequent-round shared
context.

**TD-04 --- Tool use is observability**\
The tool-use stream does not automatically become shared agent context.

**TD-05 --- Reference-compatible conversation records**\
Do not require a universal event envelope that is not present in the
reference records.

**TD-06 --- Narrow tool-use writer**\
Write `agent`, `timestamp`, and known `tool_name` for actual tool invocations. Do not mirror the Pi RPC event stream or invent unsupported historical fields.

**TD-07 --- Run checkpoint**\
Use `session.json` as the atomic latest-state checkpoint for harness control state. It is retained with the run and is not an event log or a v1 resume mechanism.

------------------------------------------------------------------------

# 14. Remaining TBDs

**TBD-03 --- Complete `tool-use.jsonl` schema**  
Need an uncropped sample or source implementation to establish any fields beyond the v1 narrow writer contract.

**TBD-04 --- Conversation extensions**  
Whether future versions should add fields beyond the reference-compatible records.

**TBD-05 --- Cross-log correlation**  
Whether explicit turn/tool correlation IDs become necessary for later observability features.

**TBD-07 --- Retry/failure event history**  
`session.json` persists the latest retry/availability state. Whether a separate historical execution/event log is useful remains a future decision.

**TBD-10 --- Exact reference prompt bodies**  
The unrecovered portions of the CEO and board-member reference prompts remain unknown until source/clearer evidence is obtained.

------------------------------------------------------------------------

# Workflow State Machine

The domain workflow is:

``` text
Brief
  ↓
CEO Frames
  ↓
Board Debates
  ↕
Constraint Check
  ↓
Final Statements
  ↓
Memo
  ↓
COMPLETED
```

This workflow doesnt show that Board Debates include a time and token limited 'round' which includes reply to ceo, and ceo decision whether to call for final statements or wrangle new prompts for board for another round.  This is a loop that can continue until time/token allowance runs out or ceo decides enough is known to end loop.

`FAILED` is a terminal outcome when execution cannot continue
successfully.  If the CEO fails, then that is a definite system failure.

## Control ownership

The harness owns execution mechanics, wall-clock and cost tracking,
constraint enforcement, parallel board execution, round barriers,
retries, session status, persistence, and TUI rendering.

The CEO owns semantic deliberation: framing the decision, deciding what to ask, processing complete board rounds, choosing voluntary closure when eligible, invoking `end_deliberation()`, ingesting final statements, synthesizing the decision, and writing the memo.

## State model

The implementation state model is:

``` text
INITIALIZING
  ↓
VALIDATING
  ↓
CEO_FRAMING
  ↓
DELIBERATING
  ↓
FINAL_CLOSING
  ↓
SYNTHESIS
  ↓
COMPLETED

Any unrecoverable CEO/session failure → FAILED
```

`DELIBERATING` contains repeated `converse()` rounds and continuous
constraint monitoring.

## Brief → CEO Frames

The selected brief is validated and fixed for the run. The CEO receives the full brief plus supporting context and runtime context.

The CEO reads the material, may read/update its private
expertise/scratchpad, frames the question for the board, and calls `converse()`.

## Board Debates --- `converse()`

A `converse()` call creates a board round. The CEO-facing tool contract is:

```ts
converse({
  to: "all" | string | string[],
  message: string
})
```

Recipient selection is explicit. `"all"` resolves to all currently active/available configured board members at invocation time. A single member or configured subset may also be addressed. Unknown board-member names are tool-input errors. An explicitly addressed member already marked `UNAVAILABLE` is reported as unavailable and is not executed.

For each participating board member, the extension establishes access to:

- that member's agent definition/system prompt;
- the selected `brief.md`;
- all supplemental files in the selected brief directory;
- prior shared `conversation.jsonl` history;
- that member's own expertise/scratchpad;
- configured skills/tools;
- the CEO's current `message`;
- current runtime/session context required by the harness.

The extension provides these as runtime context/references; the board Pi process performs its normal reads. Same-round peer responses are excluded from the member's visible context until the round barrier completes.

All participating board members execute asynchronously/in parallel. The CEO does not regain semantic control until every participating member has either:

- completed the round successfully; or
- exhausted its one retry and been marked `UNAVAILABLE`.

After the barrier, `converse()` returns the full available board responses, explicit participant resolution status, and current constraint control state. The semantic shape is:

```ts
type ConverseResult = {
  responses: Array<{
    member: string;
    status: "completed" | "unavailable";
    message?: string;
  }>;
  constraint: {
    forced_close: boolean;
    reason?: "max_time" | "max_budget";
    voluntary_close_allowed: boolean;
  };
};
```

The harness does not synthesize or replace board responses with a round summary. Tool traces, file reads/writes, and detailed telemetry are not part of the CEO-facing `converse()` result unless separately required by a later implementation decision.

The harness maintains internal monotonically increasing round state for barrier/control purposes. No `round_id` is required in `conversation.jsonl` or in the CEO-facing tool result. If later implementation requires correlation identifiers for subprocesses or observability, they remain internal/execution concerns unless explicitly promoted into a persistence contract.

The CEO then processes the completed round and may update its private scratchpad.

Before `min_time_minutes` has elapsed, the next semantic action must keep the deliberation open; the CEO may not voluntarily close.

After `min_time_minutes` has elapsed, the CEO may either call `converse()` again or voluntarily call `end_deliberation()`.

## Constraint Check

The harness continuously tracks elapsed wall-clock time and accumulated cost.

Constraint semantics:

``` text
min_time_minutes → voluntary-close eligibility threshold
min_budget       → no control-flow effect
max_time_minutes → forced-close trigger
max_budget       → forced-close trigger
```

If either maximum is crossed while a round is active, the harness sets a pending forced-close condition. It does not cancel already-running board members merely because the maximum was crossed.

After the round barrier, the CEO receives/processes the round, but the harness rejects/prevents another normal `converse()` round. The CEO must invoke `end_deliberation()`.

## Final Statements --- `end_deliberation()`

`end_deliberation()` is the single closing path for both voluntary and constraint-triggered closure. Its CEO-facing input contract is:

```ts
end_deliberation()
```

The CEO does not supply recipients. The harness targets every active/applicable board member that remains available for the session. The closing request itself is canonical harness behavior rather than arbitrary CEO-supplied text. It requests one final statement containing the member's final position, strongest supporting reason, and strongest remaining concern or condition. The exact literal prompt wording remains TBD.

Final board executions launch asynchronously/in parallel and resolve subject to the same one-retry rule. `end_deliberation()` returns the full available final statements plus explicit unavailable status for members that cannot provide one. The semantic shape is:

```ts
type EndDeliberationResult = {
  statements: Array<{
    member: string;
    status: "completed" | "unavailable";
    message?: string;
  }>;
};
```

An unavailable member does not receive a fabricated final statement. The Contrarian executes in parallel with the other applicable members but its completed statement is presented/consumed by the CEO last. The ordering among all non-Contrarian responses is unspecified.

After ingesting the complete available final-response set, the CEO enters synthesis. Another normal deliberation round is not valid after `end_deliberation()` begins.

## Retry and failure semantics

Every failed agent execution is retried once.

For a board member:

``` text
attempt fails
  ↓
retry once
  ↓
success → remain active
failure → mark UNAVAILABLE; continue with remaining board
```

`UNAVAILABLE` is terminal for that board member for the remainder of the current session. The member is excluded from later required deliberation responses and from final statements.

For the CEO:

``` text
attempt fails
  ↓
retry once
  ↓
success → continue
failure → session FAILED
```

Retry backoff is not semantically significant in v1; the retry count remains exactly one. The 90-second inactivity watchdog defined below is the hung-turn mechanism rather than an absolute turn-duration limit.

## Expertise persistence and write ownership

Each agent may read only the expertise resources declared for that agent. An expertise entry with `updatable: true` may be modified by its owning agent; otherwise it is read-only. The harness does not merge or synthesize expertise content.

Expertise changes are durable when the underlying file write/edit succeeds. They are not rolled back if a later response or session step fails. This matches the persistent-learning model and avoids transactional rollback around model-driven filesystem writes.

Because expertise is shared across runs, v1's project-level active-run lock ensures that two runs cannot concurrently update the same agent expertise file.

## Memo / Synthesis

Synthesis begins only after `end_deliberation()` has resolved all active/applicable board members and the accepted final statements have been persisted to `conversation.jsonl`. This persistence ordering guarantees that the board's final positions survive even if CEO synthesis later fails.

The CEO synthesis context includes:

- the full selected brief package;
- complete accepted shared conversation;
- all available final board statements;
- the CEO's private expertise/scratchpad;
- shared run artifacts that passed the round-visibility rules.

`tool-use.jsonl` is not injected merely because it exists.

The canonical memo location is:

``` text
memos/<session_name>/memo.md
```

The required v1 semantic memo body is:

``` text
# Board Memo: <title>

## Final Decision
## Ranked Recommendations
## Decision Map
## Board Stances
## Tensions & Dissent
## Trade-offs & Risks
## Next Actions
## Deliberation Summary
```

The memo must contain a concrete final decision even when evidence is incomplete or the board disagrees. Ranked recommendations contain up to three meaningful entries; recommendation #1 represents the primary decision. Unavailable members are identified as unavailable rather than assigned fabricated stances. No formal vote tally is required.

Memo frontmatter is parsed separately from the Markdown body and contains at least:

``` yaml
title: <string>
date: <timestamp/date>
session_id: <session id>
duration: <elapsed duration>
budget_used: <numeric/string display value derived from harness state>
board_members: <active member list>
brief: <brief path/reference>
transcript: <conversation.jsonl path/reference>
```

Deterministic metadata (session ID, date, duration, budget, board names, brief/transcript references) is supplied/verified by the harness rather than invented by the CEO.

After the CEO writes the memo, a deterministic validator parses YAML frontmatter and validates its structured fields with Zod. A deterministic Markdown parser/checker verifies required headings and that `Final Decision` is non-empty. The validator also checks deterministic metadata against harness state. No LLM participates in this acceptance check.

A memo validation/generation failure is a CEO execution failure: retry once in the same CEO Pi session with explicit instruction that the prior memo attempt was not accepted. A second failure marks the session `FAILED`; accepted final board statements and all prior records remain preserved. Partial/invalid memo files remain inspectable but are not presented as successful output.

The reference-compatible CEO may have an SVG skill that generates a `decision-map.svg` beside `memo.md` and references it from the Markdown. This is skill/configuration-driven rather than hard-coded into the harness. Failure of an optional visualization does not invalidate an otherwise valid memo.

Optional TTS remains non-blocking and non-required for v1.

Completion ordering is:

``` text
final statements persisted
→ CEO synthesis/memo write
→ deterministic memo validation
→ configured required memo-side artifacts, if any
→ append meeting_end
→ session.json = COMPLETED
→ optional/non-blocking post-actions (TTS, editor launch)
```

The configured editor may be launched after the run is already `COMPLETED`. Editor-launch failure produces a warning only and cannot change the session result.

## Failed sessions

`FAILED` sessions preserve already-written conversation history,
tool-use history, generated artifacts, and expertise/scratchpad changes.

v1 does not resume a failed run.

# Pi Extension Execution Architecture

The system is implemented as a Pi extension. The demonstrated launch
form is:

``` text
cd apps/ceo && pi -e extensions/ceo-and-board.ts
```

The extension registers the one-shot `/ceo-begin` command. Normal
free-form interactive chat is not the product interaction model.

The reference extension establishes that board members are separate Pi
agent processes with persistent sessions. For this implementation, board
execution shall use Pi's documented RPC mode rather than a custom
provider-SDK integration or an ad-hoc stdout protocol. TypeScript control
should use Pi's maintained `RpcClient` where available.

## Board-member process/session model

Each active board member receives one long-lived Pi RPC subprocess for the
duration of the CEO/Board run. Board members execute concurrently because
the extension controls multiple independent Pi processes.

Conceptually:

``` text
CEO Pi process
  └─ CEO/Board extension
       ├─ Pi RPC process: <board member A>
       ├─ Pi RPC process: <board member B>
       └─ Pi RPC process: <board member N>
```

Each board process uses one persistent Pi session for the duration of the CEO/Board run. The extension selects that session using Pi's `--session-id` and `--session-dir` mechanisms.

All agents share the CEO/Board run `session_id`, but each Pi execution session has a distinct derived identifier:

``` text
<session_id>.ceo
<session_id>.<board-member-slug>
```

Per-agent Pi session files live under:

``` text
deliberations/<session_name>/pi-sessions/<agent>/
```

They are private run-scoped execution history. They are retained with the archived run and are never reused as the Pi session for a later CEO/Board decision.

Process lifetime, Pi-session lifetime, and expertise lifetime are distinct:

``` text
board Pi process      = current CEO/Board run
board Pi session      = current CEO/Board run
agent expertise       = cross-run persistent
conversation.jsonl    = current CEO/Board run shared deliberation
```

A board member's Pi session is private execution history and is not the
authoritative shared board conversation. `conversation.jsonl` remains the
canonical shared deliberation record.

## Board-agent customization

Agent definitions under `agents/<member>.md` remain application-owned. The extension parses their YAML frontmatter and Markdown body. The Markdown body becomes the agent-specific system prompt, with runtime material appended or injected by the extension.

Runtime prompt construction follows the recovered reference-agent structure rather than inventing a universal schema. For the CEO, the recovered `ceo.md` establishes the runtime variables `SESSION_ID`, `BRIEF_CONTENT`, `BOARD_MEMBERS`, `MEMO_PATH`, `MIN_TIME`, `MAX_TIME`, `MIN_BUDGET`, and `MAX_BUDGET`, plus a runtime Context section. Board-specific runtime-variable names shall be taken from the recovered/reference board files when available; functionality shall not depend on unverified variable names.

Pi supports replacing or appending system prompts at process startup. The
implementation shall use those documented mechanisms rather than depend on
Pi's generic project `SYSTEM.md` as the source of board personas. This keeps
the CEO/Board agent-definition contract authoritative.

Agent `skills:` entries shall be resolved by the extension and made available
to the corresponding Pi process using Pi's skill/resource mechanisms. Skill
bodies should not be indiscriminately concatenated into every round prompt.

## Board execution context

For every board member, the extension shall establish access to:

- the board member's parsed agent definition/system prompt;
- the selected `brief.md`;
- every supplemental file in the selected brief directory;
- prior shared `conversation.jsonl` history through the pre-round barrier;
- the board member's own configured expertise/scratchpad resources;
- configured skills/tools;
- session/runtime identifiers and control information needed by the agent;
- the current CEO `message` for the round.

The extension should provide stable paths/runtime variables and instruct the
board agent to use normal Pi file/tool access to read the brief package, shared
conversation, and private expertise. It shall not treat the CEO round message
as a substitute for the full brief package.

Current-round peer responses shall not be exposed until the round barrier has
completed.

## RPC turn lifecycle

A board execution attempt follows this control sequence:

``` text
verify participant is applicable
  ↓
ensure board RPC process/session is available
  ↓
record pre-turn session stats
  ↓
send RPC prompt containing the current CEO round instruction
  ↓
consume Pi events for runtime/TUI observability
  ↓
wait for `agent_settled`
  ↓
capture authoritative final assistant text
  ↓
record post-turn session stats
  ↓
return board-attempt result to round barrier
```

A successful RPC `prompt` acknowledgement means only that Pi accepted/queued
the prompt. It does not satisfy the round barrier. The harness waits until Pi
emits `agent_settled`, because retries, compaction, follow-up processing, or
other automatic work may occur after lower-level agent completion.

Streaming `message_update` events may drive live TUI output. The authoritative
board response shall come from the completed assistant message (for example
`message_end`) or Pi's `get_last_assistant_text` command after the agent is
settled. The harness shall not reconstruct the final response solely from
streaming deltas.

## Retry ownership

The CEO/Board harness owns the architecture's exactly-one-retry policy. Pi's
own automatic retry mechanism for transient provider failures shall therefore
be disabled for managed board processes (`set_auto_retry(false)`) unless a
later explicit design changes retry ownership.

This prevents hidden Pi retries from being combined with the harness retry and
changing the intended attempt count.

A failed board attempt is retried once by the harness using the same run-scoped Pi session. If the child process remains healthy, the retry reuses it. If the child process exited or became unusable, the harness launches a replacement Pi RPC process against that same Pi session.

The retry instruction explicitly states that the prior attempt failed and produced no accepted board response, and that incomplete prior output must not be treated as an accepted deliberation contribution. Failed attempts are never appended as fabricated shared messages in `conversation.jsonl`.

If testing later demonstrates that a particular Pi failure mode contaminates the resumed context, a fork-from-pre-attempt strategy may be introduced as a targeted implementation change; v1 does not add that complexity preemptively.

## Failure and cancellation mechanics

An execution attempt may fail because of at least:

- child-process startup failure;
- unexpected child-process exit;
- RPC/protocol failure;
- a final assistant response with an error/aborted outcome;
- harness sanity-timeout expiration.

Pi's RPC `abort` command is the cancellation primitive for an in-progress board turn.

The v1 sanity timeout is an inactivity watchdog, not a wall-clock turn limit: 90 seconds with no observable Pi activity causes the harness to issue `abort` and classify the attempt as failed. Meaningful Pi lifecycle/message/tool activity resets the watchdog, including file/artifact-generation activity. Continuous legitimate work may therefore exceed 90 seconds without being treated as hung. The global meeting constraints remain separate from this hung-agent watchdog.

Failure/retry state remains runtime-visible and follows the existing
`FAILED_ATTEMPT → RETRYING → UNAVAILABLE` architecture. Exact durable
retry/failure persistence remains separately unresolved.

## Model selection

The authoritative model for the CEO or a board member is the `model:` value in that agent's Markdown frontmatter. The meeting YAML does not duplicate model selection in v1.

At preflight, the harness validates that each active agent definition contains a valid model identifier that Pi can resolve. At process/session initialization, the extension configures Pi with that frontmatter-selected model using Pi's normal model-selection mechanism. The extension shall not implement direct provider adapters.

The model remains stable for the run unless a later explicit product decision permits runtime model changes.

## Usage, cost, and context telemetry

Per-board telemetry shall use Pi's `get_session_stats` RPC command. Pi provides
session token counts, cumulative cost, and current context-window usage.

For a single board response, incremental usage/cost may be derived from the
difference between pre-turn and post-turn session statistics. Current context
usage shall use Pi's reported `contextUsage` rather than a harness estimate. If
Pi reports context usage as unavailable, the UI/runtime shall represent it as
unavailable rather than synthesize a value.

This removes the need for provider-specific usage/cost/context adapters inside
the CEO/Board extension.

## Pi capability basis

These implementation choices rely on documented Pi runtime capabilities:

- RPC mode is a long-lived JSONL command/event interface;
- TypeScript/Node integrations are directed to Pi's `RpcClient`;
- persistent sessions can be selected with `--session-id`, `--session`, and
  `--session-dir`;
- system prompts can be replaced/appended at startup;
- models are selected through Pi rather than provider SDK calls;
- `agent_settled` indicates that Pi will not continue automatic work;
- `get_last_assistant_text` returns the last assistant response text;
- `get_session_stats` exposes token, cost, and context usage;
- `set_auto_retry` controls Pi's internal transient-error retry behavior;
- `abort` stops current work and waits for the session to become idle.

The exact Pi package/module import paths shall be verified against the installed
Pi version during implementation rather than frozen here from web documentation.

## Runtime TUI architecture

The parent CEO Pi extension owns the visible runtime interface and uses Pi's UI APIs. Board-member Pi RPC subprocesses remain headless; their RPC lifecycle/tool events feed parent-side runtime state and rendering.

The v1 TUI preserves the observed vertical structure:

``` text
CEO converse callout / current semantic output
Global status
Configured board-member live rows
Time and budget progress area
CEO + board telemetry rows
```

The main runtime board is implemented as a persistent Pi widget/custom component rather than repeated notifications. `ctx.ui.notify()` remains appropriate for startup/missing-config warnings and exceptional notices.

Collapsed member rows show status plus the latest meaningful observable activity (for example reading a file, invoking a skill/tool, writing an artifact, or waiting for model output). Expanded member views may show recent observable tool/file/artifact events and accepted response text. The UI never exposes or fabricates private chain-of-thought.

UI display labels/icons are centralized in a presentation configuration/module so wording such as `responding...`, `retrying...`, `unavailable`, `[deliberating]`, `[closing]`, `[synthesizing]`, `[complete]`, and `[failed]` can be changed without changing persisted lifecycle states.

Time and budget bars cover the complete interval from zero through the configured minimum marker to the configured maximum marker. Values below minimum visibly occupy the first segment. Textual elapsed time/cost is not clamped at the maximum because closing/synthesis may continue after `max reached`.

Per-agent response count is an app-level accepted-response count, not raw Pi message/tool count. Per-turn cost is derived from the delta between pre-turn and post-turn Pi session stats. Remaining context is derived from Pi-reported `contextUsage` (`contextWindow - tokens`) when available; unavailable Pi telemetry renders as unavailable rather than estimated.

Board-member colors come from YAML. Other styles, labels, truncation/wrapping policy, and keyboard bindings are centralized implementation/presentation concerns. Default interaction should keep rows collapsed, allow selection plus expand/collapse, truncate collapsed activity to one line, and wrap expanded content.

Herdr may be integrated later as an optional richer multi-agent observability/maximized view. It is not required for execution correctness and does not replace the parent Pi extension as the authoritative runtime UI in v1.

## Agent-definition contract

Agent definitions are Markdown files with YAML frontmatter. The CEO
reference visibly establishes:

``` yaml
name: ceo
expertise:
  - path: .pi/ceo-agents/expertise/ceo-scratch-pad.md
    use-when: "..."
    updatable: true
skills:
  - path: <skill path>
    use-when: "..."
model: <Pi-supported model identifier>
domain: []
```

`expertise` and `skills` are structured lists. The `use-when` field
describes when the referenced resource should be used, and an expertise
entry may be marked `updatable: true`.

The `model:` value in each active agent definition is authoritative for v1 model selection. The meeting YAML does not override it.

The CEO Markdown body is a system prompt organized into sections
including `Purpose`, `Variables`, `Instructions`, `Workflow`, `Context`, and `Report`. Exact text that is not visible in the supplied source material must not be reconstructed by inference.

## Brief package

A selectable brief is directory-scoped:

``` text
briefs/
└── <brief-directory>/
    ├── brief.md
    └── <optional supporting context files>
```

The canonical `brief.md` structure is:

``` text
# Brief: <concise title framed as a question>

## Situation
## Stakes
## Constraints
## Key Question
```

The `Constraints` section describes constraints on the decision itself.  Meeting-runtime time and budget limits are separate configuration concerns.

The acquisition example visibly stores `business-metrics.md` and
`product-overview.md` beside `brief.md`. For v1, every regular sibling file in the selected brief directory other than `brief.md` is supporting context and is made available to the CEO and all board members. Used brief packages are immutable project history after a run references them.

## Configuration and startup

The canonical configuration path is:

``` text
.pi/ceo-agents/ceo-and-board-configuration.yaml
```

The v1 configuration contract is:

``` yaml
meeting:
  constraints:
    min_time_minutes: <number>
    max_time_minutes: <number>
    min_budget: <number>
    max_budget: <number>
  editor: <string>

brief_sections:
  - section: <required Markdown heading>
    description: <authoring/validation help text>

paths:
  briefs: <path>
  deliberations: <path>
  memos: <path>
  agents: <path>

board:
  - name: <display/agent name>
    path: <agent-definition path>
    color: <display color>
```

`brief_sections[].section` drives deterministic brief validation. `description` is authoring/validation help metadata and is not injected into agent runtime prompts merely because it is present in configuration.

Canonical v1 budget values are numeric dollar amounts. UI rendering adds currency formatting; control logic does not parse dollar-prefixed strings.

`paths.agents` defines the base agent-definition directory. The CEO definition is `<paths.agents>/ceo.md`. Board `path` resolution follows these rules:

1. an absolute filesystem path is used as written;
2. a project-root-relative path beginning with `.pi/` is resolved from the project root;
3. every other board path, including `../...`, is resolved relative to `paths.agents` and normalized.

Canonical configurations should prefer filenames or paths beneath `paths.agents`; `../...` remains supported because it appears in the reference configuration.

A board entry present in the parsed `board:` array is active. Commented-out or absent entries are inactive. The v1 board-entry schema is limited to `name`, `path`, and `color`; model, retry, timeout, skills, and role/domain overrides are not board-entry fields.

The authoritative model is read from each active agent definition's `model:` frontmatter.

### Deterministic preflight validation

After brief selection and before run creation/CEO framing, the harness executes a deterministic validation script. No LLM participates in preflight validation.

Preflight validates at minimum:

- YAML syntax and required configuration structure;
- numeric meeting constraints and `min <= max` relationships;
- required `paths.*` entries and resolvable directories/files;
- existence and parseability of `<paths.agents>/ceo.md`;
- non-empty active board and unique board-member names;
- board path resolution and existence of every active agent definition;
- required agent frontmatter structure, including a Pi-resolvable `model`;
- referenced expertise and skill paths required by active definitions;
- selected brief package existence;
- the selected `brief.md` against every configured `brief_sections[].section` requirement.

Structural/configuration failures are fatal: preflight reports the errors and no run/session is created and no agent execution begins. Non-control cosmetic presentation issues may be warnings where they cannot affect execution correctness.

On Pi `session_start`, the extension renders startup information including configured time range, budget range, editor, board members, and the instruction:

``` text
/ceo-begin to start a deliberation.
```

If the configuration file is missing, the extension reports the canonical path to create.

# Implementation TBDs

- Exact board-specific runtime variable names/text where the corresponding reference board prompt has not yet been recovered.
- Exact literal canonical closing-prompt wording used by `end_deliberation()`.
- Contrarian-last configuration mechanism.
- Exact expertise/scratchpad content conventions (the storage/write contract is defined; prose format remains agent-specific).
- Remaining CEO prompt sections and complete board-member reference prompts.
- Exact presentation polish such as keyboard bindings, narrow-terminal truncation thresholds, and non-board-member colors; these are centralized implementation details rather than architectural blockers.
- Whether later versions add a historical execution/event log for retry/failure/lifecycle events.
