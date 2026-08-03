import { describe, expect, it } from 'vitest';
import { formatTacticalUnitStatus } from './tacticalBattleUnitStatus';

describe('formatTacticalUnitStatus', () => {
  it('summarizes the selected commander outside the battle grid', () => {
    expect(formatTacticalUnitStatus({ name: '关羽', troops: 1328, moved: true, acted: false }, '骑兵', '正常')).toBe(
      '骑兵 · 兵 1,328 · 正常 · 已移动',
    );
  });

  it('returns the selection prompt when no unit is selected', () => {
    expect(formatTacticalUnitStatus(undefined, '', '')).toBe('点击战场或我军名单选择单位');
  });
});
