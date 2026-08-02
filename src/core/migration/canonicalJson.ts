import { createHash } from 'node:crypto';

export const CANONICAL_JSON_ALGORITHM = 'canonical-json-v1' as const;
export const CANONICAL_DIGEST_ALGORITHM = 'sha256' as const;
export const CANONICAL_NUMBER_DOMAIN = 'safe-integer-or-decimal-6-v1' as const;

const DECIMAL_SCALE = 1_000_000;
const MAX_DECIMAL_MAGNITUDE = 9_000_000_000;

export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') {
    assertUnicodeScalarSequence(value);
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`canonical-json-v1 only accepts finite numbers, received ${String(value)}`);
    }
    if (Number.isSafeInteger(value)) return Object.is(value, -0) ? '0' : String(value);
    if (Math.abs(value) > MAX_DECIMAL_MAGNITUDE) {
      throw new Error(`canonical-json-v1 decimal magnitude exceeds ${MAX_DECIMAL_MAGNITUDE}`);
    }
    const scaled = Math.round(value * DECIMAL_SCALE);
    const normalized = scaled / DECIMAL_SCALE;
    if (!Number.isSafeInteger(scaled) || (scaled === 0 && value !== 0)
      || Math.abs(value - normalized) > 1e-12) {
      throw new Error(`canonical-json-v1 accepts at most 6 decimal places, received ${String(value)}`);
    }
    return formatScaledDecimal(scaled);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    for (const key of keys) assertUnicodeScalarSequence(key);
    keys.sort(compareUnicodeScalar);
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  throw new Error(`canonical-json-v1 cannot encode ${typeof value}`);
}

function assertUnicodeScalarSequence(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new Error('canonical-json-v1 requires well-formed Unicode scalar sequences');
      }
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new Error('canonical-json-v1 requires well-formed Unicode scalar sequences');
    }
  }
}

function formatScaledDecimal(scaled: number): string {
  const sign = scaled < 0 ? '-' : '';
  const absolute = Math.abs(scaled);
  const integer = Math.floor(absolute / DECIMAL_SCALE);
  const fraction = String(absolute % DECIMAL_SCALE).padStart(6, '0').replace(/0+$/u, '');
  return fraction ? `${sign}${integer}.${fraction}` : `${sign}${integer}`;
}

export function canonicalSha256(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

export function compareUnicodeScalar(left: string, right: string): number {
  const leftPoints = [...left].map((character) => character.codePointAt(0) ?? 0);
  const rightPoints = [...right].map((character) => character.codePointAt(0) ?? 0);
  const sharedLength = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const difference = leftPoints[index] - rightPoints[index];
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}
