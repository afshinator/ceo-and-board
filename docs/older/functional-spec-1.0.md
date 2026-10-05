I think we have enough to proceed. The remaining unknowns are implementation-level or failure-policy details, so I'll explicitly mark them **TBD — not answered by the video** rather than filling them in by assumption.

# CEO–Board Decision System

## Functional Specification

**Version:** 1.0
**Status:** Initial functional specification
**Basis:** Product Behavior Description v0.5 + behavior extracted from the reference video
**Implementation context:** Custom agent harness; current experimentation uses Pi, with multiple model providers under consideration.

---

# 1. Purpose

This specification defines the functional behavior required to implement the CEO–Board Decision System.

The system accepts a structured decision brief, initializes a configured CEO and board of specialized agents, conducts autonomous multi-round deliberation, and produces a final decision memo.

The specification intentionally defines **what the system must do**, rather than prescribing the underlying implementation technology.

Where the reference video does not establish a behavior, the requirement is explicitly marked:

> **TBD — not answered by the video**

---

# 2. Actors

The system contains three functional actors.

### F-2.1 Human User

The user:

* creates or selects a decision brief;
* configures the board;
* starts a decision session;
* observes execution;
* reviews the resulting decision memo and archived artifacts.

The user does not interactively direct the agents after execution begins.

### F-2.2 CEO Agent

The CEO:

* reads and frames the decision;
* broadcasts questions to the board;
* evaluates responses;
* updates its expertise;
* determines whether additional deliberation is required;
* initiates normal closure;
* synthesizes the final decision;
* writes the final memo.

The CEO has final synthesis authority.

### F-2.3 Board Agents

Each board agent:

* has a specialized role;
* receives CEO broadcasts;
* reads shared historical context;
* reads its private expertise;
* performs reasoning;
* may invoke configured tools;
* may generate artifacts;
* updates its private expertise;
* returns a response to the shared conversation.

---

# 3. System Configuration

## 3.1 Configuration File

The system uses a developer-readable configuration file:

`config.json`

The configuration defines, at minimum:

* board members;
* agent roles;
* model assignments;
* execution limits;
* required brief sections;
* path mappings;
* available skills/tools;
* other runtime parameters.

The exact schema is TBD at the technical-design stage.

---

## 3.2 Agent Configuration

Each agent has an associated configuration/system-prompt file under:

`agents/`

Agent configuration may include frontmatter metadata.

An agent configuration defines its:

* role;
* behavioral orientation;
* domain specialization;
* model assignment;
* available capabilities/tools.

The number and composition of board agents are configurable.

---

## 3.3 Model Assignment

The system must support independent model assignment for the CEO and each board agent.

A typical configuration may use:

* a higher-capability model for the CEO;
* lower-cost models for board members.

Example:

* CEO → Claude Opus
* Board → Claude Sonnet

Other model providers, including DeepSeek and others, may be used.

The functional requirement is provider/model configurability, not any specific vendor.

---

# 4. Decision Brief

## 4.1 Brief Selection

A session begins when the user executes:

`ceo begin`

The harness prompts the user to select a target brief from:

`briefs/`

The selected brief becomes the immutable input for the session.

---

## 4.2 Brief Structure

The brief is Markdown.

Required sections are defined in `config.json`.

The currently established required sections are:

* `debrief`
* `stakes`
* `constraints`
* `key questions`

A brief may also reference or incorporate supporting context such as:

* `product_overview.md`
* `business_metrics.md`

The exact mechanism for referencing supporting documents is TBD.

---

## 4.3 Programmatic Validation

Before agent execution begins, the harness validates the selected brief against the required section schema.

If any required section is missing:

1. The session does not enter execution.
2. No CEO deliberation begins.
3. The validation failure is reported to the user.
4. The user must correct the brief before execution can begin.

The exact validation error format is TBD.

---

## 4.4 Brief Immutability

Once execution begins, the original brief cannot be modified through the running session.

Agents may challenge assumptions or facts contained in it but do not modify the source brief.

---

# 5. Session Startup

When the user selects a valid brief:

### Startup sequence

1. Harness starts the session.
2. Harness records the selected brief.
3. CEO reads the selected brief.
4. CEO reads configured supporting reference files.
5. CEO reads its private expertise file.
6. CEO updates `expertise/ceo.md` with relevant facts/problem framing.
7. CEO invokes the `converse` mechanism.
8. CEO's opening broadcast is sent to all board agents.

Representative execution trace:

```text
ceo begin
    ↓
select brief
    ↓
validate brief
    ↓
CEO reads context
    ↓
CEO reads/updates expertise
    ↓
CEO invokes converse
    ↓
parallel board execution
```

The exact startup event schema is TBD.

---

# 6. Agent Turn

## 6.1 Atomic Turn Definition

An agent turn is one complete execution pass by one agent.

A turn may contain:

1. context reading;
2. private expertise reading;
3. reasoning;
4. local tool calls;
5. artifact generation;
6. expertise updates;
7. final response generation.

All of these operations belong to the same agent turn.

Tool calls inside a turn do not constitute separate deliberation rounds.

---

## 6.2 CEO Turn

A CEO turn consists of the CEO:

* reviewing available context;
* evaluating prior board responses;
* potentially updating its expertise;
* deciding what should happen next;
* invoking `converse` when it wants to communicate with the board.

The CEO may continue deliberation by issuing another `converse` message.

---

## 6.3 Board Turn

A board turn begins when a CEO broadcast is dispatched to the board.

Each board member independently:

* reads the broadcast;
* reads relevant shared history;
* reads its own expertise;
* reasons according to its role;
* invokes tools if needed;
* generates artifacts if needed;
* updates its expertise if needed;
* produces its response.

---

# 7. Board Parallelism and Synchronization

## 7.1 Parallel Dispatch

A CEO broadcast is dispatched to all configured board members in parallel.

Conceptually:

```text
                  CEO
                   │
              broadcast
                   │
       ┌───────────┼───────────┐
       ↓           ↓           ↓
    Revenue     Moonshot    Compounder
       │           │           │
       └───────────┼───────────┘
                   ↓
             CEO regains control
```

---

## 7.2 Turn Isolation

Board members cannot see peer responses from the currently active turn while generating their own responses.

This preserves independent analysis.

---

## 7.3 Synchronization

The harness waits for all board agents to complete their active turn before returning control to the CEO.

The exception is a system constraint interruption such as:

* `max_time`;
* `max_budget`.

Failure handling is addressed separately in Section 15.

---

# 8. Communication Model

## 8.1 Broadcast Communication

The active communication model is CEO-to-everyone broadcast:

```json
{
  "from": "ceo",
  "to": "everyone",
  "message": "..."
}
```

---

## 8.2 Direct Agent Messaging

Private 1:1 agent messaging is not enabled.

Agents communicate indirectly through the shared conversation history.

---

## 8.3 Shared Historical Context

Once a turn has completed, its information becomes part of the shared conversation history.

Subsequent agents can inspect prior turns.

This allows later board turns to react to:

* other agents' arguments;
* CEO questions;
* previously generated evidence;
* disagreements;
* artifacts;
* revised positions.

---

# 9. Conversation Log

## 9.1 Harness Ownership

The harness owns `conversation.json`.

The harness automatically records and manages the file.

Agents do not need to manually maintain the authoritative conversation log.

---

## 9.2 Recorded Information

Conversation records include, at minimum:

* sender;
* recipient;
* message content;
* timestamp;
* tool calls;
* execution outputs where applicable.

Example:

```json
[
  {
    "from": "ceo",
    "to": "everyone",
    "message": "Board, we are here to make a call...",
    "timestamp": "2026-10-02T14:00:00Z"
  },
  {
    "from": "moonshot",
    "to": "everyone",
    "message": "Reject offer. Run 30-day investor test...",
    "tool_calls": [
      {
        "tool": "write_file",
        "path": "debates/moonshot_chart.svg"
      }
    ]
  }
]
```

The complete event schema is TBD.

---

## 9.3 Incremental Persistence

Conversation events are written incrementally during execution.

The system must not depend on successful completion before writing the authoritative history.

---

# 10. Deliberation Control

## 10.1 CEO-Controlled Loop

The normal deliberation loop is controlled by the CEO.

After receiving board responses, the CEO evaluates:

* arguments;
* disagreement;
* evidence;
* remaining uncertainty;
* depth of discussion.

The CEO determines whether another round is needed.

There is no predetermined number of deliberation rounds.

---

## 10.2 Continuing Deliberation

The CEO continues deliberation by invoking `converse` again.

A subsequent broadcast starts another parallel board turn.

The process repeats until:

* the CEO initiates normal closure; or
* the harness triggers forced closure because an execution limit is reached.

---

## 10.3 Targeted Messaging

The current implementation supports broadcast communication only.

The CEO does not currently route private 1:1 messages to individual board members.

Future targeted messaging is outside the current functional requirement.

---

# 11. Agent Memory

## 11.1 Private Expertise

Each agent has a persistent Markdown scratchpad:

`expertise/<agent_role>.md`

It contains information such as:

* working hypotheses;
* key facts;
* domain patterns;
* lessons;
* recurring considerations;
* observations about other agents.

---

## 11.2 Memory Read

An agent reads its private expertise:

* during session startup;
* prior to turn generation.

---

## 11.3 Memory Write

An agent may update its expertise during or after a turn using local file-writing capabilities.

Changes are persisted to disk.

---

## 11.4 Cross-Agent Behavioral Memory

Agents may record observations about specific other board members.

Examples include:

* recurring disagreements;
* recurring friction;
* argument patterns;
* observed blind spots;
* tendencies when responding to evidence.

These observations persist across sessions.

---

## 11.5 Memory Isolation

An agent can access only its own private expertise file.

An agent cannot directly read another agent's scratchpad.

---

# 12. Tools and Artifacts

## 12.1 Agent Tools

Agents may use configured tools during their turns.

Tools are part of the agent's execution pass.

---

## 12.2 In-Flight SVG Generation

Board members may dynamically generate SVG diagrams during active deliberation.

An agent may create an SVG to:

* explain an argument;
* visualize evidence;
* compare alternatives;
* expose a risk;
* persuade the CEO;
* document its reasoning.

Generated SVGs are stored under the relevant run's `debates/` area.

---

## 12.3 Artifact Registration

The harness records artifact-generating tool activity in `conversation.json`.

This associates the artifact with the relevant deliberation activity.

Subsequent agents and the CEO can discover the artifact through the shared deliberation record.

---

## 12.4 Artifact Persistence

Generated artifacts remain available as part of the session archive.

---

# 13. Execution Constraints

## 13.1 Time Limit

The system supports a configurable maximum execution duration:

`max_time`

---

## 13.2 Budget Limit

The system supports a configurable maximum execution cost:

`max_budget`

---

## 13.3 Live Constraint Telemetry

During execution, the system exposes:

* elapsed time;
* cumulative spend;
* configured limits;
* current execution status.

The exact telemetry schema is TBD.

---

# 14. Normal Completion

## 14.1 CEO Initiated Closure

When the CEO determines that sufficient deliberation has occurred, it stops issuing open-ended debate prompts.

The CEO requests one final closing statement from each board member.

---

## 14.2 Final Board Statements

All board members submit one final closing position in parallel.

These statements become part of the shared conversation history.

---

## 14.3 CEO Synthesis

After receiving the final board statements, the CEO synthesizes the complete deliberation and generates the final decision memo.

The CEO must produce a concrete recommendation.

Consensus is not required.

---

# 15. Forced Completion

## 15.1 Limit Detection

The harness continuously enforces configured execution constraints.

If `max_time` or `max_budget` is reached, the harness overrides normal CEO-controlled continuation.

---

## 15.2 Harness Interception

The harness:

1. detects the limit breach;
2. intercepts the active execution loop;
3. injects the standardized override:

```text
max reached
```

4. provides the override to the CEO;
5. prevents further open-ended deliberation.

---

## 15.3 Forced Closing

The CEO responds to the override by:

1. stopping open debate;
2. requesting one final closing statement from each board member;
3. receiving those statements in parallel;
4. synthesizing the accumulated discussion;
5. generating the final memo.

Forced closure does not imply consensus.

---

# 16. Agent and Tool Failure Handling

The reference video does not establish detailed failure behavior. The following is therefore a **functional design decision**, not behavior extracted from the video.

## 16.1 Failure Preservation

If an agent pass or tool operation fails:

* completed conversation events remain persisted;
* generated artifacts remain persisted;
* completed scratchpad writes remain persisted;
* the failure itself is recorded.

The system does not discard previously persisted work.

---

## 16.2 Recommended Failure Model

The recommended functional behavior is:

1. Attempt the failed operation according to a configurable retry policy.
2. If retries are exhausted, mark the affected agent/operation unavailable.
3. Record the failure in `conversation.json`.
4. Make the failure visible to the CEO.
5. Allow the CEO to determine whether the remaining perspectives are sufficient.
6. Continue when the decision can reasonably proceed.
7. Permit the overall session to fail if the missing capability makes completion impractical.

This treats a single board-member failure as a potentially recoverable condition rather than automatically destroying the entire session.

---

## 16.3 Failure Policy TBD

The following details are **TBD — not answered by the video**:

* **F16.3.1:** exact retry count;
* **F16.3.2:** retry delay;
* **F16.3.3:** per-agent timeout;
* **F16.3.4:** whether retries reuse identical context;
* **F16.3.5:** whether a failed agent can rejoin in a later round;
* **F16.3.6:** exact failure event schema;
* **F16.3.7:** exact conditions requiring complete session abort;
* **F16.3.8:** whether CEO or harness has final authority to declare the session unrecoverable.

These should be resolved during implementation design.

---

# 17. Final Decision Memo

## 17.1 Output

A successfully completed session produces:

`memos/<brief_name>.md`

---

## 17.2 Memo Structure

The current demonstrated structure is:

### Decision Map

Visual SVG framework representing the decision.

### Core Decision

The CEO's final recommendation and any binding conditions.

### Vote Tally

Breakdown of member stances.

### Board Stances

Individual board-member positions.

### Tension & Dissent

Resolved and unresolved objections and significant dissent.

### Execution Plan

Trade-offs, risks, next actions, and decision gates.

---

## 17.3 Recommendation Requirement

The CEO must make a concrete recommendation.

The recommendation may contain:

* assumptions;
* uncertainty;
* conditions;
* unresolved disagreement.

The system must not require unanimous consensus.

---

## 17.4 Attribution

The memo should distinguish:

* facts/evidence derived from source material;
* arguments made by board members;
* the CEO's synthesis and recommendation.

The exact attribution format is TBD.

---

# 18. Run Persistence and File Structure

The system uses file-based persistence.

A representative project structure is:

```text
.
├── config.json
├── agents/
│   ├── revenue.md
│   ├── moonshot.md
│   ├── compounder.md
│   └── ...
├── briefs/
│   ├── acquisition_offer.md
│   ├── product_overview.md
│   └── business_metrics.md
├── debates/
│   └── <run>/
│       ├── conversation.json
│       └── *.svg
├── expertise/
│   ├── ceo.md
│   ├── revenue.md
│   ├── moonshot.md
│   └── ...
└── memos/
    └── <brief_name>.md
```

The exact run-directory naming scheme is TBD.

---

## 18.1 Run Isolation

Each decision session maintains its own:

* conversation record;
* generated artifacts;
* memo;
* associated execution state.

One run must not overwrite another run's deliberation artifacts.

---

## 18.2 Successful Run

A successful run contains, where applicable:

* selected brief;
* completed conversation log;
* generated artifacts;
* updated expertise files;
* final memo.

---

## 18.3 Failed Run

A failed run preserves:

* original brief;
* partial conversation log;
* generated artifacts created before failure;
* scratchpad changes completed before failure.

A failed run does not produce a false successful-completion state.

---

# 19. Runtime UI / Telemetry

The system provides a real-time execution interface.

The initial implementation context is a terminal-based harness UI, with the interface expected to support expandable/collapsible agent detail.

---

## 19.1 Session Header

The runtime interface displays:

* system/session identity;
* execution mode;
* selected brief;
* configured duration limit;
* configured budget limit.

---

## 19.2 Global Telemetry

The interface displays:

* elapsed execution time;
* cumulative spend;
* current execution state;
* hard-limit status.

A real-time board stance/consensus summary may also be displayed.

The exact calculation and presentation of a consensus split is TBD.

---

## 19.3 CEO Status

The interface displays:

* CEO model designation;
* current CEO activity;
* context-loading activity;
* expertise-file updates;
* tool activity;
* CEO broadcasts.

The exact representation of CEO reasoning requires care and is not intended to require exposure of private chain-of-thought.

The functional requirement is visibility into generated CEO messages and harness-level execution status.

---

## 19.4 Board Status

For each board member, the interface displays:

* agent role;
* assigned model;
* current deliberation status;
* completed-turn status;
* turn cost;
* relevant tool activity.

Agents should be individually expandable/collapsible so the user can move between overview and detailed activity.

---

## 19.5 Tool and File Activity

The runtime interface may expose events such as:

* file reads;
* scratchpad writes;
* SVG generation;
* other tool execution;
* system overrides.

---

# 20. Completion Presentation

After successful memo generation, the harness may automatically open the generated memo for the user.

The specific application used to open it is **not** a functional requirement.

For v1:

* opening the memo is supported;
* audio generation is not required;
* audio playback is not required.

---

# 21. Session State Model

The functional lifecycle can be represented as:

```text
                    ┌──────────────┐
                    │   NOT STARTED│
                    └──────┬───────┘
                           │ ceo begin
                           ↓
                    ┌──────────────┐
                    │   VALIDATING │
                    └──────┬───────┘
                           │ valid
                           ↓
                    ┌──────────────┐
                    │ INITIALIZING │
                    └──────┬───────┘
                           │
                           ↓
                    ┌──────────────┐
                    │ DELIBERATING │◄────────────┐
                    └──────┬───────┘             │
                           │                      │
              ┌────────────┴────────────┐         │
              │                         │         │
        CEO continues             CEO closes     │
              │                         │         │
              └──────────────→─────────┘         │
                           │                      │
                           ↓                      │
                    ┌──────────────┐              │
                    │ FINAL CLOSING│              │
                    └──────┬───────┘              │
                           │                      │
                           ↓                      │
                    ┌──────────────┐              │
                    │   SYNTHESIS  │──────────────┘
                    └──────┬───────┘
                           │
                           ↓
                    ┌──────────────┐
                    │  COMPLETED   │
                    └──────────────┘

At any applicable execution state:

max_time / max_budget
          ↓
   HARNESS INTERCEPT
          ↓
    FORCED CLOSING
          ↓
      SYNTHESIS
```

A separate `FAILED` state exists when execution cannot successfully complete.

---

# 22. Functional Requirements Summary

The core requirements are:

| ID    | Requirement                                                                           |
| ----- | ------------------------------------------------------------------------------------- |
| FR-01 | System accepts a structured Markdown decision brief.                                  |
| FR-02 | Harness validates required brief sections before execution.                           |
| FR-03 | User starts a session through the CLI workflow.                                       |
| FR-04 | CEO initializes context and private expertise before first broadcast.                 |
| FR-05 | CEO broadcasts questions/directions to the board.                                     |
| FR-06 | Board agents execute broadcasts in parallel.                                          |
| FR-07 | Board agents cannot see active-turn peer responses.                                   |
| FR-08 | Subsequent turns can inspect shared historical conversation.                          |
| FR-09 | Harness owns and incrementally persists `conversation.json`.                          |
| FR-10 | Agent turns may contain multiple internal tool operations.                            |
| FR-11 | Agents have persistent private expertise files.                                       |
| FR-12 | Agents can maintain cross-agent behavioral observations.                              |
| FR-13 | Private expertise remains isolated between agents.                                    |
| FR-14 | CEO controls normal deliberation continuation.                                        |
| FR-15 | CEO initiates normal final closing.                                                   |
| FR-16 | Hard execution limits override CEO continuation.                                      |
| FR-17 | Harness injects `max reached` when forced closure occurs.                             |
| FR-18 | Forced closure requests one final position from every board member.                   |
| FR-19 | Final board statements are generated in parallel.                                     |
| FR-20 | CEO produces the final decision memo.                                                 |
| FR-21 | Memo contains recommendation, board positions, dissent, and execution considerations. |
| FR-22 | Model/provider assignment is independently configurable.                              |
| FR-23 | Board members can generate in-flight SVG artifacts.                                   |
| FR-24 | Generated artifacts are persisted per run.                                            |
| FR-25 | Runs maintain isolated conversation/artifact state.                                   |
| FR-26 | Partial work is preserved after failure.                                              |
| FR-27 | Runtime telemetry exposes execution/cost/status information.                          |
| FR-28 | Agent activity can be expanded/collapsed in the runtime UI.                           |
| FR-29 | Successful completion can automatically open the generated memo.                      |
| FR-30 | Audio generation/playback is not required for v1.                                     |
| FR-31 | Board-agent failure handling supports retry/unavailable behavior.                     |
| FR-32 | Agent failures are surfaced to the CEO rather than silently discarded.                |

---

# 23. Explicitly TBD

The following are not sufficiently established by the reference video and should remain open rather than being silently converted into requirements:

### Configuration

* Exact `config.json` schema.
* Exact agent frontmatter schema.
* Exact tool/skill configuration mechanism.

### Brief

* Exact reference-file declaration mechanism.
* Exact validation error behavior.
* Whether additional brief sections can be dynamically configured.

### Deliberation

* Exact CEO prompt/instruction structure.
* Exact criteria the CEO uses to determine sufficient deliberation.
* Whether CEO broadcasts can contain structured metadata.

### Conversation

* Complete `conversation.json` event schema.
* Whether tool outputs are fully embedded or referenced.
* Exact timestamp/cost/token fields.

### Failure handling

* Retry count.
* Retry strategy.
* Per-agent timeout.
* Failed-agent re-entry behavior.
* Session-abort criteria.
* Failure event schema.

**The reference video does not answer these failure-policy questions.**

### Memo

* Exact Markdown template.
* Exact vote-tally calculation.
* Exact attribution format.
* Exact SVG integration mechanism.

### UI

* Exact terminal UI layout.
* Exact expandable/collapsible interaction.
* Exact consensus visualization.
* Exact telemetry refresh behavior.

### Archive

* Exact run naming scheme.
* Archive browsing/search behavior.
* Whether failed runs can be resumed.
* Formal replay behavior.

These should be resolved before or during technical design where necessary.

---

# 24. v1 Boundary

The functional scope of v1 is therefore:

**Input**

Structured decision brief + configured board + configured models/tools.

**Process**

Autonomous CEO-led multi-round deliberation with parallel specialized board agents, private persistent expertise, shared conversation history, in-flight artifacts, execution limits, and controlled closure.

**Output**

A concrete CEO decision memo plus a persistent record of the deliberation and generated artifacts.

**User interaction**

Configure → start → observe → inspect result.

The user does not steer the active deliberation.

**Not required for v1**

* live user intervention;
* private agent-to-agent messaging;
* ongoing monitoring;
* automatic execution of recommendations;
* formal voting authority;
* mandatory consensus;
* deterministic replay;
* audio generation/playback.

