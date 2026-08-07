# Mission Brief: Full parity and deterministic regression closure

## Outcome

Close the remaining migration-wide parity and determinism gaps after MB23 so the native Godot client can be judged against the Web oracle across the complete strategic and tactical loop. Produce a reproducible regression matrix, reconcile every known provisional parity claim, and either repair or explicitly defer each remaining discrepancy without changing the deterministic seed, command, save, or ownership contracts.

## Context

The long-running migration charter is `docs/mission-briefs/MB00-godot-full-migration-program.md`; the only progress ledger is `docs/migration/godot-program-state.json`. MB01–MB23 established the Godot 4.7.1 GDScript project, production domain/application rules, strategic and tactical systems, native presentation, saves, Android export, MuMu launch/lifecycle evidence, and Windows GL Compatibility smoke. The Web implementation remains the executable oracle. MB23 left a bounded P2 device gap: MuMu ADB touchscreen injection did not reliably hit controls, so physical touch, drag/zoom, and node selection still need manual or real-device confirmation.

## Required Behaviors

- Inventory all existing `references/parity-matrix.md`, Web fixture, Godot fixture, save/recovery, strategic, tactical, and presentation claims; label each as matched, intentionally divergent, provisional, or blocked with a direct evidence path.
- Build or extend language-neutral JSON replay cases covering the complete representative loop: campaign setup, strategic city command, movement/order, month transition/AI, tactical entry, movement, attack/skill, outcome/settlement, return to strategy, save/load, and deterministic replay from the same seed.
- Compare TypeScript and Godot outputs using canonicalized, explicitly sorted collections; fail on state, resource, event, RNG, digest, or error-contract drift rather than relying on visual similarity.
- Add focused regression coverage for malformed input, unknown command, insufficient resources, invalid ownership, corrupted save, missing fixture, and unsupported presentation action. Errors must remain bounded and must not silently replace state.
- Re-run Windows GL Compatibility and Android/MuMu checks from MB23; if a physical-device/manual touch result is available, capture it. Otherwise preserve the P2 gap and provide exact human acceptance steps.
- Keep all restricted assets and vendored rule evidence out of application dependencies; do not introduce WebView, JavaScript, network, WASM, or browser runtime code.
- Update `docs/migration/godot-program-state.json` only after tests, report, review findings, and a local commit are complete. Generate the next single Mission Brief (MB25) only when MB24 evidence is credibly closed.

## Constraints

- Use Godot 4.7.1 stable and GDScript; do not switch engine or language.
- Preserve `RefCounted` GameState/GameSession ownership, explicit RNG seed/state, transactional commands, canonical JSON fixtures, sorted result-affecting collections, and save schema contracts.
- Keep changes inside the existing Web project plus top-level `godot/`; do not relocate or rewrite the Web client.
- No downloading/installing SDKs, JDKs, emulators, drivers, Godot components, or external assets without explicit approval.
- No push, PR, release APK/AAB publication, destructive Git/filesystem operations, or license decisions.
- Do not claim full parity from screenshots or a single happy path; every claim needs an executable fixture, source evidence, or an explicitly marked provisional status.

## Non-goals

This Mission does not produce formal art/audio, add Godot Web export, migrate the historical save schema wholesale, publish a release build, or close the final release-candidate/device sign-off reserved for MB25.

## Evidence of Completion

- A parity ledger update and MB24 report with a complete claim table, fixture paths, canonicalization rules, and all known divergences/P2 gaps.
- Deterministic replay/regression commands pass for both Web and Godot, including negative/error cases and save/load digest continuity.
- `npm run check`, targeted Godot presentation/domain runners, `git diff --check`, restricted-content audit, and Windows compatibility smoke pass.
- Android/MuMu evidence is refreshed where executable; any remaining manual touch or real-device gap is precise, bounded, and carried into MB25 rather than hidden.
- Three read-only reviews cover Godot architecture/scene ownership, deterministic fixture parity, and Android/touch/mobile experience. Repair all P0/P1 and Mission-introduced P2 findings before promotion.

## Delegated Decisions and Unknowns

Choose the smallest fixture and comparison additions that close real evidence gaps. Prefer canonical serializers and replay harnesses over ad-hoc screenshot assertions. Treat existing Web behavior as the oracle when source evidence is absent, and record any intentional Godot presentation-only difference. If an external device remains unavailable, document the exact command, endpoint, and missing observation.

## Autonomy and Approval Boundaries

Local code, docs, fixtures, tests, non-destructive exports, local reports, and commits on `codex/godot-migration-spike` are authorized. Installation/downloads, destructive changes, external pushes/PRs, publication, and licensing decisions require approval.

## Execution Directive

Own the full MB24 outcome. Start by reading this brief, MB00, the ledger, the roadmap, MB23’s report, `references/parity-matrix.md`, and the existing Web/Godot fixture generators. Work in small evidence-backed slices, run the relevant checks after each slice, preserve the P2 touch gap if it cannot be safely exercised, dispatch the required read-only reviews before promotion, write the report, commit locally, update the ledger, generate MB25, and continue without ending the long-running Goal.
