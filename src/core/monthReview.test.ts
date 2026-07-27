import { describe, expect, it } from 'vitest';
import { createSampleState } from './sampleState';
import { buildMonthAdvanceReview, buildMonthResolutionReport } from './monthReview';
import type { GameLog } from './types';

describe('month-end review', () => {
  it('derives current actions and remaining usable officers without mutating state', () => {
    const state = createSampleState();
    state.actedOfficerIds = ['cao-cao'];
    state.logs.push({ id: 'action', kind: 'map', turn: state.turn, message: '曹操在洛阳主持开垦。' });
    const before = structuredClone(state);

    const review = buildMonthAdvanceReview(state);

    expect(review.actedOfficerCount).toBe(1);
    expect(review.availableOfficerCount).toBe(3);
    expect(review.actions).toEqual(['曹操在洛阳主持开垦。']);
    expect(review.notices).toContainEqual(expect.objectContaining({ id: 'available-officers', tone: 'info' }));
    expect(state).toEqual(before);
  });

  it('counts unspent monthly actions even when a zero-stamina command may be the only option', () => {
    const state = createSampleState();
    for (const officer of Object.values(state.officers)) {
      if (officer.factionId === state.playerFactionId) officer.stamina = 0;
    }

    const review = buildMonthAdvanceReview(state);

    expect(review.availableOfficerCount).toBe(4);
    expect(review.notices[0].title).toBe('尚有 4 名驻城武将未行动');
  });

  it('flags empty, starving, vulnerable, and disaster-struck holdings from current evidence', () => {
    const state = createSampleState();
    for (const officer of Object.values(state.officers)) {
      if (officer.cityId === 'chang-an' && officer.status === 'serving') officer.cityId = 'luoyang';
    }
    state.cities['chang-an'].reserveTroops = 100;
    state.cities['chang-an'].food = 0;
    state.cities['chang-an'].condition = 'drought';

    const review = buildMonthAdvanceReview(state);

    expect(review.notices).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'empty-chang-an', tone: 'critical', cityId: 'chang-an' }),
      expect.objectContaining({ id: 'food-chang-an', tone: 'critical', cityId: 'chang-an' }),
      expect.objectContaining({ id: 'border-chang-an', tone: 'warning', cityId: 'chang-an' }),
      expect.objectContaining({ id: 'condition-chang-an', tone: 'warning', cityId: 'chang-an' }),
    ]));
  });

  it('reports active strategic and diplomatic orders as pending month work', () => {
    const state = createSampleState();
    state.strategicOrders.move = {
      id: 'move', kind: 'move', factionId: state.playerFactionId, officerId: 'cao-cao',
      sourceCityId: 'luoyang', targetCityId: 'chang-an', routeCityIds: ['luoyang', 'chang-an'],
      createdTurn: 1, createdYear: 190, createdMonth: 1, durationMonths: 1, remainingMonths: 1,
      cargo: { money: 0, food: 0, reserveTroops: 0 },
    };
    state.diplomaticOrders.plot = {
      id: 'plot', kind: 'alienate', factionId: state.playerFactionId, officerId: 'xun-yu',
      sourceCityId: 'xuchang', targetOfficerId: 'guan-yu', targetFactionId: 'liu-bei', targetCityId: 'hanzhong',
      createdTurn: 1, createdYear: 190, createdMonth: 1, durationMonths: 1, remainingMonths: 1, moneyCost: 100,
    };

    const review = buildMonthAdvanceReview(state);

    expect(review.strategicOrderCount).toBe(1);
    expect(review.diplomaticOrderCount).toBe(1);
    expect(review.notices).toContainEqual(expect.objectContaining({ id: 'active-orders' }));
  });
});

describe('month resolution report', () => {
  it('groups important and ordinary events and links known city references', () => {
    const state = createSampleState();
    state.calendar = { year: 191, month: 1 };
    const logs: GameLog[] = [
      { id: 'annual', kind: 'turn', turn: 2, message: '年度更新：人物年龄增长 1 岁。' },
      { id: 'battle', kind: 'battle', turn: 2, message: '曹操军占领汉中。' },
      { id: 'diplomacy', kind: 'map', turn: 2, message: '荀彧成功离间关羽。' },
      { id: 'ai', kind: 'ai', turn: 2, message: '刘备军完成例行经营。' },
      { id: 'turn', kind: 'turn', turn: 2, message: '进入 191 年 1 月。' },
    ];

    const report = buildMonthResolutionReport(logs, state);

    expect(report.headline[0]).toContain('年度更新');
    expect(report.groups.map((group) => group.category)).toEqual(['annual', 'battle', 'diplomacy', 'ai', 'other']);
    expect(report.groups.find((group) => group.category === 'battle')?.items[0].cityId).toBe('hanzhong');
    expect(report.totalEvents).toBe(logs.length);
  });

  it('produces a quiet-month headline while retaining an empty detail set', () => {
    const state = createSampleState();
    const report = buildMonthResolutionReport([], state);

    expect(report.headline).toEqual(['各势力本月没有发生重大事件。']);
    expect(report.groups).toEqual([]);
    expect(report.totalEvents).toBe(0);
  });

  it('links an unambiguous single-character city without matching arbitrary text', () => {
    const state = createSampleState();
    state.cities.luoyang.name = '吴';
    const report = buildMonthResolutionReport([
      { id: 'city', kind: 'battle', turn: 2, message: '吴被孙坚军占领。' },
      { id: 'noise', kind: 'turn', turn: 2, message: '武将完成体力恢复。' },
    ], state);

    expect(report.groups.find((group) => group.category === 'battle')?.items[0].cityId).toBe('luoyang');
    expect(report.groups.find((group) => group.category === 'city')?.items[0].cityId).toBeUndefined();
  });
});
