# CEO--Board Decision System

## Functional Specification --- v1.9

## 1. Purpose

The CEO--Board Decision System is a one-shot autonomous multi-agent
decision engine.

A human prepares a structured decision brief and starts a decision
session. A CEO agent coordinates a configurable board of specialized
agents through multiple rounds of deliberation. Board members
independently analyze the problem, use configured tools, generate
supporting artifacts, and maintain private persistent expertise.

The CEO controls the deliberation and ultimately produces a final
decision memo containing a concrete recommendation, the board's
positions, areas of agreement and disagreement, and execution
considerations.

The system is designed for **observation rather than interactive human
intervention once execution begins**.

------------------------------------------------------------------------

# 2. Actors

## 2.1 Human User

The human:

1.  Prepares or selects a decision brief.
2.  Starts the decision session.
3.  Observes execution and telemetry.
4.  Reviews the resulting decision memo and archived run.

The human cannot modify the brief or inject new instructions into an
active session in v1.

## 2.2 CEO Agent

The CEO:

-   receives the decision brief;
-   gathers context;
-   reads and updates its private expertise;
-   broadcasts questions/instructions to the board;
-   evaluates board responses;
-   decides whether to continue deliberation or close;
-   initiates final closing statements;
-   synthesizes the final decision memo.

The CEO is the final decision-making agent within the system.

## 2.3 Board Agents

Each board member has independently configurable:

-   role;
-   domain focus;
-   system prompt;
-   model/provider;
-   skills/tools;
-   private persistent expertise.

Board roles are intentionally differentiated and may be adversarial by
design.

Example roles include:

-   **Revenue** --- short-term cash flow and financial survival.
-   **Compounder** --- long-term value creation and compounding.
-   **Moonshot** --- asymmetric risk and high-upside opportunities.
-   **Contrarian** --- challenges assumptions and consensus.

The specific board composition is configuration, not a fixed product
requirement. The number and titles of active board members must not be
hard-coded. Board roles may be enabled or disabled in
`ceo-and-board-configuration.yaml` (including by commenting optional
members out), and the runtime uses only the active configured subset.

------------------------------------------------------------------------

# 3. System Configuration

The reference implementation separates the global Pi harness from
project-local decision-system data. The executable harness and its
general tools/configuration live under the user-level `~/.pi`
environment, while each decision project maintains its own
project-specific `.pi/` directory containing workflow data and
configuration.

Within the project-local `.pi/`, the system is configured through
`ceo-and-board-configuration.yaml` and agent definitions under
`agents/`.

Configuration includes, at minimum:

-   CEO definition;
-   active board membership;
-   optional/inactive board roles;
-   agent roles;
-   system prompts;
-   model/provider assignments;
-   available skills/tools;
-   execution constraints;
-   retry/error behavior where configured.

Model and provider assignment must be independent of the product
architecture.

The system must support experimentation with different providers and
models rather than being permanently tied to a particular model vendor.

A typical configuration may use a higher-capability model for the CEO
and lower-cost models for parallel board members, but this is
configurable behavior rather than a fixed requirement.

Execution limits such as meeting time and cost are configurable per
run/configuration; implementations may provide defaults. The
configuration may also contain an optional editor setting (observed as
`editor: "code"`) used to choose which editor/application opens a
generated memo after completion.

Agent skill files may live in standard harness/developer-workspace
locations outside this application tree. Their physical location is not
part of this product specification.

The reference implementation uses the following canonical top-level
layout for the areas established so far:

``` text
ceo-agents/
├── agents/
│   └── <agent>.md
├── briefs/
│   └── <brief-name>.md
├── deliberations/
│   └── <run_id>/
│       ├── conversation.jsonl
│       ├── tool-use.jsonl
│       └── *.svg
├── expertise/
│   └── <agent>.md
├── ceo-and-board-configuration.yaml
└── apps/
    └── ceo/
        └── extensions/
            └── index.js
```

Agent persona definitions and persistent expertise are distinct:
`agents/<agent>.md` defines the persona/instructions, while
`expertise/<agent>.md` stores that agent's private cross-run expertise.
Agent files may exist without being active in every run; configuration
determines the active board subset.

------------------------------------------------------------------------

# 4. Decision Brief

## 4.1 Brief Format

A decision brief is a Markdown document stored under `briefs/`.

The canonical v1 brief contract is:

``` text
# Brief: <concise title framed as the question the board will answer>

## Situation
## Stakes
## Constraints
## Key Question
```

`Situation` states the current facts, relevant history, and trigger
event without opinion or spin. `Stakes` states the upside and downside.
`Constraints` is an explicit, preferably exhaustive bullet list of
decision constraints. `Key Question` is singular: the one most
important, specific question the board must answer.

Additional supporting context files may be stored in the same brief
directory as `brief.md`. They supplement, but do not replace, the four
required headings above.

## 4.2 Brief Selection

When the user runs:

``` text
ceo begin
```

the harness interactively discovers available briefs from `briefs/` and
prompts the user to select the brief for the session.

The selected brief becomes immutable for the duration of the run.

------------------------------------------------------------------------

## 4.3 Validation

Before any agent deliberation begins, the harness programmatically
validates the selected Markdown brief against the required structure
required by the canonical brief contract and any additional validation
rules configured in `ceo-and-board-configuration.yaml`.

If required sections are missing or invalid:

1.  execution stops;
2.  no board deliberation begins;
3.  the user receives a validation error.

------------------------------------------------------------------------

# 5. Session Startup

After a valid brief is selected:

1.  The harness creates an isolated run context.
2.  The CEO receives the decision brief.
3.  The CEO gathers relevant context.
4.  The CEO reads its private expertise.
5.  The CEO may update its private expertise.
6.  The CEO invokes its configured `converse` mechanism.
7.  The CEO broadcasts the initial question/instruction to the board.

The system then enters deliberation.

------------------------------------------------------------------------

# 6. Agent Execution Model

An agent turn is an atomic execution pass.

An atomic turn may contain:

1.  context reads;
2.  private expertise reads;
3.  reasoning;
4.  tool calls;
5.  file reads/writes;
6.  artifact generation;
7.  expertise updates;
8.  a generated response.

The harness records the externally observable execution events produced
during the turn.

------------------------------------------------------------------------

# 7. Board Deliberation

## 7.1 `converse(to, message)` Topology

The CEO communicates with board members through the custom
`converse(to, message)` tool.

`to` supports:

-   one board-member name;
-   an array of board-member names;
-   `"all"`.

The demonstrated normal mode is a broadcast to `"all"`, but targeted
individual and subgroup calls are supported by the reference CEO tool
contract.

For a call addressing multiple members, those members execute in
parallel. `converse()` returns responses from the addressed members plus
current constraint state.

## 7.2 Current-Turn Isolation

All board members responding to a CEO broadcast execute against the same
pre-round shared state.

A board member **must not see another board member's response from the
current round**.

After all applicable board turns have completed, their responses become
part of shared historical context.

Subsequent rounds may inspect the complete prior conversation.

This isolation is a first-class functional requirement.

## 7.3 Subsequent Deliberation

The CEO receives the completed board responses and decides whether
another deliberation round is necessary.

The CEO has two functional choices:

### Continue

Invoke `converse(to, message)` again, addressing one member, a subset,
or all active board members.

The system returns to `DELIBERATING`.

### Close

Stop open-ended deliberation and initiate the final closing phase.

There is no predetermined number of rounds.

------------------------------------------------------------------------

# 8. Communication Model

The communication topology is intentionally simple:

``` text
CEO → all
Board member → all
```

`to: all` describes the publication scope of persisted deliberation
messages. The harness still enforces current-round peer isolation. There
is no direct board-to-board invocation/private messaging in v1.

Historical communication is shared through the persisted conversation
record after the applicable round barrier.

------------------------------------------------------------------------

# 9. Conversation and Tool-Use Logs

The harness owns two separate run-scoped JSON Lines logs:

``` text
conversation.jsonl
tool-use.jsonl
```

Both are incrementally persisted so already-written history can survive
partial or interrupted runs, but they serve different functional
purposes.

## 9.1 Conversation Log

`conversation.jsonl` is the persisted shared deliberation record.

Observed records include:

-   a `meeting_start` record;
-   CEO-to-board messages;
-   board-member-to-all messages;
-   a `meeting_end` record.

Ordinary deliberation message records use fields such as:

``` json
{"from":"CEO","to":"all","message":"..."}
```

The observed `meeting_start` record includes fields such as `type`,
`session_id`, `timestamp`, and `brief`.

The observed `meeting_end` record includes fields such as `type`,
`timestamp`, `elapsed_minutes`, `total_cost`, and `end_reason`;
`max_time_constraint` is one observed end reason.

`conversation.jsonl` is the shared history agents may reread in
subsequent rounds. Tool execution details shall not be inserted into
this log merely for observability.

## 9.2 Tool-Use Log

`tool-use.jsonl` is the separate execution-observability record for
agent tool activity.

The available reference sample shows records containing fields
including:

``` text
agent
timestamp
tool_name
```

Observed `tool_name` values include:

``` text
read
write
edit
bash
converse
```

The screenshot does not expose the complete right-hand side of the
records, so additional fields and their exact schema remain TBD.

`tool-use.jsonl` is not shared deliberation context. Persisting an
operation there does not make its contents visible to peer agents.

## 9.3 Separation Requirement

Conversation state and tool-use observability are distinct.

The system shall preserve this boundary:

``` text
conversation.jsonl = what was communicated in the deliberation
tool-use.jsonl     = observable tool activity performed by agents
```

Generated artifacts remain run-scoped files and may be referenced from
either deliberation or execution activity as appropriate.

The exact treatment of lifecycle events, retries, failures, constraint
events, and model telemetry across these persistence surfaces remains a
technical-design concern.

------------------------------------------------------------------------

# 10. Agent Expertise

Each agent has private persistent expertise storage. In the reference
structure this is organized under `expertise/` and may contain more than
one kind of persistent working file.

Example:

``` text
expertise/
├── ceo.md
├── revenue.md
├── compounder.md
├── moonshot.md
└── contrarian.md
```

An agent may read and update its own expertise during a session.

Expertise storage may contain:

-   **expertise files** containing deep domain knowledge, specialized
    patterns, and learned insights relevant to the agent's business
    domain or recurring problems;
-   **scratchpad/working files** containing persistent session status,
    working notes, observations about other board members, and
    interaction history;
-   lessons from previous sessions;
-   recurring observations;
-   behavioral observations about specific board members;
-   recurring friction or disagreement with other board members.

## 10.1 Privacy Boundary

Private expertise is **not part of the shared conversation transcript**.

An agent cannot directly read another agent's expertise file.

The shared state is:

``` text
brief
conversation history
registered artifacts
```

The private state is:

``` text
own expertise
```

## 10.2 Cross-Run Persistence

Decision runs are isolated with respect to their execution state, debate
history, and artifacts.

Persistent expertise is intentionally **not isolated per run**.

Instead:

``` text
Run A ──┐
Run B ──┼──> shared persistent agent expertise
Run C ──┘
```

This is intentional product behavior: agents learn across decision
sessions.

The harness must ensure that one run cannot accidentally overwrite
another run's debate record or artifacts, while allowing the designated
agent expertise state to persist across runs.

The exact concurrency/versioning mechanism for expertise updates is a
technical-design concern.

------------------------------------------------------------------------

# 11. Tools and Artifacts

Agents may use configured skills and tools during deliberation.

## 11.1 In-Flight Artifacts

Artifact generation is part of active deliberation.

For example, a board agent may generate an SVG chart to support its
argument.

Artifacts are stored within the active run:

``` text
deliberations/
└── <run_id>/
    ├── conversation.jsonl
    ├── tool-use.jsonl
    └── *.svg
```

## 11.2 Artifact Lifecycle

The functional lifecycle is:

``` text
Agent generates artifact
        ↓
Harness captures/saves artifact
        ↓
Artifact receives run-relative identity
        ↓
Artifact creation is recorded in conversation log
        ↓
Artifact becomes available as run context
        ↓
Artifact remains with archived run
        ↓
Artifact may be referenced/rendered in final memo
```

Artifacts therefore form part of the permanent decision record rather
than being temporary execution output.

------------------------------------------------------------------------

# 12. Execution Constraints

The configured meeting guardrails are:

``` text
min_time_minutes
max_time_minutes
min_budget
max_budget
```

Control semantics are:

- `min_time_minutes`: CEO may not voluntarily close before this time.
- `max_time_minutes`: hard closure trigger.
- `max_budget`: hard closure trigger.
- `min_budget`: display/configuration value only; it does not affect
  control flow and is not a spending target.

The harness owns enforcement.

The UI exposes live time and budget telemetry and shows the configured
minimum--maximum ranges.

# 13. Constraint Reached / Forced Closure

Maximum time **or** maximum budget forces closure.

If a maximum is crossed while a `converse()` round is active, the
harness records the constraint condition but does not abandon the active
round. All participating board members are allowed to finish and the
round barrier completes.

The resulting flow is:

``` text
maximum reached during/after deliberation
      ↓
finish active converse() round, if any
      ↓
CEO receives/processes completed round
      ↓
harness prevents another normal converse() round
      ↓
CEO invokes end_deliberation()
      ↓
final board statements
      ↓
CEO ingests final statements
      ↓
memo synthesis
```

The CEO is informed that the maximum has been reached. The exact
user-visible wording of that signal is an implementation/UI concern;
`max reached` is observed reference wording.

# 14. Final Closing

## 14.1 Eligibility for Voluntary Closure

The CEO must continue normal deliberation until `min_time_minutes` has
elapsed.

After the minimum time is satisfied, the CEO may voluntarily invoke
`end_deliberation()` when it determines that further open-ended debate
is no longer useful.

A minimum budget does not gate closure.

## 14.2 `end_deliberation()`

Normal and forced closure use the same operation:
`end_deliberation()`.

The operation requests one final position from every active/applicable
board member. Final statements execute asynchronously/in parallel.

The CEO receives the final responses before memo synthesis.

The Contrarian's final response is consumed/processed by the CEO last.
This is a consumption-order rule, not an execution-order rule. The
processing order of all non-Contrarian final responses is unspecified
and must not be invented.

## 14.3 Failed Board Members at Closure

A board member that has exhausted its one retry and is marked
failed/unavailable is not required to manufacture a final statement.
`end_deliberation()` operates on the remaining active/applicable board.

# 15. Final Decision Memo

After receiving the final board statements, the CEO synthesizes the
final decision memo.

The memo is stored under a session-specific directory:

``` text
memos/<session_name>/memo.md
```

`<session_name>` is derived from the associated brief and the session
timestamp. The exact session-name formatting, sanitization, and
timestamp format remain TBD and shall be resolved during technical
design.

## 15.1 Required Memo Content

The memo contains:

### Decision Map

Summary of the decision landscape and major considerations.

### Core Decision

The CEO's concrete recommendation.

### Board Stance Summary

A factual summary of the board's positions.

This is **not a formal vote** and does not imply that the board has
decision authority.

### Board Stances

Individual final positions attributed to their respective roles.

### Tension & Dissent

Important disagreements, objections, unresolved concerns, and competing
assumptions.

### Execution Plan

Recommended implementation/action considerations, dependencies, risks,
and next steps.

## 15.2 Recommendation Requirement

A successfully completed session must produce a concrete CEO
recommendation even when:

-   evidence is incomplete;
-   board members disagree;
-   uncertainty remains;
-   consensus is absent.

The CEO must explicitly identify important uncertainty and assumptions
rather than presenting them as settled facts.

------------------------------------------------------------------------

# 16. Agent and Session Failure Handling

## 16.1 Agent States

An individual agent execution may move through:

``` text
RUNNING
   ↓
FAILED_ATTEMPT
   ↓
RETRYING
   ↓
RUNNING
```

or, after the retry also fails:

``` text
FAILED_ATTEMPT
   ↓
RETRYING
   ↓
UNAVAILABLE
```

Completed work is preserved.

## 16.2 Board-Agent Failure

A failed board-agent execution is retried exactly once.

If the retry succeeds, the agent returns to active participation.

If the retry fails:

1. mark the board member failed/unavailable;
2. preserve completed work and failure observability;
3. continue the deliberation with the remaining active board members;
4. exclude the unavailable member from later required responses,
   including final statements.

The UI must expose board-member status.

Retry delay/backoff and low-level timeout mechanics remain TBD.

## 16.3 CEO Failure

A failed CEO execution is retried exactly once.

If the retry also fails, the entire session transitions to `FAILED`.
The session cannot continue without the CEO because the CEO owns framing,
round-to-round semantic control, final-statement ingestion, synthesis,
and memo generation.

## 16.4 Failed Session Preservation

A failed session must preserve partial conversation history, tool-use
history, generated artifacts, and completed expertise/scratchpad writes.

It must be visibly marked failed and must not present a final memo as a
successful decision result.

v1 does not resume a failed session.

# 17. Run Isolation and Persistence

Each decision session has its own isolated run directory.

``` text
deliberations/
└── <run_id>/
    ├── conversation.jsonl
    ├── tool-use.jsonl
    └── *.svg
```

The run contains the complete execution-specific record.

Global persistent agent expertise is deliberately outside the run
directory.

Therefore:

### Run-scoped state

-   decision brief reference;
-   conversation;
-   execution events;
-   generated artifacts;
-   run status;
-   partial/completed execution state.

### Persistent cross-run state

-   each agent's private expertise.

This distinction is intentional.

------------------------------------------------------------------------

# 18. Runtime UI and Telemetry

The runtime UI provides observation into the active decision session.

It must not imply that private model chain-of-thought is being exposed.

## 18.1 Session Header

Display:

-   system identity;
-   execution mode;
-   duration limit;
-   budget limit;
-   selected brief;
-   active run.

Execution mode is explicitly:

> non-interactive, one-shot once started

## 18.2 Global Telemetry

Display:

-   elapsed time for the current deliberation session;
-   cumulative session spend;
-   board stance distribution/summary where available;
-   constraint status;
-   `max reached` when applicable.

The UI must not represent the stance distribution as a formal vote.

## 18.3 CEO Panel

Display:

-   CEO model designation;
-   current activity/state;
-   generated CEO messages;
-   current broadcast prompt;
-   harness-level activity such as context gathering or tool execution.

The system does not expose private chain-of-thought.

## 18.4 Board Grid

For each active configured board member, display:

-   role/domain focus;
-   assigned model;
-   deliberation status;
-   current context-window usage/remaining where available (the
    reference UI shows values such as `978k` against a 1M-token context
    limit);
-   message count for the agent within the current deliberation round;
-   incremental cost for the agent's specific response, contributing to
    cumulative session cost;
-   tool execution events;
-   file activity;
-   generated artifacts.

Individual CEO and board-member activity can be expanded or collapsed.
The UI must derive board rows/cards from the active configuration rather
than assume a fixed count or fixed role names.

## 18.5 Audio

Core system audio generation and playback are **not required in v1**.

Optional skills/tools capable of audio generation, such as an ElevenLabs
integration, are not prohibited. If configured as an agent skill, such
tools may be used according to the normal tool model.

Audio is therefore an optional tool capability, not a core product
requirement.

------------------------------------------------------------------------

# 19. Session Lifecycle

The authoritative functional state model is:

``` text
INITIALIZING
      ↓
VALIDATING
      ↓
DELIBERATING
      │
      ├── CEO continues ───────────┐
      │                            │
      │                            ↓
      │                       DELIBERATING
      │
      ├── CEO closes ─────────→ FINAL CLOSING
      │
      └── constraint reached ──→ FINAL CLOSING

FINAL CLOSING
      ↓
SYNTHESIS
      ↓
COMPLETED
```

Failure may occur from applicable states:

``` text
        ┌──────────────┐
        ↓              │
     FAILED ←──────────┘
```

A completed run represents successful memo synthesis.

A failed run represents preserved partial execution without successful
completion.

The harness must persist the current lifecycle state so that the UI and
archived run accurately reflect what happened.

------------------------------------------------------------------------

# 20. Pi Extension Runtime

The system shall run as a Pi extension. The demonstrated extension
source path is:

``` text
apps/ceo/extensions/ceo-and-board.ts
```

The extension shall register a `session_start` handler and shall expose
the one-shot command:

``` text
/ceo-begin
```

The deliberation runtime shall provide `converse` and `end_deliberation`
operations to the CEO.

At session startup, when valid configuration is available, the UI shall
display the configured meeting time range, budget range, editor, active
board, and an instruction to run `/ceo-begin`.

If the canonical configuration file is unavailable, the UI shall report
that configuration is missing and identify:

``` text
.pi/ceo-agents/ceo-and-board-configuration.yaml
```

The extension shall delegate model/provider execution through Pi rather
than requiring direct provider SDK adapters in the CEO/Board extension.

Exact subprocess invocation, persistent-session reuse, and usage/cost/
context accounting APIs remain TBD.

------------------------------------------------------------------------

# 21. Agent Definition Contract

Agent definitions shall be Markdown documents with YAML frontmatter.

The CEO reference establishes the following supported frontmatter
concepts:

``` yaml
name: ceo
expertise:
  - path: <expertise path>
    use-when: "..."
    updatable: true
skills:
  - path: <skill path>
    use-when: "..."
model: <Pi-supported model identifier>
domain: []
```

`expertise` shall be represented as a list of structured entries.
`skills` shall be represented as a list of structured entries.

The visible CEO definition demonstrates that an agent may specify its
model in frontmatter. Model-precedence behavior across all possible
configuration surfaces is not yet established and remains TBD.

------------------------------------------------------------------------

# 22. Brief Package and Initialization

Each selectable brief shall be represented by a directory under
`briefs/` containing:

``` text
<brief-directory>/
├── brief.md
└── <optional supporting context files>
```

The reference acquisition brief demonstrates sibling context files such
as `business-metrics.md` and `product-overview.md`.

Running:

``` text
/ceo-begin
```

shall initiate the one-shot deliberation workflow. The selected
`brief.md` shall be validated before board deliberation begins.

The selected brief and its supporting context form the session input
package. The exact discovery/selection UI and exact rules for which
sibling files are loaded remain TBD unless established by further source
inspection.

------------------------------------------------------------------------

# 23. Completion Presentation

When synthesis succeeds:

1.  the final memo is persisted;
2.  the run is marked `COMPLETED`;
3.  all run artifacts remain available;
4.  the harness may automatically open the generated memo.

The specific application used to open the memo is configurable and is
not a fixed product requirement. The reference configuration includes an
`editor` setting (observed as `"code"`).

Audio playback is not required.

------------------------------------------------------------------------

# 24. Archive and Inspection

A completed or failed run must remain inspectable through its persisted
records.

Inspection includes:

-   original brief;
-   `conversation.jsonl` shared deliberation log;
-   `tool-use.jsonl` execution-observability log;
-   generated artifacts;
-   relevant expertise state;
-   final memo, if successfully generated;
-   run status.

v1 does **not** promise deterministic replay.

Re-running an identical brief may produce different LLM outputs and is
considered a new execution rather than a replay of the original run.

------------------------------------------------------------------------

# 25. Functional Requirements

### Brief and Startup

**FR-01** --- The system shall accept structured Markdown decision
briefs using the canonical headings `Situation`, `Stakes`,
`Constraints`, and singular `Key Question` beneath a `# Brief:` title.

**FR-02** --- The harness shall validate the canonical required brief
headings before deliberation begins, plus any additional configured
validation rules.

**FR-03** --- `/ceo-begin` shall discover available briefs and prompt
the user to select one.

**FR-04** --- The harness shall initialize an isolated run after a valid
brief is selected.

**FR-05** --- The CEO shall gather initial context and read/update its
private expertise before its first board broadcast.

**FR-06** --- The CEO shall use its configured `converse` mechanism to
issue board broadcasts.

### Deliberation

**FR-07** --- The CEO shall broadcast prompts to all active board
members selected by configuration; board count and role titles shall not
be hard-coded.

**FR-08** --- Board members shall execute in parallel.

**FR-09** --- Board members shall not see peer responses generated
during the current round.

**FR-10** --- Subsequent deliberation rounds shall have access to
complete prior shared conversation history.

**FR-11** --- The harness shall incrementally append shared deliberation
records to the run-scoped `conversation.jsonl` log.

**FR-11A** --- The harness shall separately append observable agent tool
activity to the run-scoped `tool-use.jsonl` log.

**FR-11B** --- Tool-use records shall not become shared deliberation
context merely because they are persisted.

**FR-12** --- An agent turn may contain multiple internal tool
executions.

**FR-13** --- The CEO shall control whether deliberation continues or
closes.

**FR-14** --- The CEO shall have the functional choices `Continue` or
`Close` after a deliberation cycle.

### Expertise

**FR-15** --- Agents shall maintain private persistent expertise.

**FR-16** --- Agents shall be able to record domain knowledge and
working notes in their expertise.

**FR-17** --- Agents may record recurring behavioral observations and
friction involving other board members.

**FR-18** --- Private expertise shall be inaccessible to peer agents.

**FR-19** --- Private expertise shall not be included in the shared
conversation transcript.

**FR-20** --- Expertise shall persist across decision runs.

### Closure

**FR-21** --- Normal closure shall initiate a dedicated final-closing
phase.

**FR-22** --- The CEO shall request one final position statement from
every available board member.

**FR-23** --- Final board statements shall execute in parallel.

**FR-24** --- Final closing prompts shall request a final position,
strongest supporting reason, and strongest remaining concern or
condition.

**FR-25** --- The CEO shall synthesize a final decision memo.

**FR-26** --- A successful session shall contain a concrete CEO
recommendation.

**FR-27** --- The final memo shall contain a Board Stance Summary rather
than implying a formal board vote.

### Constraints

**FR-28** --- The harness shall enforce configured execution limits.

**FR-29** --- The CEO shall not voluntarily close before
`min_time_minutes` has elapsed.

**FR-30** --- `min_budget` shall have no control-flow effect.

**FR-31** --- Reaching `max_time_minutes` or `max_budget` shall set a
forced-close condition.

**FR-32** --- If a maximum is reached during a `converse()` round, all
participating board members shall be allowed to resolve that round
before forced closure proceeds.

**FR-33** --- After the forced-close round barrier, the harness shall
prevent another normal `converse()` round and require the CEO to invoke
`end_deliberation()`.

**FR-34** --- Forced closure shall request one final closing statement
from each active/applicable board member.

### Failures

**FR-35** --- The harness shall record agent failures.

**FR-36** --- A failed board-agent execution shall be retried once.

**FR-37** --- If the board-agent retry fails, the member shall be marked
unavailable and deliberation shall continue with the remaining active
board members.

**FR-38** --- A failed CEO execution shall be retried once.

**FR-39** --- If the CEO retry fails, the session shall transition to
`FAILED`.

**FR-40** --- Retry delay/backoff and low-level timeout mechanics remain
TBD.

**FR-41** --- Agent failures shall be surfaced in runtime status.

**FR-42** --- Session failure shall preserve partial execution records
and artifacts.

**FR-43** --- A failed session shall not be represented as successfully
completed.

### Artifacts

**FR-40** --- Agents may generate artifacts during active deliberation.

**FR-41** --- SVG generation shall be supported as a core artifact
capability.

**FR-42** --- Artifacts shall be stored within the corresponding run
directory.

**FR-43** --- Artifact creation shall be recorded in the execution log.

**FR-44** --- Artifacts shall remain available during subsequent turns
and archive inspection.

**FR-45** --- Artifacts may be referenced or rendered in the final
decision memo.

### Configuration

**FR-46** --- CEO and board model assignments shall be independently
configurable.

**FR-47** --- Model/provider configuration shall not be hard-coded to a
single provider.

### Runtime UI

**FR-48** --- The UI shall display session identity and execution
constraints and shall dynamically reflect the active board configured
for the run.

**FR-49** --- The UI shall display elapsed time and cumulative spend
where available.

**FR-50** --- The UI shall display CEO activity and generated
broadcasts.

**FR-51** --- The UI shall display board-member status and execution
telemetry.

**FR-52** --- Individual CEO and board activity shall be
expandable/collapsible.

**FR-53** --- The UI shall distinguish conversational activity from
execution/tool telemetry.

**FR-54** --- The UI shall not imply that private chain-of-thought is
exposed.

**FR-55** --- Audio generation/playback shall not be required for v1.

### Project/Harness Separation and Telemetry

**FR-56** --- The application architecture shall distinguish the global
Pi harness (`~/.pi`) from project-local `.pi/` decision workflow data
and configuration.

**FR-57** --- Agent skill-file locations in external developer/harness
directories shall not be hard-coded as application data-path
requirements.

**FR-58** --- Execution time and cost limits shall be configurable, with
defaults permitted.

**FR-59** --- The runtime UI shall support displaying per-agent
current-round message count, context-window telemetry where available,
and incremental response cost.

**FR-60** --- The final decision memo shall be stored as
`memos/<session_name>/memo.md`, where `<session_name>` is derived from
the associated brief and session timestamp.

### Persistence and Archive

**FR-61** --- Each decision run shall have an isolated execution record.

**FR-62** --- Run artifacts shall remain associated with their
originating run.

**FR-63** --- Persistent agent expertise shall intentionally survive
across runs.

**FR-64** --- The harness shall persist lifecycle state.

**FR-65** --- Completed and failed runs shall support inspection.

**FR-66** --- v1 shall not guarantee deterministic replay.

**FR-67** --- A successful completion may automatically open the
generated memo.

------------------------------------------------------------------------

# 26. Explicit TBDs

The following are intentionally unresolved and should be addressed
during technical design or later functional refinement:

1.  Exact `conversation.jsonl` schema beyond the observed
    `meeting_start`, message, and `meeting_end` records.
2.  Exact `tool-use.jsonl` schema beyond the observed `agent`,
    `timestamp`, and `tool_name` fields.
3.  Exact lifecycle-state persistence mechanism.
4.  Exact run naming and ID format.
5.  Exact session-name derivation rules, including brief-name
    sanitization, timestamp format, and collision behavior.
6.  Exact retry count and retry delay.
7.  Per-agent timeout behavior.
8.  Retry context supplied to failed agents.
9.  Whether/how an unavailable agent can re-enter an active session.
10. Exact session-abort criteria.
11. Exact behavior when the CEO itself fails.
12. Exact handling of concurrent expertise updates.
13. Exact mechanism for discovering/loading supporting reference files.
14. Exact UI layout and frontend implementation.
15. Exact model/provider adapter architecture.
16. Exact tool cancellation behavior.
17. Exact calculation/presentation of board stance summaries.
18. Whether failed sessions can be resumed.
19. Exact archive browser/inspection interface.

These TBDs do not invalidate the functional contract above.

------------------------------------------------------------------------

# 27. v1 Boundary

The v1 system is:

> **A human-started, one-shot, autonomous CEO--Board deliberation engine
> that turns a structured decision brief into a documented decision memo
> while preserving the complete execution history, generated artifacts,
> and persistent private agent expertise.**

The core v1 loop is:

``` text
Prepare brief
    ↓
ceo begin
    ↓
Select brief
    ↓
Validate
    ↓
Initialize CEO
    ↓
CEO gathers context / updates expertise
    ↓
CEO broadcast
    ↓
Parallel board deliberation
    ↓
CEO evaluates responses
    ↓
Continue ──────────────┐
    │                  │
    └──────────────────┘
    ↓
Close
    ↓
Parallel final statements
    ↓
CEO synthesis
    ↓
Final decision memo
    ↓
Completed archived run
```

Hard constraints may enter the same path:

``` text
Deliberation
    ↓
limit reached
    ↓
finish active converse() round
    ↓
CEO processes completed round
    ↓
forced closing
    ↓
final statements
    ↓
CEO synthesis
```

The system deliberately does **not** require:

-   human intervention during deliberation;
-   formal board voting;
-   board consensus;
-   deterministic replay;
-   core audio generation/playback;
-   direct board-to-board messaging;
-   exposure of private chain-of-thought.
