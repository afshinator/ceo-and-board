# CEO--Board Decision System

## Product Behavior Description --- v1.5

**Version:** 1.6 **Purpose:** Define what the system does from the
user's perspective, independent of the specific implementation
technology.

------------------------------------------------------------------------

## 1. Product Purpose

The CEO--Board Decision System is a one-shot autonomous decision engine.

The user gives the system a structured problem brief and starts a
decision session. A CEO agent coordinates a board of specialized agents
through multiple rounds of independent analysis, disagreement,
challenge, evidence gathering, and deliberation.

The CEO ultimately synthesizes the discussion into a definitive decision
memo.

The system is designed to allow a human to hand a difficult question to
a group of specialized AI decision-makers and observe their reasoning
process without having to manually coordinate the discussion.

It is **not** an ongoing monitoring system and is **not** an interactive
chat session in which the user guides the agents while they deliberate.

------------------------------------------------------------------------

# 2. User Interaction Model

The primary interaction is command-driven.

A typical session begins with a command such as:

`/ceo-begin`

The user has already prepared the decision brief and configured the
board.

Once the session begins:

1.  The system validates the brief.
2.  The CEO and board agents are initialized.
3.  The CEO begins the deliberation.
4.  Board members independently analyze questions posed by the CEO.
5.  Their responses and generated artifacts are recorded.
6.  Subsequent rounds allow agents to react to the accumulated
    discussion.
7.  The CEO determines when deliberation is complete.
8.  The CEO requests final positions when appropriate.
9.  The CEO produces a final decision memo.

The user primarily **observes** the session rather than participating in
it.

The user cannot modify the brief, inject new instructions, or redirect
the board while a session is actively executing.

------------------------------------------------------------------------

# 3. The CEO and Board

## 3.1 CEO

The CEO is the coordinating and final decision-making agent.

The CEO:

-   interprets the decision brief;
-   determines what questions need to be investigated;
-   broadcasts questions or prompts to the board;
-   reviews board responses;
-   identifies disagreement, missing evidence, contradictions, and weak
    assumptions;
-   directs subsequent rounds of deliberation;
-   determines when the discussion should close;
-   requests final positions when closing;
-   synthesizes the board's findings;
-   produces the final decision memo.

The CEO has final authority over the synthesis.

There is no formal board vote that determines the outcome.

The final memo may describe where board members agreed or disagreed, but
the CEO is responsible for the final recommendation.

------------------------------------------------------------------------

## 3.2 Board Members

The board consists of configurable specialized agents.

Each board member has:

-   a defined role;
-   a system prompt;
-   a model assignment;
-   available skills/tools;
-   a particular domain perspective;
-   persistent private expertise;
-   persistent behavioral observations about interactions with other
    agents.

Example roles include:

-   **Revenue:** emphasizes short-term cash flow and immediate financial
    consequences.
-   **Compounder:** emphasizes long-term value creation and compounding.
-   **Moonshot:** emphasizes asymmetric opportunities and high-upside
    possibilities.
-   **Contrarian:** actively challenges assumptions, consensus, and
    proposed conclusions.

The exact board composition is configurable. Board roles and role count
are not hard-coded: roles may be enabled or disabled in the YAML
configuration (including by commenting entries out) for a particular
configuration/run, and the runtime UI reflects only the active board.
The number and titles of active board members are not fixed. Roles may
be enabled or disabled in `ceo-and-board-configuration.yaml`, including
by commenting optional board members out for a particular
configuration/run. The runtime UI reflects the resulting active board
dynamically.

------------------------------------------------------------------------

## 3.3 Adversarial Specialization

Board members are deliberately differentiated.

Their disagreement comes from their assigned roles, prompts, expertise,
and behavioral tendencies rather than from the system dynamically
assigning agents to argue predetermined sides.

Agents are expected to:

-   challenge assumptions;
-   identify weaknesses in other arguments;
-   surface overlooked alternatives;
-   expose risks;
-   question unsupported claims;
-   defend positions they believe are justified;
-   change their position when evidence warrants it.

The purpose of disagreement is to improve the quality of the eventual
CEO synthesis.

------------------------------------------------------------------------

# 4. Decision Brief

## 4.1 Structured Brief

Every decision session begins with a structured Markdown brief.

The reference brief format uses the following required Markdown
structure:

``` text
# Brief: <concise title framed as the question the board will answer>

## Situation
## Stakes
## Constraints
## Key Question
```

`Situation` states what is happening now, including relevant facts,
history, and the trigger event without opinion or spin. `Stakes`
describes what is at risk and the upside/downside. `Constraints` is an
explicit bullet list intended to surface all meaningful limits.
`Key Question` is singular and states the one most important specific
question for the board.

Additional supporting context files may be stored alongside `brief.md`
inside the selected brief directory. These files supplement, but do not
replace, the required brief structure.

------------------------------------------------------------------------

## 4.2 Programmatic Brief Validation

The brief schema is **machine-enforced**.

The canonical required headings are `Situation`, `Stakes`,
`Constraints`, and `Key Question`; additional validation behavior may be
configured in `ceo-and-board-configuration.yaml`.

Before the CEO or any board agent begins deliberation, the harness
validates the brief Markdown against the configured required sections.

If one or more required sections are missing:

1.  The session does not begin.
2.  Agent deliberation is not started.
3.  The system reports the validation failure.
4.  The user must correct the brief before execution can proceed.

A manually written brief that merely follows the documented format is
therefore insufficient; it must satisfy the configured schema
validation.

------------------------------------------------------------------------

## 4.3 Brief Immutability During Execution

Once a session begins, its brief is fixed.

The user cannot modify the brief while the session is running.

Agents may interpret, question, or challenge information contained in
the brief, but they do not modify the original decision brief.

------------------------------------------------------------------------

# 5. Agent Memory and Expertise

## 5.1 Private Persistent Expertise

Each agent has private persistent expertise storage under the
project-specific expertise area. The directory may contain distinct
expertise files and scratchpad/working files rather than representing a
single undifferentiated memory file.

Expertise files emphasize deep domain knowledge, specialized patterns,
and learned insights. Scratchpad/working files provide persistent
working space for session status, notes, observations about other board
members, and interaction history. Across these files, an agent may
accumulate:

-   domain knowledge;
-   useful working notes;
-   lessons from previous decisions;
-   recurring considerations;
-   relevant prior conclusions.

An agent can read and update its own expertise during or after a run.

These updates persist across subsequent sessions.

------------------------------------------------------------------------

## 5.2 Privacy Between Agents

An agent's private expertise file cannot be directly read by other
agents.

Agents learn about each other's thinking only through information
explicitly exposed during the deliberation, such as:

-   board responses;
-   CEO prompts;
-   shared artifacts;
-   generated diagrams;
-   other information written to the shared conversation or artifact
    space.

This creates a distinction between:

**Private memory:** what an agent knows about its own expertise and
history.

**Shared deliberation:** what agents have explicitly contributed to the
current decision.

------------------------------------------------------------------------

## 5.3 Cross-Agent Behavioral Memory

Agent scratchpads also record observations about the behavior and
interaction patterns of other board members.

This can include observations such as:

-   recurring disagreements with a particular agent;
-   arguments that repeatedly create friction;
-   tendencies of another agent to challenge particular assumptions;
-   recurring weaknesses or blind spots observed during deliberation;
-   useful patterns in how another agent responds to evidence;
-   historical interaction dynamics across sessions.

These observations are associated with specific board members where
appropriate.

This memory persists across sessions and can influence how an agent
interprets or responds to future deliberations.

Behavioral memory does not give an agent access to another agent's
private scratchpad. It records only what the observing agent itself has
learned through prior shared interactions.

------------------------------------------------------------------------

# 6. Deliberation Process

## 6.1 Parallel Board Responses

The CEO broadcasts a question or prompt to the board.

Board members respond independently and in parallel.

When generating their responses for a round, board members do not see
the other board members' responses from that same round.

This preserves independent first-order analysis.

At the persisted-message level, the observed conversation uses
`to: "all"` for CEO broadcasts and board responses. Thus board
contributions are published to the shared deliberation, while the
harness controls when those messages become visible to peers. `to: all`
does not remove the current-round isolation rule.

------------------------------------------------------------------------

## 6.2 Shared Conversation History

Shared deliberation messages are incrementally recorded in the
run-scoped append-oriented JSON Lines log:

`conversation.jsonl`

Tool activity is recorded separately in:

`tool-use.jsonl`

The two logs have distinct purposes. `conversation.jsonl` is the shared
deliberation history that agents may reread in later rounds.
`tool-use.jsonl` is execution observability and does not become shared
conversational context merely because it was logged.

After each round, the accumulated shared discussion in
`conversation.jsonl` becomes available to the agents.

Agents are instructed to reread the relevant/full conversation history
in subsequent rounds so that they can react to:

-   competing arguments;
-   new evidence;
-   challenges from other agents;
-   contradictions;
-   revised positions.

The resulting process alternates between **independent analysis** and
**cross-agent reaction**.

------------------------------------------------------------------------

## 6.3 Multiple Deliberation Rounds

The CEO can conduct multiple rounds of questioning and response.

A round may involve:

1.  CEO question or instruction.
2.  Parallel board responses.
3.  Tool use and evidence gathering.
4.  Generation of supporting artifacts.
5.  Recording of outputs.
6.  Subsequent CEO analysis.
7.  Another round addressing unresolved issues.

The CEO decides when the discussion is sufficiently developed to move
toward closure, subject to the configured execution limits.

------------------------------------------------------------------------

# 7. Model Tiering

The system uses differentiated model tiers for different
responsibilities.

The CEO coordinator is assigned a **higher-capability model**
appropriate for complex synthesis and orchestration.

Board members may use **lower-cost models** that are sufficiently
capable for specialized parallel analysis.

For example:

-   CEO → Claude Opus-class model
-   Board members → Claude Sonnet-class models

The specific models are configurable. In v1,
`ceo-and-board-configuration.yaml` is the authoritative source for CEO
and board-member model selection; agent-file frontmatter is not
authoritative for model selection.

The purpose of the tiering is to balance:

-   synthesis and coordination quality;
-   parallel reasoning capacity;
-   execution cost;
-   overall session efficiency.

Model assignment is therefore part of the board configuration rather
than an incidental implementation detail.

------------------------------------------------------------------------

# 8. Execution Limits

## 8.1 Time and Budget Limits

A session operates within configured execution limits.

Examples may include:

-   maximum wall-clock duration;
-   maximum spending/budget;
-   other configured resource limits.

The exact thresholds are configuration values rather than fixed product
requirements.

------------------------------------------------------------------------

## 8.2 Normal Completion

The CEO may naturally determine that the deliberation has reached
sufficient depth.

The CEO then transitions the session toward closure and produces the
final memo.

A successful completion requires a concrete CEO recommendation.

The recommendation may acknowledge:

-   incomplete evidence;
-   assumptions;
-   uncertainty;
-   unresolved disagreement.

Consensus is not required.

------------------------------------------------------------------------

## 8.3 Harness-Intercepted Hard Limit

Hard limits are enforced by the agent harness rather than merely
communicated as advisory information to the CEO.

When a configured time or budget limit is reached, the harness:

1.  **Intercepts the active execution loop.**
2.  Stops normal continuation of the deliberation.
3.  Injects a standardized limit-override message to the CEO, such as:
    `max reached`
4.  Instructs the CEO to stop open-ended debate.
5.  Initiates a structured closing sequence.
6.  Requests **one final closing position from every board member**.
7.  Allows the CEO to synthesize those final positions.
8.  Produces the final decision memo.

The hard limit therefore produces a controlled closure protocol rather
than simply terminating the process abruptly.

Whichever configured hard limit is reached first triggers this closure
path.

A forced closure does not imply consensus.

------------------------------------------------------------------------

# 9. Evidence, Tools, and Artifacts

## 9.1 External and Supplemental Information

Agents can work with information supplied in the decision brief and
supporting documents.

They may also use configured skills and tools where enabled.

Examples include:

-   web research;
-   document analysis;
-   financial calculations;
-   code or data analysis;
-   SVG generation;
-   audio generation;
-   other specialized tools.

The exact tool set is configurable.

Formal academic citation formatting is not required.

Important factual claims in the final memo should nevertheless be
attributable to their source context where practical, while agent
positions should be identifiable as originating from the relevant board
member.

------------------------------------------------------------------------

## 9.2 In-Flight Persuasion Artifacts

Supporting artifacts are not limited to the final output.

Board members can dynamically generate artifacts **during active
deliberation** to support their arguments and persuade the CEO.

For example, a board member may generate an SVG diagram to:

-   illustrate an argument;
-   visualize a relationship;
-   expose a risk;
-   compare alternatives;
-   make a quantitative or conceptual point;
-   document its reasoning visually.

These artifacts become part of the deliberation record and can be
referenced by subsequent agents and/or the CEO.

The artifacts therefore serve two purposes:

1.  **Persuasion:** helping an agent communicate an argument to the CEO.
2.  **Documentation:** preserving how the agent developed and supported
    its position.

Supporting artifacts may also remain available as part of the final
decision archive.

------------------------------------------------------------------------

## 9.3 Artifact Types

A session may produce:

-   SVG diagrams;
-   charts;
-   financial projections;
-   analysis files;
-   other generated documents;
-   optional audio summaries.

Audio generation, such as ElevenLabs-based summaries, is optional and
not required for the initial version.

------------------------------------------------------------------------

# 10. Final Decision Memo

## 10.1 Memo Generation

A successfully completed session produces a Markdown decision memo
written by the CEO.

The exact canonical memo path/name is not yet established with
sufficient confidence from the reference material and remains to be
resolved before implementation is locked.

The system may automatically open the resulting Markdown document after
completion.

------------------------------------------------------------------------

## 10.2 Memo Content

The memo should provide a clear and actionable synthesis of the
deliberation.

It should include, as appropriate:

-   the decision/problem;
-   the CEO's recommendation;
-   supporting rationale;
-   relevant evidence;
-   important assumptions;
-   options considered;
-   trade-offs;
-   risks;
-   areas of disagreement;
-   significant dissenting positions;
-   next steps.

The CEO must make a concrete recommendation even when evidence is
incomplete or board members remain divided.

The memo should make meaningful uncertainty and disagreement visible
rather than manufacturing consensus.

------------------------------------------------------------------------

# 11. Session Records and Archive

Each completed or failed session produces an inspectable record.

The primary artifacts include:

-   the original decision brief;
-   `conversation.jsonl`;
-   `tool-use.jsonl`;
-   the final `memo.md`, if generated;
-   agent expertise changes;
-   generated supporting artifacts.

`conversation.jsonl` preserves the shared deliberation. Observed records
include a `meeting_start` record, ordinary deliberation messages
represented with fields such as `from`, `to`, and `message`, and a
`meeting_end` record. Observed meeting-end telemetry includes
`timestamp`, `elapsed_minutes`, `total_cost`, and `end_reason`;
`max_time_constraint` is one observed end reason.

`tool-use.jsonl` separately preserves per-agent tool activity. The
observed sample uses fields including `agent`, `timestamp`, and
`tool_name`, with observed tool names including `read`, `write`, `edit`,
`bash`, and `converse`. The complete tool-use record schema is not
visible in the available sample and remains a technical-design concern.

Tool-use records are not part of the shared conversation merely because
they are persisted.

The archive therefore allows the user to inspect how the final decision
emerged.

------------------------------------------------------------------------

# 12. Failure Behavior

If a session fails before completion, the system preserves work already
produced.

This includes, where applicable:

-   the original brief;
-   `conversation.jsonl` through the point of failure;
-   `tool-use.jsonl` through the point of failure;
-   generated supporting artifacts;
-   agent expertise changes already written;
-   the final memo if it had already been generated.

A failed session is not represented as a successfully completed decision
merely because partial work exists.

The preserved artifacts allow the user to determine what happened and
potentially diagnose or resume work through a future implementation
mechanism.

------------------------------------------------------------------------

# 13. Replay and Reproducibility

The archive provides enough information to inspect a previous decision
process.

A replay or rerun may use:

-   the original brief;
-   the original configuration;
-   the recorded conversation;
-   agent expertise;
-   generated artifacts.

However, exact bit-for-bit reproduction is not guaranteed because LLM
generation is nondeterministic.

The system's objective is therefore **observability and historical
inspection**, not deterministic reproduction.

------------------------------------------------------------------------

# 14. Pi Extension Runtime

The product runs as a Pi extension. The demonstrated application tree
contains the extension at:

``` text
apps/ceo/extensions/ceo-and-board.ts
```

The extension registers a Pi `session_start` handler. At startup it
reads the CEO/Board configuration and presents the configured time
range, budget range, editor, and active board, followed by:

``` text
/ceo-begin to start a deliberation.
```

If the configuration is missing, the startup UI identifies the canonical
configuration path:

``` text
.pi/ceo-agents/ceo-and-board-configuration.yaml
```

The extension provides the deliberation operations `converse` and
`end_deliberation`. The CEO uses these operations to conduct board
rounds and initiate final statements.

Board-member model execution is delegated through Pi. Exact subprocess
arguments, persistent-session mechanics, and usage-accounting APIs
remain implementation details that are not established by the available
source material.

------------------------------------------------------------------------

# 15. Configuration and Project Structure

The canonical project-local configuration file is:

``` text
.pi/ceo-agents/ceo-and-board-configuration.yaml
```

The reference material establishes a project-local structure containing
agent definitions, briefs, deliberations, expertise, and configuration:

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
    │   └── <session-directory>/
    │       ├── conversation.jsonl
    │       ├── tool-use.jsonl
    │       └── <generated artifacts>
    ├── expertise/
    │   └── <expertise files>
    └── ceo-and-board-configuration.yaml
```

A brief is therefore a directory-scoped input package: `brief.md` is the
decision brief and sibling files may provide additional context. The
acquisition example visibly includes `business-metrics.md` and
`product-overview.md` beside `brief.md`.

Agent definitions are Markdown files with YAML frontmatter. The CEO
example establishes fields with this shape:

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

`expertise` and `skills` are structured lists rather than bare path
strings. The visible CEO definition also carries its model identifier in
frontmatter. The precedence relationship, if any, between agent
frontmatter and model-related configuration elsewhere is not established
by the available screenshots and must not be assumed.

Meeting configuration visibly includes minimum/maximum time,
minimum/maximum budget, an editor setting, and board entries including
member names/paths/colors. Additional configuration fields should be
specified only where supported by the configuration source.

------------------------------------------------------------------------

# 16. User-Visible Functional Areas

The product behavior encompasses several functional areas, although
these do not necessarily correspond to separate screens:

1.  **Decision Brief**

    -   Create/edit the structured problem definition.
    -   Validate required sections before execution.

2.  **Board Configuration**

    -   Define board members, roles, prompts, models, tools, and
        expertise.

3.  **Session Execution**

    -   Start a decision session.
    -   Observe autonomous deliberation.

4.  **Deliberation Record**

    -   Inspect questions, responses, tool activity, and generated
        artifacts.

5.  **Final Decision**

    -   Review the CEO's final memo and recommendation.

6.  **Decision Archive**

    -   Preserve and inspect previous sessions.

7.  **Persistent Agent Expertise**

    -   Maintain private agent knowledge and cross-agent behavioral
        observations across sessions.

------------------------------------------------------------------------

# 16.1 Runtime Telemetry Semantics

The reference runtime UI exposes live metrics whose meanings are part of
the observable product behavior:

-   **Context/tokens:** values such as `978k` represent current
    context-window usage/remaining relative to the model context limit
    (shown against a 1M-token limit in the reference).
-   **Per-agent count:** the count displayed on an agent row represents
    that agent's message count within the current deliberation round.
-   **Per-agent cost:** the displayed cost is incremental for that
    specific agent response and contributes to cumulative session cost.
-   **Time meter:** TIME shows elapsed time for the current deliberation
    session and is compared with the configured meeting-time constraint.

The number and titles of agent rows are dynamic and reflect the board
members active in the current YAML configuration.

------------------------------------------------------------------------

# 17. Out of Scope

The initial system does not require:

-   live user prompting during deliberation;
-   modification of the brief during a running session;
-   modification of the board during a running session;
-   ongoing decision monitoring;
-   automatic execution of recommendations;
-   a formal board vote that overrides the CEO;
-   mandatory consensus;
-   guaranteed deterministic reruns;
-   audio summaries as a required v1 capability;
-   a graphical board configuration UI.

------------------------------------------------------------------------

# 18. Reference Evidence Status

To keep reconstruction evidence separate from implementation choices,
technical design should classify details as:

-   **Observed** --- directly visible or extracted from the reference
    video, screenshots, configuration, or sample files.
-   **Established behavior** --- supported by multiple observations and
    required to reproduce the demonstrated behavior.
-   **Design decision** --- required for our implementation but not
    demonstrated by the reference material.

Examples of currently observed details include the canonical filesystem
names, `ceo-and-board-configuration.yaml`, the brief headings, separate
`conversation.jsonl` and `tool-use.jsonl` files, `meeting_start`,
message records using `from`/`to`/`message`, `meeting_end`, tool-use
records using fields including `agent`/`timestamp`/`tool_name`, and
runtime time/cost telemetry. Current-turn peer isolation and controlled
forced closure are established behaviors. Event IDs, sequence numbers,
schema-version fields, checkpoint formats, retry-record formats, and
provider request identifiers remain design decisions unless further
reference evidence establishes them.

------------------------------------------------------------------------

# 19. Definition of Success

A successful session transforms a structured decision problem into a
clear CEO recommendation supported by a visible deliberation process.

The result should provide:

-   a concrete recommendation;
-   supporting reasoning and evidence;
-   consideration of alternatives;
-   explicit trade-offs and risks;
-   meaningful disagreement and dissent;
-   source attribution where appropriate;
-   actionable next steps;
-   an inspectable record of how the decision was reached.

The system succeeds when the user can hand it a difficult question,
allow the CEO and board to deliberate autonomously, and receive a
decision memo that is both **useful as a decision artifact and
inspectable as a decision process**.
