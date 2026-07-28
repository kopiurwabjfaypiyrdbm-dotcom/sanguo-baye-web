# Mission Brief: Mobile landscape application foundation

## Outcome

The campaign application is comfortably operable as a full-screen landscape experience on current phones, while remaining usable on tablets and desktop browsers. Shared layout, typography, safe-area, orientation, and touch conventions form a stable foundation for later screen migrations.

## Context

- This repository is a modern Web remake of the BBK electronic-dictionary version of 三国霸业; playable product progress is the priority.
- The final priority platform is a phone used full-screen in landscape orientation.
- The agreed interaction direction is documented in `docs/design/mobile-landscape-ui-v1.md`; its SVGs are intent references rather than pixel-perfect specifications.
- The current React shell is centered in `src/ui/App.tsx`, with global presentation in `src/styles.css` and Phaser canvases mounted from `src/game/`.

## Required Behaviors

- The app respects display cutouts and browser safe areas without obscuring campaign controls.
- Representative small-phone, large-phone, tablet, and desktop landscape viewports have no unintended page-level horizontal scrolling, clipped primary actions, or overlapping critical text.
- All primary controls are usable by touch, do not depend on hover, and present sufficiently large targets and visible focus/pressed/disabled states.
- Portrait use receives a concise orientation treatment without corrupting campaign state or blocking desktop-like portrait environments that can still support the interface.
- Shared visual and responsive primitives can be reused by the strategic and tactical screens without duplicating breakpoint logic.

## Constraints

- Preserve existing game rules, deterministic behavior, saves, bundled scenarios, and Phaser bridge contracts.
- Do not remove currently reachable gameplay to satisfy a narrow viewport.
- Do not introduce or commit original proprietary assets, unverified fonts, or other license-unclear material.
- Meet the repository collaboration and reference rules in `AGENTS.md` and keep `npm run check` passing.

## Non-goals

- Redesigning the strategic information architecture, individual command flows, or tactical battle controls.
- Final art direction, production animation, audio, packaging as a native app, or portrait-first play.

## Evidence of Completion

- Browser evidence at representative landscape sizes including approximately 740×360, 844×390, 932×430, and 1024×768, plus a desktop viewport.
- Touch, keyboard focus, safe-area, overflow, and orientation checks that exercise the title/setup screen and an active campaign.
- Automated tests and production build remain green, with any unavoidable limitation recorded.

## Delegated Decisions and Unknowns

- Choose CSS architecture, breakpoints, viewport units, and orientation-detection mechanics from current browser evidence and existing project conventions.
- Treat the SVG measurements as design guidance; prefer legibility, reachability, and graceful scaling over literal reproduction.
- Resolve whether portrait presentation is a full overlay or a non-blocking prompt based on accessible browser behavior and the requirement not to strand users.

## Autonomy and Approval Boundaries

- Local reversible code, test, documentation, and design-token changes are authorized, as are local builds and browser acceptance checks.
- Local commits are permitted when the outcome is complete and verified.
- Do not push, publish, add dependencies with material licensing or maintenance implications, import restricted assets, or make destructive repository changes without user approval.

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
