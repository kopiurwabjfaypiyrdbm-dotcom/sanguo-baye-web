import { describe, expect, it } from 'vitest';
import { BAYE_LIB_MISSING_ENTRY, BayeLibArchive, BayeLibError } from './libArchive';

describe('BayeLibArchive', () => {
  it('reads fixed-length legacy items with one-based indexes', () => {
    const archive = new BayeLibArchive(createLegacyFixture());

    expect(archive.getResourceHeader(1)).toMatchObject({
      resourceId: 1,
      resourceLength: 18,
      itemCount: 2,
      itemLength: 3,
      key: 0,
      headerLength: 12,
      headerVariant: 'legacy-u16-item-length',
    });
    expect([...archive.getItem(1, 1)]).toEqual([1, 2, 3]);
    expect([...archive.getItem(1, 2)]).toEqual([4, 5, 6]);
  });

  it('reads indexed variable-length items and subtracts the resource key', () => {
    const archive = new BayeLibArchive(createLegacyFixture());

    expect([...archive.getItem(2, 1)]).toEqual([10, 20]);
    expect([...archive.getItem(2, 2)]).toEqual([30, 40, 50]);
  });

  it('reads a single variable-length item directly after its header', () => {
    const archive = new BayeLibArchive(createLegacyFixture());

    expect([...archive.getItem(3, 1)]).toEqual([90, 91, 92, 93]);
  });

  it('supports the newer 14-byte header only when requested explicitly', () => {
    const bytes = new Uint8Array(32);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 8, true);
    view.setUint32(8, 18, true);
    view.setUint16(12, 1, true);
    view.setUint16(14, 1, true);
    view.setUint32(16, 4, true);
    bytes.set([7, 8, 9, 10], 22);

    const archive = new BayeLibArchive(bytes, { headerVariant: 'wide-u32-item-length' });
    expect(archive.getResourceHeader(1).headerLength).toBe(14);
    expect([...archive.getItem(1, 1)]).toEqual([7, 8, 9, 10]);
  });

  it('reports absent resources and invalid one-based indexes', () => {
    const archive = new BayeLibArchive(createLegacyFixture());

    expectBayeError(() => archive.getResourceHeader(4), 'RESOURCE_NOT_FOUND');
    expectBayeError(() => archive.getResourceHeader(0), 'INVALID_RESOURCE_ID');
    expectBayeError(() => archive.getItem(1, 0), 'INVALID_ITEM_INDEX');
    expectBayeError(() => archive.getItem(1, 3), 'INVALID_ITEM_INDEX');
  });

  it('rejects truncated directories, resource ranges, item indexes, and item payloads', () => {
    expectBayeError(() => new BayeLibArchive(new Uint8Array(3)).getResourceHeader(1), 'DIRECTORY_ENTRY_TRUNCATED');

    const badResource = createLegacyFixture();
    new DataView(badResource.buffer).setUint32(24, 0xffff, true);
    expectBayeError(() => new BayeLibArchive(badResource).getResourceHeader(1), 'RESOURCE_BOUNDS');

    const badIndex = createLegacyFixture();
    const view = new DataView(badIndex.buffer);
    const resource2 = view.getUint32(4, true);
    view.setUint32(resource2 + 12, 0xffff, true);
    expectBayeError(() => new BayeLibArchive(badIndex).getItem(2, 1), 'ITEM_BOUNDS');

    const truncatedIndex = createLegacyFixture();
    const truncatedView = new DataView(truncatedIndex.buffer);
    const resource2Offset = truncatedView.getUint32(4, true);
    truncatedView.setUint32(resource2Offset, 19, true);
    expectBayeError(() => new BayeLibArchive(truncatedIndex).getItem(2, 2), 'ITEM_INDEX_TRUNCATED');
  });

  it('rejects directory entries that point to a different resource header', () => {
    const bytes = createLegacyFixture();
    const resource1 = new DataView(bytes.buffer).getUint32(0, true);
    new DataView(bytes.buffer).setUint16(resource1 + 4, 99, true);

    expectBayeError(() => new BayeLibArchive(bytes).getResourceHeader(1), 'RESOURCE_ID_MISMATCH');
  });
});

function createLegacyFixture(): Uint8Array {
  const bytes = new Uint8Array(128);
  const view = new DataView(bytes.buffer);
  const resource1 = 24;
  const resource2 = 48;
  const resource3 = 96;

  view.setUint32(0, resource1, true);
  view.setUint32(4, resource2, true);
  view.setUint32(8, resource3, true);
  view.setUint32(12, BAYE_LIB_MISSING_ENTRY, true);

  writeLegacyHeader(view, resource1, 18, 1, 2, 3, 0);
  bytes.set([1, 2, 3, 4, 5, 6], resource1 + 12);

  writeLegacyHeader(view, resource2, 25, 2, 2, 0, 3);
  view.setUint16(resource2 + 12, 20, true);
  view.setUint16(resource2 + 14, 2, true);
  view.setUint16(resource2 + 16, 22, true);
  view.setUint16(resource2 + 18, 3, true);
  bytes.set([13, 23, 33, 43, 53], resource2 + 20);

  writeLegacyHeader(view, resource3, 16, 3, 1, 0, 0);
  bytes.set([90, 91, 92, 93], resource3 + 12);
  return bytes;
}

function writeLegacyHeader(
  view: DataView,
  offset: number,
  resourceLength: number,
  resourceId: number,
  itemCount: number,
  itemLength: number,
  key: number,
): void {
  view.setUint32(offset, resourceLength, true);
  view.setUint16(offset + 4, resourceId, true);
  view.setUint16(offset + 6, itemCount, true);
  view.setUint16(offset + 8, itemLength, true);
  view.setUint8(offset + 10, key);
  view.setUint8(offset + 11, 0);
}

function expectBayeError(action: () => unknown, code: BayeLibError['code']): void {
  try {
    action();
    throw new Error(`expected BayeLibError ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(BayeLibError);
    expect((error as BayeLibError).code).toBe(code);
  }
}
