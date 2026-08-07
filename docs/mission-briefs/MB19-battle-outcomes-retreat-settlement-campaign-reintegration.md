# Mission Brief: MB19 — Battle outcomes, retreat, settlement, and campaign reintegration

## Outcome

An ended Godot tactical battle can be converted into the same deterministic strategic result as the Web oracle: victory/defeat reason, retreat, casualties, food/day settlement, city ownership/defense changes, experience and campaign logs are applied once to a validated campaign snapshot and can be replayed or restored without changing the result.

## Context

MB13–MB18 established the scene-independent tactical contract, terrain, movement, attacks, representative skill, bounded AI, native battlefield presentation, command envelopes and canonical state digests. The authoritative Web behavior is in `src/core/tacticalBattle.ts` (`retreatTacticalSide`, `createTacticalBattleResult`, outcome evaluation), `src/core/battle.ts` (`resolveBattle`/`applyBattleResult`), `src/core/battleRecovery.ts`, and their tests. Godot must preserve the Web result semantics as a cross-language fixture, while keeping `GameState` and settlement outside the scene tree.

## Required Behaviors

- A validated ended tactical snapshot supports commander defeat, annihilation, objective, food/day limit, and both-side retreat outcomes where the Web contract defines them; terminal status, outcome and logs are stable and complete.
- A versioned application command settles an ended battle exactly once, rejects ongoing/stale/malformed/duplicate/conflicting requests, and returns before/after canonical campaign digests plus a receipt containing the battle identity and result summary.
- Attacker/defender food, day, surviving troops, casualties, officer experience, target city ownership/defense/reserve troops and campaign logs reconcile with the corresponding TypeScript fixture; collection ordering is explicit.
- Saving the pre-settlement or post-settlement campaign snapshot and restoring it through the Godot session produces the same result and does not apply settlement twice.
- No scene, Control, Camera, WebView, TypeScript runtime or Godot default RNG becomes authoritative for settlement.

## Constraints

- Use Godot 4.7.1 and GDScript; extend the existing domain/application contracts and canonical command envelopes.
- Keep the Web client unchanged and runnable; use `references/vendor/baye-c-core/` only as read-only evidence and do not add restricted original assets or reference files to the build.
- Do not expand into the complete tactical HUD, production art, Android packaging, device acceptance, or unrelated strategic commands.

## Non-goals

- Full campaign save migration, complete strategic UI, Android/Windows hardening and performance acceptance (MB20–MB23).
- Reimplementing every battle animation or speculative BBK ABI behavior without Web/source evidence.

## Evidence of Completion

- A language-neutral fixture generated from the Web oracle covers at least one attacker win, defender win, attacker retreat, defender retreat, and a saved continuation; it compares terminal state, strategic state, receipt, logs and canonical digests.
- Godot headless 4.7.1 runners cover success, duplicate, command-id conflict, stale digest, malformed restore and ongoing/terminal rejection, and existing tactical/application/Web checks remain green.
- A read-only review checks settlement ownership, deterministic result ordering and save/idempotence boundaries; any introduced P0/P1/P2 is repaired or explicitly blocked by an external approval boundary.

## Delegated Decisions and Unknowns

Choose the smallest domain/application adapter that maps the existing `BattleResult` and campaign state contracts without duplicating Web logic. Resolve exact casualty, reserve, experience and log mappings from source and fixtures; mark any intentional modern difference as provisional in `references/parity-matrix.md`. Keep presentation changes limited to displaying the settled result when evidence requires it.

## Autonomy and Approval Boundaries

Local inspection, GDScript/domain/application edits, fixture generation, headless verification, documentation, reviews and local commits are authorized. Do not push, create a PR, publish APK/AAB, install SDKs/assets, delete user data, alter MB00 fixed clauses or make licensing decisions without explicit approval.

## Execution Directive

You own delivery of the outcome above. Investigate the established Web and Godot contracts, implement the smallest deterministic settlement slice, validate it from independent fixture and restore evidence, repair review findings, record remaining uncertainty, and promote the next mission only after this outcome is credibly verified.
