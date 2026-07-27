import { describe, expect, it } from 'vitest';
import { createItemCatalog } from './itemCatalog';

describe('item catalog', () => {
  it('provides the 33 provisional catalog entries used by the playable scenarios', () => {
    const items = createItemCatalog();
    expect(Object.keys(items)).toHaveLength(33);
    expect(items['item-0']).toMatchObject({ name: '方天画戟', forceBonus: 10 });
    expect(items['item-13']).toMatchObject({ name: '孙子兵法', intelligenceBonus: 10 });
    expect(items['item-22']).toMatchObject({ name: '赤兔', moveBonus: 3 });
    expect(items['item-30'].armsTypeOverride).toBe('elite');
  });
});
