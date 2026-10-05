# CEO–Board Decision System

## Functional Specification — v1.1

## 1. Purpose

The CEO–Board Decision System is a one-shot autonomous multi-agent decision engine.

A human prepares a structured decision brief and starts a decision session. A CEO agent coordinates a configurable board of specialized agents through multiple rounds of deliberation. Board members independently analyze the problem, use configured tools, generate supporting artifacts, and maintain private persistent expertise.

The CEO controls the deliberation and ultimately produces a final decision memo containing a concrete recommendation, the board's positions, areas of agreement and disagreement, and execution considerations.

The system is designed for **observation rather than interactive human intervention once execution begins**.

---

# 2. Actors

## 2.1 Human User

The human:

1. Prepares or selects a decision brief.
2. Starts the decision session.
3. Observes execution and telemetry.
4. Reviews the resulting decision memo and archived run.

The human cannot modify the brief or inject new instructions into an active session in v1.

## 2.2 CEO Agent

The CEO:

* receives the decision brief;
* gathers context;
* reads and updates its private expertise;
* broadcasts questions/instructions to the board;
* evaluates board responses;
* decides whether to continue deliberation or close;
* initiates final closing statements;
* synthesizes the final decision memo.

The CEO is the final decision-making agent within the system.

## 2.3 Board Agents

Each board member has independently configurable:

* role;
* domain focus;
* system prompt;
* model/provider;
* skills/tools;
* private persistent expertise.

Board roles are intentionally differentiated and may be adversarial by design.

Example roles include:

* **Revenue** — short-term cash flow and financial survival.
* **Compounder** — long-term value creation and compounding.
* **Moonshot** — asymmetric risk and high-upside opportunities.
* **Contrarian** — challenges assumptions and consensus.

The specific board composition is configuration, not a fixed product requirement.

---

# 3. System Configuration

The system is configured through `config.json` and agent definitions under `agents/`.

Configuration includes, at minimum:

* CEO definition;
* board membership;
* agent roles;
* system prompts;
* model/provider assignments;
* available skills/tools;
* execution constraints;
* retry/error behavior where configured.

Model and provider assignment must be independent of the product architecture.

The system must support experimentation with different providers and models rather than being permanently tied to a particular model vendor.

A typical configuration may use a higher-capability model for the CEO and lower-cost models for parallel board members, but this is configurable behavior rather than a fixed requirement.

---

# 4. Decision Brief

## 4.1 Brief Format

A decision brief is a Markdown document stored under `briefs/`.

The brief must contain these required sections:

```text
debrief
stakes
constraints
key questions
```

It may also contain supporting sections such as:

```text
business_metrics
product_overview
financials
market_context
reference_material
```

The exact supporting-section vocabulary is not fixed.

## 4.2 Brief Selection

When the user runs:

```text
ceo begin
```

the harness interactively discovers available briefs from `briefs/` and prompts the user to select the brief for the session.

The selected brief becomes immutable for the duration of the run.

---

## 4.3 Validation

Before any agent deliberation begins, the harness programmatically validates the selected Markdown brief against the required structure defined in `config.json`.

If required sections are missing or invalid:

1. execution stops;
2. no board deliberation begins;
3. the user receives a validation error.

---

# 5. Session Startup

After a valid brief is selected:

1. The harness creates an isolated run context.
2. The CEO receives the decision brief.
3. The CEO gathers relevant context.
4. The CEO reads its private expertise.
5. The CEO may update its private expertise.
6. The CEO invokes its configured `converse` mechanism.
7. The CEO broadcasts the initial question/instruction to the board.

The system then enters deliberation.

---

# 6. Agent Execution Model

An agent turn is an atomic execution pass.

An atomic turn may contain:

1. context reads;
2. private expertise reads;
3. reasoning;
4. tool calls;
5. file reads/writes;
6. artifact generation;
7. expertise updates;
8. a generated response.

The harness records the externally observable execution events produced during the turn.

---

# 7. Board Deliberation

## 7.1 Broadcast Topology

The CEO communicates with the board through broadcast prompts.

A normal deliberation cycle is:

```text
CEO
 ↓
broadcast
 ↓
┌─────────┬─────────┬─────────┬─────────┐
│ Board A │ Board B │ Board C │ Board D │
└─────────┴─────────┴─────────┴─────────┘
 ↓           ↓           ↓           ↓
response   response   response   response
 └───────────┴───────────┴───────────┘
                 ↓
                CEO
```

Board members do not directly message one another in v1.

## 7.2 Current-Turn Isolation

All board members responding to a CEO broadcast execute against the same pre-round shared state.

A board member **must not see another board member's response from the current round**.

After all applicable board turns have completed, their responses become part of shared historical context.

Subsequent rounds may inspect the complete prior conversation.

This isolation is a first-class functional requirement.

## 7.3 Subsequent Deliberation

The CEO receives the completed board responses and decides whether another deliberation round is necessary.

The CEO has two functional choices:

### Continue

Invoke `converse` with another broadcast to the board.

The system returns to `DELIBERATING`.

### Close

Stop open-ended deliberation and initiate the final closing phase.

There is no predetermined number of rounds.

---

# 8. Communication Model

The communication topology is intentionally simple:

```text
CEO → broadcast → Board
Board → response → CEO
```

There is no direct board-to-board messaging in v1.

Historical communication is shared through the persisted conversation record.

---

# 9. Conversation and Execution Log

The harness owns `conversation.json`.

The file is incrementally persisted throughout the run.

Functionally, the log contains two conceptual event layers.

## 9.1 Conversation Events

Examples:

* CEO broadcast;
* board response;
* CEO deliberation action;
* final board statement;
* CEO final synthesis.

## 9.2 Execution Events

Examples:

* context/file read;
* expertise read/write;
* tool invocation;
* tool result;
* SVG generation;
* artifact creation;
* retry;
* agent failure;
* constraint reached.

The exact JSON schema is a technical-design concern and remains TBD.

The log must preserve sufficient information to reconstruct what happened during the run.

---

# 10. Agent Expertise

Each agent has a private persistent expertise file.

Example:

```text
expertise/
├── ceo.md
├── revenue.md
├── compounder.md
├── moonshot.md
└── contrarian.md
```

An agent may read and update its own expertise during a session.

Expertise may contain:

* domain knowledge;
* working notes;
* lessons from previous sessions;
* recurring observations;
* behavioral observations about specific board members;
* recurring friction or disagreement with other board members.

## 10.1 Privacy Boundary

Private expertise is **not part of the shared conversation transcript**.

An agent cannot directly read another agent's expertise file.

The shared state is:

```text
brief
conversation history
registered artifacts
```

The private state is:

```text
own expertise
```

## 10.2 Cross-Run Persistence

Decision runs are isolated with respect to their execution state, debate history, and artifacts.

Persistent expertise is intentionally **not isolated per run**.

Instead:

```text
Run A ──┐
Run B ──┼──> shared persistent agent expertise
Run C ──┘
```

This is intentional product behavior: agents learn across decision sessions.

The harness must ensure that one run cannot accidentally overwrite another run's debate record or artifacts, while allowing the designated agent expertise state to persist across runs.

The exact concurrency/versioning mechanism for expertise updates is a technical-design concern.

---

# 11. Tools and Artifacts

Agents may use configured skills and tools during deliberation.

## 11.1 In-Flight Artifacts

Artifact generation is part of active deliberation.

For example, a board agent may generate an SVG chart to support its argument.

Artifacts are stored within the active run:

```text
debates/
└── <run>/
    ├── conversation.json
    └── *.svg
```

## 11.2 Artifact Lifecycle

The functional lifecycle is:

```text
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

Artifacts therefore form part of the permanent decision record rather than being temporary execution output.

---

# 12. Execution Constraints

The system supports hard execution limits such as:

```text
max_time
max_budget
```

The UI exposes live constraint telemetry.

Example:

```text
Time:   03:42 / 05:00
Budget: $3.21 / $5.00
```

The harness, rather than the CEO, owns enforcement of these constraints.

---

# 13. Constraint Reached / Forced Closure

When a configured hard limit is reached, the harness interrupts **normal deliberation**.

If an atomic agent turn or tool call is already in flight, the harness allows that active operation to finish before initiating forced closure.

The harness then injects the standard signal:

```text
max reached
```

The CEO is informed that the constraint has been reached.

The CEO must stop open-ended deliberation and enter final closure.

The system does not attempt to achieve consensus merely because forced closure occurred.

A forced closure is therefore:

```text
constraint reached
      ↓
active atomic work finishes
      ↓
max reached
      ↓
CEO closes deliberation
      ↓
final board statements
      ↓
CEO synthesis
```

The exact cancellation/timeout mechanics for individual tools remain a technical-design concern.

---

# 14. Final Closing

## 14.1 Normal Closure

When the CEO decides to close, it initiates final closing.

The CEO sends a dedicated closing prompt to every board member.

All final board statements are requested in parallel.

## 14.2 Final Closing Statement

A final closing statement is distinct from a normal deliberation response.

The prompt must request a single final position based on the complete deliberation.

At minimum, the board member should provide:

1. final position/recommendation;
2. strongest supporting reason;
3. strongest remaining concern or condition.

The final response represents the member's final stance for purposes of the decision memo.

## 14.3 Forced Closure

Forced closure uses the same final-closing mechanism.

The harness must enforce **one final closing statement per board member**.

Board members must not initiate another open-ended deliberation round after `max reached`.

---

# 15. Final Decision Memo

After receiving the final board statements, the CEO synthesizes the final decision memo.

The memo is stored under:

```text
memos/<brief_name>.md
```

The exact naming/versioning convention remains TBD.

## 15.1 Required Memo Content

The memo contains:

### Decision Map

Summary of the decision landscape and major considerations.

### Core Decision

The CEO's concrete recommendation.

### Board Stance Summary

A factual summary of the board's positions.

This is **not a formal vote** and does not imply that the board has decision authority.

### Board Stances

Individual final positions attributed to their respective roles.

### Tension & Dissent

Important disagreements, objections, unresolved concerns, and competing assumptions.

### Execution Plan

Recommended implementation/action considerations, dependencies, risks, and next steps.

## 15.2 Recommendation Requirement

A successfully completed session must produce a concrete CEO recommendation even when:

* evidence is incomplete;
* board members disagree;
* uncertainty remains;
* consensus is absent.

The CEO must explicitly identify important uncertainty and assumptions rather than presenting them as settled facts.

---

# 16. Agent and Session Failure Handling

The reference video primarily demonstrates the successful execution path and does not specify detailed retry/error semantics.

Therefore, exact retry counts, retry delays, timeout values, retry context, and related mechanics remain **TBD**.

The functional failure model is nevertheless defined.

## 16.1 Agent States

An individual board agent may move through:

```text
RUNNING
   ↓
AGENT_FAILED
   ↓
RETRYING
   ↓
RUNNING
```

or:

```text
AGENT_FAILED
   ↓
UNAVAILABLE
```

A failed agent's completed work must be preserved.

## 16.2 Recoverable Agent Failure

An individual board-agent failure does not automatically fail the entire session.

The harness:

1. records the failure;
2. preserves completed work;
3. applies the configured retry behavior;
4. marks the agent unavailable if recovery fails;
5. informs the CEO;
6. allows the CEO to proceed using the remaining available perspectives where possible.

## 16.3 Session Failure

A **session failure** occurs when the system cannot complete a valid decision session.

Examples may include unrecoverable CEO failure or an execution failure that prevents synthesis.

A failed session must:

* preserve partial `conversation.json`;
* preserve generated artifacts;
* preserve completed expertise updates;
* record explicit failed state;
* not claim successful completion;
* not produce or present a final memo as if the decision were successfully completed.

---

# 17. Run Isolation and Persistence

Each decision session has its own isolated run directory.

```text
debates/
└── <run>/
    ├── conversation.json
    └── *.svg
```

The run contains the complete execution-specific record.

Global persistent agent expertise is deliberately outside the run directory.

Therefore:

### Run-scoped state

* decision brief reference;
* conversation;
* execution events;
* generated artifacts;
* run status;
* partial/completed execution state.

### Persistent cross-run state

* each agent's private expertise.

This distinction is intentional.

---

# 18. Runtime UI and Telemetry

The runtime UI provides observation into the active decision session.

It must not imply that private model chain-of-thought is being exposed.

## 18.1 Session Header

Display:

* system identity;
* execution mode;
* duration limit;
* budget limit;
* selected brief;
* active run.

Execution mode is explicitly:

> non-interactive, one-shot once started

## 18.2 Global Telemetry

Display:

* elapsed time;
* cumulative spend;
* board stance distribution/summary where available;
* constraint status;
* `max reached` when applicable.

The UI must not represent the stance distribution as a formal vote.

## 18.3 CEO Panel

Display:

* CEO model designation;
* current activity/state;
* generated CEO messages;
* current broadcast prompt;
* harness-level activity such as context gathering or tool execution.

The system does not expose private chain-of-thought.

## 18.4 Board Grid

For each board member, display:

* role/domain focus;
* assigned model;
* deliberation status;
* cost/token telemetry where available;
* tool execution events;
* file activity;
* generated artifacts.

Individual CEO and board-member activity can be expanded or collapsed.

## 18.5 Audio

Core system audio generation and playback are **not required in v1**.

Optional skills/tools capable of audio generation, such as an ElevenLabs integration, are not prohibited. If configured as an agent skill, such tools may be used according to the normal tool model.

Audio is therefore an optional tool capability, not a core product requirement.

---

# 19. Session Lifecycle

The authoritative functional state model is:

```text
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

```text
        ┌──────────────┐
        ↓              │
     FAILED ←──────────┘
```

A completed run represents successful memo synthesis.

A failed run represents preserved partial execution without successful completion.

The harness must persist the current lifecycle state so that the UI and archived run accurately reflect what happened.

---

# 20. CLI Initialization

Running:

```text
ceo begin
```

initiates interactive session setup.

At minimum, initialization must:

1. discover available briefs under `briefs/`;
2. prompt the user to select a brief;
3. validate the selected brief;
4. initialize the run;
5. begin CEO execution.

The functional specification does not require that the CLI be the only future interface, but CLI startup is the v1 execution mechanism.

---

# 21. Completion Presentation

When synthesis succeeds:

1. the final memo is persisted;
2. the run is marked `COMPLETED`;
3. all run artifacts remain available;
4. the harness may automatically open the generated memo.

The specific application used to open the memo is not a product requirement.

Audio playback is not required.

---

# 22. Archive and Inspection

A completed or failed run must remain inspectable through its persisted records.

Inspection includes:

* original brief;
* conversation/execution log;
* generated artifacts;
* relevant expertise state;
* final memo, if successfully generated;
* run status.

v1 does **not** promise deterministic replay.

Re-running an identical brief may produce different LLM outputs and is considered a new execution rather than a replay of the original run.

---

# 23. Functional Requirements

### Brief and Startup

**FR-01** — The system shall accept structured Markdown decision briefs.

**FR-02** — The harness shall validate required brief sections before deliberation begins.

**FR-03** — `ceo begin` shall discover available briefs and prompt the user to select one.

**FR-04** — The harness shall initialize an isolated run after a valid brief is selected.

**FR-05** — The CEO shall gather initial context and read/update its private expertise before its first board broadcast.

**FR-06** — The CEO shall use its configured `converse` mechanism to issue board broadcasts.

### Deliberation

**FR-07** — The CEO shall broadcast prompts to all configured board members.

**FR-08** — Board members shall execute in parallel.

**FR-09** — Board members shall not see peer responses generated during the current round.

**FR-10** — Subsequent deliberation rounds shall have access to complete prior shared conversation history.

**FR-11** — The harness shall incrementally persist the conversation/execution record.

**FR-12** — An agent turn may contain multiple internal tool executions.

**FR-13** — The CEO shall control whether deliberation continues or closes.

**FR-14** — The CEO shall have the functional choices `Continue` or `Close` after a deliberation cycle.

### Expertise

**FR-15** — Agents shall maintain private persistent expertise.

**FR-16** — Agents shall be able to record domain knowledge and working notes in their expertise.

**FR-17** — Agents may record recurring behavioral observations and friction involving other board members.

**FR-18** — Private expertise shall be inaccessible to peer agents.

**FR-19** — Private expertise shall not be included in the shared conversation transcript.

**FR-20** — Expertise shall persist across decision runs.

### Closure

**FR-21** — Normal closure shall initiate a dedicated final-closing phase.

**FR-22** — The CEO shall request one final position statement from every available board member.

**FR-23** — Final board statements shall execute in parallel.

**FR-24** — Final closing prompts shall request a final position, strongest supporting reason, and strongest remaining concern or condition.

**FR-25** — The CEO shall synthesize a final decision memo.

**FR-26** — A successful session shall contain a concrete CEO recommendation.

**FR-27** — The final memo shall contain a Board Stance Summary rather than implying a formal board vote.

### Constraints

**FR-28** — The harness shall enforce configured execution limits.

**FR-29** — When a limit is reached, active atomic turns/tool calls shall be allowed to finish before forced closure begins.

**FR-30** — The harness shall inject `max reached` after the active work has completed.

**FR-31** — Forced closure shall prevent another open-ended deliberation round.

**FR-32** — Forced closure shall request exactly one final closing statement from each board member.

### Failures

**FR-33** — The harness shall record board-agent failures.

**FR-34** — Board-agent failures shall support retry and unavailable states.

**FR-35** — Exact retry counts, delays, timeout values, and retry mechanics remain TBD.

**FR-36** — Agent failures shall be surfaced to the CEO.

**FR-37** — Recoverable individual agent failure shall not automatically fail the session.

**FR-38** — Session failure shall preserve partial execution records and artifacts.

**FR-39** — A failed session shall not be represented as successfully completed.

### Artifacts

**FR-40** — Agents may generate artifacts during active deliberation.

**FR-41** — SVG generation shall be supported as a core artifact capability.

**FR-42** — Artifacts shall be stored within the corresponding run directory.

**FR-43** — Artifact creation shall be recorded in the execution log.

**FR-44** — Artifacts shall remain available during subsequent turns and archive inspection.

**FR-45** — Artifacts may be referenced or rendered in the final decision memo.

### Configuration

**FR-46** — CEO and board model assignments shall be independently configurable.

**FR-47** — Model/provider configuration shall not be hard-coded to a single provider.

### Runtime UI

**FR-48** — The UI shall display session identity and execution constraints.

**FR-49** — The UI shall display elapsed time and cumulative spend where available.

**FR-50** — The UI shall display CEO activity and generated broadcasts.

**FR-51** — The UI shall display board-member status and execution telemetry.

**FR-52** — Individual CEO and board activity shall be expandable/collapsible.

**FR-53** — The UI shall distinguish conversational activity from execution/tool telemetry.

**FR-54** — The UI shall not imply that private chain-of-thought is exposed.

**FR-55** — Audio generation/playback shall not be required for v1.

### Persistence and Archive

**FR-56** — Each decision run shall have an isolated execution record.

**FR-57** — Run artifacts shall remain associated with their originating run.

**FR-58** — Persistent agent expertise shall intentionally survive across runs.

**FR-59** — The harness shall persist lifecycle state.

**FR-60** — Completed and failed runs shall support inspection.

**FR-61** — v1 shall not guarantee deterministic replay.

**FR-62** — A successful completion may automatically open the generated memo.

---

# 24. Explicit TBDs

The following are intentionally unresolved and should be addressed during technical design or later functional refinement:

1. Exact `conversation.json` schema.
2. Exact lifecycle-state persistence mechanism.
3. Exact run naming and ID format.
4. Exact memo filename/versioning behavior.
5. Exact retry count and retry delay.
6. Per-agent timeout behavior.
7. Retry context supplied to failed agents.
8. Whether/how an unavailable agent can re-enter an active session.
9. Exact session-abort criteria.
10. Exact behavior when the CEO itself fails.
11. Exact handling of concurrent expertise updates.
12. Exact mechanism for discovering/loading supporting reference files.
13. Exact UI layout and frontend implementation.
14. Exact model/provider adapter architecture.
15. Exact tool cancellation behavior.
16. Exact calculation/presentation of board stance summaries.
17. Whether failed sessions can be resumed.
18. Exact archive browser/inspection interface.

These TBDs do not invalidate the functional contract above.

---

# 25. v1 Boundary

The v1 system is:

> **A human-started, one-shot, autonomous CEO–Board deliberation engine that turns a structured decision brief into a documented decision memo while preserving the complete execution history, generated artifacts, and persistent private agent expertise.**

The core v1 loop is:

```text
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

```text
Deliberation
    ↓
limit reached
    ↓
finish active atomic work
    ↓
max reached
    ↓
forced closing
    ↓
final statements
    ↓
CEO synthesis
```

The system deliberately does **not** require:

* human intervention during deliberation;
* formal board voting;
* board consensus;
* deterministic replay;
* core audio generation/playback;
* direct board-to-board messaging;
* exposure of private chain-of-thought.
