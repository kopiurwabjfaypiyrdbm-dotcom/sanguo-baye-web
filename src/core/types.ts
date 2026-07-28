import type { CampaignRulesetId } from './rulesets';

export type CityType = 'capital' | 'city' | 'frontier';

export type AiProfile = 'balanced' | 'aggressive' | 'defensive';

export type LogKind = 'system' | 'turn' | 'battle' | 'ai' | 'map';

export type GamePhase = 'player' | 'ai' | 'succession' | 'ended';

export type GameOutcome = 'victory' | 'defeat';

export type OfficerStatus = 'serving' | 'free' | 'hidden' | 'captive' | 'dead';
export type CityCondition = 'normal' | 'famine' | 'drought' | 'flood' | 'rebellion';

export type LifecyclePolicy = {
  version: 1;
  ageGrowth: 'enabled' | 'disabled';
  /**
   * The fixed C source has this branch commented out. It remains opt-in so
   * campaigns can use it without presenting it as the only original rule.
   */
  naturalDeath: 'disabled' | 'age-90-coinflip';
  /** The vendored source initializer permits the rare no-escape battle death branch. */
  battleDeath: 'disabled' | 'baye-rare';
  /** Monthly escape is a documented modern continuity rule. */
  captiveEscape: 'disabled' | 'modern-monthly';
};

export type OfficerDeathCause = 'battle-death' | 'natural-death' | 'execution';
export type SuccessionReason = OfficerDeathCause | 'capture';

export type PendingSuccession = {
  version: 1;
  factionId: string;
  formerRulerOfficerId: string;
  candidateOfficerIds: string[];
  reason: SuccessionReason;
  createdTurn: number;
  createdYear: number;
  createdMonth: number;
  resumePhase: 'player' | 'ai';
  resumeActiveFactionId: string;
  /** Browser-interactive AI defense resumes after this faction-order index. */
  resumeAiFactionIndex?: number;
};

export type DeathRecord = {
  cause: OfficerDeathCause;
  turn: number;
  year: number;
  month: number;
  cityId?: string;
  responsibleFactionId?: string;
};

export type Faction = {
  id: string;
  name: string;
  rulerOfficerId: string;
  color: string;
  isPlayer: boolean;
  /** Empty cities and unaffiliated people use this non-playable bucket. */
  isNeutral?: boolean;
  aiProfile: AiProfile;
};

export type City = {
  id: string;
  sourceIndex?: number;
  name: string;
  x: number;
  y: number;
  type: CityType;
  region: string;
  ownerId: string;
  neighbors: string[];
  population: number;
  farming: number;
  commerce: number;
  defense: number;
  money: number;
  food: number;
  reserveTroops: number;
  satrapOfficerId?: string;
  farmingLimit?: number;
  commerceLimit?: number;
  populationLimit?: number;
  publicLoyalty?: number;
  disasterPrevention?: number;
  /** Persistent monthly condition; absent values from older saves mean normal. */
  condition?: CityCondition;
  /** Discovered items available for use in this city. */
  itemIds?: string[];
  /** Scenario items that may be revealed by search. */
  hiddenItemIds?: string[];
};

export type Item = {
  id: string;
  sourceId?: number;
  name: string;
  forceBonus: number;
  intelligenceBonus: number;
  moveBonus: number;
  armsTypeOverride?: string;
  /** Optional semantic replacement for the equipped unit's normal attack mask. */
  normalAttackPatternOverride?: 'orthogonal-adjacent' | 'adjacent-eight' | 'manhattan-ring-two';
  /** Optional annual appearance rule for scenario items not yet placed in a city. */
  appearanceYear?: number;
  appearanceCityId?: string;
};

export type ArmsType = {
  id: string;
  name: string;
  attackModifier: number;
  defenseModifier: number;
  mobility: number;
};

export type Officer = {
  id: string;
  sourceId?: number;
  name: string;
  force: number;
  intelligence: number;
  leadership: number;
  armsTypeId: string;
  /** Ordered Baye-compatible equipment slots. Original scenarios allow two arbitrary items. */
  equipmentItemIds?: string[];
  /** @deprecated schema-two migration input from the early three-slot prototype. */
  weaponItemId?: string;
  /** @deprecated schema-two migration input from the early three-slot prototype. */
  intelligenceItemId?: string;
  /** @deprecated schema-two migration input from the early three-slot prototype. */
  mountItemId?: string;
  status: OfficerStatus;
  factionId: string;
  /** Captives are neutral records held in a city owned by this faction. */
  captorFactionId?: string;
  /** Faction served immediately before capture; retained for logs and later diplomacy. */
  formerFactionId?: string;
  cityId?: string;
  troops: number;
  loyalty: number;
  age: number;
  stamina: number;
  level?: number;
  character?: number;
  experience?: number;
  /** Original scenario year in which a hidden officer becomes free. */
  appearanceYear?: number;
  /** Missing target means the original rule selects a deterministic random city. */
  appearanceCityId?: string;
  /** Dead officers remain as historical records and never re-enter city queues. */
  death?: DeathRecord;
};

export type GameLog = {
  id: string;
  kind: LogKind;
  message: string;
  turn: number;
};

export type CityIntelReport = {
  cityId: string;
  observedTurn: number;
  observedYear: number;
  observedMonth: number;
  population: number;
  money: number;
  food: number;
  reserveTroops: number;
  farming: number;
  commerce: number;
  defense: number;
  publicLoyalty?: number;
  satrapName?: string;
  /** Officer identities observed at the time of reconnaissance. */
  officerIds?: string[];
  officerCount: number;
  totalTroops: number;
};

export type StrategicOrderKind = 'move' | 'transport';

export type StrategicOrder = {
  id: string;
  kind: StrategicOrderKind;
  factionId: string;
  officerId: string;
  sourceCityId: string;
  targetCityId: string;
  routeCityIds: string[];
  createdTurn: number;
  createdYear: number;
  createdMonth: number;
  durationMonths: number;
  remainingMonths: number;
  cargo: {
    money: number;
    food: number;
    reserveTroops: number;
  };
};

export type DiplomaticOrderKind = 'alienate' | 'canvass' | 'counterespionage' | 'induce';

export type DiplomaticOrder = {
  id: string;
  kind: DiplomaticOrderKind;
  factionId: string;
  officerId: string;
  sourceCityId: string;
  targetOfficerId: string;
  targetFactionId: string;
  /** Target location when issued; used for intelligence evidence and invalidation logs. */
  targetCityId: string;
  createdTurn: number;
  createdYear: number;
  createdMonth: number;
  durationMonths: number;
  remainingMonths: number;
  moneyCost: number;
};

export type GameState = {
  schemaVersion: 6;
  rulesetId: CampaignRulesetId;
  scenario?: {
    id: string;
    source: 'sample' | 'baye-legacy';
    period?: number;
  };
  turn: number;
  phase: GamePhase;
  outcome?: GameOutcome;
  activeFactionId: string;
  factionOrder: string[];
  rngSeed: number;
  calendar: {
    year: number;
    month: number;
  };
  campaignStarted: boolean;
  lifecyclePolicy: LifecyclePolicy;
  /** Player succession is an explicit, saveable decision point. AI succession resolves immediately. */
  pendingSuccession?: PendingSuccession;
  playerFactionId: string;
  actedOfficerIds: string[];
  /** Active multi-month strategic orders. Their officers are serving but not stationed in a city. */
  strategicOrders: Record<string, StrategicOrder>;
  nextStrategicOrderSerial: number;
  /** Active multi-month diplomacy orders. Their executors are serving but temporarily away from a city. */
  diplomaticOrders: Record<string, DiplomaticOrder>;
  nextDiplomaticOrderSerial: number;
  /** Free officers whose whereabouts are known to the player. */
  discoveredOfficerIds: string[];
  /** Player intelligence snapshots keyed by target city id. */
  intelReports: Record<string, CityIntelReport>;
  factions: Record<string, Faction>;
  cities: Record<string, City>;
  officers: Record<string, Officer>;
  items: Record<string, Item>;
  armsTypes: Record<string, ArmsType>;
  logs: GameLog[];
};
