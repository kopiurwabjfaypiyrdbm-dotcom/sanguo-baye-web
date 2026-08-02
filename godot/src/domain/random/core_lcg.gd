extends RefCounted

## Exact unsigned 32-bit LCG used by src/core/random.ts.

const MULTIPLIER: int = 1_664_525
const INCREMENT: int = 1_013_904_223
const UINT32_MASK: int = 0xffff_ffff
const UINT32_RANGE: float = 4_294_967_296.0


static func next_random(seed: int) -> Dictionary:
	var next_seed: int = (seed * MULTIPLIER + INCREMENT) & UINT32_MASK
	return {
		"seed": next_seed,
		"value": float(next_seed) / UINT32_RANGE,
	}
