# Mission Brief: Map-first strategy screen and city context drawer

## Outcome

An active campaign opens into a map-first landscape screen where players can inspect the strategic situation, select cities, and reach every existing city action through a touch-friendly contextual drawer without losing map context.

## Context

- The mobile landscape foundation is defined by `docs/mission-briefs/mobile-landscape-foundation.md` and should already be credibly verified.
- The agreed interaction model and screen intent are in `docs/design/mobile-landscape-ui-v1.md` and `docs/design/mobile-ui/01-strategy-map.svg` through `02-city-drawer.svg`.
- The current strategic shell and map mounting live in `src/ui/App.tsx`; city information and commands are concentrated in `src/ui/CityPanel.tsx`; Phaser map behavior lives in `src/game/MapScene.ts`.
- Product direction is “地图常驻、点物下令、层层聚焦、统一推进、战术独立”.

## Required Behaviors

- The strategic map is the dominant campaign surface, with compact persistent campaign status and a stable global navigation region.
- Selecting a city on the map opens or updates a contextual drawer while preserving the selected location and visible strategic context.
- The drawer immediately communicates ownership, key resources, condition, garrison, and important officers, and exposes clear entries for internal affairs, personnel, military, and intrigue actions.
- Enemy-city information continues to obey current reconnaissance and knowledge rules.
- Every currently supported city command remains reachable during migration, including through a clearly labeled full-detail fallback where a command has not yet received its mobile flow.
- Closing, switching, and reopening city context works by touch, keyboard, and browser navigation conventions without resetting the campaign.

## Constraints

- Do not alter core command legality, costs, results, AI behavior, save data, map coordinates, or deterministic outcomes.
- Preserve the React–Phaser event bridge and avoid parallel sources of selection truth.
- Do not hide unavailable commands without explaining their category or route to details.
- Follow `AGENTS.md`; do not introduce license-unclear original assets.

## Non-goals

- Completing the redesigned step-by-step UI for every command.
- Replacing the underlying strategic map art, changing campaign rules, or finalizing city/officer catalog screens.

## Evidence of Completion

- Browser acceptance demonstrates selecting friendly and enemy cities, switching selections, dismissing/reopening the drawer, and reaching representative commands at phone, tablet, and desktop landscape sizes.
- Regression evidence covers map selection synchronization, intelligence visibility, campaign persistence, and continued reachability of the full existing command inventory.
- Accessibility inspection confirms meaningful landmarks, focus behavior, labels, and no hover-only critical interaction.
- `npm run check` passes.

## Delegated Decisions and Unknowns

- Choose drawer width, motion, dismissal behavior, and compact-summary density based on real viewport evidence.
- Split or wrap `CityPanel` as needed, preferring incremental migration and a single rules authority over a large rewrite.
- Determine which summary facts deserve first-screen prominence using campaign decision value and the existing rules model.

## Autonomy and Approval Boundaries

- Local reversible implementation, tests, documentation, browser checks, and local commits are authorized.
- Do not push, publish, import restricted assets, change licenses, or remove established gameplay without user approval.

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
