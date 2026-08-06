# Mission Brief: Android touch acceptance and final migration gate

## Outcome

The Android-first Godot migration has direct, reproducible touch evidence or a precisely bounded external-device blocker, and the long-lived migration Goal has a defensible final gate. A reviewer can distinguish native code readiness from emulator/input limitations and can decide whether the full migration may be declared complete, must continue, or must wait for a user-visible device action.

## Context

The migration charter is [`MB00-godot-full-migration-program.md`](MB00-godot-full-migration-program.md); the current ledger is [`godot-program-state.json`](../migration/godot-program-state.json). MB25 produced [`godot-release-candidate-report.md`](../migration/godot-release-candidate-report.md), verified APK `godot/builds/sanguo-baye-godot-mb25-debug.apk`, closed code-side P1s, and confirmed install/start on MuMu. The remaining Android-first P1 is evidence, not an unreported code failure: the MuMu surface is rotated and `adb shell input tap/touchscreen` did not reliably reach Godot controls. The Web client remains the oracle and `npm run check` is the baseline gate.

## Required Behaviors

- On MuMu through a real GUI touch path or on a real Android phone, the APK can be launched offline and physically tapped at the main-menu, setup, map-city, command, tactical, and confirmation controls.
- The same device path demonstrates strategic map drag, bounded zoom/pinch (or an explicitly documented device limitation), city selection, tactical entry, Android Back/confirmation, background pause, process restart, pause recovery, terminal settlement, and return to strategy at both 1280×720 and 844×390 landscape configurations where the device can represent them.
- Evidence distinguishes human/GUI touch from ADB key navigation and rotated-coordinate injection. No keyboard-only result is promoted to physical-touch acceptance.
- The final report records device model, Android/API, renderer, orientation, dimensions, APK hash/size, exact actions, screenshots or video-equivalent traces, logs, and every failed attempt.
- If direct touch cannot be observed because the available tool boundary has no GUI or device interaction, the mission produces a concrete manual handoff and keeps the P1 open; it does not mark the Goal complete.
- The final Goal decision is bounded by the charter: complete only when all required evidence and provenance decisions are true; otherwise promote the next adaptive mission with no change to MB00 fixed clauses.

## Constraints

- Stay on `codex/godot-migration-spike`; do not push, create a PR, publish APK/AAB, modify `main`, or replace the Web product.
- Use Godot 4.7.1 stable and the existing GDScript APK; do not introduce C#, WebView, JavaScript bridges, network dependencies, or restricted original assets.
- Preserve deterministic seeds, canonical ordering, command/save contracts, and all repository licensing/provenance rules. Keep `npm run check` passing.
- Do not fabricate user-visible input, silently change emulator orientation/configuration without recording it, or claim real-device coverage from ADB injection alone.
- Ask before installing/downloading drivers or SDK components, destructive cleanup, licensing changes, publishing, pushing, or creating a PR.

## Non-goals

- This mission does not add new strategic or tactical rules, produce formal art/audio, replace the Web oracle, or publish a release artifact.

## Evidence of Completion

- Final post-change `npm run check` passes, with the Godot 4.7.1 project/main scene, all domain/presentation/recovery runners, Web tests, and build represented in the report.
- APK install/start, offline/no-WebView boundary, package identity, exact byte size and SHA-256 are independently recorded.
- Direct touch/GUI evidence covers the required path, or the report contains the exact external blocker and a ready-to-run manual procedure with the P1 intentionally still open.
- Three read-only reviews are re-run for architecture, determinism/fixtures, and Android/mobile UX; introduced P0/P1 issues are fixed. Remaining P2 coverage gaps are either closed or explicitly carried forward.
- The ledger, final report, and local commit agree on the same status; no Goal completion claim is made while a fixed charter requirement or approval-dependent provenance decision remains unresolved.

## Delegated Decisions and Unknowns

Choose whether MuMu GUI automation, user-visible manual interaction, or a real device gives the most credible evidence; choose safe coordinate/orientation transforms from observed device metadata; and decide whether a remaining limitation is code, tooling, or external approval. Prefer direct observation and reversible diagnostics. If a user must click or touch, stop at that precise handoff rather than simulating a pass.

## Autonomy and Approval Boundaries

You may inspect and run local diagnostics, foreground the existing emulator, install the already-built local APK, collect screenshots/logs, edit in-scope reports/tests/code, update the ledger/roadmap, and create local commits. Approval is required for downloads/installations, destructive operations, fixed-charter or licensing changes, publishing, pushing, and PR creation.

## Execution Directive

You own delivery of the outcome above. Start from MB25’s report and the current device state, attempt the least-assumptive observable touch route, record evidence before interpreting it, repair any code-side P0/P1 discovered, run all required checks and reviews, update the final report and ledger, and commit locally. Continue until the Android-first gate is evidenced or a concrete external/manual blocker is handed off; do not declare the long-term Goal complete merely because automated tests are green.
