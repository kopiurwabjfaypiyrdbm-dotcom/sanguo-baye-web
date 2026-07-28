import { calculateCityGrowth, getSupportedOfficerIdsByCity } from './economy';
import { summarizeMonth } from './monthSummary';
import type { GameLog, GameState } from './types';

export type MonthReviewTone = 'info' | 'warning' | 'critical';

export type MonthReviewNotice = {
  id: string;
  tone: MonthReviewTone;
  title: string;
  detail: string;
  cityId?: string;
};

export type MonthAdvanceReview = {
  year: number;
  month: number;
  actedOfficerCount: number;
  availableOfficerCount: number;
  playerCityCount: number;
  actions: string[];
  notices: MonthReviewNotice[];
  strategicOrderCount: number;
  diplomaticOrderCount: number;
};

export type MonthReportCategory =
  | 'annual'
  | 'battle'
  | 'diplomacy'
  | 'logistics'
  | 'city'
  | 'lifecycle'
  | 'ai'
  | 'other';

export type MonthReportItem = {
  id: string;
  message: string;
  cityId?: string;
};

export type MonthReportGroup = {
  category: MonthReportCategory;
  label: string;
  items: MonthReportItem[];
};

export type MonthResolutionReport = {
  year: number;
  month: number;
  headline: string[];
  groups: MonthReportGroup[];
  totalEvents: number;
};

const VULNERABLE_GARRISON = 500;

export function buildMonthAdvanceReview(state: GameState): MonthAdvanceReview {
  const playerCities = Object.values(state.cities)
    .filter((city) => city.ownerId === state.playerFactionId)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  const servingOfficers = Object.values(state.officers).filter((officer) =>
    officer.status === 'serving' && officer.factionId === state.playerFactionId && Boolean(officer.cityId));
  const availableOfficers = servingOfficers.filter((officer) =>
    !state.actedOfficerIds.includes(officer.id));
  const supportedOfficerIds = getSupportedOfficerIdsByCity(state);
  const nextCalendar = state.calendar.month === 12
    ? { year: state.calendar.year + 1, month: 1 }
    : { year: state.calendar.year, month: state.calendar.month + 1 };
  const notices: MonthReviewNotice[] = [];

  if (availableOfficers.length > 0) {
    notices.push({
      id: 'available-officers',
      tone: 'info',
      title: `尚有 ${availableOfficers.length} 名驻城武将未行动`,
      detail: '结束本月后，本月未使用的行动机会不会保留。',
    });
  }

  for (const city of playerCities) {
    const stationed = servingOfficers.filter((officer) => officer.cityId === city.id);
    if (stationed.length === 0) {
      notices.push({
        id: `empty-${city.id}`,
        tone: 'critical',
        title: `${city.name}没有驻城武将`,
        detail: '空城无法执行命令，且受到进攻时没有武将部队守备。',
        cityId: city.id,
      });
    }

    const supportedOfficers = (supportedOfficerIds.get(city.id) ?? [])
      .map((officerId) => state.officers[officerId])
      .filter((officer) => officer?.factionId === state.playerFactionId);
    const supportedTroops = supportedOfficers.reduce((sum, officer) => sum + officer.troops, 0);
    const forecastTroops = supportedOfficers.reduce((sum, officer) => {
      if (officer.cityId !== city.id) return sum + officer.troops;
      if (city.condition === 'drought' || city.condition === 'flood') return sum + officer.troops - Math.floor(officer.troops / 4);
      if (city.condition === 'rebellion') return sum + Math.floor(officer.troops / 2);
      return sum + officer.troops;
    }, 0);
    const growth = calculateCityGrowth(city, nextCalendar, forecastTroops);
    const availableFood = city.food + growth.food;
    if (availableFood <= growth.upkeep) {
      notices.push({
        id: `food-${city.id}`,
        tone: 'critical',
        title: `${city.name}预计粮草不足`,
        detail: `按当前驻军估算，下月可用粮 ${availableFood}、军粮消耗 ${growth.upkeep}；若局势不变，驻军与受该城支持的在途部队会减员。`,
        cityId: city.id,
      });
    }

    const hostileBorder = city.neighbors.some((neighborId) => {
      const neighbor = state.cities[neighborId];
      return neighbor && neighbor.ownerId !== state.playerFactionId && !state.factions[neighbor.ownerId]?.isNeutral;
    });
    if (hostileBorder && supportedTroops + city.reserveTroops < VULNERABLE_GARRISON) {
      notices.push({
        id: `border-${city.id}`,
        tone: 'warning',
        title: `${city.name}边境守备薄弱`,
        detail: `现有驻军与后备兵合计 ${supportedTroops + city.reserveTroops}；敌军是否进攻仍取决于其月度决策。`,
        cityId: city.id,
      });
    }

    if (city.condition && city.condition !== 'normal') {
      const labels = { famine: '饥荒', drought: '旱灾', flood: '水灾', rebellion: '暴动' } as const;
      notices.push({
        id: `condition-${city.id}`,
        tone: 'warning',
        title: `${city.name}仍处于${labels[city.condition]}`,
        detail: '月末将继续按现有规则结算影响；能否自然恢复取决于当前城市状态。',
        cityId: city.id,
      });
    }
  }

  const strategicOrderCount = Object.values(state.strategicOrders)
    .filter((order) => order.factionId === state.playerFactionId).length;
  const diplomaticOrderCount = Object.values(state.diplomaticOrders)
    .filter((order) => order.factionId === state.playerFactionId).length;
  if (strategicOrderCount + diplomaticOrderCount > 0) {
    notices.push({
      id: 'active-orders',
      tone: 'info',
      title: `${strategicOrderCount + diplomaticOrderCount} 项命令将在月末推进`,
      detail: `含 ${strategicOrderCount} 项调动或输送、${diplomaticOrderCount} 项谋略；到期命令将按既有确定性规则结算。`,
    });
  }

  const actions = state.logs
    .filter((log) => log.turn === state.turn && (log.kind === 'map' || log.kind === 'battle'))
    .slice(-6)
    .map((log) => log.message);

  return {
    year: state.calendar.year,
    month: state.calendar.month,
    actedOfficerCount: state.actedOfficerIds.filter((officerId) => state.officers[officerId]?.factionId === state.playerFactionId).length,
    availableOfficerCount: availableOfficers.length,
    playerCityCount: playerCities.length,
    actions,
    notices,
    strategicOrderCount,
    diplomaticOrderCount,
  };
}

const GROUP_LABELS: Record<MonthReportCategory, string> = {
  annual: '年度与登场',
  battle: '战事',
  diplomacy: '谋略与外交',
  logistics: '调动与补给',
  city: '城市与灾情',
  lifecycle: '人物与继承',
  ai: '诸侯行动',
  other: '其他结算',
};

const GROUP_ORDER: MonthReportCategory[] = [
  'annual', 'battle', 'diplomacy', 'lifecycle', 'logistics', 'city', 'ai', 'other',
];

export function buildMonthResolutionReport(logs: GameLog[], state: GameState): MonthResolutionReport {
  const grouped = new Map<MonthReportCategory, MonthReportItem[]>();
  for (const log of logs) {
    const category = classifyMonthLog(log);
    grouped.set(category, [...(grouped.get(category) ?? []), {
      id: log.id,
      message: log.message,
      cityId: findReferencedCityId(log.message, state),
    }]);
  }
  const groups = GROUP_ORDER
    .filter((category) => (grouped.get(category)?.length ?? 0) > 0)
    .map((category) => ({ category, label: GROUP_LABELS[category], items: grouped.get(category)! }));
  return {
    year: state.calendar.year,
    month: state.calendar.month,
    headline: summarizeMonth(logs),
    groups,
    totalEvents: logs.length,
  };
}

function classifyMonthLog(log: GameLog): MonthReportCategory {
  const message = log.message;
  if (message.startsWith('年度更新：') || message.includes('登场')) return 'annual';
  if (log.kind === 'battle' || ['攻陷', '占领', '击退', '守城', '战斗'].some((keyword) => message.includes(keyword))) return 'battle';
  if (['离间', '招揽', '策反', '劝降', '谋略'].some((keyword) => message.includes(keyword))) return 'diplomacy';
  if (['病逝', '战死', '处斩', '继任', '新君', '势力瓦解', '逃离囚禁'].some((keyword) => message.includes(keyword))) return 'lifecycle';
  if (['输送', '抵达', '粮草不足', '目标易主', '流落', '在途'].some((keyword) => message.includes(keyword))) return 'logistics';
  if (['饥荒', '旱灾', '水灾', '暴动', '灾害', '恢复', '税收', '收获'].some((keyword) => message.includes(keyword))) return 'city';
  if (log.kind === 'ai') return 'ai';
  return 'other';
}

function findReferencedCityId(message: string, state: GameState): string | undefined {
  return Object.values(state.cities)
    .filter((city) => city.name.length > 1 ? message.includes(city.name) : singleCharacterCityAppears(message, city.name))
    .sort((a, b) => b.name.length - a.name.length || a.id.localeCompare(b.id))[0]?.id;
}

function singleCharacterCityAppears(message: string, cityName: string): boolean {
  return [
    `${cityName}被`, `${cityName}发生`, `${cityName}恢复`, `${cityName}粮草`,
    `向${cityName}`, `从${cityName}`, `在${cityName}`, `至${cityName}`,
    `占领${cityName}`, `攻陷${cityName}`, `抵达${cityName}`, `治理${cityName}`,
  ].some((pattern) => message.includes(pattern));
}
