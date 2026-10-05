# Pi CEO & Board UI: Main Screen Layout (Screenshot Extraction)

## Purpose
Document the visible sections and their top-to-bottom hierarchy from the supplied screenshot. Text that is partially obscured or too small to verify is marked as an estimate.

## Layout hierarchy

### 1. Current command / activity summary
- **Position:** Top of the application panel.
- **Visible command:** `converse CEO -> all`
- **Summary line:** A short excerpt of the CEO's current message or deliberation context, shown directly beneath the command.
- **Likely purpose:** Shows the active operation and a compact summary of its prompt or current context.
- **Layout note:** This is a highlighted, two-line banner spanning most of the panel width.

### 2. Overall activity status
- **Position:** Directly below the command summary.
- **Visible status:** `Working...`
- **Likely purpose:** Indicates that the overall CEO/board operation is in progress.

### 3. Board-member activity feed
- **Position:** Below the overall status.
- **Visible entries:** Six member rows:
  1. Revenue
  2. Product Strategist
  3. Technical Architect
  4. Contrarian
  5. Compounder
  6. Moonshot
- **Each row appears to contain:**
  - A colored member-name/status label, such as `Revenue responding...`
  - A short activity or progress message underneath, such as reading the current conversation log before forming a position.
- **Likely purpose:** Shows what each agent is doing while the board round runs.
- **Layout note:** Rows are stacked vertically. The role color is reused in the member's lower status row.

### 4. Time and budget status
- **Position:** Mid-panel, in a dedicated horizontal block.
- **Visible time information:**
  - A `TIME` label and horizontal bar.
  - Displayed value: approximately `4.8 min`.
  - Reference range: `2–5 min`.
- **Visible budget information:**
  - A `BUDGET` label and horizontal bar.
  - Displayed value: approximately `$1.65`.
  - Reference range: `$1–$5`.
- **Likely purpose:** Tracks elapsed/estimated meeting time and spend against configured bounds.
- **Layout note:** Time and budget are separate horizontal meter rows, with the current value and allowed range at the right. The bars use contrasting colors and visible markers.
- **Caution:** The screenshot alone does not establish whether time is elapsed time, projected total time, or another measure.

### 5. Separator / activity-output area
- **Position:** Immediately below the time/budget block and above the CEO status row.
- **Visible elements:** Thin horizontal rules and a small colored vertical marker at the left.
- **Interpretation:** Appears to be a divider or compact output/selection area. Its exact function is unclear from this screenshot.

### 6. CEO status and usage row
- **Position:** First row in the bottom status section.
- **Visible label:** `CEO [deliberating]`
- **Visible metrics at right:** Approximately `$0.22` and `978k`, preceded by small icons.
- **Likely purpose:** Shows the CEO agent's current state, accumulated cost, and a context/token usage figure.
- **Caution:** `978k` may represent context usage or token count, but the screenshot does not establish the unit or whether it is current, maximum, or remaining context.

### 7. Board-member status grid
- **Position:** Bottom of the application panel, directly below the CEO row.
- **Visible members:** Six members arranged in two columns and three rows:
  - Left column: Revenue, Technical Architect, Compounder
  - Right column: Product Strategist, Contrarian, Moonshot
- **Each member row appears to show:**
  - A colored member label.
  - A small icon and a count, often `1`.
  - A dollar amount, likely agent cost.
  - A context/token figure, for example `978k`, `970k`, `974k`, `965k`, and `977k`.
- **Likely purpose:** Compact per-agent telemetry for the current board operation.
- **Layout note:** Member colors match the activity feed and help identify agents across sections.

## Suggested wireframe

```text
┌────────────────────────────────────────────────────────────────┐
│ Current command: converse CEO -> all                            │
│ Short command / conversation summary                            │
├────────────────────────────────────────────────────────────────┤
│ Overall status: Working...                                      │
├────────────────────────────────────────────────────────────────┤
│ Revenue responding...                                           │
│   Agent activity / progress detail                              │
│ Product Strategist responding...                                │
│   Agent activity / progress detail                              │
│ Technical Architect responding...                               │
│   Agent activity / progress detail                              │
│ Contrarian responding...                                        │
│   Agent activity / progress detail                              │
│ Compounder responding...                                        │
│   Agent activity / progress detail                              │
│ Moonshot responding...                                          │
│   Agent activity / progress detail                              │
├────────────────────────────────────────────────────────────────┤
│ TIME    [time meter........................] 4.8 min   2–5 min  │
│ BUDGET  [budget meter......................] $1.65     $1–$5    │
├────────────────────────────────────────────────────────────────┤
│ Divider / unclear compact output area                           │
├────────────────────────────────────────────────────────────────┤
│ CEO [deliberating]                         $0.22      978k       │
├────────────────────────────────────────────────────────────────┤
│ Revenue          cost/context │ Product Strategist cost/context │
│ Technical Arch.  cost/context │ Contrarian         cost/context │
│ Compounder       cost/context │ Moonshot           cost/context │
└────────────────────────────────────────────────────────────────┘
```

## Notes for a functional UI specification

1. Treat the activity feed and the bottom telemetry grid as different views of the same agents:
   - **Activity feed:** human-readable current task and progress.
   - **Telemetry grid:** compact numeric status, cost, and context/token usage.
2. Keep the CEO's status in a separate, full-width row above the six-member grid.
3. Preserve stable agent colors across the activity feed and telemetry grid.
4. Make time and budget current values, configured limits, and bar markers visually distinguishable.
5. Define the meaning and units of the `978k`-style metric before implementing it. Do not assume it is a percentage.
6. The screenshot shows six active board roles, including roles that appeared optional in the configuration screenshot. The UI should therefore render the configured roster dynamically rather than hard-code only four roles.
7. The command banner's summary text is truncated with an ellipsis, so the UI should support truncation or clipping for long summaries.

## Items to confirm later
- Does `4.8 min` mean elapsed time, estimated completion time, or total meeting duration?
- Does `978k` represent tokens used, context-window capacity, or another context metric?
- What do the small icons and the numeric count (often `1`) in each agent row represent?
- What is the function of the thin-rule area between the meters and CEO row?
- Are the displayed cost figures per agent for the current round, cumulative for the conversation, or session totals?
