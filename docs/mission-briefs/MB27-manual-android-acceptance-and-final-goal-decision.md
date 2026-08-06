# Mission Brief: current-source Android acceptance and final Goal decision

## Outcome

The Android-first migration gate is decided from a current-source Godot 4.7.1 APK: the APK is exported from the MB26-closed tree, installed and launched offline, and its strategic/tactical touch path is directly observed on MuMu or a real Android device. If direct observation is unavailable, the repository contains a precise manual handoff and the long-lived Goal remains active rather than being declared complete.

## Context

The migration charter is [`MB00-godot-full-migration-program.md`](MB00-godot-full-migration-program.md), the program ledger is [`godot-program-state.json`](../migration/godot-program-state.json), and MB26 is recorded in [`MB26-android-touch-acceptance-and-goal-gate.md`](../migration/mission-reports/MB26-android-touch-acceptance-and-goal-gate.md). MB26 closed the code-side terminal pause/recovery window with deterministic presentation evidence (125 tactical assertions and 139 production save/recovery assertions). The recorded `godot/builds/sanguo-baye-godot-mb25-debug.apk` was exported before those fixes and is diagnostic only. The local Godot 4.7.1 editor currently reports that its official Android Debug export template is missing; downloading/installing that component requires explicit user approval. MuMu was previously observed at Android 15/API 35, x86_64, with a rotated landscape surface, but the current ADB endpoint is not a reliable physical-touch witness.

## Required Behaviors

- Use Godot 4.7.1 stable and the existing GDScript project; the resulting APK must contain the current source, not a copied or stale artifact.
- Record the exact APK path, byte size, SHA-256, package identity, engine version, export time, renderer, Android/API, ABI, orientation, and represented viewport sizes.
- Demonstrate offline install and cold launch without WebView, JavaScript, network, or browser dependencies.
- Directly observe main-menu entry, campaign setup, strategic map drag/zoom/city selection, command entry, tactical controls, Android Back/confirmation, pause/restart, terminal settlement, and return to strategy at 1280×720 and 844×390 when the device can represent them.
- Keep keyboard navigation, ADB injection, and rotated-coordinate experiments labelled as diagnostics; none may substitute for a human/GUI touch result.
- Re-run the required Godot/Web gates after the current-source export and update the final report and ledger with a bounded complete/continue/wait decision.

## Constraints

- Stay on `codex/godot-migration-spike`; do not push, create a PR, publish an APK/AAB, or modify MB00 fixed clauses.
- Do not fabricate touch, device, screenshot, or provenance evidence. Do not silently change orientation or emulator configuration.
- Preserve deterministic seeds, canonical ordering, save/recovery contracts, and the existing Web oracle. Do not import restricted original assets or introduce C#, WebView, JSBridge, or network dependencies.
- Ask before downloading/installing the Godot export template, drivers, SDK components, or taking destructive actions.

## Non-goals

This mission does not add new strategic or tactical rules, replace the Web client, produce formal art/audio, or publish a release artifact.

## Evidence of Completion

- A current-source 4.7.1 APK export either installs and launches with direct touch evidence, or the exact template/device blocker and ready manual procedure are recorded.
- The evidence report contains independent hash/size and package checks, offline boundary checks, device metadata, screenshots or equivalent visible traces, and failed-attempt logs.
- The final post-change component gates and aggregate `npm run check` are represented truthfully, including any environment warning or timeout.
- Architecture, determinism/fixture, and Android/mobile read-only reviews are rerun; introduced P0/P1 issues are fixed. Any remaining P2 is explicitly carried forward.
- The ledger, brief/report, and local commit agree. The Goal is marked complete only if every MB00 gate is evidenced; otherwise it stays active with the next concrete external action.

## Delegated Decisions and Unknowns

Choose MuMu GUI automation or a real phone according to which provides the most credible visible touch trace. Derive coordinate transforms only from observed orientation and dimensions. Decide whether an observed failure is code, export-template, emulator, or device tooling based on logs and reproduction; do not infer a human-touch failure from ADB injection.

## Autonomy and Approval Boundaries

Local inspection, deterministic runners, report/ledger edits, screenshots from an already available device, and local commits are authorized. Downloading/installing the official Android template or other components, destructive cleanup, provenance/licensing decisions, pushing, PR creation, and publishing require explicit approval.

## Execution Directive

You own delivery of the outcome above. Start from MB26’s report and the current worktree, obtain approval only for the missing export component if needed, produce a current-source APK, and pursue the least-assumptive visible device path. Preserve the distinction between automated readiness and physical acceptance. Continue until the Android-first gate is evidenced or a precise manual handoff is recorded; never declare the long-lived Goal complete from a stale APK or keyboard-only result.
