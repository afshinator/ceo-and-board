# Screenshot Evidence Register --- v0.1

**Purpose:** Preserve pertinent implementation/product evidence visible
in the supplied reference-video screenshots that is not fully
represented in the Product Behavior Description v1.6, Functional
Specification v1.8, or Technical Architecture v0.5.

**Evidence rule:** This document records only what is visibly supported
by the screenshots. Cropped or obscured text is marked as incomplete
rather than reconstructed.

------------------------------------------------------------------------

# 1. Incorporation Map

  -----------------------------------------------------------------------------------
  Evidence                      Current status          Recommended destination
  ----------------------------- ----------------------- -----------------------------
  Exact CEO frontmatter values  Structure is in the     Agent/prompt implementation
  and `use-when` text           three specs; exact      spec or reference agent file
                                values are not          

  CEO memo SVG skill            Generic `skills`        Memo-generation / agent
                                structure is            implementation spec
                                documented; exact       
                                skill/path/behavior is  
                                not                     

  CEO TTS skill and immediate   Not fully documented    Memo-generation /
  playback behavior                                     completion-output spec

  Exact startup notification    High-level startup      UI/extension implementation
  composition and colors        behavior is documented; spec
                                exact rendering is not  

  Exact missing-config warning  Path/behavior           UI/extension implementation
  text/path                     documented; exact text  spec
                                is not                  

  `memberLines` uses board      Not fully documented    UI/extension implementation
  color/name/model-label                                spec
  presentation                                          

  Exact brief-template          Required headings are   Brief authoring/template
  instructional copy            documented; exact       artifact
                                template guidance is    
                                not                     

  Exact acquisition example     Only sibling context    Test fixture / example brief
  brief                         filenames are           
                                documented              

  Acquisition example sibling   Documented in current   No further action required
  files                         specs                   

  Visible brief-directory       Not documented and not  Test-fixture/reference-data
  examples                      normative               notes

  Visible project/app           Not documented;         Build/runtime implementation
  dependency files              implementation-only     notes if needed

  `ceo-and-board.ts`            Placement/startup       No further action required
  size/placement and            behavior documented     
  `session_start` callback                              
  evidence                                              

  Visible model identifier      Current docs            Reference agent fixture; do
  `anthropic/claude-opus-4-6`   intentionally           not make global requirement
                                generalize model field  

  CEO prompt body begins with   Not fully documented    Reference CEO prompt / prompt
  exact Purpose text                                    implementation spec
  -----------------------------------------------------------------------------------

------------------------------------------------------------------------

# 2. CEO Agent Definition --- Exact Visible Evidence

The screenshot shows:

``` text
.pi/ceo-agents/agents/ceo.md
```

Its visible YAML frontmatter is:

``` yaml
---
name: ceo
expertise:
  - path: .pi/ceo-agents/expertise/ceo-scratch-pad.md
    use-when: "Take notes on board member arguments, track shifting positions, record your evolving thesis, and note which tensions are resolved vs unresolved."
    updatable: true
skills:
  - path: .claude/skills/svg-generate/SKILL.md
    use-when: "When writing the memo, generate 1 SVG diagrams that visualize the final decision, key findings, trade-offs, and recommendations. Save them alongside the memo and reference them in the markdown."
  - path: .claude/skills/tts-eleven/SKILL.md
    use-when: "After the memo is fully written, use this to speak a 1–4 sentence summary of the final decision. Be concise, professional, and straightforward — state the problem and the solution the board reached. Save the audio file alongside the memo AND play it aloud immediately (use Workflow 3: TTS+TTF — save then afplay). Use a 2m bash timeout so you don't cut off your own speech."
model: anthropic/claude-opus-4-6
domain: []
---
```

## 2.1 Implications to preserve later

**E1.** The reference CEO has one explicitly updatable expertise
resource: `ceo-scratch-pad.md`.

**E2.** The CEO is explicitly instructed to use that scratchpad for
board arguments, shifting positions, its evolving thesis, and
resolved/unresolved tensions.

**E3.** Memo generation includes a visual-output skill. The visible
instruction says to generate **1 SVG diagrams** (wording preserved
exactly as shown), save them alongside the memo, and reference them from
the Markdown memo.

**E4.** Completion includes an optional/reference TTS workflow: after
the memo is complete, produce a 1--4 sentence spoken summary, save the
audio alongside the memo, and play it immediately.

**E5.** The visible TTS instruction specifically references `afplay` and
a `2m` bash timeout. This is environment-specific behavior and should
not become a cross-platform product requirement without an explicit
design decision.

**E6.** The reference CEO model is `anthropic/claude-opus-4-6`. This is
evidence for the reference configuration, not evidence that the product
must hard-code that model.

**Where to incorporate:** reference `ceo.md`, prompt/agent
implementation spec, memo-generation design, and completion-output
design.

------------------------------------------------------------------------

# 3. CEO Prompt Body --- Visible Evidence

Immediately after frontmatter, the file contains:

``` markdown
# CEO / Chief Decider

## Purpose

Conduct strategic deliberations by framing decisions, driving debate among board members, synthesizing arguments, and producing a final memo. You are not the visionary. You are the integrator who holds the long-range thesis while making hard tradeoffs in the present. You convert debate into decisions and decisions into commitments.

## Variables
```

The screenshot does not expose the remainder of the prompt body. It must
not be reconstructed from this image.

**Where to incorporate:** the canonical/reference CEO prompt artifact.
The architecture only needs to specify the prompt-file contract, not
duplicate the full prompt.

------------------------------------------------------------------------

# 4. Extension Startup UI --- Exact Visible Evidence

The screenshot shows the Pi extension source:

``` text
apps/ceo/extensions/ceo-and-board.ts
```

and a `pi.on("session_start", async (_event, ctx) => { ... })` callback.

The visible startup notification is constructed from:

``` ts
ctx.ui.notify(
  `${bold(pink("CEO & Board"))} ${dim("—")} ${yellow("Strategic Decision-Making Agent Team")}\n\n` +
  `${dim("Time")} ${cyan(`${c.min_time_minutes}–${c.max_time_minutes}`)} ${dim("min")}\n` +
  `${dim("Budget")} ${green(c.min_budget)}${dim("–")}${green(c.max_budget)}\n` +
  `${dim("Editor")} ${yellow(config.meeting.editor)}\n` +
  `${bold("Board")} ${memberLines.join("")}\n\n` +
  `${dim("Run")} ${cyan("/ceo-begin")} ${dim("to start a deliberation.")}`,
  "info",
);
```

The missing-configuration branch visibly shows:

``` ts
ctx.ui.notify(
  "CEO & Board Agent Team\n\n" +
  "No configuration found.\n" +
  "Create .pi/ceo-agents/ceo-and-board-configuration.yaml",
  "warning",
);
```

## 4.1 Additional visible UI construction evidence

Immediately above the notification, `memberLines.push(...)` visibly
uses:

-   the configured board-member color (`b.color`);
-   the board-member name (`b.name`);
-   a model label derived for the member.

The complete expression is horizontally cropped, so its exact formatting
must be recovered from source or a clearer screenshot before being
specified verbatim.

## 4.2 Implications

**E7.** Startup presentation distinguishes `info` and `warning`
notification types.

**E8.** The reference startup UI has the title
`CEO & Board — Strategic Decision-Making Agent Team`.

**E9.** Meeting time is displayed as a configured minimum--maximum range
in minutes.

**E10.** Budget is displayed as a configured minimum--maximum range.

**E11.** The configured editor is displayed.

**E12.** Board-member startup display is generated dynamically from
configured members, including member color/name and apparently model
information.

**E13.** `/ceo-begin` is explicitly presented as the run command.

**E14.** Missing configuration produces a warning that tells the user
exactly which canonical configuration file to create.

**Where to incorporate:** extension/UI implementation specification.
E9--E14 are behavior-level details; the ANSI/color-function choices
themselves belong in implementation/UI notes rather than the core
product contract.

------------------------------------------------------------------------

# 5. Brief Template --- Exact Visible Evidence

The screenshot shows:

``` text
.pi/ceo-agents/brief-template.md
```

Visible template content:

``` markdown
# Brief: <concise title — frame as a question the board will answer>

## Situation
<What is happening right now? State the facts. No opinion, no spin. Include current state, ...>

## Stakes
<What's at risk? What's the upside if you get this right? What's the downside if you get it ...>

## Constraints
<List each constraint as a bullet. Be exhaustive — hidden constraints derail deliberations.>
- <Budget / financial limit>
- <Timeline / deadline>
- <Team capacity / headcount>
- <Technical / infrastructure>
- <Regulatory / legal / contractual>
- <Personal / health / family / location>

## Key Question
<The single most important question you want the board to answer. One sentence. Be specific. ...>
```

Parts of the Situation, Stakes, and Key Question guidance extend beyond
the visible viewport and are therefore intentionally left with ellipses.

## 5.1 Implications

**E15.** The reference implementation contains a reusable
`brief-template.md` in addition to individual brief directories.

**E16.** The brief title itself is instructed to be framed as a question
the board will answer.

**E17.** Situation guidance explicitly calls for facts without
opinion/spin.

**E18.** Constraints are expected as an exhaustive bullet list, with the
reference template suggesting six categories: 1. Budget / financial
limit 2. Timeline / deadline 3. Team capacity / headcount 4. Technical /
infrastructure 5. Regulatory / legal / contractual 6. Personal / health
/ family / location

**E19.** Key Question is explicitly singular, one sentence, and
specific.

**Where to incorporate:** create/maintain the actual
`brief-template.md`; add its existence/path to the project-layout
portion of the architecture and functional spec when those documents
next change.

------------------------------------------------------------------------

# 6. Acquisition Brief --- Exact Reference Fixture

The screenshot shows:

``` text
.pi/ceo-agents/briefs/2026-03-18-acquisition-offer/brief.md
```

with sibling files:

``` text
business-metrics.md
product-overview.md
```

The visible `brief.md` is:

``` markdown
# Brief: Should we take the $12M acquisition offer?

## Situation
A PE-backed supplement rollup (NutraHoldings) has made a formal offer to acquire BlendStack for $12M cash. That's 11x our current $1.08M ARR. The offer is non-negotiable on price and expires in 30 days. We bootstrapped to this point with zero outside capital. MoM growth has slowed from 6.8% in Q3 2025 to 4.2% now. NutraHoldings has acquired 4 supplement brands in the last 18 months and plans to consolidate operations.

## Stakes
If we sell: founders walk away with life-changing money, team gets retention packages, but the brand likely gets absorbed into a portfolio and loses its identity. If we don't sell: we keep the upside but face a tightening market, slowing growth, and no guarantee another offer comes. The supplement DTC space is consolidating — the window for independent exits may be closing.

## Constraints
- Offer expires in 30 days, non-negotiable on price
- No outside investors to consult — founders make the call
- 2 co-founders, both full-time, both need to agree
- Team of 6 (2 content, 2 eng, 1 ops, 1 customer success) — all would be offered roles
- Current runway: profitable, but only $180K cash in bank
- Growth is decelerating — unclear if we can re-accelerate without capital
- NutraHoldings wants the custom manufacturing IP and the blend engine

## Key Question
Do we take $12M at 11x ARR now — a strong multiple in a cooling market — or do we bet we can 3–5x the business over the next 2 years and either sell for more or build a durable independent company?
```

This is reference/test data, not a product requirement.

**Where to incorporate:** preserve as an example/test fixture. It is
useful for end-to-end acceptance tests because it exercises a real brief
plus multiple sibling context files.

------------------------------------------------------------------------

# 7. Visible Brief Fixture Inventory

The Explorer shows these brief directories:

``` text
2026-03-17-agentic-copilot
2026-03-17-shorts-platform
2026-03-18-acquisition-offer
2026-03-18-engineering-path
2026-03-18-fda-warning
2026-03-18-home-purchase...
2026-03-18-solo-plugin-bet
```

The home-purchase directory name is truncated in the screenshot and must
not be completed by inference.

**Where to incorporate:** optional fixture inventory only. These names
should not enter normative product or architecture requirements.

------------------------------------------------------------------------

# 8. Visible Agent Inventory

In one Explorer view, the following agent files are visible:

``` text
moonshot.md
product-strategist.md
revenue.md
technical-architect.md
```

Other established board members are not visible in that cropped portion
of the Explorer, so this screenshot alone is not a complete board
inventory.

**Where to incorporate:** reference fixture/configuration, not
hard-coded product behavior. The board remains configurable.

------------------------------------------------------------------------

# 9. Application/Repository Structure Visible in Screenshots

The repository/application view visibly includes, under `apps/ceo/`:

``` text
.cursor/
.pi/
extensions/
node_modules/
.gitignore
bun.lock
CLAUDE.md
index.js
jsconfig.json
package-lock.json
package.json
README.md
TOOLS.md
```

At the repository root, the screenshot also visibly includes:

``` text
.claude/
.pi/
.playwright-cli/
ai_docs/
apps/ceo/
images/
specs/
.env
.env.sample
.gitignore
CLAUDE.md
justfile
README.md
```

These are repository/build-environment observations. They do **not**
establish that all of these paths are required for the CEO/Board
product.

**E20.** Both `bun.lock` and `package-lock.json` are visible under the
app. This records repository state only; it does not establish a
package-manager requirement.

**E21.** `node_modules/` is present locally, supporting that the
extension is a JavaScript/TypeScript/Node-style application environment,
but no deployment requirement should be inferred from its presence.

**E22.** `.cursor/`, `.claude/`, `.playwright-cli/`, and `ai_docs/` are
visible developer-tooling directories and should not be treated as
runtime product dependencies without further evidence.

**Where to incorporate:** build/developer-environment notes only if
implementation work needs them.

------------------------------------------------------------------------

# 10. Items Already Captured in the Three Current Specs

The following screenshot evidence is already materially represented and
does not need a separate normative addition solely because of these
screenshots:

-   canonical configuration path
    `/.pi/ceo-agents/ceo-and-board-configuration.yaml` (project-relative
    form documented as `.pi/...`);
-   extension path `apps/ceo/extensions/ceo-and-board.ts`;
-   `session_start` startup behavior;
-   `/ceo-begin`;
-   minimum/maximum meeting time and budget;
-   editor and board startup information;
-   agent Markdown + YAML-frontmatter contract;
-   structured `expertise` and `skills` entries;
-   `model` and `domain`;
-   directory-scoped briefs;
-   sibling supporting-context files;
-   `business-metrics.md` and `product-overview.md` in the acquisition
    fixture;
-   the four required brief sections.

------------------------------------------------------------------------

# 11. Recommended Later Incorporation

**R1 --- Reference agent files.**\
Create canonical/reference agent Markdown files separately from the
architecture spec. Put the exact CEO frontmatter, Purpose text,
expertise instruction, skill paths, and skill `use-when` text there.

**R2 --- Brief template artifact.**\
Create the actual `.pi/ceo-agents/brief-template.md` and preserve the
visible wording. A clearer source is still needed for the cropped ends
of Situation, Stakes, and Key Question instructions.

**R3 --- UI/extension implementation spec.**\
When UI implementation begins, incorporate the exact startup
notification labels, notification severity, member color/name/model
rendering, and missing-config warning.

**R4 --- Memo/completion pipeline.**\
When memo generation is designed, decide whether SVG generation and TTS
playback are required product behavior or optional reference-agent
skills. The screenshots prove the reference CEO is configured for both;
they do not prove these capabilities must be mandatory in every
deployment.

**R5 --- Acceptance fixtures.**\
Preserve the acquisition-offer brief and its two supporting files as an
end-to-end test fixture if the source files can be recovered. Do not
recreate the contents of the two supporting files from their filenames.

**R6 --- Unknown/cropped evidence.**\
Obtain source or clearer screenshots before specifying: - the remainder
of the CEO prompt; - full `memberLines.push(...)` formatting; - cropped
brief-template instruction endings; - contents of
`business-metrics.md`; - contents of `product-overview.md`; - complete
truncated brief-directory names.

------------------------------------------------------------------------

# 12. Critical Unknowns

The screenshots do **not** establish:

-   the complete contents of `ceo-and-board-configuration.yaml`;
-   the complete CEO prompt;
-   complete prompts/frontmatter for every board member;
-   exact model-selection precedence;
-   exact sibling-context discovery/loading rules;
-   exact `memberLines` formatting;
-   whether SVG/TTS skills are mandatory product features or merely this
    CEO configuration;
-   contents of the acquisition supporting-context files.

These remain unresolved until supported by source, transcript, or
clearer screenshots.
