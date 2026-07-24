import { describe, expect, it } from 'vitest';
import { parseOfficerRows } from './officers';

describe('parseOfficerRows', () => {
  it('imports edited officer csv rows and extracts scenario variants', () => {
    const csv = [
      '武将ID,名字,武力,智力,统率,兵种,武器,智力道具,坐骑',
      '1,曹操（时期2）,84,90,82,骑兵,倚天剑（武力+10）,,',
    ].join('\n');

    expect(parseOfficerRows(csv)).toEqual([
      {
        sourceId: 1,
        name: '曹操',
        scenarioVariant: '时期2',
        force: 84,
        intelligence: 90,
        leadership: 82,
        armsType: '骑兵',
        weapon: '倚天剑（武力+10）',
      },
    ]);
  });

  it('turns blank equipment cells into undefined', () => {
    const csv = [
      '武将ID,名字,武力,智力,统率,兵种,武器,智力道具,坐骑',
      '2,赵云,101,87,90,弓兵,,,',
    ].join('\n');

    expect(parseOfficerRows(csv)[0]).toMatchObject({
      name: '赵云',
      weapon: undefined,
      intelligenceItem: undefined,
      mount: undefined,
    });
  });
});
