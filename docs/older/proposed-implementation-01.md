I reviewed the current Project files first. One important source-state issue: the Project currently exposes only six of the nine files you named. `technical-architecture-0.71.md`, `functional-spec-1.15.md`, `product-behavior-description-1.7.md`, `screenshot-evidence-register-0.2.md`, `video-transcript.md`, and `Video notes.md` are present. Standalone `ceo.md`, `compounder.md`, and `ceo-and-board-configuration.yaml` are **not currently exposed as Project files**. Their recovered/derived content is represented in the architecture/evidence docs, so that does not block the orchestration plan below, but I would not claim to have verified their standalone current contents.

The architecture is sufficiently settled to start implementation. The current docs explicitly put board execution behind Pi RPC, with one long-lived subprocess/session per board member, and keep `conversation.jsonl` as the canonical shared deliberation rather than Pi session history. technical-architecture-0.71

# 1. Proposed module/file breakdown

Keep `apps/ceo/extensions/ceo-and-board.ts` as a thin Pi entrypoint. The reference really does establish it as the extension location, but the ~2K-line implementation should not remain monolithic. screenshot-evidence-register-0.2

```text
apps/ceo/extensions/
├── ceo-and-board.ts                 # Pi extension entrypoint only
└── ceo-board/
    ├── command.ts                   # /ceo-begin
    ├── types.ts                     # core domain TS types
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

The split is deliberate:

- **Pi integration** is isolated from orchestration.
- **Turn execution** knows how to execute exactly one agent attempt.
- **Orchestration** knows rounds/barriers/closure but not subprocess details.
- **Persistence** owns only durable surfaces.
- **TUI** observes runtime state rather than driving the workflow.
- **Validation** is deterministic and isolated from model execution.

The documented validation stack is already fixed at `yaml` → Zod 4 → `remark-parse`/mdast, with strict/no-silent-coercion behavior. technical-architecture-0.71

# 2. Module responsibilities and public interfaces

| Module | Responsibility | Main public interface |
|---|---|---|
| `ceo-and-board.ts` | Register Pi lifecycle + command | `registerExtension(pi)` |
| `command.ts` | `/ceo-begin` interaction and top-level error boundary | `beginDecision(ctx)` |
| `config/load-config.ts` | Parse canonical YAML | `loadConfig(projectRoot): Promise<CeoBoardConfig>` |
| `config/paths.ts` | Canonical path resolution | `resolveProjectPaths(config, root)` |
| `agents/load-agent.ts` | Parse MD/frontmatter and resources | `loadAgentDefinition(path)` |
| `agents/prompt-renderer.ts` | Construct runtime system prompt | `renderAgentPrompt(def, runtime)` |
| `briefs/discover.ts` | Discover selectable brief directories | `discoverBriefs(path)` |
| `briefs/validate.ts` | Required-heading validation | `validateBrief(pkg, config)` |
| `run/create-run.ts` | IDs, directories, initial run state | `createRun(validatedInput)` |
| `run/project-lock.ts` | single-active-run protection | `acquireProjectLock()`, `release()` |
| `run/checkpoint.ts` | authoritative `session.json` | `readCheckpoint()`, `writeCheckpoint()` |
| `run/snapshot.ts` | config/agent/rendered-prompt archive | `writeExecutionSnapshot()` |
| `conversation-log.ts` | accepted shared deliberation | `appendConversation(record)` |
| `tool-use-log.ts` | actual tool invocation activity | `appendToolUse(record)` |
| `pi/agent-client.ts` | architecture-level Pi boundary | `PiAgentClient` |
| `pi/rpc-agent-client.ts` | real Pi RPC implementation | `RpcPiAgentClient` |
| `pi/process-manager.ts` | persistent child lifecycle | `startAgent()`, `replaceAgent()`, `shutdownAll()` |
| `pi/event-mapper.ts` | convert Pi events into observable runtime events | `mapPiEvent(event)` |
| `turn-runner.ts` | one attempt + exactly-one retry policy | `runBoardTurn()` / `runCeoTurn()` |
| `inactivity-watchdog.ts` | 90 sec inactivity semantics | `InactivityWatchdog` |
| `telemetry.ts` | pre/post stats and deltas | `measureTurnUsage()` |
| `constraints.ts` | time/budget state only | `getConstraintState(run)` |
| `converse.ts` | recipients, parallel execution, barrier, publication | `converse(input)` |
| `final-closing.ts` | parallel final statements + consumption order | `endDeliberation()` |
| `controller.ts` | lifecycle/state-machine coordinator | `runDecision(run)` |
| `artifacts/visibility.ts` | round-scoped eligible/shared artifacts | `captureArtifactDelta()`, `promoteAcceptedArtifacts()` |
| `memo.ts` | synthesis attempt/retry | `synthesizeMemo()` |
| `memo-validator.ts` | deterministic acceptance | `validateMemo()` |
| `tui/state.ts` | view model, no Pi UI calls | `RuntimeViewState` |
| `tui/runtime-widget.ts` | Pi UI rendering | `mountRuntimeWidget()` |
| `tui/status-display.ts` | centralized labels/icons | `statusPresentation(state)` |

A key boundary: `converse.ts` should **not** invoke `RpcClient` directly. It asks `turn-runner` to execute participants. This makes round semantics independently testable.

# 3. TypeScript/Zod schema inventory

I would separate **durable schemas**, **configuration/input schemas**, and **runtime-only types**.

### Durable/config Zod schemas

| Schema | Zod? | Notes |
|---|---:|---|
| `CeoBoardConfigSchema` | Yes | complete YAML root |
| `MeetingConstraintsSchema` | Yes | numeric, explicit min/max refinement |
| `BriefSectionConfigSchema` | Yes | `section`, `description` |
| `BoardConfigEntrySchema` | Yes | only `name`, `path`, `color` |
| `AgentFrontmatterSchema` | Yes | name/model/expertise/skills/domain |
| `ExpertiseEntrySchema` | Yes | path/use-when/updatable |
| `SkillEntrySchema` | Yes | path/use-when |
| `SessionCheckpointSchema` | Yes | authoritative `session.json` |
| `ConversationMeetingStartSchema` | Yes | persisted record |
| `ConversationMessageSchema` | Yes | `from`, `to`, `message` |
| `ConversationMeetingEndSchema` | Yes | persisted terminal record |
| `ToolUseRecordSchema` | Yes | narrow v1 fields |
| `MemoFrontmatterSchema` | Yes | deterministic metadata |

The canonical config has exactly meeting constraints/editor, brief sections, paths, and `board[]` entries of `name/path/color`; model selection belongs to agent frontmatter. functional-spec-1.15

`session.json` should encode the latest control state only: identity, status, round state, forced-close state, board availability/retry state, Pi session IDs and timestamps. It must not become another event log. technical-architecture-0.71

### Runtime-only TypeScript contracts

These don't all need Zod because they never cross an untrusted persistence/process boundary:

```ts
type WorkflowStatus =
  | "INITIALIZING"
  | "VALIDATING"
  | "CEO_FRAMING"
  | "DELIBERATING"
  | "FINAL_CLOSING"
  | "SYNTHESIS"
  | "COMPLETED"
  | "FAILED";

type AgentControlState =
  | "ACTIVE"
  | "RUNNING"
  | "RETRYING"
  | "UNAVAILABLE";

type ForcedCloseReason = "max_time" | "max_budget";

interface TurnResult {
  agent: string;
  status: "completed" | "unavailable";
  message?: string;
  usage?: TurnUsage;
  acceptedArtifacts: string[];
}

interface ConverseResult {
  responses: TurnResult[];
  constraint: ConstraintState;
}

interface EndDeliberationResult {
  statements: TurnResult[];
}
```

Those `ConverseResult`/`EndDeliberationResult` shapes track the current architecture almost exactly. technical-architecture-0.71 technical-architecture-0.71

Do **not** add persisted `round_id`, event IDs, universal envelopes, correlation IDs, etc. unless implementation proves they are needed internally. The current persistence architecture explicitly does not require them. technical-architecture-0.71

# 4. Pi RPC adapter/interface

This is the most important abstraction boundary.

```ts
export interface PiAgentClient {
  readonly agentName: string;
  readonly piSessionId: string;

  start(config: PiAgentStartConfig): Promise<void>;

  prompt(text: string): Promise<void>;

  getSessionStats(): Promise<PiSessionStats>;

  getLastAssistantText(): Promise<string | null>;

  abort(): Promise<void>;

  setAutoRetry(enabled: boolean): Promise<void>;

  onEvent(handler: (event: PiAgentEvent) => void): () => void;

  waitUntilSettled(signal?: AbortSignal): Promise<void>;

  isHealthy(): boolean;

  close(): Promise<void>;
}
```

`PiAgentStartConfig` should contain only Pi-level concerns:

```ts
interface PiAgentStartConfig {
  model: string;
  sessionId: string;
  sessionDir: string;
  systemPrompt: string;
  cwd: string;
  skills: ResolvedSkill[];
}
```

Then:

```ts
interface PiAgentClientFactory {
  create(config: PiAgentStartConfig): Promise<PiAgentClient>;
}
```

This gives tests a simple:

```ts
class ScriptedPiAgentClient implements PiAgentClient { ... }
```

No Anthropic/OpenAI mocks anywhere.

### Turn lifecycle

`turn-runner.ts` should execute:

```text
ensure client healthy
→ getSessionStats()
→ reset/start inactivity watchdog
→ prompt()
→ consume activity events
→ waitUntilSettled()
→ getLastAssistantText()
→ getSessionStats()
→ compute usage delta
→ return attempt
```

That matches the architecture's Pi lifecycle and, critically, waits for `agent_settled` rather than treating prompt acknowledgement as completion. technical-architecture-0.71

On managed child startup:

```ts
await client.setAutoRetry(false);
```

because the harness owns exactly one retry. Retry stays in the same Pi session, replacing only the process when necessary. technical-architecture-0.71

The watchdog gets reset by meaningful Pi lifecycle/message/tool/file activity. Only **90 seconds without activity** triggers `abort()`. technical-architecture-0.71

# 5. Runtime flow: `/ceo-begin` → terminal state

```text
/ceo-begin
    │
    ├─ load config enough to show/discover briefs
    ├─ acquire/inspect active-run lock
    ├─ discover briefs
    ├─ user selects brief
    │
    ▼
VALIDATING
    │
    ├─ YAML/Zod config
    ├─ path validation
    ├─ load CEO + active board definitions
    ├─ validate agent resources/models
    └─ validate selected brief
         │
         ├─ error → report; NO RUN CREATED
         ▼
create session_id/session_name
acquire run lock ownership
create run directories
write initial session.json
render prompts
write snapshot
write meeting_start
start board Pi RPC children
    │
    ▼
CEO_FRAMING
    │
    ├─ CEO receives full brief package/runtime context
    ├─ expertise may be read/written
    └─ CEO calls converse(...)
    │
    ▼
DELIBERATING
    │
    ├─ resolve addressed available members
    ├─ freeze pre-round shared context
    ├─ mark round IN_PROGRESS
    ├─ execute members in parallel
    │     └─ each: attempt → one retry → completed/UNAVAILABLE
    ├─ barrier
    ├─ publish ONLY accepted responses
    ├─ promote accepted artifacts
    ├─ mark round IDLE
    ├─ evaluate max constraints
    └─ return complete results to CEO
          │
          ├─ converse() again → loop
          │
          └─ end_deliberation()
                 │
                 ▼
FINAL_CLOSING
    │
    ├─ all remaining available members execute in parallel
    ├─ retry semantics unchanged
    ├─ persist accepted final statements
    └─ expose Contrarian statement last to CEO
                 │
                 ▼
SYNTHESIS
    │
    ├─ CEO synthesis attempt
    ├─ write memo.md
    ├─ deterministic memo validation
    │
    ├─ invalid → concrete errors → retry CEO synthesis once
    │                └─ invalid again → FAILED
    │
    └─ valid
         │
         ├─ append meeting_end
         ├─ session.json = COMPLETED
         ├─ release project lock
         └─ optional editor/TTS
```

The final-statement persistence boundary is especially important: final positions must hit `conversation.jsonl` **before** synthesis begins. technical-architecture-0.71

For forced closure, crossing max time/budget only sets a pending close while a round is running. That round finishes, CEO receives it, and another `converse()` is rejected. functional-spec-1.15

### Failure path

```text
board turn
  fail → retry once → fail → UNAVAILABLE → continue

CEO turn/synthesis
  fail → retry once → fail → FAILED

unexpected harness death
  next stale-lock inspection
  → previous run session.json = FAILED
  → failure_reason = interrupted
```

# 6. Implementation order / milestones

I would build vertical control correctness before TUI fidelity.

**A1 — Core contracts + validation**

Implement schemas, config loader, path resolution, agent loader, brief discovery/validation.

Exit condition: deterministic preflight either returns a fully typed `ValidatedRunInput` or a concrete error list. **No Pi processes yet.**

**A2 — Persistence + run lifecycle primitives**

Implement IDs, run directory creation, `session.json`, lock, JSONL appenders, snapshots.

Exit condition: fake run can be created/failed/completed with correct durable files and atomic checkpoint behavior.

**A3 — Pi RPC boundary**

Implement `PiAgentClient`, `RpcPiAgentClient`, process manager, stats, event mapping, abort, settled detection.

Exit condition: one headless Pi agent can be started, prompted multiple times in the same run session, observed, and shut down.

**A4 — Atomic turn execution**

Implement watchdog, telemetry deltas, retry-once semantics, process replacement against same session.

Exit condition: scripted Pi fake proves success, retry success, retry exhaustion, inactivity abort.

**A5 — `converse()` orchestration**

Implement targeting, `"all"`, parallelism, pre-round snapshot, barrier, publication, `UNAVAILABLE`, constraints.

Exit condition: strong deterministic peer-isolation tests.

**A6 — Final closing**

Implement `end_deliberation()`, parallel final statements, final persistence, Contrarian-last consumption.

Exit condition: simulated synthesis crash cannot lose accepted final statements.

**A7 — CEO lifecycle + synthesis**

Wire CEO framing, closure semantics, memo generation, structural validation and one synthesis retry.

Exit condition: full fake-Pi `/ceo-begin → COMPLETED` and `/ceo-begin → FAILED`.

**A8 — Runtime TUI**

Bind orchestration events to a centralized `RuntimeViewState` and Pi widget.

Exit condition: UI reflects state but changing UI labels cannot affect orchestration.

**A9 — Real Pi smoke tests**

Small opt-in tests against installed Pi and configured models.

Exit condition: verify actual package APIs/import paths, `agent_settled`, stats, abort, persistent session behavior.

This ordering prevents the UI and live models from masking basic state-machine defects.

# 7. Test strategy mapped to modules

| Area | Primary tests |
|---|---|
| `config/*` | malformed YAML, wrong types, min>max, duplicate members, unsupported extra structure as appropriate |
| `agents/*` | frontmatter parsing, model required, expertise/skills resolution, prompt snapshot fidelity |
| `briefs/*` | missing required heading, support-file discovery, immutable package reference |
| `project-lock.ts` | acquire, live-owner rejection, stale PID recovery, release |
| `checkpoint.ts` | atomic replacement, terminal states, interrupted conversion |
| JSONL writers | one complete JSON object/line, append-only, incomplete trailing-line recovery |
| `PiAgentClient` fake contract | scripted events, stats, settled, abort, process exit |
| `turn-runner.ts` | retry exactly once, same Pi session, watchdog resets |
| `converse.ts` | `"all"`, target subsets, unknown target, unavailable target, parallel barrier |
| round isolation | member B cannot see member A's same-round response/artifact |
| constraints | minimum-time close rejection, max-time/max-budget deferred closure |
| artifacts | success promotion, failed-attempt preservation without promotion, collision handling |
| final closing | parallel execution, unavailable member, Contrarian consumed last |
| memo validator | frontmatter mismatch, duplicate/missing headings, empty Final Decision |
| synthesis | retry with validator errors, second failure → FAILED |
| end-to-end fake Pi | complete run, failed CEO, partial board loss, forced close |
| real Pi smoke | actual RPC/session/stats/system-prompt behavior |

This matches the architecture's required deterministic coverage and its explicit choice to fake the Pi RPC boundary rather than provider SDKs. functional-spec-1.15

Use the recovered acquisition-offer brief as the main reference acceptance fixture. Do **not** fabricate its missing supporting files. screenshot-evidence-register-0.2

# 8. Remaining blockers before coding

There are **no architecture blockers** to starting A1–A8.

The unresolved items fall into two groups.

**R1 — Must verify during implementation, not design:** exact installed Pi version/API/module import paths. The architecture intentionally defers those until inspecting the actual environment. This affects `RpcPiAgentClient`, not the orchestration design.

**R2 — Test runner/toolchain:** inspect the real `apps/ceo/package.json`, Node/Bun setup, and existing test dependencies before selecting Vitest/Node test/etc. The specs explicitly leave this open.

**R3 — Missing standalone Project source files:** I cannot currently verify the current `ceo.md`, `compounder.md`, or actual YAML config because they are not exposed among the Project files. This does **not** block harness coding, but it does block claiming exact prompt/config fixture fidelity.

**R4 — Exact closing prompt text:** still unknown. Not architecturally significant. Put the canonical prompt in one constant/module so it can be replaced when recovered.

**R5 — Missing acquisition support-file contents:** `business-metrics.md` and `product-overview.md` remain unrecovered and must not be recreated as reference fixtures.

**R6 — Prompt reconstruction:** some role prompts remain reconstructed. That is explicitly deferred and does not block orchestration.

The Technical Architecture itself classifies those remaining items as non-blocking implementation TBDs, including Pi import details, exact closing wording, unrecovered prompt bodies, test runner, and missing acquisition support files. technical-architecture-0.71

**Critical implementation recommendation:** start with A1–A4 and make `PiAgentClient` the hard seam. If that boundary is clean, the rest of the ~2K-line extension becomes ordinary deterministic orchestration instead of a Pi/UI/persistence/state-machine knot.