# Mission Brief: Release-candidate and migration-completion evidence

## Outcome

The Godot 4.7.1 GDScript client has a release-candidate evidence package that establishes whether the current native migration slice is ready for broader migration and device acceptance. A reviewer can launch the local Android Debug APK without network or WebView, exercise the real mobile path, recover a tactical checkpoint after process interruption, return the terminal battle to the strategic session exactly once, and compare the resulting evidence with the Web oracle and the program charter.

## Context

The long-lived migration Goal is defined by [`MB00-godot-full-migration-program.md`](MB00-godot-full-migration-program.md), with the dependency ledger in [`godot-program-roadmap.json`](../migration/godot-program-roadmap.json) and the current state in [`godot-program-state.json`](../migration/godot-program-state.json). MB01–MB24 have established the native domain, strategic and tactical slices, production saves, parity fixtures, Android Debug export, lifecycle handling, and deterministic recovery. MB24 leaves one Android-first P1 acceptance gap: MuMu/real-device physical touch, drag, pinch, city selection, tactical entry, and return have not yet been proven reliably by evidence. The authoritative reports are [`MB24-full-parity-deterministic-regression-closure.md`](../migration/mission-reports/MB24-full-parity-deterministic-regression-closure.md) and [`godot-spike-report.md`](../migration/godot-spike-report.md).

## Required Behaviors

- A clean Godot 4.7.1 project opens and starts through its declared main scene; the Android Debug APK installs and launches offline.
- On a 1280×720 and an 844×390 landscape viewport, the user can use physical touch (and mouse/keyboard as a diagnostic fallback) to pan and zoom the strategic map, select a city, open its contextual command surface, enter the native tactical sample, and return without losing the campaign.
- A paused tactical battle survives process/scene recreation through the validated pause repository, rejects unrelated or malformed candidates, and resumes the exact battle identity and canonical state.
- A terminal tactical result writes the strategic settlement, resources, RNG state, and save envelope exactly once across warm return and cold recovery. A crash window between committed recovery and pause cleanup must not dispatch the same settlement twice.
- The evidence package records device/emulator identity, APK byte size and digest, orientation, screenshots or equivalent observable traces, commands, failures, and remaining risks; it does not imply physical-touch success when the evidence only used keyboard or unreliable ADB injection.
- The completion report gives a bounded recommendation: proceed to wider migration, continue with specified blockers, or stop pending external approval. It keeps any unresolved original-BBK parity claims provisional.

## Constraints

- Use the existing `codex/godot-migration-spike` branch and do not push, create a pull request, publish an APK/AAB, or modify `main`.
- Use Godot 4.7.1 stable at `D:\03_Godot\01_Engine\Godot_v4.7.1-stable_win64.exe` and GDScript; do not introduce C#, TypeScript, WebView, JavaScript bridges, or browser runtime dependencies.
- Preserve the Web implementation as oracle and keep `npm run check` passing. Preserve deterministic RNG, explicit seeds, canonical ordering, transactional commands, validation, save contracts, and the restricted-asset/licensing rules in `AGENTS.md`.
- Do not claim a device result that was not actually observed. MuMu or real-device interaction may require user-visible/manual steps; record it as pending rather than fabricating input evidence.
- Do not make destructive filesystem or Git changes, install/download components, change licensing, or publish artifacts without the required approval.

## Non-goals

- This mission does not perform a full tactical-art or audio production pass, add Godot Web export, replace the Web client, publish a release build, or resolve every historical BBK ABI/parity uncertainty.

## Evidence of Completion

- `npm run check` passes after all changes, including Web tests/build and all Godot domain, presentation, migration, parity, save/recovery, and project checks.
- A fresh Android Debug APK is exported from the current project; its exact size, SHA-256, engine version, install/start result, and offline behavior are recorded. Windows/headless project verification remains green.
- MuMu and/or a real Android device provides direct evidence for touch tap, drag, pinch/zoom, city selection, tactical entry, Android Back/confirmation, pause/resume, and return-to-strategy at both required landscape sizes. If a capability remains unavailable, the report names the exact blocker and keeps the P1 open.
- A cold-recovery rehearsal covers: terminal pause checkpoint, committed settlement marker, simulated process loss, menu recovery, automatic promotion, matching battle-id handoff, no duplicate strategic command, and cleanup after successful return. The JSON fixture and canonical digests remain comparable with TypeScript output.
- Three independent read-only reviews cover Godot architecture/scene ownership, deterministic rules/fixture correspondence, and Android/touch UX. All introduced P0/P1 issues are fixed; any remaining P2 issue is documented with a follow-up mission or explicit rationale.
- `docs/migration/godot-release-candidate-report.md` (or a more precise equivalent) records the evidence, known risks, final parity scope, and migration recommendation, and the program ledger promotes the next mission or marks the Goal complete only when the charter truly permits it.

## Delegated Decisions and Unknowns

Choose the safest local verification route for MuMu versus a physical device, the smallest additional fixture or runner needed to make the cold vertical path credible, and the report structure. Treat emulator input-coordinate transforms, renderer/device driver behavior, signing details, and any unverified original-rule claim as evidence questions to measure, not assumptions to hide. Keep the existing APK/export path if it is reproducible; change it only when the evidence shows a concrete blocker.

## Autonomy and Approval Boundaries

You may inspect the repository, run tests and local Godot/ADB diagnostics, edit in-scope source/docs/tests, generate ignored local fixtures, take local screenshots, create a local commit, and update the migration ledger. Ask before installing or downloading SDK/driver components, using destructive cleanup or history rewrites, changing fixed MB00 clauses, altering licensing/provenance, pushing, creating a PR, or publishing any APK/AAB.

## Execution Directive

You own delivery of the outcome above. Start from the current ledger and MB24 evidence, verify the actual local engine/device state, and choose an efficient evidence-first route consistent with repository conventions. Make only in-scope changes, run the required checks, perform the three read-only reviews, repair all introduced P0/P1 issues, write the release-candidate report, update the ledger, and create a local commit. Continue until the evidence package is delivered or a concrete external approval/device blocker remains; report that blocker precisely without declaring migration complete prematurely.
