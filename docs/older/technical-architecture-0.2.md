# CEO--Board Decision System

## Technical Architecture --- v0.2

**Scope:** Run/Session Data Model + Conversation/Tool-Use Persistence

This revision corrects v0.1 using direct samples of the reference
implementation's `conversation.jsonl` and `tool-use.jsonl`.

------------------------------------------------------------------------

# 1. Scope

v0.2 defines:

1.  run/session identity;
2.  run-scoped persistence layout;
3.  `conversation.jsonl` responsibility and observed record shapes;
4.  `tool-use.jsonl` responsibility and observed record shape;
5.  the visibility boundary between conversation and execution
    observability;
6.  immutable inputs and mutable session checkpointing;
7.  crash-safe persistence principles.

It intentionally does **not** define the harness state machine, retry
policy, provider adapters, or exact schemas for fields not visible in
the reference samples.

------------------------------------------------------------------------

# 2. Corrections from v0.1

## C1 --- Conversation and tool use are separate logs

v0.1 incorrectly treated `conversation.jsonl` as a universal event
stream containing conversation, tools, files, artifacts, telemetry,
failures, constraints, and lifecycle events.

The reference implementation instead visibly maintains:

``` text
conversation.jsonl
tool-use.jsonl
```

These are separate persistence surfaces.

## C2 --- `session_id` is not the run-directory name

v0.1 incorrectly proposed one human-readable `session_id` for both
identity and directory naming.

The supplied `conversation.jsonl` sample contains:

``` json
{"type":"meeting_start","session_id":"9xfmor", ...}
```

while the screenshot shows the containing deliberation directory as a
longer human-readable name ending in the short identifier.

Therefore the architecture shall keep these concepts separate.

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
memos/<session_name>/memo.md
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

# 4. Run-Scoped Persistence Layout

``` text
ceo-agents/
├── agents/
│   └── <agent>.md
├── briefs/
│   └── <brief-name>.md
├── deliberations/
│   └── <session_name>/
│       ├── session.json
│       ├── brief.md
│       ├── configuration.yaml
│       ├── conversation.jsonl
│       ├── tool-use.jsonl
│       └── <generated artifacts>
├── expertise/
│   └── <agent>.md
├── memos/
│   └── <session_name>/
│       └── memo.md
└── ceo-and-board-configuration.yaml
```

`session.json`, `brief.md`, and `configuration.yaml` inside the run
directory are implementation decisions from our architecture, not
directly demonstrated by the reference screenshot.

Generated SVGs are directly observed alongside the JSONL files in the
deliberation directory.

------------------------------------------------------------------------

# 5. Persistence Responsibilities

## 5.1 `conversation.jsonl`

Purpose:

> Persist what was communicated as part of the shared board
> deliberation.

It is the history agents may reread in later rounds.

It is **not** the general execution log.

## 5.2 `tool-use.jsonl`

Purpose:

> Persist observable tool activity performed by agents.

It provides execution observability without polluting shared
deliberation context.

## 5.3 Generated artifacts

Artifacts such as SVGs are stored as files in the run directory.

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

The supplied copy truncates the `brief` value, so its exact full
representation is not established here.

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

Those fields proposed in v0.1 were our design invention, not reference
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
**not** currently know the complete schema.

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

Tool-use records identify the agent performing the operation.

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

Therefore v0.2 does not require those fields.

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

Our implementation should snapshot the effective brief and configuration
used for a session so later edits do not alter historical meaning.

Proposed files:

``` text
deliberations/<session_name>/brief.md
deliberations/<session_name>/configuration.yaml
```

This remains an implementation design choice; it is not directly
demonstrated by the reference screenshot.

Whether active agent definitions and supporting context files are also
snapshotted remains TBD.

------------------------------------------------------------------------

# 12. What v0.2 Does Not Assign Yet

The following should **not** be forced into either JSONL file until we
have a reason/evidence:

-   lifecycle transitions;
-   constraint-detection events;
-   retry events;
-   agent-turn start/completion;
-   provider request metadata;
-   token/context telemetry;
-   cost telemetry beyond the observed `meeting_end.total_cost`;
-   failure records;
-   artifact metadata.

Some of these may ultimately belong in `tool-use.jsonl`, `session.json`,
a separate runtime log, or nowhere as durable events.

That decision depends partly on #3 Harness State Machine.

------------------------------------------------------------------------

# 13. Decisions Established in v0.2

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
Do not require the v0.1 invented universal event envelope.

**TD-06 --- Unknown tool-use fields remain unknown**\
Do not design the hidden portion of the tool-use schema from inference.

**TD-07 --- Checkpoint remains provisional**\
`session.json` is retained as a proposed architecture mechanism, but its
lifecycle content waits for #3.

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
Depends on later failure-policy design.

**TBD-08 --- Supporting-context snapshot policy**\
Whether context files are copied, hashed, or referenced.

**TBD-09 --- Agent-definition snapshots**\
Whether active agent prompts are archived per session.

------------------------------------------------------------------------

# 15. Next Architecture Boundary

The next design discussion remains **#3 Harness State Machine**.

v0.2 intentionally avoids deciding where lifecycle/constraint/failure
records are stored until we decide:

-   who owns state transitions;
-   what CEO `Continue` and `Close` mean operationally;
-   normal versus constraint-forced closure;
-   atomic-turn completion rules;
-   entry into `FINAL_CLOSING`;
-   completion versus failure;
-   crash/recovery behavior.
