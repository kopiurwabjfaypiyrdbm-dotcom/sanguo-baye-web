# Mission Brief: Full-screen touch-first tactical battle interface

## Outcome

A complete manual tactical battle can be understood and played comfortably on a landscape phone using touch alone, with the battlefield remaining visually dominant and every movement, attack, skill, wait, phase, retreat, and result decision retaining current deterministic semantics.

## Context

- The agreed separation is “战术独立”: battle becomes a focused full-screen mode rather than carrying the strategic screen's information density.
- Screen intent is illustrated in `docs/design/mobile-ui/05-tactical-battle.svg`.
- React battle presentation lives in `src/ui/TacticalBattleScreen.tsx`; Phaser battle rendering and events live in `src/game/BattleScene.ts` and `src/game/createBattleGame.ts`; authoritative tactical behavior lives in `src/core/tacticalBattle.ts` with compatibility evidence under `src/compat/baye/`.
- Current battles already support deterministic movement, normal attacks, skills/statuses, AI phases, commander defeat, retreat, recovery, and campaign writeback.

## Required Behaviors

- The battlefield occupies the primary visual area and remains pan/select friendly without browser-page gestures stealing intended interaction.
- Players can identify active side, objectives, force condition, selected unit, reachable area, attack/skill targets, terrain, status, costs, and predicted consequences at the moment they matter.
- Touch interaction supports selecting units and tiles, choosing an action, previewing a target, cancelling, confirming, waiting, ending a side, and retreating without hover or keyboard dependence.
- Unit rosters and detailed information remain accessible but can yield space to the battlefield on small landscape heights.
- AI resolution, feedback, commander defeat, battle result, crash-safe recovery, refresh/reload behavior, and campaign writeback continue to work exactly once.
- Keyboard and desktop pointer use remain supported as secondary input modes.

## Constraints

- Preserve tactical rules, source-backed compatibility behavior, random sequence, battle persistence, and strategic writeback.
- React and Phaser must share one selection/action truth through established bridge contracts.
- Do not obscure playable tiles with permanent chrome or require tiny dense controls.
- Follow `AGENTS.md`; do not add original or license-unclear battle assets.

## Non-goals

- Adding new units, tactical skills, maps, AI behaviors, animations, or original-rule claims.
- Final production VFX/audio or native gesture integration.

## Evidence of Completion

- Browser acceptance completes representative battles on small and large landscape phones, including movement, previewed attack, skill/status use, wait/end-side, AI response, commander defeat, result writeback, and refresh recovery.
- Responsive evidence checks crowded rosters, long Chinese labels, safe areas, touch targets, overlays, and battlefield visibility.
- Automated tactical, compatibility, save/recovery, and campaign tests remain green with `npm run check`.

## Delegated Decisions and Unknowns

- Choose action-bar composition, roster collapse behavior, details disclosure, gesture handling, and portrait fallback from device evidence.
- Preserve useful existing information while prioritizing the immediate tactical decision; use progressive disclosure for secondary statistics and logs.
- Adjust Phaser camera/input coordination only where required for reliable touch interaction.

## Autonomy and Approval Boundaries

- Local reversible UI, Phaser integration, tests, docs, browser validation, and local commits are authorized.
- Do not push, publish, alter tactical rules, add restricted assets, or introduce platform SDKs without approval.

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
