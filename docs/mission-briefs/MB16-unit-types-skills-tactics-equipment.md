# Mission Brief: MB16 — Unit types, skills, tactics, equipment, and special effects

## Outcome

The Godot tactical domain can execute a representative, deterministic skill/tactic command on the MB15 battle contract. Given the same snapshot, explicit seed, command envelope, and period data as the Web oracle, Godot produces the same eligible skill/target list, preview, resource/status changes, receipt, logs, canonical battle SHA, and RNG behavior. The slice must also preserve the current unit type and equipment modifiers without making the tactical rules depend on scenes or presentation.

## Context

MB15 now provides ordinary attack, damage, hidden/dunjia handling, experience receipts, strict restore validation, and 11 boundary cases in `godot/data/fixtures/tactical-battle-attack-v1.json`. The authoritative Web behavior is in `src/core/tacticalBattle.ts` (`getAvailableTacticalSkills`, `getTacticalSkillTargetIds`, `previewTacticalSkill`, `useTacticalSkill`, unit status helpers) and `src/compat/baye/tacticalBattle.ts`/`tacticalGrowth.ts`. Equipment and unit-type inputs come from `src/data/` and the existing `src/core/equipment.ts` contracts. The existing Godot domain/application contracts are `godot/src/domain/tactical/`, `godot/src/application/tactical_battle/`, and `godot/src/domain/validation/`.

## Required Behaviors

- Expose a versioned, language-neutral fixture with at least one real Web skill/tactic preview and execute path, plus a second case that exercises an equipment or unit-type modifier.
- Match Web eligibility and deterministic sorting for actor skills and targets, including side, troops, acted state, status restrictions, intelligence/skill-point thresholds, range shape, and target-specific effects.
- Apply one representative skill effect completely within the tactical snapshot (for example status, troop recovery, or resource change), with explicit validation, before/after SHA, receipt, log, and seed semantics.
- Preserve the existing MB13–MB15 command envelope, duplicate/stale/conflict behavior, copy→validate→apply→revalidate transaction boundary, and strict malformed restore rejection.
- Keep all result-affecting collections explicitly sorted and do not substitute Godot random state for the Web RNG.

## Constraints

- Use Godot `4.7.1-stable` and GDScript; core state and rules remain scene-independent `RefCounted` objects.
- Web remains the rule oracle. Record provisional modern substitutions in `references/parity-matrix.md`; do not claim original compatibility without source or repeatable fixture evidence.
- Do not import restricted original assets or make `references/vendor/baye-c-core/` a build dependency. Do not embed TypeScript, WebView, JSBridge, or browser runtime.
- Do not alter or replace the existing Web client. Do not expand into tactical AI, battlefield presentation/touch, strategic settlement, or production save schema.

## Non-goals

- Full tactical AI and multi-turn decision policy (MB17).
- Native tactical battlefield scene, camera, HUD, animation, touch, and Android device validation (MB18/MB22).
- Retreat, battle outcome, campaign settlement, and strategic reintegration (MB19).

## Evidence of Completion

- A committed `godot/data/fixtures/tactical-battle-skill-v1.json` is generated from real Web APIs and is checked against the on-disk canonical JSON in non-write mode.
- A Godot 4.7.1 headless runner compares normal skill/tactic preview and execute results, status/troop/resource changes, receipt/log/SHA/seed, restore continuation, and at least ten malformed or transactional boundaries.
- Existing MB13, MB14, MB15, application-session, project, reference, Web test, and build checks remain green.
- Three read-only reviews cover scene-tree architecture, cross-language determinism/fixture parity, and Android/mobile impact; P0/P1 findings are fixed before promotion.

## Delegated Decisions and Unknowns

Choose the smallest representative skill/tactic whose Web behavior is fully observable and whose effect can be represented without introducing a broader tactical state schema. Prefer an effect with clear status or troop/resource deltas and reuse existing data-driven unit/equipment definitions. If a modifier is only a modern substitution, preserve it as such and narrow claims rather than inventing original ABI behavior. Resolve fixture shape, helper naming, and test organization from repository conventions.

## Autonomy and Approval Boundaries

Local inspection, implementation, fixture generation, headless Godot runs, Web tests, documentation, and local commits are authorized. Do not push, create a PR, download/install SDKs or assets, change MB00 fixed clauses, delete user data, publish APKs, or make licensing decisions without explicit approval.

## Execution Directive

You own delivery of the outcome above. Investigate the relevant Web and Godot contracts, choose an efficient route consistent with existing conventions, make the in-scope changes, and validate them with independent fixture and runtime evidence. Adapt the route as evidence appears, preserve the Outcome and Constraints, report material divergence, and continue until the slice is credibly verified and the next mission can be promoted.
