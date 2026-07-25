import { describe, expect, it } from 'vitest';
import {
  decodeBayeLegacyString,
  parseBayeLegacyCityRecord,
  parseBayeLegacyPersonRecord,
} from './legacyScenario';

describe('Baye legacy scenario records', () => {
  it('decodes the 31-byte city record with one-based references', () => {
    const bytes = new Uint8Array(31);
    const view = new DataView(bytes.buffer);
    bytes.set([3, 6, 9], 0);
    view.setUint16(3, 5000, true);
    view.setUint16(5, 1200, true);
    view.setUint16(7, 4000, true);
    view.setUint16(9, 900, true);
    bytes.set([80, 40], 11);
    view.setUint32(13, 900_000, true);
    view.setUint32(17, 420_000, true);
    view.setUint16(21, 700, true);
    view.setUint16(23, 1200, true);
    view.setUint16(25, 300, true);
    bytes.set([12, 5, 2, 1], 27);

    expect(parseBayeLegacyCityRecord(bytes, 3)).toEqual({
      sourceIndex: 3,
      rulerIndex: 5,
      satrapIndex: 8,
      farmingLimit: 5000,
      farming: 1200,
      commerceLimit: 4000,
      commerce: 900,
      publicLoyalty: 80,
      disasterPrevention: 40,
      populationLimit: 900_000,
      population: 420_000,
      money: 700,
      food: 1200,
      reserveTroops: 300,
      personQueueOffset: 12,
      personCount: 5,
      goodsQueueOffset: 2,
      goodsCount: 1,
    });
  });

  it('decodes the 15-byte person record and empty equipment sentinel', () => {
    const bytes = new Uint8Array([1, 2, 3, 84, 90, 100, 3, 4, 50, 2, 0x34, 0x12, 0, 7, 35]);
    expect(parseBayeLegacyPersonRecord(bytes, 1)).toEqual({
      sourceIndex: 1,
      legacyIndexMarker: 1,
      rulerIndex: 1,
      level: 3,
      force: 84,
      intelligence: 90,
      loyalty: 100,
      character: 3,
      experience: 4,
      stamina: 50,
      armsType: 2,
      troops: 0x1234,
      equipmentIndexes: [null, 6],
      age: 35,
    });
  });

  it('stops at the first terminator before decoding GBK padding', () => {
    expect(decodeBayeLegacyString(new Uint8Array([0xb2, 0xdc, 0xb2, 0xd9, 0, 0xcc, 0xcc]))).toBe('曹操');
  });

  it('maps the four custom glyph slots used by the original name table', () => {
    expect(decodeBayeLegacyString(new Uint8Array([0xcf, 0xc4, 0xba, 0xee, 0xa2, 0xef, 0]))).toBe('夏侯惇');
  });
});
