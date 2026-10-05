# CEO--Board Decision System

## Technical Architecture --- v0.5

**Scope:** Pi extension architecture, run/session persistence,
deliberation state machine, and agent/brief contracts

------------------------------------------------------------------------

# 1. Scope

This document defines the current technical architecture for the
CEO--Board Decision System. It covers project structure, run identity,
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
memos/<session_name>/memo.md
```

The exact physical relationship between that memo path and the
project-local `.pi/ceo-agents/` tree remains governed by configuration
and is not inferred here.

No additional run files such as `session.json`, copied `brief.md`, or a
configuration snapshot are required by the reference evidence. Such
checkpoint/snapshot files may be introduced later only as explicit
implementation decisions.

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
Do not require a universal event envelope that is not present in the
reference records.

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

# Workflow State Machine

The Workflow follows the reference terminology:

``` text
Brief
  ↓
CEO Frames
  ↓
Board Debates
  ↓
Constraint Check
  ↓
Final Statements
  ↓
Memo
  ↓
Completed
```

`FAILED` is a terminal outcome when execution cannot continue
successfully.

The state machine is an implementation mechanism underneath this
Workflow. Code and documentation should preserve these domain concepts.

## Control ownership

The harness owns execution mechanics, time/budget tracking, constraint
enforcement, parallel board execution, round barriers, session status,
persistence, and TUI rendering.

The CEO owns semantic deliberation: framing the decision, deciding what
to ask, processing board responses, choosing whether to continue,
initiating `end_deliberation()`, synthesizing the decision, and writing
the memo.

## Brief → CEO Frames

The selected brief is validated and fixed for the run. The CEO receives
the full brief content plus runtime context and supporting context.

The CEO reads the brief, gathers context, may read/update its
expertise/scratchpad, frames the decision, and uses
`converse(to, message)` to engage the board.

## Board Debates --- `converse()`

The demonstrated v1 deliberation topology is CEO-to-board broadcast. The
CEO calls `converse()` to issue a board-wide question, challenge,
follow-up, or directive.

All active board members execute the round asynchronously/in parallel.
Each member responds independently. The CEO does not regain semantic
control of the deliberation until all participating board members have
finished the current round.

The CEO then processes the complete round, may update its private
scratchpad/expertise, and chooses either to call `converse()` again or
to initiate closing with `end_deliberation()`.

Direct board-to-board messaging and private/backroom discussion are not
part of the v1 behavior. The available material does not establish a v1
targeted-member or subgroup `converse()` contract, so one is not
specified here.

Individual board-member timeout, retry, and partial-round failure
semantics remain TBD.

## Constraint Check

The harness continuously tracks time and budget while deliberation
executes. Constraint state is also returned to the CEO through
`converse()`.

Configured minimums prevent premature voluntary closure. Once minimum
requirements are satisfied, the CEO may choose to close.

When a maximum constraint is reached during an active board call,
already-running addressed board members are allowed to finish that call
rather than being abandoned solely because the meeting maximum was
crossed. After the call barrier, the harness informs the CEO that the
maximum has been reached and normal open-ended deliberation stops.

Normal and constraint-triggered closure converge on
`end_deliberation()`.

## Final Statements --- `end_deliberation()`

The extension registers `end_deliberation` as a custom tool alongside
`converse`.

Calling it initiates one final position from each applicable board
member. Final statements execute asynchronously/in parallel.

The CEO processes the Contrarian final statement last. This is a CEO
consumption-order rule, not a requirement that the Contrarian subprocess
execute last.

The exact final-statement instruction/template and whether
Contrarian-last is hard-coded or configured remain TBD.

## Memo

After all final statements are available, the CEO:

1.  processes the complete set of final board positions;
2.  synthesizes the decision and memo details;
3.  generates required supporting artifacts such as the decision SVG
    when configured;
4.  writes `memo.md`.

Writing the memo is the final successful output step.

The canonical memo location is:

``` text
memos/<session_name>/memo.md
```

A successful write transitions the Workflow to `COMPLETED`.

## Failed sessions

If execution cannot continue, the session is marked `FAILED`.
Already-written conversation history, tool-use history, artifacts, and
expertise/scratchpad changes are preserved. v1 does not resume a failed
run.

Detailed board-member timeout/retry/failure behavior remains TBD.

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

The extension uses Pi's extension APIs rather than implementing direct
provider SDK integrations.

## Board-member execution

Board members are executed as Pi agent subprocesses. The extension
imports Node's `spawn` facility and Pi extension primitives.

The exact subprocess command-line arguments, persistent-session
identifiers, reconnection mechanism, and usage-return mechanism are not
yet visible in the available screenshots and remain TBD.

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

The visible CEO file specifies its model in frontmatter. The precedence
relationship between this field and any other model-related
configuration is not established by the available evidence and remains
TBD.

The CEO Markdown body is a system prompt organized into sections
including `Purpose`, `Variables`, `Instructions`, `Workflow`, `Context`,
and `Report`. Exact text that is not visible in the supplied source
material must not be reconstructed by inference.

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

The `Constraints` section describes constraints on the decision itself.
Meeting-runtime time and budget limits are separate configuration
concerns.

The acquisition example visibly stores `business-metrics.md` and
`product-overview.md` beside `brief.md`. The exact algorithm used to
discover/load sibling context files remains TBD.

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
-   Exact `converse()` return schema.
-   Exact `end_deliberation()` implementation and closing prompt source.
-   Board-member sanity timeout and partial-round failure semantics.
-   Contrarian-last configuration mechanism.
-   Exact expertise/scratchpad format.
-   Remaining CEO prompt sections.
-   Board-member system-prompt templates.
