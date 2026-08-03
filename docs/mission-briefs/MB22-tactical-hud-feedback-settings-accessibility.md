# Mission Brief: Tactical HUD, feedback, settings, and accessibility

## Outcome

The native Godot client provides a coherent tactical-battle presentation around the already implemented deterministic battle/application rules: a player can understand the current battle state, select and command units, receive clear success/rejection/outcome feedback, adjust the supported presentation settings, and use the tactical flow on the target landscape layouts without losing the authoritative session.

## Context

The migration charter is `docs/mission-briefs/MB00-godot-full-migration-program.md` and the single progress ledger is `docs/migration/godot-program-state.json`. MB13–MB17 provide deterministic deployment, movement, attacks, skills, tactical AI, outcomes, and settlement. MB18–MB21 provide native battlefield/strategic presentation, campaign navigation, session hand-off, production saves, and the main menu/strategic entry. The existing tactical scene, battle presentation runner, application `GameSession`, and Web fixtures are the authoritative local conventions. The Web client remains the rule oracle; `npm run check` must remain green.

## Required Behaviors

- Entering a tactical battle from a production campaign presents the active side, round/phase, units, legal actions, selected-unit state, and battle outcome/return affordances without making scene nodes the authoritative `GameState`.
- Mouse and touch input can select units, move, attack, use an implemented skill/tactic, cancel or reject an invalid action, and visibly communicate the result; feedback distinguishes pending, accepted, rejected, defeated, retreat, and settlement states.
- Tactical UI refreshes from explicit application snapshots after every accepted command and remains deterministic for the same campaign/battle seed; visible collections use explicit stable ordering.
- Returning to strategy preserves the same application-owned campaign session and authoritative state digest; leaving through menu/navigation does not silently discard unsaved progress.
- A native settings/accessibility surface exposes only supported presentation choices (for example text scale, contrast/readability, input hints, and reduced motion) and applies them consistently to tactical feedback and controls at runtime.
- The tactical HUD and feedback remain usable at 1280×720 and 844×390 landscape sizes, including touch targets, safe-area margins, readable status text, and no essential action hidden behind an overflowing container.

## Constraints

- Use Godot 4.7.1 stable and GDScript with an explicit main scene; no parse errors or default-randomness substitutions.
- Keep rules, RNG, command transactions, validation, campaign identity, and save contracts in `RefCounted` domain/application code. Nodes and scenes are input, presentation, and application-dispatch boundaries only.
- Preserve Web-compatible fixtures, canonical state digests, explicit seeds, transactional receipts, and sorted result collections. Do not infer semantics from `Dictionary` traversal order.
- Do not move or replace the Web client, embed WebView/JavaScript/JSBridge/browser runtime code, or make `references/vendor/baye-c-core/` an application dependency.
- Reuse only redistributable assets with provenance; never add restricted original images, fonts, audio, video, WASM, `dat.lib.orig`, `.lib`, or `.reference` files.
- Android landscape remains primary and Windows desktop secondary. Android lifecycle, APK/MuMu device hardening, and performance profiling belong to MB23; do not claim them complete here.
- Do not push, create a PR, publish APK/AAB, delete user data, install software, or alter MB00 fixed clauses without approval.

## Non-goals

This Mission does not perform full Android/Windows hardening, complete historical save-schema migration, formal art/audio production, Godot Web export, full parity closure, or release-candidate publication.

## Evidence of Completion

- Godot 4.7.1 project/import/headless presentation verification and the tactical presentation runner pass without parse errors, node errors, or swallowed script failures.
- Deterministic tactical fixtures compare representative selection, movement, attack, skill, defeat/outcome, settlement, and return-to-strategy results against the TypeScript oracle for identical seeds and receipts.
- Presentation tests exercise both mouse and touch paths, accepted and rejected commands, feedback transitions, settings/accessibility changes, save/return confirmation, and session digest preservation.
- Automated geometry assertions and a compatibility-renderer GUI smoke cover 1280×720 and 844×390; manual device evidence is recorded separately when available and any gap is explicit.
- `npm run check`, `git diff --check`, restricted-content audit, and the mission report all pass; the report records unresolved renderer/device risks rather than hiding them.

## Delegated Decisions and Unknowns

Choose the smallest native HUD/control composition that fits the current tactical scene and preserves spatial battlefield feedback. Reuse existing battle/application signals and fixtures; do not invent undocumented rules. Select settings storage and localization patterns from existing project conventions. Decide which accessibility options are genuinely supported by evidence, and record unsupported platform behavior for MB23 instead of simulating it. Resolve gesture thresholds, animation timing, focus order, and status wording from the two target sizes and existing UI conventions.

## Autonomy and Approval Boundaries

Local edits, Godot scenes/scripts, fixtures, tests, reports, ignored verification output, and local commits on `codex/godot-migration-spike` are authorized. Software installation/downloads, restricted reference access, destructive filesystem/Git actions, external pushes/PRs, published builds, licensing decisions, and charter changes require approval.

## Execution Directive

You own delivery of the outcome above. Investigate the current tactical presentation and application contracts, make the in-scope native changes, validate them from independent rule and presentation angles, repair review findings, and record the result in a mission report. Continue until the tactical HUD/feedback/settings outcome is credibly verified or a documented approval-boundary blocker is reached. Preserve the outcome and constraints when implementation assumptions conflict with repository evidence, and report material divergence.
