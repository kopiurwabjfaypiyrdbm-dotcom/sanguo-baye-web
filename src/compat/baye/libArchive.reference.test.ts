// Node types are intentionally not a product dependency; this optional test
// runs only when a local, non-distributed reference checkout is supplied.
// @ts-expect-error Node built-in is available to Vitest at runtime.
import { createHash } from 'node:crypto';
// @ts-expect-error Node built-in is available to Vitest at runtime.
import { readFileSync } from 'node:fs';
// @ts-expect-error Node built-in is available to Vitest at runtime.
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import fixture from '../../../references/fixtures/lib-original.json';
import { BayeLibArchive } from './libArchive';

const sourceRoot = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  ?.BAYE_REFERENCE_SOURCE;

describe.skipIf(!sourceRoot)('local Baye dat.lib.orig reference', () => {
  it('matches the recorded resource headers and decoded item hashes', () => {
    const bytes = readFileSync(resolve(sourceRoot!, 'baye_c/src/dat.lib.orig'));
    const archive = new BayeLibArchive(bytes);

    expect(archive.byteLength).toBe(fixture.archive.byteLength);
    expect(sha256(bytes)).toBe(fixture.archive.sha256);
    for (const observation of fixture.observations) {
      const header = archive.getResourceHeader(observation.resourceId);
      expect(header).toMatchObject({
        resourceOffset: observation.header.resourceOffset,
        resourceLength: observation.header.resourceLength,
        resourceId: observation.header.storedResourceId,
        itemCount: observation.header.itemCount,
        itemLength: observation.header.itemLength,
        key: observation.header.key,
        reserved: observation.header.reserved,
      });
      const item = archive.getItem(observation.resourceId, observation.itemIndex);
      expect(item.byteLength).toBe(observation.item.byteLength);
      expect(sha256(item)).toBe(observation.item.decodedSha256);
    }
  });
});

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
