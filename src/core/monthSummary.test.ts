import { describe, expect, it } from 'vitest';
import { summarizeMonth } from './monthSummary';
import type { GameLog } from './types';

describe('month summary', () => {
  it('keeps concrete commerce, governance, and inspection actions in the report', () => {
    const logs: GameLog[] = [
      { id: '1', kind: 'map', turn: 2, message: '诸葛亮在成都主持招商，商业提高 80。' },
      { id: '2', kind: 'map', turn: 2, message: '荀彧治理许昌，防灾提高 3。' },
      { id: '3', kind: 'map', turn: 2, message: '鲁肃出巡建业，民忠提高 2、人口增加 100。' },
    ];

    expect(summarizeMonth(logs)).toEqual(logs.map((log) => log.message));
  });

  it('deduplicates repeated important messages and falls back for quiet months', () => {
    const message = '张辽抵达洛阳。';
    expect(summarizeMonth([
      { id: '1', kind: 'turn', turn: 2, message },
      { id: '2', kind: 'turn', turn: 2, message },
    ])).toEqual([message]);
    expect(summarizeMonth([])).toEqual(['各势力本月没有发生重大事件。']);
  });
});
