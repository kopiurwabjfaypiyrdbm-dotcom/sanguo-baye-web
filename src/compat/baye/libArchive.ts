export const BAYE_LIB_MISSING_ENTRY = 0xffff_ffff;

export type BayeLibHeaderVariant = 'legacy-u16-item-length' | 'wide-u32-item-length';

export type BayeLibResourceHeader = {
  resourceId: number;
  resourceOffset: number;
  resourceLength: number;
  resourceEnd: number;
  itemCount: number;
  itemLength: number;
  key: number;
  reserved: number;
  headerLength: number;
  headerVariant: BayeLibHeaderVariant;
};

export type BayeLibErrorCode =
  | 'INVALID_RESOURCE_ID'
  | 'DIRECTORY_ENTRY_TRUNCATED'
  | 'RESOURCE_NOT_FOUND'
  | 'RESOURCE_HEADER_TRUNCATED'
  | 'RESOURCE_ID_MISMATCH'
  | 'RESOURCE_BOUNDS'
  | 'INVALID_ITEM_INDEX'
  | 'ITEM_INDEX_TRUNCATED'
  | 'ITEM_BOUNDS';

export class BayeLibError extends Error {
  constructor(
    readonly code: BayeLibErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BayeLibError';
  }
}

export type BayeLibArchiveOptions = {
  /**
   * dat.lib.orig uses the 12-byte resource header from resource.h. The newer
   * C port declares a 14-byte header in datman.h and must be selected explicitly.
   */
  headerVariant?: BayeLibHeaderVariant;
};

/**
 * Safe reader for Baye's little-endian resource archive.
 *
 * Resource and item IDs are one-based, matching GetResStartAddr/GetResItem.
 * Returned item bytes are copies and are decrypted with the original
 * byte-subtraction operation when the resource key is non-zero.
 */
export class BayeLibArchive {
  readonly headerVariant: BayeLibHeaderVariant;

  private readonly bytes: Uint8Array;
  private readonly view: DataView;

  constructor(bytes: Uint8Array, options: BayeLibArchiveOptions = {}) {
    this.bytes = new Uint8Array(bytes);
    this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
    this.headerVariant = options.headerVariant ?? 'legacy-u16-item-length';
  }

  get byteLength(): number {
    return this.bytes.byteLength;
  }

  getDirectoryEntry(resourceId: number): number | null {
    assertOneBasedInteger(resourceId, 'resource ID', 'INVALID_RESOURCE_ID');
    const entryOffset = (resourceId - 1) * 4;
    if (!Number.isSafeInteger(entryOffset) || entryOffset + 4 > this.byteLength) {
      throw new BayeLibError(
        'DIRECTORY_ENTRY_TRUNCATED',
        `resource ${resourceId} directory entry is outside the ${this.byteLength}-byte archive`,
      );
    }

    const value = this.view.getUint32(entryOffset, true);
    return value === BAYE_LIB_MISSING_ENTRY ? null : value;
  }

  getResourceHeader(resourceId: number): BayeLibResourceHeader {
    const resourceOffset = this.getDirectoryEntry(resourceId);
    if (resourceOffset === null) {
      throw new BayeLibError('RESOURCE_NOT_FOUND', `resource ${resourceId} is not present`);
    }

    const headerLength = this.headerVariant === 'legacy-u16-item-length' ? 12 : 14;
    if (resourceOffset + headerLength > this.byteLength) {
      throw new BayeLibError(
        'RESOURCE_HEADER_TRUNCATED',
        `resource ${resourceId} header at ${resourceOffset} is truncated`,
      );
    }

    const resourceLength = this.view.getUint32(resourceOffset, true);
    const storedResourceId = this.view.getUint16(resourceOffset + 4, true);
    const itemCount = this.view.getUint16(resourceOffset + 6, true);
    const itemLength =
      this.headerVariant === 'legacy-u16-item-length'
        ? this.view.getUint16(resourceOffset + 8, true)
        : this.view.getUint32(resourceOffset + 8, true);
    const keyOffset = resourceOffset + (this.headerVariant === 'legacy-u16-item-length' ? 10 : 12);
    const resourceEnd = resourceOffset + resourceLength;

    if (storedResourceId !== resourceId) {
      throw new BayeLibError(
        'RESOURCE_ID_MISMATCH',
        `directory resource ${resourceId} points to header for resource ${storedResourceId}`,
      );
    }
    if (
      resourceLength < headerLength ||
      !Number.isSafeInteger(resourceEnd) ||
      resourceEnd > this.byteLength
    ) {
      throw new BayeLibError(
        'RESOURCE_BOUNDS',
        `resource ${resourceId} range ${resourceOffset}..${resourceEnd} is outside the archive`,
      );
    }

    return {
      resourceId,
      resourceOffset,
      resourceLength,
      resourceEnd,
      itemCount,
      itemLength,
      key: this.bytes[keyOffset],
      reserved: this.bytes[keyOffset + 1],
      headerLength,
      headerVariant: this.headerVariant,
    };
  }

  getItem(resourceId: number, itemIndex: number): Uint8Array {
    const header = this.getResourceHeader(resourceId);
    assertOneBasedInteger(itemIndex, 'item index', 'INVALID_ITEM_INDEX');
    if (itemIndex > header.itemCount) {
      throw new BayeLibError(
        'INVALID_ITEM_INDEX',
        `resource ${resourceId} contains ${header.itemCount} item(s), requested ${itemIndex}`,
      );
    }

    const { start, length } = this.locateItem(header, itemIndex);
    const result = this.bytes.slice(start, start + length);
    if (header.key !== 0) {
      for (let index = 0; index < result.length; index += 1) {
        result[index] = (result[index] - header.key) & 0xff;
      }
    }
    return result;
  }

  private locateItem(
    header: BayeLibResourceHeader,
    itemIndex: number,
  ): { start: number; length: number } {
    if (header.itemLength !== 0) {
      const start = header.resourceOffset + header.headerLength + (itemIndex - 1) * header.itemLength;
      this.assertItemBounds(header, itemIndex, start, header.itemLength);
      return { start, length: header.itemLength };
    }

    // ResLoadToCon treats a single variable-length item as the bytes directly
    // after RCHEAD, without a RIDX record.
    if (header.itemCount === 1) {
      return {
        start: header.resourceOffset + header.headerLength,
        length: header.resourceLength - header.headerLength,
      };
    }

    const indexLength = header.headerVariant === 'legacy-u16-item-length' ? 4 : 8;
    const indexOffset = header.resourceOffset + header.headerLength + (itemIndex - 1) * indexLength;
    if (indexOffset + indexLength > header.resourceEnd) {
      throw new BayeLibError(
        'ITEM_INDEX_TRUNCATED',
        `resource ${header.resourceId} item ${itemIndex} index record is truncated`,
      );
    }
    const relativeOffset =
      header.headerVariant === 'legacy-u16-item-length'
        ? this.view.getUint16(indexOffset, true)
        : this.view.getUint32(indexOffset, true);
    const length =
      header.headerVariant === 'legacy-u16-item-length'
        ? this.view.getUint16(indexOffset + 2, true)
        : this.view.getUint32(indexOffset + 4, true);
    const start = header.resourceOffset + relativeOffset;
    this.assertItemBounds(header, itemIndex, start, length);
    return { start, length };
  }

  private assertItemBounds(
    header: BayeLibResourceHeader,
    itemIndex: number,
    start: number,
    length: number,
  ): void {
    const end = start + length;
    if (
      start < header.resourceOffset + header.headerLength ||
      !Number.isSafeInteger(end) ||
      end > header.resourceEnd
    ) {
      throw new BayeLibError(
        'ITEM_BOUNDS',
        `resource ${header.resourceId} item ${itemIndex} range ${start}..${end} is outside its resource`,
      );
    }
  }
}

function assertOneBasedInteger(
  value: number,
  label: string,
  code: Extract<BayeLibErrorCode, 'INVALID_RESOURCE_ID' | 'INVALID_ITEM_INDEX'>,
): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new BayeLibError(code, `${label} must be a positive one-based integer`);
  }
}
