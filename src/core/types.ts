export type CityType = 'capital' | 'city' | 'frontier';

export type AiProfile = 'balanced' | 'aggressive' | 'defensive';

export type LogKind = 'system' | 'turn' | 'battle' | 'ai' | 'map';

export type GamePhase = 'player' | 'ai' | 'ended';

export type GameOutcome = 'victory' | 'defeat';

export type OfficerStatus = 'serving' | 'free' | 'hidden' | 'captive';

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
};

export type GameLog = {
  id: string;
  kind: LogKind;
  message: string;
  turn: number;
};

export type GameState = {
  schemaVersion: 2;
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
  playerFactionId: string;
  actedOfficerIds: string[];
  /** Free officers whose whereabouts are known to the player. */
  discoveredOfficerIds: string[];
  factions: Record<string, Faction>;
  cities: Record<string, City>;
  officers: Record<string, Officer>;
  items: Record<string, Item>;
  armsTypes: Record<string, ArmsType>;
  logs: GameLog[];
};
