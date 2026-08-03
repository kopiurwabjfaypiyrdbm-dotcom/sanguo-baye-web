# Mission Brief: Production saves, migration, and corruption recovery

## Outcome

The native Godot client can save and load a production campaign without losing rule state or campaign identity: a valid period-1 production `GameState` round-trips through a versioned Godot save envelope, legacy/older supported snapshots are migrated only when their evidence-backed contract is complete, malformed or corrupted data is rejected atomically, and a battle checkpoint can resume or commit without applying a settlement twice.

## Context

MB03–MB12 established the production data contract and strategic state; MB19 added the first tactical-to-strategic settlement boundary. The current Godot `JsonSaveRepository` and `GameSession.save_game/load_game` still target the MB01 `dataContractVersion: 1` spike and explicitly refuse production campaigns. The Web oracle is `src/core/saveGame.ts` (save envelope, schema migration and normalization) plus `src/core/battleRecovery.ts` (version-2 pending/committed recovery). Existing canonical JSON, `GameState` validation, command envelopes, and deterministic LCG must remain the authority. `references/parity-matrix.md` and prior application-session fixtures record the cross-client evidence already established.

## Required Behaviors

- A production period-1 campaign can be saved with stable format/version, rule/data contract identity, campaign metadata, canonical state digest, label and deterministic state content, then loaded into a fresh `GameSession` with the same state and campaign descriptor.
- The save boundary validates the complete runtime state before writing and validates the parsed envelope before replacing session state; parse errors, unknown format/version, missing fields, wrong contract, invalid digest and structurally invalid state leave the current session unchanged.
- The migration policy accepts only explicitly supported Web save shapes and produces the production schema without inventing missing gameplay facts; unsupported, partial or ambiguous legacy fields are rejected with an actionable error and a parity note.
- Pending and committed tactical battle recovery records use a versioned, language-neutral envelope tied to a battle identity, strategic fingerprint, attack order and resume position; a valid pending record can be resumed, a committed record is treated as already applied, and identity/fingerprint/mode/order conflicts are rejected.
- Save/load and recovery preserve deterministic `rngSeed`, turn/calendar/phase, orders, lifecycle fields, officers, cities, inventories, logs and post-MB19 settlement results; no Godot scene or default RNG becomes save authority.
- Repeated load, resume and commit operations are idempotent and do not double-apply settlement, consume RNG, or reorder result-bearing collections.

## Constraints

- Use Godot 4.7.1 and GDScript in the existing `godot/` tree; keep `GameState` and persistence logic outside the scene tree.
- Preserve the Web client as the oracle and keep `npm run check` green; add language-neutral fixtures generated from TypeScript rather than copying runtime code into Godot.
- Keep canonical serialization, explicit sorting, explicit seed and transaction envelopes; never rely on Dictionary traversal order or Godot default random numbers.
- Do not embed WebView/TypeScript/JSBridge, add restricted original assets, import `.reference` material, or alter the MB00 charter.
- Do not broaden this Mission into the complete strategic UI, full tactical HUD, Android packaging, or release distribution.

## Non-goals

- Formal save compatibility with undocumented BBK binary files or unverified `.lib`/`dat.lib.orig` formats.
- Complete migration of every historical Web schema when its semantics cannot be proven.
- Final Android/MuMu/real-device acceptance, performance tuning, and release signing.

## Evidence of Completion

- A Web-generated production save/recovery fixture covers a valid round trip, at least one supported migration, pending player and AI recovery, committed recovery, and malformed/corrupt/conflicting envelopes.
- Independent Godot 4.7.1 headless runners compare canonical save envelope, state, campaign descriptor, digest, recovery status, resume position, RNG and logs against the fixture; they prove atomic rejection, restore continuation and exact-once settlement.
- Existing domain/application/tactical outcome/settlement/presentation checks, `npm run check`, and Web tests/build remain green; `git diff --check` is clean.
- Read-only review finds no P0/P1 or newly introduced P2 in persistence ownership, deterministic migration, or mobile lifecycle boundaries; remaining external platform risks are recorded in the mission report.

## Delegated Decisions and Unknowns

Choose the smallest production envelope that can represent the established `dataContractVersion: 2` state and MB19 result without duplicating Web implementation. Decide which Web migration versions are safe to support by inspecting `saveGame.ts`, validators and fixtures; prefer rejection over guessed semantics. Determine whether pending recovery belongs in the same file or a separate user-data record based on atomicity and the Godot platform path. Keep timestamps human-readable metadata and exclude them from rule-result digests unless the existing contract requires otherwise.

## Autonomy and Approval Boundaries

Local inspection, GDScript/persistence edits, fixture generation, headless verification, documentation, read-only reviews and local commits are authorized. Do not download/install SDKs, touch user data outside the repository/user save path needed for tests, delete existing saves, change the charter, push, create a PR, publish an APK/AAB, or make licensing decisions without explicit approval.

## Execution Directive

You own delivery of the outcome above. Investigate the established Web save and recovery contracts, implement the smallest production persistence slice consistent with existing Godot conventions, validate it from independent fixtures and restore/rejection evidence, repair review findings, and record remaining uncertainty. Adapt the route as evidence appears, but preserve the Outcome and Constraints. Continue until the outcome is delivered and credibly verified, then report the result and promote the next mission without pushing or creating a PR.
