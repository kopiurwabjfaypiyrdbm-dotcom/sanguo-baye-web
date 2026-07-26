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

  it('keeps plunder visible ahead of routine events in a busy month', () => {
    const logs: GameLog[] = Array.from({ length: 6 }, (_, index) => ({
      id: `routine-${index}`,
      kind: 'ai',
      message: `例行经营 ${index}`,
      turn: 1,
    }));
    logs.push({ id: 'plunder', kind: 'map', message: '张飞掠夺汉中。', turn: 1 });

    expect(summarizeMonth(logs)[0]).toBe('张飞掠夺汉中。');
  });

  it('keeps annual progression visible ahead of routine AI reports', () => {
    const logs: GameLog[] = Array.from({ length: 6 }, (_, index) => ({
      id: `routine-${index}`,
      kind: 'ai',
      message: `例行经营 ${index}`,
      turn: 12,
    }));
    logs.push({
      id: 'annual',
      kind: 'turn',
      message: '年度更新：人物年龄增长 1 岁；各地传来新人才出仕前的活动消息。',
      turn: 12,
    });

    expect(summarizeMonth(logs)[0]).toContain('年度更新');
  });

  it('reserves the first summary slot for annual progression in a critical month', () => {
    const annual: GameLog = {
      id: 'annual',
      kind: 'turn',
      message: '年度更新：人物年龄增长 1 岁。',
      turn: 12,
    };
    const critical: GameLog[] = Array.from({ length: 6 }, (_, index) => ({
      id: `battle-${index}`,
      kind: 'battle',
      message: `城池 ${index} 被占领。`,
      turn: 12,
    }));

    expect(summarizeMonth([...critical, annual])[0]).toBe(annual.message);
  });

  it('keeps diplomacy outcomes visible in the monthly report', () => {
    const diplomacy: GameLog = {
      id: 'diplomacy',
      kind: 'map',
      message: '荀彧成功离间张飞，其忠诚由 20 降至 16。',
      turn: 3,
    };
    const routine: GameLog[] = Array.from({ length: 6 }, (_, index) => ({
      id: `routine-${index}`,
      kind: 'ai',
      message: `例行经营 ${index}`,
      turn: 3,
    }));

    expect(summarizeMonth([...routine, diplomacy])).toContain(diplomacy.message);
  });

  it('recognizes a successful counterespionage report', () => {
    const counterespionage: GameLog = {
      id: 'counterespionage',
      kind: 'map',
      message: '策反成功：张飞在江州起兵自立，脱离刘备军。',
      turn: 3,
    };

    expect(summarizeMonth([counterespionage])).toEqual([counterespionage.message]);
  });

  it('prioritizes diplomacy results over competing mission announcements', () => {
    const critical: GameLog[] = Array.from({ length: 5 }, (_, index) => ({
      id: `battle-${index}`,
      kind: 'battle',
      message: `城池 ${index} 被占领。`,
      turn: 3,
    }));
    const announcements: GameLog[] = Array.from({ length: 3 }, (_, index) => ({
      id: `order-${index}`,
      kind: 'map',
      message: `武将 ${index} 奉命执行离间，预计下月回报。`,
      turn: 3,
    }));
    const result: GameLog = {
      id: 'result',
      kind: 'map',
      message: '侯成返回长安：对韩遂的离间失败。',
      turn: 3,
    };

    expect(summarizeMonth([...critical, ...announcements, result])).toEqual([
      result.message,
      ...critical.slice(0, 4).map((log) => log.message),
    ]);
  });
});
