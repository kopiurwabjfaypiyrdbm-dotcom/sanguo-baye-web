# Mission Brief: MB17 — Deterministic tactical AI

## Outcome

The Godot tactical domain can run a bounded, deterministic AI turn on the MB13–MB16 battle contract. Given the same validated battle snapshot, explicit seed, side, and period data as the Web oracle, Godot selects the same legal movement, skill, attack, or wait action according to the current Web tactical-AI policy, applies it through the existing command envelope, and produces matching target/preview/receipt/log/state-SHA/RNG results. The AI must remain an application/domain service, not a scene-tree owner.

## Context

MB13 established deployment and turn phases; MB14 established the versioned 12×8 terrain grid, pathfinding and movement; MB15 established ordinary attacks, damage, hidden/dunjia handling, experience and strict restore validation; MB16 established the `rally` skill slice, skill-point fields, effective equipment intelligence input and cross-language fixture verification. The Web oracle is `src/core/tacticalBattle.ts` (`runBasicTacticalAi`, `getReachableTiles`, `getAttackableUnitIds`, `previewTacticalAttack`, `previewTacticalSkill`, `useTacticalSkill`, `attackTacticalUnit`) plus `src/compat/baye/tacticalBattle.ts`. Existing Godot commands, session dispatch and canonical fixture conventions are the authoritative integration boundary.

## Required Behaviors

- Expose a versioned, language-neutral fixture containing a real Web AI decision trace for at least one complete active-side turn and a continuation from a saved snapshot.
- Preserve Web legal-action filtering, deterministic scoring/tie-break ordering, movement path choice, skill/attack selection, explicit seed consumption, and wait behavior when no action is legal.
- Apply selected actions only through the existing copy→validate→apply→revalidate command boundary, retaining stale/duplicate/conflict semantics and strict malformed restore rejection.
- Keep all result-affecting collections, candidate lists, and decision traces explicitly sorted; do not rely on Godot `Dictionary` iteration or default random state.
- Record the AI policy as current Web product semantics and separate any modern heuristic from claims about the BBK original.

## Constraints

- Use Godot `4.7.1-stable` and GDScript; core state/rules remain scene-independent `RefCounted` objects.
- Web remains the rule oracle. Generate and non-write-check the fixture from real TypeScript APIs, and update `references/parity-matrix.md` with the exact source and evidence.
- Do not import restricted original assets or make `references/vendor/baye-c-core/` a build dependency. Do not embed TypeScript, WebView, JSBridge, or browser runtime.
- Do not alter or replace the existing Web client. Do not expand into native tactical presentation/touch/Android validation (MB18/MB22) or battle settlement/campaign reintegration (MB19).
- Keep policy scope bounded to the current Web AI action set; do not attempt to recover unverified original AI ABI from unavailable assets.

## Non-goals

- Native battlefield scene, camera, HUD, animation, touch, and device export (MB18/MB22).
- Retreat, victory/defeat settlement, resource reconciliation, and strategic campaign reintegration (MB19).
- Full strategic AI replacement or broad rule rewrites outside tactical action selection.

## Evidence of Completion

- A committed `godot/data/fixtures/tactical-battle-ai-v1.json` is generated from real Web AI APIs and checked against its on-disk canonical JSON in non-write mode.
- A Godot 4.7.1 headless runner compares at least one complete AI turn, one restored continuation, selected action/target/path, state and receipt SHA, logs, seed changes, no-action behavior, and at least ten malformed or transactional boundaries.
- Existing MB13–MB16, application-session, project, reference, Web test, and build checks remain green.
- Three read-only reviews cover scene-tree architecture, determinism/fixture parity, and Android/mobile impact; P0/P1 findings and any MB17-introduced P2 findings are fixed before promotion.

## Delegated Decisions and Unknowns

Choose the smallest AI trace that exercises movement plus one real attack or `rally` skill while staying within existing command contracts. Reuse Web candidate scoring and stable comparators; if a policy branch cannot be projected without MB19 state, narrow the trace and document the deferred branch rather than inventing a settlement rule. Resolve fixture naming, trace envelope, and test organization from existing tactical fixture conventions.

## Autonomy and Approval Boundaries

Local inspection, implementation, fixture generation, headless Godot runs, Web tests, documentation, read-only reviews, and local commits are authorized. Do not push, create a PR, download/install SDKs or assets, change MB00 fixed clauses, delete user data, publish APK/AAB, or make licensing decisions without explicit approval.

## Execution Directive

You own delivery of the outcome above. Investigate the existing Web AI and Godot tactical contracts, choose an efficient bounded trace, implement the in-scope deterministic AI service and fixture, validate it independently, repair review findings, write the mission report, and promote the next mission without drifting into presentation or settlement work.
