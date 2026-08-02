# Mission Brief: Single-layer mobile city command editor

## Outcome

Every supported city command can be understood, configured, and completed through one focused landscape-phone command editor: decision-critical effects, costs, availability, parameters, and the primary action remain visible and usable without ordinary commands opening another review popup. Only genuinely dangerous or irreversible actions may add one concise final warning, and closing or backing out restores the city command context without losing the map.

## Context

- This repository is a modern Web remake of the BBK electronic-dictionary version of 三国霸业, with full-screen landscape phone play as the priority interaction target.
- The map-first hierarchy is established in `docs/mission-briefs/android-map-first-campaign-shell.md` and `docs/mission-briefs/mobile-strategy-map-and-city-context.md`: the map is the strategic home, a city opens a node-anchored root menu, a category replaces that menu in place, and an exact command opens focused input.
- The broader command grammar is described in `docs/mission-briefs/mobile-unified-command-flow.md`. Current packaged Android acceptance shows the remaining gap: simple commands use unnecessarily large sparse sheets, ordinary submissions can open a clipped additional review layer, complex forms lose controls below the global dock, unavailable actions can lead to dead-end panels, and close/cancel semantics are duplicated.
- The current presentation is concentrated in `src/ui/CityPanel.tsx`, `src/ui/CityContextMenu.tsx`, `src/ui/App.tsx`, `src/ui/cityCommandCatalog.ts`, and `src/styles.css`; gameplay legality and outcomes remain authoritative under `src/core/` and `src/compat/baye/`.

## Required Behaviors

- The established city root and category menus remain lightweight and map-anchored. Selecting an exact command opens only that command's editor, with no unrelated controls or category-wide form.
- An ordinary command exposes its eligible actor, required target or quantities, meaningful expected effect, costs, action consumption, and specific disabled reason in the same interaction layer as its execution control. Executing it does not open a second review popup.
- Simple commands use content-proportionate presentation; parameter-heavy commands may use more space and scroll their content, but their identity, exit path, and primary action remain stable and visible.
- While an exact command editor is active, the global campaign dock yields the bottom interaction area and returns when the editor closes. Safe areas, short landscape viewports, and the on-screen keyboard do not conceal primary controls.
- Back and dismissal preserve a predictable hierarchy: dangerous confirmation returns to the command editor, the editor returns to its category, the category returns to the city root, and the root returns to the map. A close action may dismiss the local flow directly to the map, but equivalent controls do not conflict or duplicate one another.
- Commands known to be unavailable before editor entry communicate the reason at the category surface or through an equally immediate treatment; availability discovered after actor or parameter selection remains explained beside the disabled primary action. The player is not led into an unexplained dead end.
- Only actions whose consequences justify interruption receive an additional confirmation. That warning names the action and target, summarizes the material irreversible loss or risk, and offers unambiguous cancel and confirm actions without becoming another general-purpose review screen.
- All currently reachable internal-affairs, personnel, military, intrigue, item, captive, logistics, and attack commands remain reachable and invoke the same authoritative rule paths and deterministic outcomes.

## Constraints

- Preserve campaign rules, legality, costs, randomness, saves, AI behavior, logs, and deterministic replay; presentation must not duplicate or weaken core validation.
- Preserve the agreed map-first root and category interaction rather than returning city operation to a persistent side panel or category-wide bottom sheet.
- Do not depend on hover, precise mouse input, browser chrome, or page-level scrolling. Touch targets and native Android back behavior must remain usable on short landscape phones.
- Do not import original proprietary assets, unverified fonts, restricted implementation, or license-unclear material; follow `AGENTS.md` and repository provenance requirements.
- Keep `npm run check` passing and retain a buildable, installable Android debug APK.

## Non-goals

- Redesigning the strategic map, global campaign indexes, month-end flow, tactical battle interface, or simulation rules.
- Adding new commands, new rule effects, final production art, or commercial-mobile systems merely to populate the interface.
- Forcing every command into identical dimensions when its decision complexity differs.

## Evidence of Completion

- Browser and packaged MuMu acceptance exercise representative quick, target-based, quantity-based, unavailable, complex, and dangerous flows, including at least development, reconnaissance, trade or transport, appointment or reward, and plunder or another irreversible action.
- Representative landscape sizes around 1462×822, 844×390, and 667×375 show no clipped fields, hidden confirmation controls, unintended page scrolling, overlapping global dock, or ordinary fourth-level review popup.
- Acceptance demonstrates the complete back hierarchy, restoration of the global dock, preservation of city/category context, safe dismissal, and absence of accidental submission.
- Regression evidence confirms every previously reachable command remains accessible and representative executions produce the same state transitions and logs as the established rule tests.
- `npm run check`, production build, Android debug APK generation, and installation or launch on MuMu pass; idle observation finds no new sustained CPU loop caused by measurement, scrolling, or presentation state.

## Delegated Decisions and Unknowns

- Choose the reusable editor composition, exact dimensions, animation, responsive thresholds, actor/target selection treatment, and sticky-region implementation from current code conventions and device evidence.
- Classify commands as quick, parameter-heavy, or dangerous according to actual information density and consequence, not merely their existing component grouping.
- Decide whether a known unavailable command is disabled with an adjacent reason or opens a compact explanation, favoring immediate understanding and no dead-end navigation.
- Decide which preview facts are sufficiently reliable to show before execution; derive them from authoritative rules and avoid claiming exact outcomes where the rule includes uncertainty.

## Autonomy and Approval Boundaries

- Local reversible source, style, test, documentation, browser acceptance, Android packaging, MuMu validation, and review-oriented local commit work are authorized when executing this brief.
- Preserve unrelated worktree changes and adapt to concurrent edits rather than reverting them.
- Do not push, publish, merge, add materially consequential dependencies, import restricted assets, or perform destructive repository operations without user approval.

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
