export type CityType = 'capital' | 'city' | 'frontier';

export type AiProfile = 'balanced' | 'aggressive' | 'defensive';

export type LogKind = 'system' | 'turn' | 'battle' | 'ai' | 'map';

export type Faction = {
  id: string;
  name: string;
  rulerOfficerId: string;
  color: string;
  isPlayer: boolean;
  aiProfile: AiProfile;
};

export type City = {
  id: string;
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
};

export type Item = {
  id: string;
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
  armsType: string;
  weapon?: string;
  intelligenceItem?: string;
  mount?: string;
  factionId: string;
  cityId: string;
  troops: number;
  loyalty: number;
  age: number;
  stamina: number;
};

export type GameLog = {
  id: string;
  kind: LogKind;
  message: string;
  turn: number;
};

export type GameState = {
  calendar: {
    year: number;
    month: number;
  };
  playerFactionId: string;
  factions: Record<string, Faction>;
  cities: Record<string, City>;
  officers: Record<string, Officer>;
  items: Record<string, Item>;
  armsTypes: Record<string, ArmsType>;
  logs: GameLog[];
};
