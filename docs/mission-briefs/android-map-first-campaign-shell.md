# Mission Brief: Android map-first campaign shell

## Outcome

The active campaign is comfortably playable as a full-screen landscape Android experience: the strategic map fills the usable playfield, campaign essentials remain legible, city selection produces a compact contextual command surface, and all existing campaign functions remain reachable without desktop-style dead space or hidden primary actions.

## Context

- This repository is a modern Web remake of the BBK electronic-dictionary version of 三国霸业, with phone landscape as the priority interaction platform and playable product progress as the priority.
- The agreed product direction is “地图常驻、点物下令、层层聚焦、统一推进、战术独立”, documented in `docs/design/mobile-landscape-ui-v1.md`.
- Current Android acceptance in MuMu exposed an undersized Phaser canvas, a desktop-oriented campaign shell, an overly distant whole-map camera, permanently expensive log space, and weak city context.
- The active shell and map integration live in `src/ui/App.tsx`, `src/ui/CityPanel.tsx`, `src/game/createGame.ts`, `src/game/MapScene.ts`, and `src/styles.css`; native runtime identity is provided by `src/platform/mobileShell.ts`.
- Existing mobile briefs remain useful background, especially `docs/mission-briefs/mobile-landscape-foundation.md` and `docs/mission-briefs/mobile-strategy-map-and-city-context.md`; this commission closes the observed gap between those intentions and the packaged Android experience.

## Required Behaviors

- Android landscape presentation is selected from native runtime evidence rather than a narrow viewport-height assumption, while desktop browser play remains usable.
- The strategic canvas continuously matches its actual host after startup, immersive-mode changes, resize, orientation changes, and app restoration, without leaving unused playfield.
- The map is the dominant campaign surface. Persistent chrome communicates the current ruler or faction, date, decision-relevant resources, global destinations, and month advancement without reproducing desktop page hierarchy.
- The initial camera presents the player’s territory and useful nearby context at readable scale; players can deliberately return to their territory or inspect the full realm.
- City markers and labels are touch-legible, use forgiving hit areas, and distinguish selection from map dragging. Selecting or changing a city updates one authoritative React–Phaser selection state.
- A selected city reveals an unobtrusive contextual surface containing enough ownership, resource, garrison, and officer information to choose the next action, with every existing city command still reachable.
- Routine campaign feedback occupies a compact event treatment and can expand for full history; it does not permanently remove a major band from the map.
- Back, dismissal, scroll, drag, zoom, disabled-state, and primary-action behavior remain usable by touch and do not strand the player behind clipped content.

## Constraints

- Preserve core rules, command legality and outcomes, deterministic behavior, saves, bundled scenarios, map topology and coordinates, AI behavior, and the existing React–Phaser selection contract.
- Preserve reachability of current map, city, officer, order, system, month-end, and battle flows during incremental migration.
- Do not introduce original proprietary assets, unverified fonts, copied restricted implementation, or other license-unclear material; follow `AGENTS.md` and repository provenance rules.
- Do not solve layout defects by hiding decision-critical information or by requiring hover, double-click, or precise mouse-only interaction.
- Keep `npm run check` passing and retain an installable Android debug build.

## Non-goals

- Changing campaign simulation rules, replacing the strategic map with new licensed art, completing final visual production, or redesigning the tactical battle screen.
- Adding MMO systems, real-time timers, social features, monetization surfaces, or the information density of the cited commercial references.

## Evidence of Completion

- Packaged Android acceptance demonstrates startup, campaign entry, resize or restoration, map pan and zoom, city selection and switching, city command reachability, event-history access, global navigation, and month advancement in MuMu.
- Representative landscape evidence includes approximately 1462×822, 844×390, and 667×375 CSS viewports, with no unintended page scrolling, clipped primary actions, canvas dead space, or inaccessible context.
- Regression evidence covers map lifecycle and sizing, selection synchronization, command reachability, safe-area behavior, save persistence, and unchanged deterministic campaign outcomes.
- Idle and interactive runtime observation finds no new sustained high-CPU loop attributable to layout measurement, Phaser recreation, or animation.
- `npm run check`, the production build, and Android debug APK generation pass.

## Delegated Decisions and Unknowns

- Choose the exact native-layout CSS architecture, responsive thresholds, top resource density, event expansion treatment, contextual surface dimensions, and incremental component boundaries from device evidence and existing conventions.
- Choose camera framing and zoom limits that prioritize the player’s territory without obscuring strategic context; retain an explicit whole-map option.
- Choose whether particular secondary data belongs in persistent chrome, the selected-city surface, or an expandable detail view according to immediate decision value.
- Prefer the clean hierarchy of modern light strategy games and contextual object actions over literal imitation of any commercial interface.

## Autonomy and Approval Boundaries

- Local reversible source, test, documentation, styling, Android packaging, browser acceptance, MuMu-oriented build, and local commit work are authorized.
- Preserve unrelated worktree changes and split commits when that improves reviewability.
- Do not push, publish, merge, import restricted assets, add materially consequential dependencies, or make destructive repository changes without user approval.

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
