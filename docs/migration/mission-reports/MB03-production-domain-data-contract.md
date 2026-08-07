# MB03 Mission Report: Production domain data contract

Date: 2026-08-02  
Engine: Godot 4.7.1 stable (`a13da4feb`), GDScript  
Mission brief: `docs/mission-briefs/MB03-production-domain-data-contract.md`

## Result

MB03 is complete. The repository now has a versioned production data boundary for all four bundled periods. TypeScript remains the oracle that constructs the initial campaign states; an explicit generate command writes a catalog and four self-contained JSON envelopes, while an independent Godot `RefCounted` repository and validator load them without a scene tree, network, browser runtime, default random source, or implicit `Dictionary` order.

The MB01 `dataContractVersion: 1` spike input remains intact and continues to drive the current period-1 main scene. Production envelopes use `productionDataContractVersion: 2` and a version-gated initial-state validator, so MB01 evidence has not been silently widened or replaced.

## Contract and implementation decisions

- `godot/data/campaigns/catalog-v1.json` is the allowlisted directory. Each entry pins its period path, envelope SHA-256, state SHA-256, and observable facts.
- `godot/data/campaigns/period-{1..4}.json` contains usage/provenance metadata, scenario/player-candidate metadata, observable facts, and the complete initial state.
- The canonical protocol remains MB02's `canonical-json-v1`, SHA-256, and `safe-integer-or-decimal-6-v1`; no second digest protocol was introduced.
- Cities, officers, items, arms types, factions, roads, neighbor lists, and item placement lists have explicit semantic order. Both runtimes reject reordered semantic collections even when the JSON remains structurally valid.
- The application-layer Godot repository is a `RefCounted` IO boundary. It accepts only the four catalog paths, passes parsed values into pure domain validation, validates catalog bindings and digests, then constructs pure domain `GameState` values.
- The v2 shape is closed at envelope, metadata, scenario, state-root, graph, and entity-record levels. Optional domain fields are explicit; unknown fields or missing required fields force a contract decision instead of silently changing v2.
- Normal check mode regenerates expected values only in memory and fails on drift. Only `npm run godot:domain-data:generate` writes controlled data.

## Four-period evidence

| Period | Year | Initial seed | Player candidates | Factions | Cities | Roads | Officers | Items | State SHA-256 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1 | 190 | 48641 | 18 | 18 | 38 | 54 | 200 | 33 | `c79e06d0bdf128f371dd3df482a8cdbe0daf3a2288c0f06b331859e0d7cbf198` |
| 2 | 198 | 50690 | 16 | 16 | 38 | 54 | 200 | 33 | `98a49987f4d0915ef91c068946904ea1941b36b5325492e46fdcc7997536f8dd` |
| 3 | 208 | 53251 | 11 | 11 | 38 | 54 | 200 | 33 | `6bd98706be3b2f7ce0787efbda2651a2e82f7d554d9ee95111f7d98c499d7a45` |
| 4 | 225 | 57604 | 5 | 5 | 38 | 54 | 200 | 34 | `d4f9c7f6f37020d2771dc3740624fa16c6658f58b7b45cf6b96ca02960d32f6f` |

Every period has 108 directed neighbor references and six arms types. The 54 undirected roads and all reciprocal references are checked independently by TypeScript and Godot.

## Verification

- `npm run godot:domain-data:generate` followed by `npm run godot:domain-data:check`: pass; the controlled output is byte-stable.
- `npm run godot:domain-data:verify`: pass, four periods and 99 Godot assertions.
- `npm run godot:migration-check`: pass, seven canonical vectors, two replays, four steps, plus non-zero tamper rehearsals.
- `npm run check`: pass; 371 Web tests passed, four reference-dependent tests skipped, all 51 pinned vendor files verified, and the production build completed.
- Godot 4.7.1 headless editor import: pass.
- Godot domain suite: pass, 140 assertions.
- Godot presentation/input smoke: pass, six assertions.
- Godot main scene headless launch: pass.
- Negative data cases cover contract version, ruleset, one-way roads, dangling officer/item/arms references, duplicate and reordered semantic IDs, digest tampering, and unsupported numeric precision. Failures are deterministic and path-qualified.
- `git diff --check`: pass. No original binary archive, original/unknown-license media, WASM, `.reference/` content, or build artifact was added.

## Review disposition

Three read-only reviews were run against the final MB03 worktree: Godot architecture/scene-tree boundaries, determinism/data-contract parity, and Android/mobile regression. All three final reviews report P0/P1/P2 at zero.

Review findings fixed before closure included moving JSON IO from domain to application, closing nested/catalog schemas, binding catalog periods to envelope periods, requiring the graph and checking its road list, mirroring initial turn/uint32 seed constraints, sorting TS error output, adding complete production field type/enum checks, safely returning before semantic conversions on malformed structures, and rejecting empty required/optional-reference strings while retaining legitimate unnamed future-officer placeholders.

## Known limits and next mission

- The production files are initial-state data, not a production save schema. Runtime state evolution and migrations remain later roadmap work.
- Scenario `cityCount` and `officerCount` are source metadata, not recomputed state facts: the bundled source can include sparse/future officer semantics. Authoritative initial-state counts are separately recorded in `facts`.
- The current main scene deliberately continues to use the MB01 period-1 adapter. Period selection and session orchestration belong to MB04.
- Redistribution review remains explicitly pending in the data usage block. The files contain the repository's already bundled parsed data and no original archive or media; this mission makes no new licensing conclusion.

MB04 should build the application-layer game-session and command transaction boundary on top of this loader, without adding new gameplay rule breadth.
