import type { BayeLegacyPeriod } from '../compat/baye/legacyScenario';
import type { GameState } from '../core/types';
import bundledData from './generated/baye-periods.json';
import { createGameStateFromLegacyPeriod } from './legacyScenario';
import { DEFAULT_NEW_CAMPAIGN_RULESET, type CampaignRulesetId } from '../core/rulesets';

export type BundledPeriodId = 1 | 2 | 3 | 4;

export type ScenarioOption = {
  period: BundledPeriodId;
  title: string;
  year: number;
  description: string;
  rulerCount: number;
};

export type RulerOption = {
  sourceIndex: number;
  name: string;
  cityCount: number;
  officerCount: number;
};

const titles: Record<BundledPeriodId, string> = {
  1: '董卓弄权',
  2: '曹操崛起',
  3: '赤壁之战',
  4: '三国鼎立',
};

const descriptions: Record<BundledPeriodId, string> = {
  1: '群雄并起，天下格局尚未定型。',
  2: '诸侯兼并加速，中原霸主逐渐崛起。',
  3: '北方一统，孙刘联盟迎战强敌。',
  4: '魏蜀吴鼎立，争夺天下最后归属。',
};

const periods = (bundledData.periods as unknown as BayeLegacyPeriod[]);

export function getScenarioOptions(): ScenarioOption[] {
  return periods.map((period) => ({
    period: period.period,
    title: titles[period.period],
    year: period.year,
    description: descriptions[period.period],
    rulerCount: activeRulerIndexes(period).length,
  }));
}

export function getScenarioRulers(periodId: BundledPeriodId): RulerOption[] {
  const period = getPeriod(periodId);
  return activeRulerIndexes(period).map((sourceIndex) => ({
    sourceIndex,
    name: period.persons[sourceIndex].name,
    cityCount: period.cities.filter((city) => city.rulerIndex === sourceIndex).length,
    officerCount: period.persons.filter((person) => person.rulerIndex === sourceIndex).length,
  }));
}

export function createBundledScenario(
  periodId: BundledPeriodId,
  rulerSourceIndex: number,
  rulesetId: CampaignRulesetId = DEFAULT_NEW_CAMPAIGN_RULESET,
): GameState {
  return createGameStateFromLegacyPeriod(getPeriod(periodId), rulerSourceIndex, rulesetId);
}

function getPeriod(periodId: BundledPeriodId): BayeLegacyPeriod {
  const period = periods.find((candidate) => candidate.period === periodId);
  if (!period) throw new Error(`Bundled period is missing: ${periodId}`);
  return structuredClone(period);
}

function activeRulerIndexes(period: BayeLegacyPeriod): number[] {
  return [...new Set(period.cities.flatMap((city) => city.rulerIndex ?? []))];
}
