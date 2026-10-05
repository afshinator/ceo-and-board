# A12 Real Pi Smoke Test Report — 2026-10-05

## Scope

This report records the first credentialed execution of the A12 full-decision real-Pi smoke test. The test exercises integration behavior only; it does not evaluate the strategic quality of the model's answer.

Covered behavior:

- one CEO and one board member;
- two board turns in one persistent member Pi session;
- final closing and CEO synthesis;
- deterministic memo validation;
- write-tool observation in `tool-use.jsonl`;
- artifact creation and promotion;
- session statistics;
- subprocess restart against the same member session;
- retained history after restart;
- clean RPC shutdown.

## Model and authentication

The available Pi model list identified the requested Command Code DeepSeek Flash route as:

```text
provider: commandcode
model: deepseek/deepseek-v4-flash
Pi model argument: commandcode/deepseek/deepseek-v4-flash
```

The readiness check completed without printing credentials:

```text
pnpm exec pi auth check --provider commandcode --model deepseek/deepseek-v4-flash --no-refresh
ready
```

## Test runs

### Run 1 — initial real-model smoke

Command:

```text
CEO_BOARD_REAL_PI_SMOKE=1 CEO_BOARD_PI_MODEL=commandcode/deepseek/deepseek-v4-flash pnpm vitest run tests/pi-smoke.test.ts
```

Result: failed.

- Generated run session: `muvn8yqk-9d25d106`
- Test duration: 76.686 seconds
- Total Vitest duration: 77.74 seconds
- Failure: `CEO synthesis failed after two attempts: required heading "Final Decision" must appear exactly once`

Root cause: the CEO synthesis prompt asked for a final decision but did not explicitly restrict the model to the body text for the harness-owned `## Final Decision` section. The model returned memo headings. The deterministic memo builder inserted that response under its own `## Final Decision` heading, producing a duplicate heading and correctly failing memo validation.

### Focused regression verification

A failing regression test was added to prove the prompt defect and retry behavior. After tightening the synthesis prompt, the focused suite passed:

```text
pnpm vitest run tests/orchestrator.test.ts
```

Result: passed.

- Test files: 1 passed
- Tests: 28 passed
- Duration: 1.26 seconds

Production change:

- [src/orchestrator.ts](../src/orchestrator.ts) now instructs the CEO to return only the text for the `Final Decision` section, without the `Final Decision` heading, other Markdown headings, or the rest of the memo.

Regression coverage:

- [tests/orchestrator.test.ts](../tests/orchestrator.test.ts) verifies that heading-contaminated synthesis is retried with validator feedback and that a valid second response produces exactly one `Final Decision` heading.

### Run 2 — real-model smoke after the prompt fix

Command:

```text
CEO_BOARD_REAL_PI_SMOKE=1 CEO_BOARD_PI_MODEL=commandcode/deepseek/deepseek-v4-flash pnpm vitest run tests/pi-smoke.test.ts
```

Result: passed.

- Generated run session: `muvnc0vm-50f9c374`
- Test duration: 80.750 seconds
- Total Vitest duration: 81.59 seconds
- Test files: 1 passed
- Tests: 1 passed

The completed smoke verified the full A12 path, including persistent member-session reuse, tool/artifact observation, validated CEO synthesis, same-session process replacement, retained session state, and clean shutdown.

## Outcome

A12 is now credentialed-smoke verified with Command Code DeepSeek V4 Flash. The test remains opt-in and excluded from normal CI.

The first run exposed a real model-output contract defect that deterministic tests had not covered. That defect was reproduced, fixed, and proven by both the focused orchestrator suite and the successful real-Pi rerun.

## Remaining caveats

- This was a one-member smoke run; longer-lived and multi-member real Pi execution remains open.
- The minimal same-session process replacement path is now verified, but broader A5-style replacement behavior under repeated real runs remains open.
- Real model output remains nondeterministic; the deterministic validator remains the final memo acceptance gate.
