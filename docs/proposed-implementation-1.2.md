# CEO–Board Decision System

## Proposed Implementation — v1.2

### 1. Purpose

This document defines the concrete implementation plan for the v1 CEO–Board Decision System.

The architecture is already settled. Implementation should not reopen those decisions unless actual Pi behavior or current source files contradict them.

The implementation platform is Pi. The parent Pi extension owns orchestration and the visible TUI. Board members execute as long-lived, headless Pi RPC subprocesses with one private Pi session per board member per CEO–Board run.

Implementation shall proceed using **test-driven development (TDD)**:

```text
write failing test
→ implement minimum behavior
→ make sure implemention tests pass
→ refactor without changing behavior
→ make sure implemention tests pass
→ continue to next behavior
```

Tests are therefore part of each implementation milestone, not a later validation phase.

---

# 2. Implementation Baseline

## 2.1 Pi

Use the current stable Pi coding-agent package:

```text
@earendil-works/pi-coding-agent 1.0.0
```

Pi 1.0.0 requires Node.js 22.19 or newer. The npm package is currently published as `1.0.0`, and the Pi repository identifies the `stable` channel as the latest release.

The implementation shall use Pi APIs/RPC throughout. It shall not introduce Anthropic, OpenAI, Gemini, or other provider SDK integrations into the CEO–Board harness.

The real implementation adapter should wrap Pi's supported programmatic/RPC interfaces rather than independently implementing provider or JSONL RPC behavior.

## 2.2 Test Runner

Use:

```text
Vitest 5.x
```

The current release is `5.0.3`.

Tests should remain as runner-agnostic as practical:

- production behavior is exercised through public interfaces;
- fake implementations use ordinary TypeScript classes;
- dependency injection is preferred over module mocking;
- orchestration tests target the `PiAgentClient` boundary;
- provider SDK mocks are prohibited because provider SDKs are not part of the architecture;
- Vitest-specific functionality should primarily be limited to test declarations, assertions, spies where necessary, and fake timers for timing-sensitive tests.

Changing test runners later should not require redesigning production architecture.

---

# 3. Proposed Module Layout

Keep:

```text
apps/ceo/extensions/ceo-and-board.ts
```

as the Pi extension entrypoint, but reduce it to registration and composition.

The reference implementation visibly places the extension at that path and shows it registering Pi startup behavior.

Proposed implementation:

```text
apps/ceo/extensions/
├── ceo-and-board.ts
└── ceo-board/
    ├── command.ts
    ├── types.ts
    │
    ├── config/
    │   ├── load-config.ts
    │   ├── paths.ts
    │   └── schemas.ts
    │
    ├── agents/
    │   ├── load-agent.ts
    │   ├── prompt-renderer.ts
    │   └── schemas.ts
    │
    ├── briefs/
    │   ├── discover.ts
    │   └── validate.ts
    │
    ├── run/
    │   ├── create-run.ts
    │   ├── project-lock.ts
    │   ├── checkpoint.ts
    │   └── snapshot.ts
    │
    ├── persistence/
    │   ├── conversation-log.ts
    │   └── tool-use-log.ts
    │
    ├── pi/
    │   ├── agent-client.ts
    │   ├── rpc-agent-client.ts
    │   ├── process-manager.ts
    │   └── event-mapper.ts
    │
    ├── execution/
    │   ├── turn-runner.ts
    │   ├── inactivity-watchdog.ts
    │   └── telemetry.ts
    │
    ├── orchestration/
    │   ├── controller.ts
    │   ├── converse.ts
    │   ├── final-closing.ts
    │   └── constraints.ts
    │
    ├── artifacts/
    │   └── visibility.ts
    │
    ├── synthesis/
    │   ├── memo.ts
    │   └── memo-validator.ts
    │
    └── tui/
        ├── state.ts
        ├── status-display.ts
        └── runtime-widget.ts
```

The intended boundaries are:

```text
Pi integration
    ↓
atomic agent execution
    ↓
orchestration/state machine
    ↓
persistence

runtime state
    ↓
TUI
```

The TUI observes the runtime. It does not own orchestration decisions.

---

# 4. Module Responsibilities and Public Interfaces

## 4.1 Extension Entrypoint

### `ceo-and-board.ts`

Responsibilities:

- register Pi `session_start`;
- register `/ceo-begin`;
- compose dependencies;
- mount startup notifications/widget;
- avoid domain logic.

Public surface:

```ts
export default function registerExtension(pi: ExtensionAPI): void;
```

---

## 4.2 Command Layer

### `command.ts`

Responsibilities:

- implement `/ceo-begin`;
- invoke brief discovery and selection;
- invoke deterministic preflight;
- acquire/start the run;
- hand execution to the orchestration controller;
- expose top-level failures to the TUI.

```ts
export async function beginDecision(
  ctx: CommandContext,
  deps: BeginDecisionDependencies
): Promise<void>;
```

---

# 5. Configuration

## 5.1 `config/schemas.ts`

Use Zod 4.

Schemas:

```text
CeoBoardConfigSchema
MeetingConstraintsSchema
BriefSectionConfigSchema
PathsConfigSchema
BoardConfigEntrySchema
```

The canonical configuration contains:

```yaml
meeting:
  constraints:
    min_time_minutes: <number>
    max_time_minutes: <number>
    min_budget: <number>
    max_budget: <number>
  editor: <string>

brief_sections:
  - section: <string>
    description: <string>

paths:
  briefs: <path>
  deliberations: <path>
  memos: <path>
  agents: <path>

board:
  - name: <string>
    path: <path>
    color: <string>
```

Model assignment is not a board-YAML field. The authoritative model comes from each agent definition.

Validation must not silently coerce malformed configuration values.

## 5.2 `load-config.ts`

```ts
export async function loadConfig(
  projectRoot: string
): Promise<CeoBoardConfig>;
```

Uses:

```text
yaml
→ Zod
```

## 5.3 `paths.ts`

Own path-resolution rules.

```ts
export function resolveAgentPath(
  boardPath: string,
  config: CeoBoardConfig,
  projectRoot: string
): string;
```

Rules:

1. absolute path remains absolute;
2. `.pi/...` resolves from project root;
3. all other paths resolve relative to `paths.agents`.

---

# 6. Agent Definitions and Prompt Rendering

## 6.1 Schemas

```text
AgentFrontmatterSchema
ExpertiseEntrySchema
SkillEntrySchema
```

Representative frontmatter:

```yaml
name: ceo
expertise:
  - path: ...
    use-when: ...
    updatable: true
skills:
  - path: ...
    use-when: ...
model: ...
domain: []
```

The recovered CEO definition confirms its updatable scratchpad, SVG/TTS skills, model and `domain` fields.

The recovered Compounder definition confirms the same structural contract and uses `anthropic/claude-sonnet-4-6`.

## 6.2 `load-agent.ts`

```ts
export interface AgentDefinition {
  frontmatter: AgentFrontmatter;
  body: string;
  sourcePath: string;
  provenance: PromptProvenance;
}

export async function loadAgentDefinition(
  path: string
): Promise<AgentDefinition>;
```

## 6.3 Prompt Provenance

Prompt source status must remain explicit.

### CEO

```text
frontmatter        recovered
Purpose            recovered
Static Variables   recovered
Runtime Variables  recovered
Instructions       unrecovered
Workflow           unrecovered
Runtime Context    harness-generated
```

The CEO source confirms these runtime variables:

```text
SESSION_ID
BRIEF_CONTENT
BOARD_MEMBERS
MEMO_PATH
MIN_TIME
MAX_TIME
MIN_BUDGET
MAX_BUDGET
```



### Compounder

```text
frontmatter        recovered
Purpose            recovered
Variables          partially recovered
remaining body     unrecovered/reconstructed
```

Its exact recovered Purpose should be preserved verbatim in the actual source agent file rather than rewritten by the harness.

Other partially/unrecovered board prompts remain provenance-marked reconstructed material until better source evidence exists.

## 6.4 `prompt-renderer.ts`

```ts
export interface PromptRuntimeContext {
  sessionId: string;
  briefContent: string;
  boardMembers: string[];
  memoPath: string;
  minTime: number;
  maxTime: number;
  minBudget: number;
  maxBudget: number;
  supportingFiles: string[];
  conversationPath: string;
  expertise: ResolvedExpertise[];
  skills: ResolvedSkill[];
}

export function renderAgentPrompt(
  agent: AgentDefinition,
  runtime: PromptRuntimeContext
): string;
```

For CEO variables, honor the recovered `{{VARIABLE}}` form rather than inventing an incompatible template system.

---

# 7. Brief Handling

## 7.1 Discovery

```ts
export async function discoverBriefs(
  briefsDir: string
): Promise<BriefDescriptor[]>;
```

Each selectable package is:

```text
<brief-directory>/
├── brief.md
└── <optional sibling files>
```

Every regular sibling file other than `brief.md` is supporting context.

## 7.2 Validation

Use `remark-parse` / mdast for structural Markdown validation.

```ts
export function validateBrief(
  markdown: string,
  requiredSections: BriefSectionConfig[]
): ValidationResult;
```

No LLM participates.

Fatal preflight failure means:

```text
no session ID
no run directory
no CEO execution
no board processes
```

---

# 8. Run Creation and Persistence

## 8.1 Run Identity

After preflight succeeds:

```ts
sessionId = Date.now().toString(36)
sessionName = `${briefDirectoryName}-${sessionId}`
```

Create:

```text
deliberations/<session_name>/
├── session.json
├── conversation.jsonl
├── tool-use.jsonl
├── snapshot/
├── pi-sessions/
└── artifacts...

memos/<session_name>/
```

## 8.2 Project Lock

### `project-lock.ts`

Conceptual path:

```text
.pi/ceo-agents/.active-run.lock
```

```ts
export interface ProjectLock {
  release(): Promise<void>;
}

export async function acquireProjectLock(
  projectRoot: string,
  ownership: LockOwnership
): Promise<ProjectLock>;
```

Behavior:

```text
no lock
→ acquire

live owner
→ reject new run

dead owner
→ mark previous nonterminal run FAILED/interrupted
→ clear stale lock
→ acquire
```

---

# 9. `session.json`

`session.json` is the latest authoritative control checkpoint, not an event log.

Schema includes at least:

```ts
interface SessionCheckpoint {
  session_id: string;
  session_name: string;
  brief: string;

  status: WorkflowStatus;

  round: number;
  round_state: "IDLE" | "IN_PROGRESS";

  forced_close: {
    active: boolean;
    reason: "max_time" | "max_budget" | null;
  };

  board: Record<string, AgentCheckpoint>;

  created_at: string;
  updated_at: string;

  failure_reason?: string;
}
```

It persists current control state but does not duplicate conversation messages, tool history or telemetry.

Writes use:

```text
temporary file
→ atomic replace
```

---

# 10. Conversation and Tool Persistence

## 10.1 `conversation-log.ts`

Purpose:

```text
accepted shared deliberation only
```

Supported record types:

```text
meeting_start
CEO → board
board → all
final statements
meeting_end
```

Failed attempts do not become shared messages.

No synthetic artifact records are added.

## 10.2 `tool-use-log.ts`

Purpose:

```text
actual tool invocations only
```

Minimum writer shape:

```ts
interface ToolUseRecord {
  agent: string;
  timestamp: string;
  tool_name: string;
}
```

Do not copy:

```text
Pi lifecycle events
retry transitions
state transitions
token telemetry
constraint events
```

into `tool-use.jsonl`.

The separation between shared conversation and execution observability is a functional architecture requirement.

---

# 11. Pi RPC Boundary

## 11.1 Application Interface

The orchestration code shall depend on an application-owned interface:

```ts
export interface PiAgentClient {
  readonly agentName: string;
  readonly piSessionId: string;

  start(config: PiAgentStartConfig): Promise<void>;

  prompt(text: string): Promise<void>;

  waitUntilSettled(signal?: AbortSignal): Promise<void>;

  getLastAssistantText(): Promise<string | null>;

  getSessionStats(): Promise<PiSessionStats>;

  setAutoRetry(enabled: boolean): Promise<void>;

  abort(): Promise<void>;

  onEvent(handler: (event: PiAgentEvent) => void): () => void;

  isHealthy(): boolean;

  close(): Promise<void>;
}
```

Factory:

```ts
export interface PiAgentClientFactory {
  create(config: PiAgentStartConfig): Promise<PiAgentClient>;
}
```

This is the principal test seam.

## 11.2 Real Adapter

```text
RpcPiAgentClient
```

wraps the current Pi `RpcClient`/supported RPC APIs.

No provider-specific execution logic belongs behind this adapter.

Each active board member gets:

```text
one Pi RPC process per run
one Pi session per run
```

with derived session identifier:

```text
<session_id>.<agent-slug>
```

The Pi session remains private execution history. `conversation.jsonl` remains authoritative shared deliberation.

---

# 12. Atomic Turn Execution

## 12.1 `turn-runner.ts`

A successful attempt:

```text
ensure Pi process/session
→ read pre-turn stats
→ start inactivity watchdog
→ send prompt
→ consume Pi observable activity
→ wait for agent_settled
→ retrieve authoritative final assistant text
→ read post-turn stats
→ calculate usage delta
→ return result
```

The architecture requires waiting for Pi to settle rather than treating prompt acknowledgement as completion.

## 12.2 Retry Policy

Harness owns retry behavior.

At child initialization:

```ts
await client.setAutoRetry(false);
```

A board execution:

```text
attempt 1
  ↓ failure
attempt 2 in same Pi session
  ↓
success       → ACTIVE
failure       → UNAVAILABLE
```

If the child process is unhealthy, replace the process but reconnect to the same run-scoped Pi session.

The CEO has the same exactly-one-retry policy, except second failure terminates the session.

---

# 13. Inactivity Watchdog

The timeout is:

```text
90 seconds of inactivity
```

not:

```text
90 seconds total execution
```

```ts
export class InactivityWatchdog {
  start(): void;
  markActivity(): void;
  stop(): void;
}
```

Meaningful Pi activity resets it, including:

```text
lifecycle activity
message activity
tool activity
file activity
artifact creation
```

On 90 seconds of no meaningful activity:

```text
abort Pi attempt
→ classify attempt failed
→ normal retry policy
```

Continuous work may exceed 90 seconds.

---

# 14. `converse()`

CEO-facing input:

```ts
interface ConverseInput {
  to: "all" | string | string[];
  message: string;
}
```

Output:

```ts
interface ConverseResult {
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
}
```

The current architecture defines this semantic result shape.

Execution:

```text
resolve recipients
→ exclude UNAVAILABLE
→ capture pre-round shared context
→ round_state = IN_PROGRESS
→ execute members concurrently
→ wait for every participant
→ retry failures once
→ mark exhausted members UNAVAILABLE
→ round barrier
→ append accepted responses
→ promote eligible artifacts
→ round_state = IDLE
→ return complete response set to CEO
```

The CEO does not receive synthesized replacements for board responses.

---

# 15. Round Isolation and Artifacts

All participants in one board round operate from the same pre-round shared state.

Therefore:

```text
A response from member A
cannot be seen by member B
during that same round.
```

The same applies to artifacts.

Artifacts from successful attempts become shareable only after the round barrier.

Failed-attempt artifacts may remain on disk for diagnostics but are not promoted into shared context.

No artifact manifest is required in v1.

---

# 16. Constraint Enforcement

```ts
interface ConstraintState {
  forcedClose: boolean;
  reason?: "max_time" | "max_budget";
  voluntaryCloseAllowed: boolean;
}
```

Rules:

```text
min_time
→ voluntary closure eligibility

min_budget
→ display only

max_time
→ forced closure

max_budget
→ forced closure
```

If a maximum is crossed while a board round is running:

```text
set pending forced close
→ do NOT cancel board round
→ finish all participants
→ complete round barrier
→ CEO receives round
→ prohibit another normal converse()
→ require end_deliberation()
```

This behavior is required by the Functional Specification.

---

# 17. Final Closing

CEO-facing API:

```ts
end_deliberation()
```

No recipients are supplied.

Harness selects all remaining available board members.

Canonical semantic request asks each member for:

```text
final position
strongest supporting reason
strongest remaining concern or condition
```

Exact wording remains centralized and replaceable:

```ts
export const FINAL_STATEMENT_PROMPT = "...";
```

Result:

```ts
interface EndDeliberationResult {
  statements: Array<{
    member: string;
    status: "completed" | "unavailable";
    message?: string;
  }>;
}
```

All final statements execute concurrently.

The Contrarian:

```text
executes concurrently
but is consumed by CEO last
```

Non-Contrarian consumption order remains unspecified.

Most importantly:

```text
all accepted final statements
→ persist to conversation.jsonl
→ only then begin synthesis
```

---

# 18. Memo Synthesis

Canonical path:

```text
memos/<session_name>/memo.md
```

Required headings:

```text
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

Memo validation stack:

```text
frontmatter extraction
→ yaml
→ Zod 4
→ remark-parse/mdast
```

Validation checks:

- required frontmatter;
- deterministic metadata equals harness state;
- every required heading exactly once;
- non-empty `Final Decision`.

If validation fails:

```text
validator produces concrete errors
→ CEO synthesis retry in same CEO Pi session
→ validate again
```

Second synthesis failure:

```text
session = FAILED
```

The already-persisted final statements remain intact.

SVG/TTS/editor behavior is not permitted to invalidate an otherwise valid memo.

---

# 19. Runtime State Machine

```text
/ceo-begin
   ↓
brief selection
   ↓
VALIDATING
   │
   ├─ failure → report errors; no run
   ↓
create run
   ↓
INITIALIZING
   ↓
CEO_FRAMING
   ↓
DELIBERATING
   │
   ├─ converse() ──────────────┐
   │                           │
   └───────────────────────────┘
   │
   ├─ voluntary close when eligible
   └─ forced close after active round
   ↓
FINAL_CLOSING
   ↓
persist final statements
   ↓
SYNTHESIS
   ↓
memo validation
   │
   ├─ retry once on failure
   ↓
COMPLETED
```

Any unrecoverable CEO/session failure:

```text
FAILED
```

Unexpected interrupted prior run:

```text
FAILED
failure_reason = interrupted
```

---

# 20. TUI

The parent Pi process owns the visible UI.

Board RPC subprocesses remain headless.

Preserve vertical order:

```text
CEO semantic/converse callout
global status
board-member live rows
time/budget
CEO/member telemetry
```

Status presentation must be centralized:

```text
tui/status-display.ts
```

Persisted state names must not depend on user-facing labels.

Collapsed member row:

```text
name
status
latest meaningful observable activity
```

Expanded member view may show:

```text
tool/file/artifact activity
accepted response text
```

Never show or reconstruct chain-of-thought.

---

# 21. TDD Strategy

## 21.1 Rule

Every behavior-oriented implementation step begins with an automated failing test.

The normal cycle is:

```text
RED
write the smallest failing behavior test

GREEN
implement the minimum production behavior required

REFACTOR
improve structure without changing observable behavior
```

No production orchestration feature should be implemented significantly ahead of its deterministic test.

## 21.2 What to Test

Prefer:

```text
public module interfaces
state transitions
durable outputs
boundary behavior
observable side effects
```

Avoid tests tied unnecessarily to:

```text
private helper names
internal function decomposition
exact implementation order
Vitest-specific mocking mechanics
```

## 21.3 Pi Testing Boundary

Normal tests use:

```ts
class ScriptedPiAgentClient implements PiAgentClient
```

Example script:

```ts
[
  event("message_update"),
  event("tool_start", "read"),
  event("tool_end", "read"),
  settled(),
  response("ACCEPT")
]
```

The fake should be reusable across:

```text
turn tests
retry tests
converse tests
closure tests
full-run integration tests
```

Do not mock Anthropic/OpenAI/provider SDKs.

---

# 22. TDD Implementation Milestones

Each milestone follows:

```text
test specification
→ failing tests
→ implementation
→ passing tests
→ refactor
```

## A1 — Schemas and Configuration

### Write tests first

Tests:

```text
valid config parses
invalid YAML rejected
string budget rejected
min_time > max_time rejected
min_budget > max_budget rejected
empty board rejected
duplicate member names rejected
unexpected/missing required fields handled according to schema
agent-relative paths resolve correctly
```

### Then implement

```text
config/schemas.ts
config/load-config.ts
config/paths.ts
```

### Exit condition

All configuration behavior is deterministic and tested without Pi.

---

## A2 — Agent Definitions and Brief Validation

### Write tests first

Agent tests:

```text
valid CEO frontmatter parses
model is required
expertise entries parse
skills entries parse
updatable expertise recognized
invalid resource entries rejected
```

Brief tests:

```text
canonical headings accepted
missing Situation rejected
missing Stakes rejected
missing Constraints rejected
missing Key Question rejected
duplicate required section rejected if prohibited by validator
supporting siblings discovered
```

Prompt tests:

```text
CEO known runtime variables are substituted
recovered prompt source remains intact
runtime context is injected deterministically
```

### Then implement

```text
agents/*
briefs/*
```

---

## A3 — Run Persistence and Locking

### Write tests first

```text
session ID generated only after validation
session_name derived correctly
collision regenerates ID
run directories created correctly
session.json atomic replace
conversation JSONL append
tool-use JSONL append
incomplete trailing JSONL line ignored during recovery
lock acquisition succeeds
second live lock rejected
dead-process stale lock recovered
prior run becomes FAILED/interrupted
lock released on terminal state
```

### Then implement

```text
run/*
persistence/*
```

---

## A4 — Pi Agent Boundary

### Write adapter contract tests first

Against `ScriptedPiAgentClient`:

```text
prompt accepted
events delivered
settled observed
last assistant text returned
session stats returned
abort supported
health state exposed
close supported
```

Then write opt-in real-Pi contract smoke tests for:

```text
process startup
persistent session
system prompt configuration
model selection
multiple turns same session
agent_settled
get last assistant text
stats
abort
```

### Then implement

```text
pi/agent-client.ts
pi/rpc-agent-client.ts
pi/process-manager.ts
pi/event-mapper.ts
```

Real Pi behavior is verified against Pi 1.0.0 rather than guessed from older versions.

---

## A5 — Turn Runner

### Write tests first

```text
successful attempt
stats measured before/after
usage delta calculated
response accepted only after settled
streaming text not used as authoritative result
first failure retries once
second failure becomes unavailable
retry remains in same Pi session
dead process replaced but session preserved
Pi auto retry disabled
```

Watchdog tests using fake time:

```text
89 seconds inactivity does not fail
90 seconds inactivity aborts
message activity resets timer
tool activity resets timer
file/artifact activity resets timer
continuous activity allows >90 second total turn
```

### Then implement

```text
execution/turn-runner.ts
execution/inactivity-watchdog.ts
execution/telemetry.ts
```

---

## A6 — `converse()` and Round Barrier

### Write tests first

Recipient behavior:

```text
"all" resolves all available members
single target works
subset works
unknown target rejected
UNAVAILABLE member not executed
```

Concurrency/barrier:

```text
members launch concurrently
CEO result does not resolve early
one slow member holds barrier
one unavailable member does not prevent completion
```

Isolation:

```text
member B cannot see member A current-round response
member B cannot see member A current-round artifact
next round sees prior accepted responses
next round sees prior promoted artifacts
```

Persistence:

```text
accepted CEO message persisted
accepted board responses persisted
failed-attempt response not persisted
tool events never become conversation records
```

### Then implement

```text
orchestration/converse.ts
artifacts/visibility.ts
```

---

## A7 — Constraints

### Write tests first

```text
CEO cannot voluntarily close before min_time
min_budget has no control effect
max_time activates forced close
max_budget activates forced close
crossing maximum does not abort active round
active round finishes
another converse is rejected after forced close
end_deliberation remains permitted
elapsed/cost can exceed maximum during closure
```

### Then implement

```text
orchestration/constraints.ts
```

---

## A8 — Final Closing

### Write tests first

```text
all available board members targeted
UNAVAILABLE members excluded
all final statements start concurrently
each participant gets one retry
accepted final statement persisted
no fabricated unavailable statement
Contrarian runs concurrently
Contrarian consumed last
non-Contrarian ordering not relied upon
```

Critical crash test:

```text
final statements accepted
→ all persisted
→ simulate synthesis crash
→ conversation still contains all accepted final statements
```

### Then implement

```text
orchestration/final-closing.ts
```

---

## A9 — Memo Validation and Synthesis

### Write validator tests first

```text
valid memo accepted
missing frontmatter rejected
wrong session ID rejected
wrong budget rejected
wrong board list rejected
missing required heading rejected
duplicate required heading rejected
empty Final Decision rejected
optional SVG missing does not fail memo
```

Synthesis retry tests:

```text
first invalid memo feeds validator errors to CEO
second valid memo completes
second invalid memo fails session
final statements survive failure
partial invalid memo remains inspectable
```

### Then implement

```text
synthesis/memo-validator.ts
synthesis/memo.ts
```

---

## A10 — Controller / Full Lifecycle

### Write full fake-Pi integration tests first

Scenarios:

```text
normal multi-round completion

voluntary closure after minimum

forced max-time closure

forced max-budget closure

one board member becomes UNAVAILABLE

CEO transient failure then recovery

CEO second failure → FAILED

synthesis validation retry success

synthesis validation retry failure

stale lock from interrupted prior process
```

Assert:

```text
state sequence
session.json final state
conversation.jsonl contents
tool-use.jsonl separation
artifacts
memo existence/nonexistence
lock release
```

### Then implement

```text
orchestration/controller.ts
command.ts
```

---

## A11 — TUI

TUI comes after core behavior is proven without terminal rendering.

### Write view-model tests first

```text
workflow state maps to presentation state
member state maps to centralized label
latest activity selected correctly
response count increments only for accepted responses
time/budget progress represents pre-minimum progress
values may exceed max textually
unavailable telemetry represented as unavailable
```

### Then implement

```text
tui/state.ts
tui/status-display.ts
tui/runtime-widget.ts
```

Rendering snapshots may be used selectively, but orchestration correctness must not depend on them.

---

## A12 — Real Pi End-to-End Smoke Tests

Use a small, opt-in smoke suite.

Do not put paid/nondeterministic model tests into normal CI.

Smoke scenarios:

```text
one CEO + one board member
one converse round
persistent board Pi session across two turns
session statistics
artifact/tool event observation
controlled shutdown
```

Then one small complete decision run if cost permits.

Purpose:

```text
verify integration assumptions
not validate strategic output quality
```

---

# 23. Test Directory Proposal

Mirror production structure:

```text
apps/ceo/extensions/ceo-board/
├── ...
└── __tests__/
    ├── config/
    ├── agents/
    ├── briefs/
    ├── run/
    ├── persistence/
    ├── pi/
    ├── execution/
    ├── orchestration/
    ├── artifacts/
    ├── synthesis/
    ├── tui/
    ├── integration/
    └── fixtures/
        ├── briefs/
        ├── agents/
        ├── configs/
        └── pi-scripts/
```

Alternatively, colocated `*.test.ts` files are acceptable if consistent with the repository convention discovered during implementation.

The tests themselves should not depend on that physical choice.

---

# 24. Fixtures

## 24.1 Reference Fixture

Use the recovered acquisition-offer `brief.md` as the primary reference brief where appropriate.

Do not fabricate the example's unrecovered sibling `business-metrics.md` or `product-overview.md`.

Those files belong only to that example brief and are not required to test the architecture.

## 24.2 Synthetic Context Fixture

Use a clearly synthetic brief package for generic sibling-context behavior:

```text
synthetic-context/
├── brief.md
├── context-a.md
└── context-b.txt
```

This verifies that arbitrary sibling regular files become supporting context.

## 24.3 Agent Fixtures

Maintain fixture classes:

```text
recovered
reconstructed
invalid
```

The recovered CEO and Compounder material should remain distinguishable from reconstructed prompt text.

---

# 25. Test Execution Layers

Use three layers.

## Layer 1 — Unit

Fast, isolated, no subprocesses.

Covers:

```text
schemas
path resolution
brief parsing
memo validation
constraint calculations
prompt rendering
state transitions
artifact eligibility
```

Run continuously during development.

## Layer 2 — Harness Integration

Uses:

```text
ScriptedPiAgentClient
temporary filesystem
real persistence modules
real orchestration modules
```

No model calls.

This layer should carry most system correctness coverage.

## Layer 3 — Pi Smoke

Uses real Pi 1.0.0 RPC processes.

Small and opt-in.

No requirement for deterministic LLM prose.

---

# 26. CI Expectations

Normal CI:

```text
typecheck
unit tests
harness integration tests
lint/check if repository already defines it
```

Normal CI shall not require:

```text
provider credentials
paid model execution
live Anthropic/OpenAI APIs
network access
```

Real Pi/model smoke tests are opt-in/manual or separately credentialed.

---

# 27. Completion Order

Successful completion is:

```text
final statements persisted
→ CEO synthesis
→ memo written
→ deterministic validation
→ optional memo-side artifacts
→ meeting_end appended
→ session.json = COMPLETED
→ project lock released
→ optional TTS/editor post-actions
```

Optional post-actions cannot convert a successful run into failure.

---

# 28. Remaining Implementation TBDs

There are no known architecture blockers to beginning implementation.

## R1 — Final-statement literal wording

Exact wording remains unrecovered.

The semantics are fixed and the literal string shall be centralized.

This does not block implementation.

## R2 — Remaining unrecovered agent prompt bodies

Recovered source is preserved exactly where available.

Missing source is explicitly marked reconstructed.

Prompt refinement is independent of the orchestration implementation.

This does not block implementation.

## R3 — Pi API verification

The implementation baseline is Pi `1.0.0`, but exact imports and version-specific API shapes shall be confirmed by the first Pi contract tests against the installed package.

Pi 1.0.0 and Node.js >=22.19 are the current release baseline.

This is deliberately handled in milestone A4 through tests before the production adapter is completed.

---

# 29. First Coding Sequence

The first concrete implementation sequence should be:

```text
1. install/pin Pi 1.0.0 + Vitest
2. create module skeleton
3. create fixture directories
4. write failing configuration-schema tests
5. implement configuration schemas
6. write failing path-resolution tests
7. implement path resolver
8. write failing agent-frontmatter tests
9. implement agent parser
10. write failing brief-validation tests
11. implement brief validator
12. continue milestone-by-milestone using the same RED → GREEN → REFACTOR cycle
```

Do not begin by implementing the full `ceo-and-board.ts` flow.

The first meaningful vertical integration target should be:

```text
valid config
+ valid agent files
+ valid brief
→ deterministic preflight succeeds
→ run can be initialized
```

Only after that behavior is covered by tests should Pi subprocess execution be introduced.