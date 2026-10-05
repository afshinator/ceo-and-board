# CEO--Board Decision System

## Technical Architecture --- v0.66

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

Its generation algorithm remains TBD.

## 3.2 `session_name`

`session_name` is the human-readable directory name derived from
brief/session information and associated with the session.

Observed screenshot example:

``` text
2026-03-18-acquisition-offer-9xfmor
```

The exact derivation algorithm remains TBD.

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

The reference sample suggests `session_name` may include `session_id`,
but this is not yet elevated into a mandatory derivation rule.

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
    │       ├── conversation.jsonl
    │       ├── tool-use.jsonl
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

No additional run files such as `session.json`, copied `brief.md`, or a configuration snapshot are required by the reference evidence. Such checkpoint/snapshot files may be introduced later only as explicit implementation decisions.

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

Artifacts such as SVGs are stored as files in the run directory (the session directory beneath deliberations).

Their exact metadata/linking mechanism remains TBD.

## 5.4 `session.json`

`session.json` remains a proposed implementation checkpoint for latest
harness state.

It is not evidenced by the supplied reference files and must be treated
as a technical design decision.

Its detailed lifecycle fields should not be finalized until the #3
state-machine discussion.

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

`session.json`, if retained, should be written using temporary-file +
atomic-replace semantics.

------------------------------------------------------------------------

# 11. Immutable Session Inputs

Our implementation should reference the effective brief and snapshot the configuration used for a session so later edits do not alter historical meaning.

These would live under 

``` text
deliberations/<session_name>/
```

This remains an implementation design choice; it is not directly
demonstrated by the reference screenshot.

At this point, whether active agent definitions and supporting context files are also snapshotted seems unnecessary.

------------------------------------------------------------------------

# 12. Unassigned Persistence Concerns

The following might want to be recorded in the run log, but not defined as part of the system from the reference video:

-   retry events;
-   failure records;

Failed attempts must not create synthetic shared-deliberation messages in `conversation.jsonl`. Their exact durable observability/persistence schema remains unresolved.

The following should **not** be forced into either JSONL file until we have a reason/evidence:

-   lifecycle transitions;
-   constraint-detection events;
-   agent-turn start/completion;
-   provider request metadata;
-   token/context telemetry;
-   cost telemetry beyond the observed `meeting_end.total_cost`;
-   artifact metadata.

Some of these may ultimately belong in `tool-use.jsonl`, `session.json`, a separate runtime log, or nowhere as durable events.

That decision depends partly on #3 Harness State Machine and TBD.

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

**TD-06 --- Unknown tool-use fields remain unknown**\
Do not design the hidden portion of the tool-use schema from inference.

**TD-07 --- Checkpoint remains provisional**\
`session.json` is retained as a proposed architecture mechanism, but its lifecycle content waits for #3.

------------------------------------------------------------------------

# 14. Remaining TBDs

**TBD-01 --- `session_id` generation**\
Exact compact-ID generation algorithm.

**TBD-02 --- `session_name` derivation**\
Exact brief-derived naming, timestamp, sanitization, and collision
rules.

**TBD-03 --- Complete `tool-use.jsonl` schema**\
Need an uncropped sample or source implementation to establish remaining
fields.

**TBD-04 --- Conversation extensions**\
Whether our implementation should add fields beyond the
reference-compatible records.

**TBD-05 --- Cross-log correlation**\
Whether explicit turn/tool correlation IDs are necessary.

**TBD-06 --- Lifecycle persistence**\
Depends on #3 state-machine design.

**TBD-07 --- Retry/failure persistence**\
The runtime must preserve retry/failure state and expose `UNAVAILABLE` status, but the exact durable event/schema location remains TBD. Failed attempts shall not be represented as fabricated `conversation.jsonl` messages.

**TBD-08 --- Supporting-context snapshot policy**\
Whether context files are copied, hashed, or referenced.

**TBD-09 --- Agent-definition snapshots**\
Whether active agent prompts are archived per session.  If we decide to snapshot agent-definitions, they will be kept under the appropriate dir under deliberations.

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

The exact retry delay/backoff and subprocess timeout mechanics remain
TBD.

## Memo / Synthesis

The CEO synthesizes the decision only after it has ingested the available final board statements.

The completion pipeline may produce:

- `memo.md`;
- a decision-map SVG when useful;
- a spoken summary when the configured CEO skill enables it. (not in v1)

The canonical memo location is:

``` text
memos/<session_name>/memo.md
```

A successful memo write transitions the session to `COMPLETED`.

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

The reference extension describes itself as a v1 deliberation engine
that:

-   registers `converse` and `end_deliberation` custom tools;
-   spawns board-member Pi agent subprocesses with persistent sessions;
-   logs conversations to JSONL;
-   renders board-member responses in the TUI.

The extension uses Pi's extension APIs rather than implementing direct provider SDK integrations.

## Board-member execution

Board members are executed as Pi agent subprocesses. The extension
imports Node's `spawn` facility and Pi extension primitives.

The exact subprocess command-line arguments, persistent-session
identifiers, reconnection mechanism, and usage-return mechanism are not yet visible in the available screenshots and remain TBD.

From the user perspective this is what the board members do/are: customized pi processes with their own system prompts that respond to the ceo;  they are not interactive chats with the user.

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

The visible CEO file specifies its model in frontmatter. The precedence relationship between this field and any other model-related configuration is not established by the available evidence and remains TBD.  For v1, the yaml config file take precedence.

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
`product-overview.md` beside `brief.md`. The exact algorithm used to
discover/load sibling context files remains TBD.  Assume that all files in that dir are supplemental data to the brief that all board members should read.

## Configuration and startup

The canonical configuration path is:

``` text
.pi/ceo-agents/ceo-and-board-configuration.yaml
```

On Pi `session_start`, the extension renders startup information
including configured time range, budget range, editor, board members,
and the instruction:

``` text
/ceo-begin to start a deliberation.
```

If the configuration file is missing, the extension reports the
canonical path to create.

# Implementation TBDs

-   Exact Pi subprocess invocation for each board member.
-   Persistent board-member Pi session creation/reuse.
-   Per-board usage/cost/context accounting mechanism.
-   Exact Pi/TypeScript field naming/serialization details for the now-defined `converse()` and `end_deliberation()` semantic contracts.
-   Exact literal canonical closing-prompt wording used by `end_deliberation()`.
-   Board-member sanity timeout mechanics and exact conditions that constitute an execution failure.
-   Contrarian-last configuration mechanism.
-   Exact expertise/scratchpad format.
-   Remaining CEO prompt sections.
-   Board-member system-prompt templates.
