# Mission Brief: MB18 — Native battlefield presentation, camera, and mobile input

## Outcome

The Godot client can open a native tactical battlefield view for an existing validated battle snapshot and let a player inspect and begin a representative turn with touch or mouse. The 12×8 battlefield, units, objective, side ownership, selection, camera motion, and a small command entry surface are legible in landscape phone and desktop viewports, while all state changes still pass through the MB13–MB17 application/domain contracts.

## Context

MB13–MB17 established the scene-independent tactical state, versioned terrain, movement, attacks, status/skill slices, deterministic AI, command envelopes, save/restore validation, and TypeScript fixtures. The current Godot project already has a required main scene and strategic presentation conventions. The Web tactical screen in `src/ui/TacticalBattleScreen.tsx` and `src/game/BattleScene.ts` is a behavioral oracle for selection, legal action affordances, and feedback, but this mission must demonstrate native Godot value rather than embed or imitate the Web runtime. The program roadmap places battle settlement in MB19 and the full HUD/accessibility/device hardening in MB22/MB23.

## Required Behaviors

- A discoverable native tactical scene consumes an application snapshot/query and renders the complete 12×8 terrain grid, objective tile, attacker/defender units, current active side, and selected unit/target with clear faction and selection feedback.
- Touch and mouse can pan/drag the battlefield, zoom it within bounded limits, and select a unit or tile without confusing a click with a drag. Landscape interaction remains usable at 1280×720 and 844×390, including forgiving hit areas and visible pressed/selected feedback.
- Camera movement is smooth and bounded; use Godot-native Camera2D/Control/Tween/Shader/particle capabilities where they materially improve the battlefield read, without turning presentation nodes into state owners.
- Selecting a legal representative action (move, attack, rally/skill, or wait as supported by the current snapshot) opens a compact space-adjacent command entry/preview and dispatches a versioned command through the application session. Invalid, stale, duplicate, and terminal results remain authoritative domain feedback.
- Reloading or replaying the same snapshot produces the same visible selection and command result; no result-affecting collection relies on `Dictionary` iteration or Godot default randomness.
- The scene remains independent of WebView, TypeScript, Phaser, JSBridge, browser APIs, and restricted original assets. Existing legal assets may be reused only with their provenance intact.

## Constraints

- Use Godot `4.7.1-stable` and GDScript for this mission. Keep `GameState`, tactical rules, RNG, validation, save contracts, and command semantics in scene-independent `RefCounted`/application code; `Node`, `Control`, `Camera`, and scene scripts only handle input, presentation, and scheduling.
- Do not replace or relocate the Web client, change its public rules, or make `references/vendor/baye-c-core/` a build dependency. Preserve existing paths and run `npm run check`.
- Do not import `dat.lib.orig`, original images/fonts/audio/video/WASM, unclear-license material, or local reference files. Do not expand this mission into campaign settlement or a full tactical HUD.
- Keep the project launchable from its explicit main scene and avoid adding tests, fixtures, or editor-only evidence to the runtime APK resource set unless they are intentionally required by the application.

## Non-goals

- Battle victory/defeat, retreat, food/day settlement, experience reconciliation, and strategic campaign reintegration (MB19).
- Full tactical HUD, settings, accessibility, localization polish, and production battle art/audio (MB22).
- Final Android/Windows packaging, performance hardening, and MuMu/real-device acceptance beyond the smallest local viewport/input evidence needed here (MB23).

## Evidence of Completion

- Godot 4.7.1 opens the project and runs the main scene with a reachable native tactical presentation; a headless/editor smoke check reports no parse or startup errors.
- A presentation/input runner or equivalent evidence exercises selection, click-versus-drag, bounded pan/zoom, and one command dispatch at both 1280×720 and 844×390 landscape sizes, including a terminal/invalid feedback path.
- The visible battlefield contains all 12×8 cells and all deployed units from the fixture snapshot, with stable ownership/selection styling and no scene-owned authoritative state.
- The representative command's result, before/after canonical state digest, and replay/save-restore behavior remain equal to the existing Web/Godot fixture contracts; `npm run check` stays green.
- Three read-only reviews cover scene-tree ownership, deterministic command/presentation separation, and Android/touch ergonomics. Fix P0/P1 and any MB18-introduced P2 findings before promotion, and document remaining device risks for MB23.

## Delegated Decisions and Unknowns

Choose the smallest native scene hierarchy and visual treatment that makes the battlefield materially clearer than the Web implementation while reusing existing project conventions. Decide whether a Camera2D plus Control overlay, a single custom draw node, or a hybrid best preserves hit testing and performance. Reuse the existing tactical query/command boundary; do not duplicate legality or scoring in UI. Resolve exact gesture thresholds, zoom limits, selection affordance, and test harness structure from the current Godot version and existing presentation tests.

## Autonomy and Approval Boundaries

Local inspection, GDScript/scene/presentation/input edits, fixture/test updates, Godot headless/editor runs, viewport screenshots, documentation, read-only reviews, and local commits are authorized. Do not push, create a PR, publish an APK/AAB, download/install SDKs or assets, delete user data, alter MB00 fixed clauses, or make licensing decisions without explicit approval.

## Execution Directive

You own delivery of the outcome above. Investigate the established tactical and presentation contracts, implement the smallest native battlefield slice consistent with them, validate touch/mouse and viewport evidence independently, repair review findings, write the mission report, and promote the next mission without drifting into settlement, full HUD, or platform-hardening work.
