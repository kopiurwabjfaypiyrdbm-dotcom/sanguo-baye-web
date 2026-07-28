export type CampaignRulesetId = 'baye-classic-v1' | 'modern-balanced-v1';

export type CampaignCommandKind =
  | 'develop'
  | 'search'
  | 'govern'
  | 'inspect'
  | 'surrender'
  | 'reward-item'
  | 'move'
  | 'trade'
  | 'banquet'
  | 'transport'
  | 'alienate'
  | 'canvass'
  | 'counterespionage'
  | 'induce'
  | 'reconnoitre'
  | 'recruit-troops'
  | 'plunder'
  | 'battle';

export type CampaignCommandCost = {
  stamina: number;
  money: number;
};

export type CampaignRuleset = {
  id: CampaignRulesetId;
  label: string;
  description: string;
  startingTroops: number;
  satrapPolicy: 'baye-auto' | 'manual-persistent';
  commandCosts: Record<CampaignCommandKind, CampaignCommandCost>;
};

export const DEFAULT_NEW_CAMPAIGN_RULESET: CampaignRulesetId = 'baye-classic-v1';
export const LEGACY_SAVE_RULESET: CampaignRulesetId = 'modern-balanced-v1';

const bayeClassic: CampaignRuleset = {
  id: 'baye-classic-v1',
  label: '经典校准',
  description: '采用固定版 C 源码已确认的开局兵力、命令消耗与自动太守规则。',
  startingTroops: 100,
  satrapPolicy: 'baye-auto',
  commandCosts: {
    develop: { stamina: 8, money: 50 },
    search: { stamina: 8, money: 0 },
    govern: { stamina: 8, money: 50 },
    inspect: { stamina: 8, money: 50 },
    surrender: { stamina: 15, money: 100 },
    'reward-item': { stamina: 0, money: 0 },
    move: { stamina: 0, money: 0 },
    trade: { stamina: 12, money: 0 },
    banquet: { stamina: 0, money: 100 },
    transport: { stamina: 8, money: 0 },
    alienate: { stamina: 20, money: 50 },
    canvass: { stamina: 20, money: 50 },
    counterespionage: { stamina: 20, money: 50 },
    induce: { stamina: 10, money: 50 },
    reconnoitre: { stamina: 10, money: 20 },
    // The money component is variable and remains calculated from recruited troops.
    'recruit-troops': { stamina: 12, money: 0 },
    plunder: { stamina: 20, money: 0 },
    battle: { stamina: 0, money: 0 },
  },
};

const modernBalanced: CampaignRuleset = {
  id: 'modern-balanced-v1',
  label: '现代平衡',
  description: '保留 v0.8 及更早存档使用的宽松行动消耗和手动太守规则。',
  startingTroops: 400,
  satrapPolicy: 'manual-persistent',
  commandCosts: {
    develop: { stamina: 8, money: 50 },
    search: { stamina: 8, money: 0 },
    govern: { stamina: 4, money: 50 },
    inspect: { stamina: 4, money: 50 },
    surrender: { stamina: 4, money: 0 },
    'reward-item': { stamina: 0, money: 0 },
    move: { stamina: 4, money: 0 },
    trade: { stamina: 4, money: 0 },
    banquet: { stamina: 0, money: 50 },
    transport: { stamina: 4, money: 0 },
    alienate: { stamina: 4, money: 50 },
    canvass: { stamina: 4, money: 50 },
    counterespionage: { stamina: 4, money: 50 },
    induce: { stamina: 4, money: 50 },
    reconnoitre: { stamina: 4, money: 50 },
    'recruit-troops': { stamina: 12, money: 0 },
    plunder: { stamina: 4, money: 0 },
    battle: { stamina: 0, money: 0 },
  },
};

export const CAMPAIGN_RULESETS: Readonly<Record<CampaignRulesetId, CampaignRuleset>> = {
  'baye-classic-v1': bayeClassic,
  'modern-balanced-v1': modernBalanced,
};

export function isCampaignRulesetId(value: unknown): value is CampaignRulesetId {
  return value === 'baye-classic-v1' || value === 'modern-balanced-v1';
}

export function getCampaignRuleset(id: CampaignRulesetId): CampaignRuleset {
  return CAMPAIGN_RULESETS[id];
}

export function getCampaignCommandCost(
  rulesetId: CampaignRulesetId,
  command: CampaignCommandKind,
): CampaignCommandCost {
  return CAMPAIGN_RULESETS[rulesetId].commandCosts[command];
}
