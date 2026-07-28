# Mission Brief: Deliberate month-end review and readable resolution

## Outcome

Players can review the state of their planned month, understand important unresolved risks, deliberately confirm progression, and read a concise actionable account of what changed after deterministic monthly resolution.

## Context

- The product direction uses concentrated player orders followed by a unified month advance, echoing the strategic cadence described in `docs/design/mobile-landscape-ui-v1.md`.
- Screen intent is illustrated in `docs/design/mobile-ui/04-month-end-review.svg`.
- Month advancement is currently coordinated from `src/ui/App.tsx`; resolution, AI, logs, events, and summaries are implemented under `src/core/`.
- Existing state already exposes officer action status, active orders, resources, events, battle interruptions, succession, outcome, and monthly summaries.

## Required Behaviors

- Invoking month progression first presents a clear review of material player actions, remaining opportunities, and credible risks derived from current state.
- The player can safely return to the campaign without advancing or explicitly confirm progression exactly once.
- Warnings distinguish consequential conditions such as usable officers, vulnerable or empty holdings, resource crises, unresolved orders, and imminent campaign interruptions without manufacturing certainty the rules do not provide.
- After resolution, important events are summarized and grouped for comprehension; ordinary detail remains available without overwhelming the primary report.
- Event or city references can return the player to relevant strategic context where state still permits it.
- Battle, succession, victory/defeat, save recovery, and other existing interruption paths retain their correct precedence and deterministic results.

## Constraints

- This commission changes interaction and presentation, not monthly rules, AI decisions, random consumption, event outcomes, or log truth.
- Advancement must be guarded against duplicate activation and remain compatible with autosave and recovery behavior.
- Warnings must be evidence-based from current state and clearly provisional where outcomes are uncertain.
- Follow `AGENTS.md` and keep all supported campaign scenarios functional.

## Non-goals

- Adding planning queues, undoing already executed commands, changing turn economy, or redesigning individual command flows.
- Replacing full historical logs or implementing new event content.

## Evidence of Completion

- Automated or repeatable scenarios cover cancel, confirm, duplicate-input protection, quiet months, multiple events, battle interruption, succession, campaign outcome, and save/reload around progression.
- Browser acceptance at phone and desktop sizes demonstrates readable review, resolution feedback, and navigation back to affected context.
- Deterministic comparison confirms the review layer does not change the resolved state or random sequence.
- `npm run check` passes.

## Delegated Decisions and Unknowns

- Choose warning thresholds, grouping, severity, and progressive disclosure using established state semantics and decision value.
- Determine whether review and result use one reusable surface or distinct components based on accessibility and lifecycle clarity.
- Prefer concise summaries with drill-down rather than exposing raw logs by default.

## Autonomy and Approval Boundaries

- Local reversible code, tests, documentation, browser checks, and local commits are authorized.
- Do not push, publish, alter game rules, import restricted assets, or introduce notifications/telemetry without approval.

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
