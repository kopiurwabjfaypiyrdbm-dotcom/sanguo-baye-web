# Project collaboration instructions

This repository is a modern Web remake of the BBK electronic-dictionary version of 三国霸业. Product progress is the priority; original behavior is recovered incrementally through evidence-backed comparison.

## Reference workflow

- Use `references/vendor/baye-c-core/` as the first source for C rules and structures. It is a read-only, pinned MIT reference subset and is not part of the application build.
- Use `npm run reference:setup` only when the vendored subset is insufficient. Local material is placed in ignored `.reference/`.
- Record every parity conclusion in `references/parity-matrix.md` with an upstream file/function or reproducible fixture.
- Put compatibility rewrites in `src/compat/baye/`; integrate playable domain behavior in `src/core/`.
- Mark unsupported claims as provisional. Do not call a behavior original-compatible without source evidence or a repeatable output comparison.

## Safety and licensing

- Never commit `dat.lib.orig`, `.lib`, fonts, original images, audio, video, WASM, generated embedded resource arrays, or files copied from `.reference/` outside the approved vendor allowlist.
- Do not copy GPL `baye_offline` implementation into the product without an explicit licensing decision.
- Do not vendor `baye_doc`; its independent redistribution license is unverified.
- Update `references/provenance/` and preserve license notices whenever upstream code materially influences an implementation.

Run `npm run check` before handing off changes.

## Godot full-migration program

- The immutable program commission is `docs/mission-briefs/MB00-godot-full-migration-program.md`. Its Outcome, Constraints, Non-goals, approval boundaries, and final completion evidence may change only with explicit user approval.
- For an active or resumed migration run, bootstrap from repository evidence in this order: this file, MB00, `docs/migration/godot-program-roadmap.json`, `docs/migration/godot-program-state.json`, the current Mission Brief when present, the latest completed mission report, `references/parity-matrix.md`, and Git status/history.
- Treat `docs/migration/godot-program-state.json` as the only authority for current position. Conversation text and compacted summaries may explain progress but cannot override the committed ledger.
- Keep exactly one active implementation Mission. A completed Mission requires its evidence gates, review fixes, report, ledger update, and local checkpoint commit; completing one Mission never completes the program Goal.
- After a Mission closes, use `$mission-brief` in a separate brief-generation step to create exactly one next self-contained Mission Brief, update the ledger, and continue implementation. Do not pre-generate the remaining backlog.
- Run `npm run godot:program-check` before resuming work and before each checkpoint. If a non-critical Mission is blocked, record the blocker and select another dependency-ready Mission; stop only at an MB00 approval boundary or when no safe ready work remains.
- Local reversible edits, tests, builds, emulator installs, and checkpoint commits are authorized by MB00. Do not push, create a PR, publish, weaken validation, or perform destructive Git/file operations without explicit user approval.
