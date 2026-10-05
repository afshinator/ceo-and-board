# CEO--Board Decision System

## Functional Specification --- v1.15

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

The reference implementation separates the global Pi harness from project-local decision-system data. The executable harness and its general tools/configuration live under the user-level `~/.pi` environment, while each decision project maintains its own project-specific `.pi/` directory containing workflow data and configuration.

Within the project-local `.pi/`, the canonical configuration file is:

``` text
.pi/ceo-agents/ceo-and-board-configuration.yaml
```

The v1 YAML contains:

- `meeting.constraints.min_time_minutes`;
- `meeting.constraints.max_time_minutes`;
- numeric `meeting.constraints.min_budget`;
- numeric `meeting.constraints.max_budget`;
- `meeting.editor`;
- `brief_sections[]` entries containing `section` and `description`;
- `paths.briefs`, `paths.deliberations`, `paths.memos`, and `paths.agents`;
- active `board[]` entries containing only `name`, `path`, and `color`.

A parsed board entry is active. Commented-out or absent board entries are inactive. Board count and role names remain dynamic.

`paths.agents` defines where agent definitions live. The CEO definition is `<paths.agents>/ceo.md`. Board paths are resolved as absolute when absolute, from the project root when beginning with `.pi/`, and otherwise relative to `paths.agents`.

Agent definitions, rather than the meeting YAML, provide each agent's authoritative `model:` frontmatter value. This permits CEO and board members to use independently configurable Pi-supported models/providers without direct provider-SDK coupling in the application architecture.

`brief_sections[].section` defines deterministic required brief headings. Its `description` is authoring/validation help metadata and is not automatically inserted into agent runtime prompts.

Execution limits are configurable per run/configuration. The optional `editor` setting selects which editor/application may open the generated memo after completion.

Agent skill files may live in standard harness/developer-workspace locations outside this application tree. Their physical location is not part of this product specification.

Agent persona definitions and persistent expertise remain distinct: `agents/<agent>.md` defines persona/instructions/model/resources, while `expertise/` stores private cross-run expertise.

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

The selected brief becomes immutable for the duration of the run. Once a brief package has been used by a run, that brief directory and its supporting files are immutable project history; materially changed inputs require a new brief directory.

After successful validation, the harness shall create the run and generate one shared CEO/Board `session_id` before CEO framing begins. In v1, the identifier is the base-36 representation of Unix epoch milliseconds at run creation. Each agent's private Pi session identifier is derived from that shared run ID as `<session_id>.<agent-slug>`.

------------------------------------------------------------------------

## 4.3 Deterministic Preflight Validation

After the user selects a brief and before the harness creates a run or starts CEO framing, the harness executes deterministic preflight validation. No LLM participates in this step.

Preflight validates the selected brief, configuration, active agent definitions, model identifiers, and required referenced resources. At minimum it checks:

1. valid YAML and required configuration fields;
2. numeric time/budget constraints with valid minimum/maximum relationships;
3. required configured paths;
4. existence and parseability of `<paths.agents>/ceo.md`;
5. a non-empty active board with unique names;
6. existence/parseability of every active board agent definition;
7. required agent frontmatter including a Pi-resolvable `model`;
8. required referenced expertise/skill paths;
9. selected brief package existence;
10. required Markdown headings configured by `brief_sections[].section`.

If a structural/configuration validation error exists:

1. execution stops;
2. no run/session is created;
3. no CEO or board agent begins execution;
4. the user receives deterministic validation errors.

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
parallel. `"all"` resolves to all currently active/available configured board members at invocation time. Unknown board-member names are invalid tool input. A member already marked `UNAVAILABLE` is not executed.

After the round barrier, `converse()` returns the full available responses from the addressed members, explicit participant resolution status, and current constraint state. The harness shall not replace those responses with a synthesized round summary. Detailed tool traces and execution telemetry are separate from the CEO-facing deliberation result.

## 7.1A Board Turn Context

For each participating board execution, the runtime shall make available:

- the member's agent definition/system prompt;
- the selected `brief.md`;
- all supplemental files in the selected brief directory;
- prior shared `conversation.jsonl` history;
- the member's own expertise/scratchpad;
- configured skills/tools;
- the CEO's current message;
- required runtime/session context derived from the recovered agent definition contract.

Runtime prompt construction follows the recovered/reference agent files. For the CEO, the known runtime variables are `SESSION_ID`, `BRIEF_CONTENT`, `BOARD_MEMBERS`, `MEMO_PATH`, `MIN_TIME`, `MAX_TIME`, `MIN_BUDGET`, and `MAX_BUDGET`. Board-specific runtime-variable names shall not be invented where reference agent files remain incomplete.

The board Pi process performs its normal context/file reads. The CEO's current message may summarize or emphasize brief information, but it does not replace the full selected brief package.

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

For v1, the writer shall record actual tool invocations using `agent`, `timestamp`, and the known `tool_name`. The runtime shall not mirror Pi lifecycle/message events, token/cost/context telemetry, constraint transitions, or retry transitions into `tool-use.jsonl` merely because those events are observable.

## 9.3 Separation Requirement

Conversation state and tool-use observability are distinct.

The system shall preserve this boundary:

``` text
conversation.jsonl = what was communicated in the deliberation
tool-use.jsonl     = observable tool activity performed by agents
```

Generated artifacts remain run-scoped files and may be referenced from
either deliberation or execution activity as appropriate.

Failed attempts shall not create fabricated shared-deliberation messages in `conversation.jsonl`. Retry/failure runtime state must remain observable, but the exact durable retry/failure record schema and persistence surface remain a technical-design concern.

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

Decision runs are isolated with respect to execution state, debate history, and run artifacts. Persistent expertise intentionally survives across runs.

Each agent owns the expertise resources declared by its agent definition. An expertise entry marked `updatable: true` is writable by that agent; other expertise entries are read-only. Agents cannot directly read or modify another agent's private expertise resources.

Successful expertise file writes/edits become durable immediately and are not rolled back merely because a later response or session step fails.

To prevent concurrent writes to shared cross-run expertise, v1 permits only one active CEO--Board run per project. `/ceo-begin` shall refuse to start a second live run while the project-level active-run lock is owned by a live process. A stale lock left by a dead process may be cleared after the prior nonterminal run is classified as interrupted for inspection.

------------------------------------------------------------------------

# 11. Tools and Artifacts

Agents may use configured skills and tools during deliberation.

## 11.1 In-Flight Artifacts

Board members may generate persuasion/supporting artifacts during active deliberation. Run-scoped deliberation artifacts live directly under:

``` text
deliberations/<session_name>/
```

No separate `register_artifact()` operation or durable artifact manifest is required in v1. Successful file creation/modification inside the run directory is sufficient for runtime artifact registration, excluding harness-owned files/directories.

Artifact activity is observable tool/file activity and resets the 90-second inactivity watchdog.

## 11.2 Artifact Visibility and Persistence

Artifacts created during a board round obey the same current-round isolation rule as board responses. The creating member and harness may access the file immediately, but peer agents do not receive it as shared context until the round barrier completes.

Artifact creation itself is not represented by a synthetic `conversation.jsonl` record. If an artifact matters to the deliberation, the creating agent references it in its accepted response. Actual file-generating tool invocations remain observable through `tool-use.jsonl` according to its normal narrow schema.

A file becomes an eligible shared artifact only after the creating tool operation succeeds and the file exists as a complete regular file. Files left by failed/aborted attempts are preserved for diagnostics but are not automatically promoted into shared deliberation context. Partial/corrupt files are not treated as shared artifacts.

Board artifact filenames may be descriptive and agent-selected but must be collision-safe; existing files shall not be silently overwritten.

CEO memo-specific visual artifacts, when produced by a configured skill, are stored beside `memo.md` rather than moved into the deliberation directory.

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

The CEO invokes `end_deliberation()` without recipient arguments. The harness targets every active/applicable board member remaining available for the session and supplies the canonical closing request. The request requires one final position, the strongest supporting reason, and the strongest remaining concern or condition. The exact literal closing-prompt wording is an implementation detail.

Final statements execute asynchronously/in parallel and follow the same one-retry rule used during normal deliberation. The CEO receives the full available final responses plus explicit unavailable status before memo synthesis. An unavailable member does not receive a fabricated final statement.

The Contrarian's final response is consumed/processed by the CEO last.
This is a consumption-order rule, not an execution-order rule. The
processing order of all non-Contrarian final responses is unspecified
and must not be invented.

## 14.3 Failed Board Members at Closure

A board member that has exhausted its one retry and is marked
failed/unavailable is not required to manufacture a final statement.
`end_deliberation()` operates on the remaining active/applicable board.

# 15. Final Decision Memo

After all available final statements have been accepted and persisted, the CEO synthesizes the final decision memo.

The memo is stored at:

``` text
memos/<session_name>/memo.md
```

`<session_name>` is `<brief-directory-name>-<session_id>`.

## 15.1 Synthesis Inputs

The CEO synthesizes from:

- the complete selected brief package;
- accepted shared conversation history;
- all available final board statements;
- the CEO's private expertise/scratchpad;
- shared run artifacts available under the round-isolation rules.

`tool-use.jsonl` is not automatically injected as semantic synthesis context.

## 15.2 Required Memo Structure

The v1 memo shall contain:

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

`Final Decision` shall state the CEO's concrete recommendation. `Ranked Recommendations` shall contain up to three meaningful recommendations; recommendation #1 represents the primary decision. The memo shall attribute each available final board stance to its member and identify unavailable members as unavailable rather than inventing a position.

The memo shall preserve important uncertainty, assumptions, dissent, and unresolved tensions rather than manufacture consensus. It shall not require or imply a formal board vote.

## 15.3 Memo Frontmatter

Memo frontmatter shall contain at least:

- `title`;
- `date`;
- `session_id`;
- `duration`;
- `budget_used`;
- `board_members`;
- `brief`;
- `transcript`.

Deterministic metadata is derived from harness state rather than guessed by the CEO.

## 15.4 Deterministic Memo Validation

After writing `memo.md`, the harness shall perform deterministic acceptance validation before marking the run complete.

Structured frontmatter shall be parsed and validated with Zod. A deterministic Markdown parser/checker shall verify the required heading structure and require a non-empty `Final Decision`. The validator shall verify deterministic frontmatter values against current harness/session state. No LLM participates in this validation.

A failed memo write/validation is a CEO execution failure and receives the normal single retry. A second CEO synthesis failure marks the run `FAILED`. Accepted board final statements and prior execution records remain preserved, and partial/invalid memo files remain inspectable but are not presented as a successful final decision.

## 15.5 Memo-Side Artifacts and Post-Actions

A configured CEO SVG skill may produce `decision-map.svg` beside the memo and reference it from Markdown. This visual is reference-compatible and skill-driven rather than hard-coded into the harness. Failure of an optional visualization shall not invalidate an otherwise valid memo.

Optional TTS is non-blocking and not required for v1. After the session is already `COMPLETED`, the configured editor may be asked to open the memo; editor-launch failure is a warning only.

Completion ordering shall ensure that accepted final board statements are persisted before CEO synthesis begins.

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

`UNAVAILABLE` is terminal for that board member for the remainder of the current session.

The UI must expose board-member status.

The board-agent hung-turn policy is a 90-second inactivity watchdog. Observable Pi lifecycle/message/tool activity resets the watchdog. Legitimate continuous work may exceed 90 seconds. If no observable activity occurs for 90 seconds, the harness aborts the attempt and applies the normal one-retry rule. Retry delay/backoff remains TBD.

## 16.3 CEO Failure

A failed CEO execution is retried exactly once.

If the retry also fails, the entire session transitions to `FAILED`.
The session cannot continue without the CEO because the CEO owns framing,
round-to-round semantic control, final-statement ingestion, synthesis,
and memo generation. If failure occurs during synthesis after `end_deliberation()`, the already accepted final board statements remain persisted in the conversation record.

## 16.4 Failed Session Preservation

A failed session must preserve partial conversation history, tool-use
history, generated artifacts, and completed expertise/scratchpad writes.

It must be visibly marked failed and must not present a final memo as a
successful decision result.

v1 does not resume a failed session.

## 16.5 Harness Checkpoint

Each initialized run shall maintain a run-scoped `session.json` file containing the latest authoritative harness control state. This is a mutable checkpoint, not an event log.

At minimum it shall persist run identity, selected brief reference, lifecycle status, current round and whether a round is in progress, forced-close state/reason, active board membership, per-agent availability/retry state, per-agent Pi session identifiers, and run creation/update timestamps.

The checkpoint shall be updated using temporary-file plus atomic-replace semantics after meaningful control-state mutations. It shall not duplicate conversation messages, tool-call history, token/cost history, or retry-event history. Completed, failed, and interrupted runs retain the checkpoint for archive/diagnostics. v1 does not use the checkpoint to resume a failed or interrupted run.

# 17. Run Isolation and Persistence

Each decision session has its own isolated run directory containing the harness checkpoint, shared conversation log, tool-use log, per-agent Pi sessions, execution snapshots, and run-scoped artifacts.

Global agent expertise remains outside individual runs and persists across them. v1 prevents concurrent project runs with a project-level active-run lock so shared expertise cannot be concurrently updated by two CEO--Board sessions.

Completed, failed, and interrupted run state remains inspectable. v1 does not resume failed/interrupted runs.

------------------------------------------------------------------------

# 18. Runtime UI and Telemetry

The parent CEO Pi extension owns the visible runtime UI through Pi's UI APIs. Board-member Pi RPC subprocesses remain headless and feed observable events/telemetry to the parent UI.

The main runtime presentation preserves the reference vertical order:

1. current CEO semantic action / `converse` callout and message;
2. global status;
3. one live row per active configured board member;
4. time and budget progress area;
5. CEO plus board telemetry rows.

The active board count and names are entirely configuration-driven.

## 18.1 Observable Activity and Expansion

Collapsed board rows show current status and the latest meaningful observable activity, such as file reads/writes, tool/skill use, artifact generation, or waiting for model output. Expanded views may show recent observable tool/file/artifact events and accepted response text.

The UI shall not display or synthesize private chain-of-thought.

Status labels/icons are presentation mappings centralized in a UI configuration/module rather than embedded throughout control-flow code. Persisted lifecycle/agent states remain stable even if labels such as `responding...`, `retrying...`, `unavailable`, `[deliberating]`, `[closing]`, `[synthesizing]`, `[complete]`, or `[failed]` are restyled.

Default interaction shall keep rows collapsed, support selection plus expand/collapse, truncate collapsed activity to one line, and wrap expanded content. Exact key bindings, terminal-width thresholds, and styling are implementation details.

## 18.2 Time and Budget

Time and budget progress bars span the full interval from zero through the configured minimum marker to the configured maximum marker. Progress below the minimum is therefore visibly represented.

`min_time_minutes` marks voluntary-close eligibility; `max_time_minutes` and `max_budget` mark forced-close thresholds. Textual elapsed time/cost may exceed the maximum while final closing/synthesis completes and shall not be clamped.

## 18.3 Per-Agent Telemetry

The per-agent response count is the application's accepted-response count, not raw Pi message/tool count. Per-turn cost is calculated from the delta between Pi session statistics before and after the turn. Remaining context is calculated from Pi-reported current context usage when available; unavailable telemetry shall render as unavailable rather than estimated.

Board colors come from YAML. Other visual styles are centralized implementation concerns.

## 18.4 Completion and Failure Presentation

Successful completion keeps the board/telemetry visible and lists only outputs actually produced (for example `memo.md`, `decision-map.svg`, optional audio). The completion view may also show the CEO's final synthesis/"what won the argument" text.

A failed run shall preserve the same screen state where practical, visibly identify the session as failed, retain each board member's final status, and identify preserved records/artifacts. Failure presentation shall not imply a valid final decision memo exists when memo acceptance failed.

## 18.5 Optional Herdr View

Herdr may be integrated later as an optional richer multi-agent observability/maximized view. It shall not be required for core execution, correctness, or persistence, and shall not replace the parent Pi extension as the authoritative v1 runtime UI.

## 18.6 Audio

Audio generation/playback remains optional and is not required for v1.

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

Board members shall execute as persistent, run-scoped Pi agent processes/sessions
controlled through Pi's supported programmatic interface. The implementation shall
use Pi-provided session, cancellation, completion, and usage/accounting mechanisms
rather than reimplementing provider-specific equivalents.

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

Each active agent definition shall specify its authoritative Pi-supported `model:` in frontmatter. The meeting YAML does not override agent model selection in v1.

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

The selected brief and its supporting context form the session input package. Every regular sibling file in the selected brief directory other than `brief.md` is supporting context available to the CEO and all board members.

------------------------------------------------------------------------

# 23. Completion Presentation

A run may be marked `COMPLETED` only after `memo.md` has been written and passed deterministic memo validation. Accepted final statements must already be persisted before synthesis begins.

The configured reference-compatible CEO may also produce `decision-map.svg`; optional audio may be produced if a configured skill enables it. Only artifacts that actually exist are listed in the completion presentation.

After the run is already complete, the harness may open the generated memo using the configured editor. Failure to launch the editor or optional post-completion audio does not change the run's success state.

------------------------------------------------------------------------

# 24. Archive and Inspection

Completed and failed runs shall remain inspectable through their persisted filesystem records. v1 does not require a separate archive-browser UI.

The authoritative entry point for a stored run is:

``` text
deliberations/<session_name>/session.json
```

Inspection includes, where present:

- `session.json` lifecycle/control state;
- original immutable brief reference;
- `conversation.jsonl` shared deliberation log;
- `tool-use.jsonl` execution-observability log;
- per-agent Pi session files;
- effective configuration / active-agent / rendered-prompt snapshots;
- generated run artifacts;
- final memo directory and memo-side artifacts;
- failure reason/status.

Terminal run status is `COMPLETED` or `FAILED`. Unexpected process termination/stale-lock recovery is represented as `FAILED` with a failure reason such as `interrupted`; v1 does not require a separate terminal `INTERRUPTED` lifecycle state and does not resume failed/interrupted runs.

A partial/invalid memo may remain in a failed archive for diagnostics but shall not be presented as a successful decision result.

Persistent expertise remains cross-run state and is not additionally snapshotted in every archive in v1.

No automatic cleanup/retention policy applies in v1. Run directories remain until explicitly removed by the user/operator.

v1 does **not** promise deterministic replay. Re-running an identical brief produces a new execution.


# 24.1 Prompt Provenance and Reference Fidelity

Recovered prompt text shall be preserved where source evidence exists. Reconstructed prompt text shall be explicitly identified as reconstructed-from-reference evidence rather than represented as verbatim source.

The common observed role-prompt structure is:

``` text
Purpose
Variables
Instructions
Workflow
Context
Report
```

Role prompts may also contain temperament, reasoning patterns, and decision-making heuristics. Shared runtime material—brief package, support files, accepted prior conversation, current CEO request, expertise/skill declarations, and run variables—is injected by the harness rather than manually duplicated across every board file.

The default reference-compatible board contains Revenue, Product Strategist, Technical Architect, Contrarian, Compounder, and Moonshot. Exact prompt tuning is not a prerequisite for the v1 orchestration implementation and may be refined later.

# 24.2 Acceptance-Test Strategy

The harness shall be tested primarily at the Pi API/RPC boundary. Deterministic fake/scripted Pi RPC clients may stand in for board/CEO processes in normal unit and integration tests; provider-SDK mocks are not the architectural test boundary because the product does not execute agents through provider SDK adapters.

An opt-in end-to-end smoke test may exercise the real Pi API path with real configured models. Normal CI shall not require paid model calls or deterministic LLM output.

The exact test runner is deferred until the implementation repository's `package.json`, Node version, and existing tooling are inspected. Vitest is acceptable if compatible, but v1 shall not introduce Vite solely to obtain a test runner.

The recovered acquisition-offer `brief.md` is the primary reference acceptance fixture. Unrecovered `business-metrics.md` and `product-overview.md` contents shall not be invented; synthetic support-file fixtures shall be clearly labeled synthetic.

Required test coverage includes validation, path/resource errors, orchestration barriers and peer isolation, retry/unavailable/failed behavior, forced and voluntary closure, inactivity watchdog semantics, artifact visibility, project-lock semantics, crash-safe persistence, final-statement preservation, and deterministic memo validation.

# 25. Functional Requirements

### Brief and Startup

**FR-01** --- The system shall accept structured Markdown decision
briefs using the canonical headings `Situation`, `Stakes`,
`Constraints`, and singular `Key Question` beneath a `# Brief:` title.

**FR-02** --- The harness shall validate the canonical required brief headings before deliberation begins, plus any additional configured validation rules.

**FR-02A** --- Preflight validation shall be deterministic code owned by the harness and shall not invoke an LLM.

**FR-02B** --- Fatal preflight errors shall prevent run creation and all CEO/board agent execution.

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

**FR-40** --- Board execution shall use a 90-second inactivity watchdog. Observable Pi activity shall reset the watchdog; elapsed wall time alone shall not classify an actively working board member as hung. A watchdog expiration shall abort the attempt and enter the normal one-retry path. Retry delay/backoff remains TBD.

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

**FR-47A** --- The authoritative model for each CEO/board agent shall come from that agent definition's `model:` frontmatter.

**FR-47B** --- `paths.agents` shall define the base agent-definition directory; the CEO definition shall be `ceo.md` beneath that directory, and relative board paths shall resolve against that base according to the defined path-resolution contract.

**FR-47C** --- Canonical budget configuration values shall be numeric dollar amounts; UI currency formatting shall not alter control values.

**FR-47D** --- `brief_sections[].description` shall be validation/authoring metadata rather than implicit runtime prompt content.

**FR-47E** --- The active board shall be the parsed `board:` entries; commented-out or absent entries shall not participate.

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

**FR-59A** --- Board-agent execution shall use Pi-managed model execution and
persistent run-scoped agent sessions; the CEO/Board extension shall not require
direct model-provider SDK adapters.

**FR-59B** --- The harness shall not treat prompt acceptance as board-turn
completion; a participant resolves only after the corresponding Pi agent execution
has settled or failed according to the harness retry policy.

**FR-59C** --- The harness shall obtain board-agent usage/cost/context telemetry
from Pi where available and shall not fabricate unavailable telemetry values.

**FR-60** --- The final decision memo shall be stored as
`memos/<session_name>/memo.md`, where `<session_name>` is `<brief-directory-name>-<session_id>`.

### Persistence and Archive

**FR-61** --- Each decision run shall have an isolated execution record.

**FR-62** --- Run artifacts shall remain associated with their
originating run.

**FR-63** --- Persistent agent expertise shall intentionally survive
across runs.

**FR-64** --- The harness shall persist lifecycle/control state in a run-scoped atomic `session.json` checkpoint.

**FR-64A** --- `session.json` shall represent latest authoritative harness state and shall not duplicate conversation/tool histories or provide v1 failed-run resume semantics.

**FR-64B** --- Each run shall snapshot the effective YAML configuration, source CEO definition, source definitions for active board members, and the fully rendered runtime system prompt supplied to each active agent.

**FR-64C** --- Used brief packages shall remain immutable at their original brief-directory location and need not be copied into the run archive.

**FR-65** --- Completed and failed runs shall support inspection.

**FR-66** --- v1 shall not guarantee deterministic replay.

**FR-67** --- A successful completion may automatically open the
generated memo.


**FR-68** --- v1 shall permit at most one active CEO--Board run per project and shall reject a second run while a live project lock is owned.

**FR-69** --- An agent may modify only its own expertise entries marked `updatable: true`; successful expertise writes shall survive later session failure.

**FR-70** --- Current-round board artifacts shall not become peer-visible shared context until the round barrier completes.

**FR-71** --- Artifact creation shall not require synthetic `conversation.jsonl` records or a dedicated v1 artifact-registration tool/manifest.

**FR-72** --- Accepted final board statements shall be persisted before CEO memo synthesis begins.

**FR-73** --- `memo.md` shall be deterministically validated after generation, including Zod validation of frontmatter and deterministic Markdown-heading/content checks.

**FR-74** --- A second CEO synthesis/memo failure shall fail the session while preserving accepted final board statements and partial artifacts for inspection.

**FR-75** --- The parent Pi extension shall own the authoritative v1 TUI; board Pi RPC subprocesses shall remain headless.

**FR-76** --- Time and budget progress visuals shall represent the full range from zero through minimum to maximum and shall allow textual elapsed/cost values to exceed maximum during closing/synthesis.

**FR-77** --- UI status wording/icons and non-board styling shall be centralized presentation configuration so they can change without altering persisted lifecycle semantics.

**FR-78** --- Optional Herdr integration may provide an alternate observability/maximized view but shall not be required for core execution.


**FR-79** --- The parent Pi extension shall parse canonical YAML/frontmatter with a standard YAML parser, validate structured contracts with Zod 4, and parse memo Markdown structurally rather than relying on regular-expression-only validation.

**FR-80** --- Canonical validation shall be strict by default and shall not silently coerce malformed authoritative values.

**FR-81** --- When deterministic memo validation fails, the CEO shall receive the concrete validation errors and receive exactly one synthesis retry; a second failure shall fail the session.

**FR-82** --- Archived-run inspection in v1 shall be filesystem-based with `deliberations/<session_name>/session.json` as the authoritative entry point; a dedicated archive-browser UI is not required.

**FR-83** --- Unexpected interruption recovered through stale-lock detection shall preserve the run and mark it `FAILED` with an interruption failure reason; v1 shall not auto-resume it.

**FR-84** --- v1 shall not automatically delete completed or failed run directories.

**FR-85** --- Automated orchestration tests shall mock/fake the Pi API/RPC boundary rather than provider SDKs, with real-model Pi smoke tests optional and non-blocking for normal CI.

**FR-86** --- Reference prompt source text and reconstructed prompt text shall have explicit provenance; unrecovered prompt bodies shall not be presented as verbatim reference content.

**FR-87** --- Shared runtime context shall be harness-injected into role prompts, including the accepted shared conversation and support files, rather than duplicated as static role-file content.

------------------------------------------------------------------------

# 26. Explicit TBDs

The following are intentionally unresolved and do not block v1 implementation planning:

1. Exact hidden/additional fields, if any, in the reference `tool-use.jsonl` records beyond the narrow v1 writer contract.
2. Whether future versions need explicit cross-log correlation IDs or a historical lifecycle/retry event log beyond `session.json`.
3. Exact literal `end_deliberation()` closing-prompt wording.
4. Full unrecovered CEO and board-member prompt bodies; deeper prompt tuning is deferred.
5. Exact installed Pi package/import details to be verified against the implementation environment.
6. Exact JavaScript/TypeScript test runner until the repository `package.json` and runtime versions are inspected.
7. Unrecovered reference contents of acquisition-fixture support files.
8. Optional future archive-browser and Herdr integrations beyond v1.

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
