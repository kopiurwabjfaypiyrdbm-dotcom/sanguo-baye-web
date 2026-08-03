# Mission Brief: Main menu, campaign setup, and complete strategic UI

## Outcome

The native Godot client presents a coherent playable strategic entry flow: launch into a main menu, choose a supported period and ruler, enter the production `GameSession`, inspect the complete 38-city map, and issue the strategic commands already proven by MB05–MB12. A player can save, load, advance the campaign, and return to the map without Web, WebView, JavaScript, or browser runtime dependencies.

## Context

The long-running migration charter is `docs/mission-briefs/MB00-godot-full-migration-program.md`; its program ledger is `docs/migration/godot-program-state.json`. MB03–MB12 provide production period data, deterministic application commands, queries, strategic orders, AI, and turn/month progression. MB18 provides the native map/camera/touch foundation, and MB20 provides production save envelopes, migration, corruption rejection, and battle recovery. The current Godot entry scene is `godot/scenes/presentation/strategy_screen.tscn`; existing presentation scripts and panel scenes are the authoritative local conventions to extend. The Web client remains the rule oracle and must continue passing `npm run check`.

## Required Behaviors

- A cold launch reaches a native menu and never assumes a preselected ruler or silently creates an invalid session.
- Period 1 and every currently bundled production period expose their declared candidates; selecting a candidate preserves the Web fixture’s period identity, player faction, ruler identity, explicit seed, and initial state digest.
- The strategic screen renders all 38 cities and their 54 undirected roads from production data, distinguishes player/other/neutral ownership, and supports mouse plus touch selection, camera drag, pinch/wheel zoom, and a visible selected-city response at both existing target aspect ratios.
- The selected-city presentation exposes useful state and command affordances for the implemented strategic domains: city development/internal affairs, officer management and lifecycle, reconnaissance, logistics, diplomacy, and progression. Every enabled action dispatches a validated `GameSession` command; unavailable actions explain their domain reason and do not mutate state.
- Month/turn advancement and AI progression use the deterministic application layer, update the map and panels through explicit state refresh, and preserve stable ordering for every visible collection.
- Save/load controls call the MB20 production repository, surface rejection without replacing the current session, and retain the selected campaign and state after a successful round trip.
- Leaving and re-entering the strategic screen does not move `GameState` into the scene tree; nodes remain input, presentation, and application dispatch boundaries.

## Constraints

- Use Godot 4.7.1 stable and GDScript; the project must retain an explicit main scene and open/run without parse errors.
- Keep `GameState`, rules, RNG, command transactions, validation, and campaign identity in `RefCounted` domain/application code. Do not use scene nodes as authoritative state.
- Preserve explicit seeds, canonical state digests, transactional command envelopes, and sorted result collections; never depend on `Dictionary` traversal order or Godot’s default random generator.
- Do not move or replace the existing Web client, embed it, or add WebView/JSBridge/browser runtime code to the Godot project.
- Reuse only redistributable project assets with provenance; do not import restricted original images, fonts, audio, video, WASM, `dat.lib.orig`, `.lib`, or `.reference` files.
- Keep Android landscape as the primary layout target and Windows desktop as a secondary target; Godot Web is outside this Mission.
- Do not push, create a PR, publish an APK/AAB, or alter the MB00 fixed clauses without approval.

## Non-goals

This Mission does not complete the tactical HUD, full settings/accessibility suite, Android/Windows performance hardening, complete historical save-schema migration, formal art/audio production, or release-candidate evidence. It may expose existing tactical entry points but must not broaden into a tactical rewrite.

## Evidence of Completion

- A Godot 4.7.1 project/editor scan and headless presentation smoke prove the menu → campaign setup → strategic screen path has no parse/runtime errors.
- A language-neutral campaign-entry fixture generated from the Web oracle compares selected period/ruler, initial digest, campaign descriptor, visible city/road counts, and one representative command result.
- Godot presentation tests exercise mouse/touch selection, drag, zoom, selected feedback, command dispatch, unavailable-command rejection, save/load refresh, and month/AI refresh without mutating state on rejected input.
- Manual checks at 1280×720 and 844×390 landscape confirm safe-area layout, readable selected-city affordances, and stable touch behavior; no network or WebView is required.
- `npm run check` remains green, including all existing migration fixtures, tests, reference checks, and Web build; restricted-content and `git diff --check` audits are clean.

## Delegated Decisions and Unknowns

Choose the simplest native Control/container composition that fits the existing scenes and keeps the map spatial rather than recreating a Web panel. Decide whether menu/setup screens are separate scenes or application-owned view states based on lifecycle and testability. Resolve panel density, labels, animation timing, camera limits, and input gesture thresholds from existing Godot conventions and the two target aspect ratios. If a command is already implemented in the domain but has no useful view, expose the smallest honest affordance rather than inventing rules. Record any Web-versus-legacy uncertainty as provisional in `references/parity-matrix.md`.

## Autonomy and Approval Boundaries

Local edits, new Godot scenes/scripts, fixtures, tests, reports, ignored verification output, and local commits on `codex/godot-migration-spike` are authorized. Do not download/install software, use restricted reference material, delete user data, push, create a PR, publish builds, or change the charter without approval.

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with the repository’s existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the strategic entry flow is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
