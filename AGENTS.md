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
