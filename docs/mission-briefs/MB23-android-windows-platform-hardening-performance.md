# Mission Brief: Android and Windows platform hardening and performance

## Outcome

The native Godot client is operationally credible on its priority platforms: a reproducible Android Debug APK can be exported from Godot 4.7.1 + GDScript, installed and launched on an available MuMu emulator or real device, and the Windows compatibility path remains runnable. Landscape touch, safe-area handling, system back navigation, lifecycle pause/resume, storage recovery, and representative performance evidence are recorded without changing the deterministic rule contract.

## Context

The migration charter is `docs/mission-briefs/MB00-godot-full-migration-program.md`; progress is tracked only in `docs/migration/godot-program-state.json`. MB18–MB22 provide native battlefield/strategy presentation, campaign session hand-off, production saves, tactical HUD, feedback, settings, and accessibility controls. The current Godot project is `godot/project.godot`, the primary engine is `D:\03_Godot\01_Engine\Godot_v4.7.1-stable_win64.exe`, and the Web implementation remains the oracle. Existing Android design notes, project export settings, platform adapter code, and MB01/MB21 reports are authoritative evidence to extend.

## Required Behaviors

- Export an Android Debug APK with Godot 4.7.1 using the chosen GDScript project, with no WebView, network, JavaScript, or browser runtime dependency; record exact export command, artifact hash/size, and any missing SDK/JDK component.
- Install and launch the APK on an available MuMu emulator or real Android device in landscape; verify main-menu → campaign setup → 38-city strategy → tactical HUD navigation without crashes or hidden essential controls.
- Verify 1280×720 and 844×390 landscape behavior on an actual window/device path, including 48px-class touch targets, safe-area margins, camera gestures, settings panel, system back handling, and selected-city/unit feedback.
- Exercise pause/resume, activity/window recreation where available, temporary storage pressure/recovery candidates, and return from tactical to strategy; preserve session/save digests or surface a bounded recovery error without silent state replacement.
- Capture representative CPU/frame-time/memory/draw-call evidence for strategy and tactical scenes, identify any P0/P1 regressions, and apply only evidence-backed optimizations that preserve ordering, explicit seed, and application/domain ownership.
- Keep Windows desktop usable through the supported compatibility renderer; distinguish default-renderer environment failures from project logic failures and do not claim untested combinations as stable.

## Constraints

- Use Godot 4.7.1 stable and GDScript; do not switch language or engine version in this Mission.
- Preserve `RefCounted` GameState/GameSession ownership, deterministic RNG, command envelopes, validation, save contracts, and canonical fixtures. Platform adapters may translate lifecycle/input/storage events but may not implement rules.
- Do not download/install SDKs, JDKs, emulators, drivers, or engine components without explicit approval. If tooling is missing, record the blocker and continue with safe local evidence.
- Do not import restricted original assets, WebView/JSBridge/browser runtime, network services, WASM, `.lib`, `dat.lib.orig`, or `.reference` build dependencies.
- Android landscape is primary; Windows desktop is secondary; Godot Web and release publishing are out of scope.
- Do not push, create a PR, publish APK/AAB, delete user data, or alter MB00 fixed clauses without approval.

## Non-goals

This Mission does not close full parity, complete historical save-schema migration, formal art/audio production, Godot Web export, or release-candidate sign-off. It does not silently treat a missing device or SDK as a pass.

## Evidence of Completion

- A reproducible Godot 4.7.1 Android export attempt and artifact audit, with exact environment/tool versions, exit status, and any approval-boundary blocker.
- Installation/launch and interaction evidence from MuMu or a real Android device when available, plus Windows compatibility-renderer smoke; screenshots/logs or an explicit unexecuted gap are retained.
- Automated and device-level checks cover 1280×720 and 844×390 landscape, touch/safe area/back/lifecycle/save recovery, and tactical↔strategy session digest continuity.
- Performance captures or bounded local measurements identify frame-time/memory/draw-call risk and show no new P0/P1 regression after fixes.
- `npm run check`, platform-specific runners, `git diff --check`, restricted-content audit, and the MB23 report pass; unresolved external-state gaps remain explicit.

## Delegated Decisions and Unknowns

Choose the safest available export backend and emulator/device procedure from installed tooling. Resolve manifest/orientation, input mapping, safe-area, lifecycle, storage path, and compatibility-renderer settings from Godot/project evidence. Prefer small measurable changes over speculative optimization. If SDK/JDK/device access is unavailable, document the exact boundary and leave release claims open for MB24/MB25.

## Autonomy and Approval Boundaries

Local code/docs/tests, non-destructive export attempts using installed tools, ignored build artifacts, logs, and local commits on `codex/godot-migration-spike` are authorized. Installing/downloading components, changing global system settings, destructive filesystem/Git operations, external pushes/PRs, publishing builds, and licensing decisions require approval.

## Execution Directive

You own delivery of the outcome above. Inspect the installed platform toolchain first, implement only in-scope platform hardening, run reproducible export/device/performance checks, repair review findings, and record the evidence and uncertainty in a mission report. Continue until platform evidence is credibly complete or a precise approval-boundary blocker is documented; never convert an unrun device or export path into a green claim.
