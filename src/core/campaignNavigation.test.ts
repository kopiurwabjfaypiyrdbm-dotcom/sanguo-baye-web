import { describe, expect, it } from 'vitest';
import { buildCityBrowserEntries, buildOfficerBrowserEntries } from './campaignNavigation';
import { createSampleState } from './sampleState';

describe('campaign navigation selectors', () => {
  it('shows current owned-city data but hides live enemy resources without reconnaissance', () => {
    const state = createSampleState();
    const entries = buildCityBrowserEntries(state);
    const owned = entries.find((entry) => entry.id === 'luoyang')!;
    const enemy = entries.find((entry) => entry.id === 'hanzhong')!;

    expect(owned).toMatchObject({ knowledge: 'current', money: state.cities.luoyang.money });
    expect(enemy).toMatchObject({ knowledge: 'public', ownerName: '刘备军' });
    expect(enemy.money).toBeUndefined();
    expect(enemy.officerCount).toBeUndefined();
  });

  it('uses the saved intelligence snapshot instead of leaking changed live city data', () => {
    const state = createSampleState();
    state.intelReports.hanzhong = {
      cityId: 'hanzhong', observedTurn: 1, observedYear: 190, observedMonth: 1,
      population: 30, money: 123, food: 456, reserveTroops: 78,
      farming: 10, commerce: 20, defense: 30, officerIds: ['guan-yu'], officerCount: 1, totalTroops: 6200,
    };
    state.cities.hanzhong.money = 9999;

    const entry = buildCityBrowserEntries(state).find((candidate) => candidate.id === 'hanzhong')!;

    expect(entry).toMatchObject({ knowledge: 'report', money: 123, food: 456, reserveTroops: 78 });
  });

  it('lists own, discovered, captive, and scouted officers without exposing unscouted enemies', () => {
    const state = createSampleState();
    state.discoveredOfficerIds = ['chen-gong'];
    state.officers['zhang-fei'] = {
      ...state.officers['zhang-fei'], status: 'captive', factionId: 'neutral', captorFactionId: 'cao-cao', cityId: 'luoyang',
    };
    state.intelReports.hanzhong = {
      cityId: 'hanzhong', observedTurn: 1, observedYear: 190, observedMonth: 1,
      population: 30, money: 123, food: 456, reserveTroops: 78,
      farming: 10, commerce: 20, defense: 30, officerIds: ['guan-yu'], officerCount: 1, totalTroops: 6200,
    };

    const entries = buildOfficerBrowserEntries(state);

    expect(entries.map((entry) => entry.id)).toEqual(expect.arrayContaining(['cao-cao', 'chen-gong', 'zhang-fei', 'guan-yu']));
    expect(entries.find((entry) => entry.id === 'guan-yu')).toMatchObject({ group: 'intel', cityId: 'hanzhong' });
    expect(entries.some((entry) => entry.id === 'liu-bei')).toBe(false);
  });

  it('keeps scouted officer location tied to the report after live movement', () => {
    const state = createSampleState();
    state.intelReports.hanzhong = {
      cityId: 'hanzhong', observedTurn: 1, observedYear: 190, observedMonth: 1,
      population: 30, money: 123, food: 456, reserveTroops: 78,
      farming: 10, commerce: 20, defense: 30, officerIds: ['guan-yu'], officerCount: 1, totalTroops: 6200,
    };
    state.officers['guan-yu'].cityId = 'chengdu';

    expect(buildOfficerBrowserEntries(state).find((entry) => entry.id === 'guan-yu')).toMatchObject({
      cityId: 'hanzhong', cityName: '汉中', observedLabel: '190 年 1 月所见',
    });
  });
});
