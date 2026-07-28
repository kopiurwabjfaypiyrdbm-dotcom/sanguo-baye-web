# Mission Brief: Unified touch-first campaign command flow

## Outcome

All supported city and campaign commands use a coherent touch-first interaction that leads players from intent through actor, target or quantity, understandable preview, and explicit confirmation while preserving the exact authority of the core rules.

## Context

- The map-first city context outcome is defined in `docs/mission-briefs/mobile-strategy-map-and-city-context.md`.
- Interaction intent is documented in `docs/design/mobile-landscape-ui-v1.md` and `docs/design/mobile-ui/03-command-preview.svg`.
- Existing command presentation is concentrated in `src/ui/CityPanel.tsx`; command legality and outcomes live under `src/core/` and compatibility behavior under `src/compat/baye/`.
- The application already supports internal affairs, personnel, military, intrigue/diplomacy, captive, item, equipment, logistics, and battle-related actions with deterministic rules.

## Required Behaviors

- A player can identify a command category, select eligible actors and targets, set quantities where relevant, review meaningful cost/risk/outcome information, and explicitly execute or cancel without losing context.
- Disabled and rejected actions explain the specific reason supplied or derived from the authoritative rules rather than failing silently.
- Similar commands share interaction vocabulary and control behavior; dangerous irreversible actions receive proportionate confirmation.
- The interface preserves actor action state, stamina, resources, route or target identity, and multi-officer selection where the underlying command requires them.
- Every currently supported command remains reachable, and UI composition does not duplicate or weaken core legality and result calculations.
- Touch, keyboard, and screen-size transitions do not accidentally submit commands or retain invalid stale selections.

## Constraints

- Core and compatibility modules remain the authority for rules, costs, randomness, state transitions, and logs.
- Preserve deterministic replay, save compatibility, AI behavior, and existing command coverage.
- Avoid a single monolithic replacement component; establish reusable flow primitives only where actual command variation supports them.
- Follow repository evidence and licensing requirements in `AGENTS.md`.

## Non-goals

- Adding new game rules or commands solely to fill visual categories.
- Reworking global catalogs, month resolution, tactical controls, or final art polish.
- Claiming original parity without source or reproducible evidence.

## Evidence of Completion

- Representative successful, disabled, cancelled, insufficient-resource, dangerous, quantity-based, target-based, multi-officer, and cross-city flows are exercised in automated and browser acceptance evidence.
- A command-coverage inventory demonstrates that all previously reachable actions remain accessible.
- State-transition comparisons show the new UI invokes the same rule paths and produces the same deterministic results as established tests.
- Phone, tablet, desktop, keyboard, and touch-oriented checks pass together with `npm run check`.

## Delegated Decisions and Unknowns

- Choose modal, sheet, drawer, or inline presentation per information density while preserving one interaction grammar.
- Determine component boundaries and migration order from code coupling and user value; internal affairs and personnel are useful early probes, not binding architecture.
- Decide how much preview detail to expose by default, favoring decision-critical facts with optional expansion.

## Autonomy and Approval Boundaries

- Local reversible code, tests, docs, refactors, browser validation, and local commits are authorized.
- Do not push, publish, remove gameplay, import restricted assets, or change external contracts without approval.

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
