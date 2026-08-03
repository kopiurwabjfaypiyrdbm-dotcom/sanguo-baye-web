# Godot release-candidate and migration-completion report

## Scope and recommendation

MB25 recorded a Godot 4.7.1 GDScript Android Debug export, installed it on the running MuMu instance, exercised the cold launch path, and closed two code-side P1s found by the final read-only reviews. The recorded APK was exported at 05:02, before the MB25 code-fix commit at 05:22 and the MB26 terminal-recovery changes; it is therefore a diagnostic artifact, not a current release candidate. The native client remains suitable for conditional continuation of the full migration, but this is not a final Android acceptance or publish decision: a current-source export template is missing, physical MuMu/real-device touch evidence is still missing, and the existing provenance review still governs any redistribution of structured period data.

## Current Android candidate

| Item | Evidence |
|---|---|
| Engine | Godot 4.7.1 stable (`a13da4feb`), standard GDScript project |
| Recorded diagnostic APK (pre-MB25/MB26 fixes) | `godot/builds/sanguo-baye-godot-mb25-debug.apk` |
| Size | 57,887,025 bytes (about 55.2 MiB / 57.9 MB; not 5 GB) |
| SHA-256 | `794D19D35290452B8D47B070248F541EB1C96984E56FC8890DDCFD6F26B7C6` |
| Package | `com.sumo91.sanguobaye.godotspike`, version `0.1.0-spike`, code 1 |
| Device | MuMu `127.0.0.1:5555`, model `NCO_AL00` / product `Nicole`, Android 15 API 35, primary ABI `x86_64` |
| Install/start | `adb install -r` streamed install succeeded; `monkey -p ... 1` started `com.godot.game.GodotAppLauncher`; live process observed |
| Offline boundary | Export preset keeps `permissions/internet=false`; project contains no WebView/JS bridge dependency. Final manifest audit remains part of the release checklist. |

The captured cold-launch screen shows the native main menu and the Godot 4.7.1 label. Local diagnostic captures are kept under the ignored `godot/builds/` directory (`mb25-launch.png`, `mb25-after-enter.png`); they are not application assets or source dependencies.

## Device interaction evidence

- The MuMu display reports a 1440×2560 physical panel with a 90° landscape surface orientation. The native app starts in landscape and renders the main menu without a crash or Java/FATAL exception in the sampled logcat.
- ADB key navigation (`input keyevent 66`) successfully entered campaign setup, confirming the installed APK and focus route. This is diagnostic evidence only.
- ADB `input tap`, `input touchscreen tap`, and MuMu `mumu-cli control tool cmd --cmd "input tap …"` attempts at the rotated-window coordinates did not activate the main-menu button. This reproduces the known rotation/input-injection limitation; it is not evidence that a human finger tap fails.
- Consequently, direct human touch or an equivalent MuMu GUI interaction is still required for tap, drag, pinch/zoom, city selection, tactical entry, Android Back/confirmation, pause/restart, and return-to-strategy at 1280×720 and 844×390. These remain an Android-first P1 acceptance gap rather than a fabricated pass.

## Recovery and determinism closure

- `GameSession.save_game(true)` gives the tactical presentation a narrow transaction window in which the committed marker survives the strategic save until the tactical checkpoint is removed; cleanup then clears the marker.
- MB26 now writes the terminal tactical checkpoint before this transaction window and rejects an ongoing same-battle pause when a committed post-state marker exists; the presentation runner covers this crash window and exact settlement projection binding.
- Cold `load_game()` consumes a matching committed battle id and returns it to the presentation, preventing a second `settle_tactical_battle` dispatch.
- A committed marker older than a newer valid main save is now classified as `stale_recovery`, isolated, and ignored while the newer main state loads. This prevents a stale marker from bricking every subsequent cold start.
- Production save/recovery runner: 139 assertions. Tactical presentation runner: 125 assertions, including warm/cold terminal settlement hand-off, committed-marker retention, terminal replacement of an older ongoing checkpoint, stale same-battle rejection, post-state pause validation, repeat-return idempotency, and compact return-confirmation touch targets. Campaign setup presentation runner: 62 assertions.

## Verification gate

The post-fix component gates pass: Godot domain/presentation/project, parity/full-loop/migration, save/recovery, tactical presentation (125), campaign setup (62), 47 Web test files / 378 tests, and production build. A fresh full `npm run check` must be rerun after installing the missing Godot 4.7.1 Android build template; the prior aggregate run reached the component gates but exceeded the local command timeout. Expected Windows root-certificate, popup-position, and missing Android build-tools warnings remain non-fatal environment warnings.

## Review and known risks

- Architecture review: no P0; core state remains outside the scene tree. The terminal presentation vertical runner now covers warm/cold settlement and repeat-return idempotency; a dedicated application-level settlement coordinator remains a P2 structural follow-up.
- Determinism review: no P0/P1 after the stale-marker fix; canonical ordering, explicit RNG, battle identity, parent digest, and exact-once settlement remain enforced.
- Mobile review: no code-side P0/P1 in the native input path; the recorded APK predates the MB25/MB26 fixes, MuMu is currently offline, and a fresh current-source APK plus physical touch/device acceptance remain P1.
- Structured period data provenance and any future public distribution remain subject to the repository’s existing licensing/provenance decision.
- The final APK is a local Debug artifact only. No APK/AAB was published, pushed, or attached to a release.

## Recommendation

Continue the full migration Goal with the Web client as oracle and promote the next evidence mission for Android template installation, current-source export, and user-visible MuMu/real-device touch. Do not call the Android-first acceptance complete or publish an artifact until that P1, the final post-fix `npm run check`, and the provenance decision are all closed.
