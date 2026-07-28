import type { GameState } from './types';

export type CityBrowserEntry = {
  id: string;
  name: string;
  ownerName: string;
  isOwned: boolean;
  knowledge: 'current' | 'report' | 'public';
  officerCount?: number;
  money?: number;
  food?: number;
  reserveTroops?: number;
  observedLabel?: string;
};

export type OfficerBrowserEntry = {
  id: string;
  name: string;
  group: 'serving' | 'free' | 'captive' | 'intel';
  statusLabel: string;
  cityId?: string;
  cityName: string;
  acted?: boolean;
  stamina?: number;
  troops?: number;
  observedLabel?: string;
};

export function buildCityBrowserEntries(state: GameState): CityBrowserEntry[] {
  return Object.values(state.cities)
    .map((city): CityBrowserEntry => {
      const ownerName = state.factions[city.ownerId]?.name ?? '未知势力';
      if (city.ownerId === state.playerFactionId) {
        return {
          id: city.id,
          name: city.name,
          ownerName,
          isOwned: true,
          knowledge: 'current',
          officerCount: Object.values(state.officers).filter((officer) =>
            officer.status === 'serving' && officer.cityId === city.id && officer.factionId === state.playerFactionId).length,
          money: city.money,
          food: city.food,
          reserveTroops: city.reserveTroops,
        };
      }
      const report = state.intelReports[city.id];
      if (report) {
        return {
          id: city.id,
          name: city.name,
          ownerName,
          isOwned: false,
          knowledge: 'report',
          officerCount: report.officerCount,
          money: report.money,
          food: report.food,
          reserveTroops: report.reserveTroops,
          observedLabel: `${report.observedYear} 年 ${report.observedMonth} 月情报`,
        };
      }
      return { id: city.id, name: city.name, ownerName, isOwned: false, knowledge: 'public' };
    })
    .sort((a, b) => Number(b.isOwned) - Number(a.isOwned) || a.name.localeCompare(b.name, 'zh-Hans-CN'));
}

export function buildOfficerBrowserEntries(state: GameState): OfficerBrowserEntry[] {
  const entries = new Map<string, OfficerBrowserEntry>();
  for (const officer of Object.values(state.officers)) {
    if (officer.status === 'serving' && officer.factionId === state.playerFactionId) {
      entries.set(officer.id, {
        id: officer.id,
        name: officer.name,
        group: 'serving',
        statusLabel: officer.cityId ? '在职' : '在途',
        cityId: officer.cityId,
        cityName: officer.cityId ? state.cities[officer.cityId]?.name ?? '未知城市' : describeOfficerOrder(state, officer.id),
        acted: state.actedOfficerIds.includes(officer.id),
        stamina: officer.stamina,
        troops: officer.troops,
      });
    } else if (officer.status === 'free' && state.discoveredOfficerIds.includes(officer.id)) {
      entries.set(officer.id, {
        id: officer.id,
        name: officer.name,
        group: 'free',
        statusLabel: '已发现人才',
        cityId: officer.cityId,
        cityName: officer.cityId ? state.cities[officer.cityId]?.name ?? '未知城市' : '行踪不明',
      });
    } else if (officer.status === 'captive' && officer.captorFactionId === state.playerFactionId) {
      entries.set(officer.id, {
        id: officer.id,
        name: officer.name,
        group: 'captive',
        statusLabel: '本方俘虏',
        cityId: officer.cityId,
        cityName: officer.cityId ? state.cities[officer.cityId]?.name ?? '未知城市' : '押送中',
        stamina: officer.stamina,
        troops: officer.troops,
      });
    }
  }

  const reports = Object.values(state.intelReports)
    .sort((a, b) => b.observedTurn - a.observedTurn || a.cityId.localeCompare(b.cityId));
  for (const report of reports) {
    for (const officerId of report.officerIds ?? []) {
      if (entries.has(officerId)) continue;
      const officer = state.officers[officerId];
      if (!officer || officer.status === 'hidden' || officer.status === 'dead') continue;
      entries.set(officerId, {
        id: officer.id,
        name: officer.name,
        group: 'intel',
        statusLabel: '情报人物',
        cityId: report.cityId,
        cityName: state.cities[report.cityId]?.name ?? '未知城市',
        observedLabel: `${report.observedYear} 年 ${report.observedMonth} 月所见`,
      });
    }
  }

  const groupOrder: OfficerBrowserEntry['group'][] = ['serving', 'free', 'captive', 'intel'];
  return [...entries.values()].sort((a, b) =>
    groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group)
    || a.name.localeCompare(b.name, 'zh-Hans-CN'));
}

function describeOfficerOrder(state: GameState, officerId: string): string {
  const strategic = Object.values(state.strategicOrders).find((order) => order.officerId === officerId);
  if (strategic) return `前往${state.cities[strategic.targetCityId]?.name ?? '目标城池'}`;
  const diplomacy = Object.values(state.diplomaticOrders).find((order) => order.officerId === officerId);
  if (diplomacy) return `谋略中 · ${diplomacy.remainingMonths} 月`;
  return '在途';
}
