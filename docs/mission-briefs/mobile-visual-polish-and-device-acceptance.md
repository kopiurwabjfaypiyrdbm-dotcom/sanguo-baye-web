# Mission Brief: Cohesive mobile presentation and device-ready acceptance

## Outcome

The completed landscape campaign experience has a coherent, legible, performant visual language and is credibly ready for sustained play on representative iOS, Android, tablet, and desktop browsers without relying on license-unclear original assets.

## Context

- Functional mobile outcomes are commissioned by the preceding `mobile-*.md` briefs in `docs/mission-briefs/`.
- Visual direction is described in `docs/design/mobile-landscape-ui-v1.md` and represented by the SVG concepts under `docs/design/mobile-ui/`.
- The intended tone is a modern light strategy-game presentation: low-saturation terrain, strong faction recognition, restrained warm-gold emphasis, compact hierarchy, and purposeful feedback rather than a literal skin of the original hardware UI.
- Project provenance, reference, and asset restrictions are binding through `AGENTS.md` and `references/`.

## Required Behaviors

- Strategic, catalog, review, dialog, system, and tactical surfaces share a recognizable hierarchy, spacing system, icon language, state feedback, and Chinese typographic treatment.
- Faction, selection, danger, warning, success, disabled, unknown-intelligence, and action-complete states are distinguishable without relying on color alone.
- Essential transitions and feedback clarify spatial or state change, respect reduced-motion preferences, and never delay repeated campaign play.
- The interface remains readable under safe areas, browser chrome changes, text expansion, coarse pointers, and representative phone/tablet/desktop viewports.
- Loading, canvas rendering, overlays, and long-session interaction remain responsive enough for sustained campaign and tactical play.
- All visual assets and fonts have documented, redistribution-compatible provenance or are original project-native work.

## Constraints

- Do not change rules or sacrifice information clarity for decorative fidelity.
- Do not import original `.lib` content, images, fonts, audio, video, WASM, generated resource arrays, GPL offline implementation, or other license-unclear material.
- Preserve accessibility, deterministic gameplay, save compatibility, and browser recoverability.
- Keep `npm run check` passing and record material provenance changes as required by `AGENTS.md`.

## Non-goals

- Pixel-identical recreation of the BBK display, a full bespoke illustration set, native-store packaging, portrait-first UI, or every possible device/browser combination.
- New campaign or tactical mechanics.

## Evidence of Completion

- A device/view matrix records representative iOS Safari, Android Chrome, tablet, and desktop outcomes for title/setup, strategic play, command completion, month progression, save/load, and tactical battle.
- Visual regression or reproducible screenshots challenge all key screens at small and large landscape sizes, including long text, overlays, safe areas, and adverse state density.
- Accessibility checks cover keyboard/focus, reduced motion, contrast, non-color cues, labels, and target sizing.
- Performance evidence covers production bundle characteristics, startup, canvas interaction, overlays, and extended play; material remaining risks are documented.
- Full automated checks and production build pass.

## Delegated Decisions and Unknowns

- Choose the final project-native icon strategy, permissible font stack, animation timing, terrain treatment, and optimization techniques from licensing, performance, and device evidence.
- Prioritize visual improvements that clarify decisions and state; defer decorative asset volume that does not improve play.
- Use real-device evidence when available and clearly distinguish emulation from physical-device verification.

## Autonomy and Approval Boundaries

- Local reversible styling, original SVG/CSS assets, code, tests, docs, build analysis, browser checks, and local commits are authorized.
- Do not push, publish, purchase or license assets, add tracking, use external accounts, or claim physical-device coverage not actually performed without approval.

## Execution Directive

You own delivery of the outcome above. Investigate the relevant environment, choose an efficient path consistent with its existing conventions, make the in-scope changes, and validate the result with evidence appropriate to the task.

Adapt the route as evidence appears. Preserve the Outcome and Constraints when assumptions conflict with repository facts, and report material divergence. Resolve discoverable implementation questions yourself; escalate only decisions requiring user judgment or approval.

Continue until the outcome is delivered and credibly verified. Report the result, evidence, and remaining uncertainty.
