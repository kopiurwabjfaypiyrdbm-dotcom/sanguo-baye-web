# Mission Brief: Mobile campaign navigation and information access

## Outcome

Players can move predictably among the strategic map, city overview, officer overview, active orders, and system functions on a landscape phone, finding any owned city or known officer quickly without creating a second source of campaign actions or losing current context.

## Context

- The strategic interaction direction is documented in `docs/design/mobile-landscape-ui-v1.md`.
- The map and command outcomes are defined in `docs/mission-briefs/mobile-strategy-map-and-city-context.md` and `docs/mission-briefs/mobile-unified-command-flow.md`.
- Campaign state and selectors live under `src/core/`; saving and loading are already supported; active orders and logs are currently surfaced within `src/ui/App.tsx` and `src/ui/CityPanel.tsx`.
- The proposed global destinations are map, cities, officers, orders, and system, but labels and grouping remain subject to evidence.

## Required Behaviors

- A persistent, touch-friendly navigation model exposes the campaign's primary information destinations without materially reducing the map's usable area.
- City and officer browsing supports useful sorting or filtering, conveys action-relevant status, and can return or jump to the corresponding map/city context.
- Active strategic and intrigue orders communicate destination, remaining duration, cargo or participants, and material risk or state.
- Save, load, export, import, settings, and return-to-title functions remain reachable but do not compete with normal campaign decisions.
- Navigation preserves selected city and relevant in-progress UI context where safe, while invalidating stale selections after state changes or loads.
- Navigation is accessible by touch and keyboard and remains understandable on phone, tablet, and desktop landscape viewports.

## Constraints

- Catalogs and dashboards must derive from authoritative state/selectors and must not become alternate rule engines.
- Preserve save semantics, intelligence restrictions, deterministic state, and all existing gameplay routes.
- Avoid persistent navigation density that obscures the strategic map or depends on tiny icon-only targets.
- Follow `AGENTS.md` and asset-license restrictions.

## Non-goals

- Adding new management mechanics, social systems, or analytical dashboards unrelated to existing decisions.
- Replacing command execution, month resolution, or tactical battle interfaces.

## Evidence of Completion

- Browser scenarios demonstrate finding and opening an owned city, locating a known officer, inspecting active orders, saving/loading, and returning to the map within phone-scale constraints.
- Tests or repeatable checks cover context preservation and invalidation after commands, month advancement, and save loading.
- Accessibility and responsive evidence covers labels, focus, active destination, safe areas, and target sizing.
- `npm run check` passes.

## Delegated Decisions and Unknowns

- Validate the destination count, names, icons, search/filter affordances, and overlay patterns against actual state density.
- Prefer fewer persistent destinations with contextual secondary actions when that improves map space and comprehension.
- Reuse or extend existing selectors where appropriate; introduce new derived selectors when they prevent presentation duplication.

## Autonomy and Approval Boundaries

- Local reversible implementation, tests, docs, browser checks, and local commits are authorized.
- Do not push, publish, add analytics or external services, import restricted assets, or change data ownership without approval.

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
