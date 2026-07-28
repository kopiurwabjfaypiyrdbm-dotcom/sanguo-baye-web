import {
  BAYE_ARMS_TYPES,
  buildBayeAttackAttributes,
  countBayeAttackDamage,
  getModernTerrainShift,
  type BayeArmsType,
  type BayeTerrain,
} from '../compat/baye/tacticalBattle';
import {
  createBattleStateGuard,
  createBattleId,
  validateAttackOrder,
  type AttackOrder,
  type BattleResult,
  type BattleStateGuard,
} from './battle';
import type { GameState, Officer } from './types';
import { getEffectiveOfficerAttributes, getOfficerEquipment } from './equipment';
import { nextRandom } from './random';
import { calculateBayeBattleExperience, calculateBayeSkillPoints } from '../compat/baye/tacticalGrowth';
import {
  BAYE_TACTICAL_STATUS_LABELS,
  bayeStatusAllowsSkill,
  bayeStatusSkipsAction,
  getBayeStatusMobility,
  getBayeStoneArrayLoss,
  getModernAttackRange,
  isBayeNormalAttackOffset,
  isBayeNormalAttackPatternOffset,
  getModernTerrainMoveCost,
  shouldRecoverBayeStatus,
  type BayeTacticalStatus,
  type BayeNormalAttackShape,
} from '../compat/baye/tacticalState';

export type TacticalSide = 'attacker' | 'defender';
export type TacticalBattleStatus = 'ongoing' | 'attacker-won' | 'defender-won';
export type TacticalVictoryReason =
  | 'annihilation'
  | 'attacker-commander-defeated'
  | 'defender-commander-defeated'
  | 'objective-held'
  | 'attacker-food-exhausted'
  | 'defender-food-exhausted'
  | 'day-limit'
  | 'attacker-retreated'
  | 'defender-retreated';
export type TacticalApproach = 'east' | 'west' | 'north' | 'south';
export type TacticalWeather = 'fine' | 'cloudy' | 'wind' | 'rain' | 'hail';
export type TacticalUnitStatus = BayeTacticalStatus;
export type TacticalSkillId =
  | 'fire'
  | 'confuse'
  | 'rally'
  | 'silence'
  | 'root'
  | 'qimen'
  | 'dunjia'
  | 'stone-array'
  | 'hide'
  | 'raid-provisions';
export type TacticalSkillTarget = 'enemy' | 'ally';
export type TacticalSkillEffect = 'troop-damage' | 'troop-recovery' | 'status' | 'food-damage';
export type TacticalBattlefieldTemplate =
  | 'river-crossing'
  | 'highland-pass'
  | 'forest-road'
  | 'twin-villages'
  | 'open-plain'
  | 'marsh-fords'
  | 'fortified-basin';

export type TacticalSkillDefinition = {
  id: TacticalSkillId;
  name: string;
  target: TacticalSkillTarget;
  range: number;
  rangeShape: 'diamond' | 'cross';
  cost: number;
  minimumIntelligence: number;
  description: string;
  effect: TacticalSkillEffect;
  basePower: number;
  appliesStatus?: TacticalUnitStatus;
  clearsStatus?: boolean;
  weatherPower: Record<TacticalWeather, number>;
  terrainPower: readonly number[];
  armsPower: readonly number[];
};

export type TacticalTile = {
  x: number;
  y: number;
  terrain: BayeTerrain;
  objective?: 'city';
};

export type TacticalUnit = {
  id: string;
  officerId?: string;
  name: string;
  factionId: string;
  side: TacticalSide;
  x: number;
  y: number;
  force: number;
  intelligence: number;
  level: number;
  armsType: BayeArmsType;
  normalAttackPatternOverride?: BayeNormalAttackShape;
  mobility: number;
  originalTroops: number;
  troops: number;
  skillPoints: number;
  maxSkillPoints: number;
  status: TacticalUnitStatus;
  statusTurns: number;
  moved: boolean;
  acted: boolean;
};

export type TacticalBattleState = {
  schemaVersion: 1;
  id: string;
  strategicTurn: number;
  seedBefore: number;
  rngSeed: number;
  sourceCityId: string;
  targetCityId: string;
  attackerFactionId: string;
  defenderFactionId: string;
  attackerOfficerIds: string[];
  defenderOfficerIds: string[];
  provisionsCommitted: number;
  attackerFood: number;
  defenderFood: number;
  width: number;
  height: number;
  day: number;
  maxDays: number;
  weather: TacticalWeather;
  activeSide: TacticalSide;
  status: TacticalBattleStatus;
  victoryReason?: TacticalVictoryReason;
  approach: TacticalApproach;
  battlefieldVersion: 1;
  battlefieldKey: string;
  battlefieldTemplate: TacticalBattlefieldTemplate;
  tiles: TacticalTile[];
  units: Record<string, TacticalUnit>;
  commanderUnitIds: Partial<Record<TacticalSide, string>>;
  experienceGains: Record<string, number>;
  guard: BattleStateGuard;
  logs: string[];
};

export type TacticalPosition = { x: number; y: number };

export type TacticalAttackPreview = {
  damage: number;
  targetTroopsAfter: number;
  attackerTerrain: BayeTerrain;
  defenderTerrain: BayeTerrain;
  attackerTerrainShift: number;
  defenderTerrainShift: number;
};

export type TacticalSkillPreview = {
  skill: TacticalSkillDefinition;
  successChance: number;
  expectedTroopChange: number;
  expectedFoodChange: number;
  resultingStatus?: TacticalUnitStatus;
  weatherMultiplier: number;
  terrainMultiplier: number;
  armsMultiplier: number;
};

const DEFAULT_WIDTH = 12;
const DEFAULT_HEIGHT = 8;
const DEFAULT_MAX_DAYS = 30;
const BATTLEFIELD_TEMPLATES: readonly TacticalBattlefieldTemplate[] = [
  'river-crossing',
  'highland-pass',
  'forest-road',
  'twin-villages',
  'open-plain',
  'marsh-fords',
  'fortified-basin',
];
export const TACTICAL_SIDE_UNIT_LIMIT = 10;
export const TACTICAL_WEATHERS: readonly TacticalWeather[] = ['fine', 'cloudy', 'wind', 'rain', 'hail'];
export const TACTICAL_WEATHER_LABELS: Record<TacticalWeather, string> = {
  fine: '晴', cloudy: '阴', wind: '风', rain: '雨', hail: '冰雹',
};
export const TACTICAL_BATTLEFIELD_LABELS: Record<TacticalBattlefieldTemplate, string> = {
  'river-crossing': '河川渡口',
  'highland-pass': '山岭关隘',
  'forest-road': '林间驿道',
  'twin-villages': '双村要冲',
  'open-plain': '平原旷野',
  'marsh-fords': '泽地浅滩',
  'fortified-basin': '盆地坚城',
};
export const TACTICAL_APPROACH_LABELS: Record<TacticalApproach, string> = {
  east: '由西向东',
  west: '由东向西',
  south: '由北向南',
  north: '由南向北',
};
export { BAYE_TACTICAL_STATUS_LABELS as TACTICAL_STATUS_LABELS };

const NEUTRAL_WEATHER = { fine: 1, cloudy: 1, wind: 1, rain: 1, hail: 1 } as const;
const NEUTRAL_TERRAIN = [1, 1, 1, 1, 1, 1, 1, 1] as const;
const NEUTRAL_ARMS = [1, 1, 1, 1, 1, 1] as const;
export const TACTICAL_SKILLS: Record<TacticalSkillId, TacticalSkillDefinition> = {
  fire: {
    id: 'fire', name: '火计', target: 'enemy', range: 3, rangeShape: 'diamond',
    cost: 18, minimumIntelligence: 55, effect: 'troop-damage', basePower: 30,
    description: '受天气影响的兵力伤害。',
    weatherPower: { fine: 1, cloudy: 0.9, wind: 1.25, rain: 0.5, hail: 0.75 },
    terrainPower: [1, 1, 0.75, 1.25, 1.1, 0.9, 1.15, 0.4],
    armsPower: [1, 1, 1, 0.7, 1, 1.15],
  },
  confuse: {
    id: 'confuse', name: '扰乱', target: 'enemy', range: 3, rangeShape: 'diamond',
    cost: 22, minimumIntelligence: 70, effect: 'status', basePower: 0, appliesStatus: 'confused',
    description: '使目标混乱并跳过行动，按日判定恢复。',
    weatherPower: NEUTRAL_WEATHER, terrainPower: NEUTRAL_TERRAIN, armsPower: NEUTRAL_ARMS,
  },
  rally: {
    id: 'rally', name: '激励', target: 'ally', range: 2, rangeShape: 'diamond',
    cost: 20, minimumIntelligence: 65, effect: 'troop-recovery', basePower: 30, clearsStatus: true,
    description: '恢复友军兵力并解除异常状态。',
    weatherPower: NEUTRAL_WEATHER, terrainPower: NEUTRAL_TERRAIN, armsPower: NEUTRAL_ARMS,
  },
  silence: {
    id: 'silence', name: '禁咒', target: 'enemy', range: 3, rangeShape: 'diamond',
    cost: 24, minimumIntelligence: 78, effect: 'status', basePower: 0, appliesStatus: 'silenced',
    description: '使目标无法施展计谋，按日判定恢复。',
    weatherPower: NEUTRAL_WEATHER, terrainPower: NEUTRAL_TERRAIN, armsPower: NEUTRAL_ARMS,
  },
  root: {
    id: 'root', name: '定身', target: 'enemy', range: 2, rangeShape: 'cross',
    cost: 20, minimumIntelligence: 68, effect: 'status', basePower: 0, appliesStatus: 'rooted',
    description: '把目标移动力压至 1，按日判定恢复。',
    weatherPower: NEUTRAL_WEATHER, terrainPower: NEUTRAL_TERRAIN, armsPower: NEUTRAL_ARMS,
  },
  qimen: {
    id: 'qimen', name: '奇门', target: 'ally', range: 2, rangeShape: 'diamond',
    cost: 28, minimumIntelligence: 82, effect: 'status', basePower: 0, appliesStatus: 'qimen',
    description: '友军移动时忽略敌方控制区。',
    weatherPower: NEUTRAL_WEATHER, terrainPower: NEUTRAL_TERRAIN, armsPower: NEUTRAL_ARMS,
  },
  dunjia: {
    id: 'dunjia', name: '遁甲', target: 'ally', range: 2, rangeShape: 'diamond',
    cost: 30, minimumIntelligence: 88, effect: 'status', basePower: 0, appliesStatus: 'dunjia',
    description: '友军受到的普通攻击伤害降低。',
    weatherPower: NEUTRAL_WEATHER, terrainPower: NEUTRAL_TERRAIN, armsPower: NEUTRAL_ARMS,
  },
  'stone-array': {
    id: 'stone-array', name: '石阵', target: 'enemy', range: 2, rangeShape: 'cross',
    cost: 32, minimumIntelligence: 90, effect: 'status', basePower: 0, appliesStatus: 'stone-array',
    description: '目标无法行动并在每日承受兵力损失。',
    weatherPower: NEUTRAL_WEATHER, terrainPower: NEUTRAL_TERRAIN, armsPower: NEUTRAL_ARMS,
  },
  hide: {
    id: 'hide', name: '潜踪', target: 'ally', range: 1, rangeShape: 'diamond',
    cost: 25, minimumIntelligence: 80, effect: 'status', basePower: 0, appliesStatus: 'hidden',
    description: '友军仅能被相邻敌军锁定。',
    weatherPower: NEUTRAL_WEATHER, terrainPower: NEUTRAL_TERRAIN, armsPower: NEUTRAL_ARMS,
  },
  'raid-provisions': {
    id: 'raid-provisions', name: '劫粮', target: 'enemy', range: 3, rangeShape: 'diamond',
    cost: 26, minimumIntelligence: 75, effect: 'food-damage', basePower: 100,
    description: '破坏目标阵营粮草。',
    weatherPower: { fine: 1, cloudy: 1, wind: 1.1, rain: 0.9, hail: 0.9 },
    terrainPower: NEUTRAL_TERRAIN, armsPower: NEUTRAL_ARMS,
  },
};

export function createTacticalBattle(state: GameState, order: AttackOrder): TacticalBattleState {
  const context = validateAttackOrder(state, order);
  if (context.attackers.length > TACTICAL_SIDE_UNIT_LIMIT) {
    throw new Error(`手动战场每方最多可部署 ${TACTICAL_SIDE_UNIT_LIMIT} 名武将`);
  }
  const defenders = context.defenders.slice(0, TACTICAL_SIDE_UNIT_LIMIT);
  const approach = resolveApproach(context.source.x, context.source.y, context.target.x, context.target.y);
  const battlefieldKey = `${state.scenario?.period ?? 0}:${context.target.sourceIndex ?? context.target.id}:${approach}`;
  const battlefieldTemplate = BATTLEFIELD_TEMPLATES[
    (context.target.sourceIndex ?? hashString(context.target.id)) % BATTLEFIELD_TEMPLATES.length
  ];
  const tiles = createStructuredBattlefield(DEFAULT_WIDTH, DEFAULT_HEIGHT, approach, battlefieldTemplate);
  const units: Record<string, TacticalUnit> = {};
  const attackerPositions = deploymentPositions(context.attackers.length, approach, 'attacker', DEFAULT_WIDTH, DEFAULT_HEIGHT);
  const defenderPositions = deploymentPositions(defenders.length, approach, 'defender', DEFAULT_WIDTH, DEFAULT_HEIGHT);

  context.attackers.forEach((officer, index) => {
    const position = attackerPositions[index];
    const unit = unitFromOfficer(state, officer, 'attacker', position.x, position.y);
    units[unit.id] = unit;
  });
  defenders.forEach((officer, index) => {
    const position = defenderPositions[index];
    const unit = unitFromOfficer(state, officer, 'defender', position.x, position.y);
    units[unit.id] = unit;
  });

  if (context.target.reserveTroops > 0) {
    const reserveId = `reserve:${context.target.id}`;
    const objective = tiles.find((tile) => tile.objective === 'city')!;
    units[reserveId] = {
      id: reserveId,
      name: `${context.target.name}守备军`,
      factionId: context.target.ownerId,
      side: 'defender',
      x: objective.x,
      y: objective.y,
      force: clamp(Math.round(35 + context.target.defense / 20), 1, 255),
      intelligence: clamp(Math.round(35 + context.target.defense / 25), 1, 255),
      level: 1,
      armsType: 1,
      mobility: 2,
      originalTroops: context.target.reserveTroops,
      troops: context.target.reserveTroops,
      skillPoints: 0,
      maxSkillPoints: 0,
      status: 'normal',
      statusTurns: 0,
      moved: false,
      acted: false,
    };
  }

  const battle: TacticalBattleState = {
    schemaVersion: 1,
    id: createBattleId(state, order),
    strategicTurn: state.turn,
    seedBefore: state.rngSeed,
    rngSeed: state.rngSeed,
    sourceCityId: context.source.id,
    targetCityId: context.target.id,
    attackerFactionId: context.source.ownerId,
    defenderFactionId: context.target.ownerId,
    attackerOfficerIds: context.attackers.map((officer) => officer.id),
    defenderOfficerIds: defenders.map((officer) => officer.id),
    provisionsCommitted: order.provisions,
    attackerFood: order.provisions,
    defenderFood: context.target.food,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    day: 1,
    maxDays: DEFAULT_MAX_DAYS,
    weather: 'wind',
    activeSide: 'attacker',
    status: 'ongoing',
    approach,
    battlefieldVersion: 1,
    battlefieldKey,
    battlefieldTemplate,
    tiles,
    units,
    commanderUnitIds: {
      attacker: context.attackers[0] ? `officer:${context.attackers[0].id}` : undefined,
      defender: defenders[0] ? `officer:${defenders[0].id}` : undefined,
    },
    experienceGains: {},
    guard: createBattleStateGuard(state, context),
    logs: [`${context.source.name}军进入${context.target.name}战场。`],
  };
  return evaluateTacticalOutcome(battle, false, true);
}

export function getTacticalTile(state: TacticalBattleState, x: number, y: number): TacticalTile | undefined {
  return state.tiles.find((tile) => tile.x === x && tile.y === y);
}

export function getReachableTiles(state: TacticalBattleState, unitId: string): TacticalPosition[] {
  const unit = requireActiveUnit(state, unitId);
  if (unit.moved || unit.acted) return [];
  // The fixed C keeps STATE_DS power at one, but its path generator does not
  // expand a path below two points. Preserve that effective immobility here.
  if (unit.status === 'rooted') return [];
  const mobility = getBayeStatusMobility(unit.status, unit.mobility);
  const occupied = occupiedPositions(state, unit.id);
  const enemyOccupied = enemyOccupiedPositions(state, unit);
  const best = new Map<string, number>([[positionKey(unit.x, unit.y), 0]]);
  const frontier: Array<{ x: number; y: number; cost: number }> = [{ x: unit.x, y: unit.y, cost: 0 }];

  while (frontier.length > 0) {
    frontier.sort((a, b) => a.cost - b.cost || a.y - b.y || a.x - b.x);
    const current = frontier.shift()!;
    if (
      !samePosition(current, unit)
      && unit.status !== 'qimen'
      && isEnemyZoneOfControl(state, unit, current)
    ) {
      continue;
    }
    for (const next of neighbors(current.x, current.y)) {
      const tile = getTacticalTile(state, next.x, next.y);
      if (!tile || enemyOccupied.has(positionKey(next.x, next.y))) continue;
      const cost = current.cost + movementCost(unit, tile.terrain);
      if (cost > mobility) continue;
      const key = positionKey(next.x, next.y);
      if ((best.get(key) ?? Number.POSITIVE_INFINITY) <= cost) continue;
      best.set(key, cost);
      frontier.push({ ...next, cost });
    }
  }

  return [...best.entries()]
    .filter(([key]) => key !== positionKey(unit.x, unit.y) && !occupied.has(key))
    .map(([key]) => parsePositionKey(key))
    .sort(positionSort);
}

export function getTacticalPath(
  state: TacticalBattleState,
  unitId: string,
  destination: TacticalPosition,
): TacticalPosition[] {
  const unit = requireActiveUnit(state, unitId);
  if (samePosition(unit, destination)) return [{ x: unit.x, y: unit.y }];
  if (unit.status === 'rooted') return [];
  const occupied = occupiedPositions(state, unit.id);
  const enemyOccupied = enemyOccupiedPositions(state, unit);
  const mobility = getBayeStatusMobility(unit.status, unit.mobility);
  const startKey = positionKey(unit.x, unit.y);
  const destinationKey = positionKey(destination.x, destination.y);
  if (occupied.has(destinationKey)) return [];
  const best = new Map<string, number>([[startKey, 0]]);
  const previous = new Map<string, string>();
  const frontier: Array<{ x: number; y: number; cost: number }> = [{ x: unit.x, y: unit.y, cost: 0 }];

  while (frontier.length > 0) {
    frontier.sort((a, b) => a.cost - b.cost || a.y - b.y || a.x - b.x);
    const current = frontier.shift()!;
    const currentKey = positionKey(current.x, current.y);
    if (currentKey === destinationKey) break;
    if (current.cost !== best.get(currentKey)) continue;
    if (
      currentKey !== startKey
      && unit.status !== 'qimen'
      && isEnemyZoneOfControl(state, unit, current)
    ) {
      continue;
    }
    for (const next of neighbors(current.x, current.y)) {
      const tile = getTacticalTile(state, next.x, next.y);
      if (!tile || enemyOccupied.has(positionKey(next.x, next.y))) continue;
      const stepCost = movementCost(unit, tile.terrain);
      if (!Number.isFinite(stepCost)) continue;
      const cost = current.cost + stepCost;
      if (cost > mobility) continue;
      const key = positionKey(next.x, next.y);
      if ((best.get(key) ?? Number.POSITIVE_INFINITY) <= cost) continue;
      best.set(key, cost);
      previous.set(key, currentKey);
      frontier.push({ ...next, cost });
    }
  }

  if (!best.has(destinationKey)) return [];
  const path: TacticalPosition[] = [];
  let key = destinationKey;
  while (true) {
    path.push(parsePositionKey(key));
    if (key === startKey) break;
    key = previous.get(key)!;
  }
  return path.reverse();
}

export function getTacticalPathCost(
  state: TacticalBattleState,
  unitId: string,
  destination: TacticalPosition,
): number | undefined {
  const unit = state.units[unitId];
  if (!unit) return undefined;
  const path = getTacticalPath(state, unitId, destination);
  if (path.length === 0) return undefined;
  return path.slice(1).reduce((cost, position) => {
    const terrain = getTacticalTile(state, position.x, position.y)?.terrain;
    return terrain === undefined ? cost : cost + movementCost(unit, terrain);
  }, 0);
}

export function getAttackableUnitIds(state: TacticalBattleState, unitId: string): string[] {
  const unit = requireActiveUnit(state, unitId);
  if (unit.acted) return [];
  return Object.values(state.units)
    .filter((target) => target.troops > 0 && target.side !== unit.side)
    .filter((target) => isNormalAttackTarget(unit, target))
    .filter((target) => target.status !== 'hidden' || distance(unit, target) <= 1)
    .sort((a, b) => a.troops - b.troops || a.id.localeCompare(b.id))
    .map((target) => target.id);
}

export function moveTacticalUnit(
  state: TacticalBattleState,
  unitId: string,
  destination: TacticalPosition,
): TacticalBattleState {
  const unit = requireActiveUnit(state, unitId);
  if (!getReachableTiles(state, unitId).some((tile) => samePosition(tile, destination))) {
    throw new Error('目标格不在该单位的可移动范围内');
  }
  const next = updateUnit(state, unit.id, { x: destination.x, y: destination.y, moved: true });
  return evaluateTacticalOutcome({ ...next, logs: [...next.logs, `${unit.name}移动至 ${destination.x},${destination.y}。`] });
}

export function attackTacticalUnit(
  state: TacticalBattleState,
  unitId: string,
  targetUnitId: string,
): TacticalBattleState {
  const attacker = requireActiveUnit(state, unitId);
  const target = state.units[targetUnitId];
  if (!target || target.troops <= 0 || target.side === attacker.side) throw new Error('攻击目标无效');
  if (!getAttackableUnitIds(state, unitId).includes(targetUnitId)) throw new Error('目标不在攻击范围内');

  const preview = previewTacticalAttack(state, unitId, targetUnitId);
  const damage = preview.damage;
  const nextTargetTroops = preview.targetTroopsAfter;
  let next = updateUnit(state, attacker.id, { moved: true, acted: true });
  next = updateUnit(next, target.id, { troops: nextTargetTroops });
  if (attacker.officerId && damage > 0) {
    next = addTacticalExperience(next, attacker.officerId, calculateBayeBattleExperience(
      damage,
      attacker.level,
      target.level,
    ));
  }
  const message = `${attacker.name}攻击${target.name}，造成 ${damage} 兵力损失${nextTargetTroops === 0 ? '，目标溃退' : ''}。`;
  return evaluateTacticalOutcome({ ...next, logs: [...next.logs, message] });
}

export function previewTacticalAttack(
  state: TacticalBattleState,
  unitId: string,
  targetUnitId: string,
): TacticalAttackPreview {
  const attacker = state.units[unitId];
  const target = state.units[targetUnitId];
  if (!attacker || attacker.troops <= 0) throw new Error('攻击单位无效');
  if (!target || target.troops <= 0 || target.side === attacker.side) throw new Error('攻击目标无效');
  if (!isNormalAttackTarget(attacker, target)) {
    throw new Error('目标不在攻击范围内');
  }
  if (target.status === 'hidden' && distance(attacker, target) > 1) throw new Error('潜踪目标必须相邻才能锁定');

  const attackerTerrain = getTacticalTile(state, attacker.x, attacker.y)?.terrain ?? 0;
  const targetTerrain = getTacticalTile(state, target.x, target.y)?.terrain ?? 0;
  const attackerTerrainShift = getModernTerrainShift(attacker.armsType, attackerTerrain);
  const defenderTerrainShift = getModernTerrainShift(target.armsType, targetTerrain);
  const attackAttributes = buildBayeAttackAttributes({
    force: clamp(attacker.force, 0, 255),
    intelligence: clamp(attacker.intelligence, 0, 255),
    level: clamp(attacker.level, 0, 255),
    armsType: attacker.armsType,
    terrain: attackerTerrain,
    terrainShift: attackerTerrainShift,
  });
  const targetAttributes = buildBayeAttackAttributes({
    force: clamp(target.force, 0, 255),
    intelligence: clamp(target.intelligence, 0, 255),
    level: clamp(target.level, 0, 255),
    armsType: target.armsType,
    terrain: targetTerrain,
    terrainShift: defenderTerrainShift,
  });
  const baseDamage = countBayeAttackDamage({
    attack: attackAttributes.attack,
    defence: Math.max(1, targetAttributes.defence),
    troops: Math.min(attacker.troops, 65_535),
    attackerArmsType: attacker.armsType,
    defenderArmsType: target.armsType,
  });
  const damage = Math.min(
    target.troops,
    target.status === 'dunjia' ? Math.max(1, Math.floor(baseDamage * 0.65)) : baseDamage,
  );
  return {
    damage,
    targetTroopsAfter: Math.max(0, target.troops - damage),
    attackerTerrain,
    defenderTerrain: targetTerrain,
    attackerTerrainShift,
    defenderTerrainShift,
  };
}

export function getAvailableTacticalSkills(unit: TacticalUnit): TacticalSkillDefinition[] {
  if (!unit.officerId || unit.troops <= 0 || !bayeStatusAllowsSkill(unit.status)) return [];
  return Object.values(TACTICAL_SKILLS)
    .filter((skill) => unit.intelligence >= skill.minimumIntelligence && unit.skillPoints >= skill.cost)
    .sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id));
}

export function getTacticalSkillTargetIds(
  state: TacticalBattleState,
  unitId: string,
  skillId: TacticalSkillId,
): string[] {
  const unit = state.units[unitId];
  const skill = TACTICAL_SKILLS[skillId];
  if (!unit || !skill || unit.troops <= 0 || unit.acted || !getAvailableTacticalSkills(unit).some((item) => item.id === skillId)) {
    return [];
  }
  return Object.values(state.units)
    .filter((target) => target.troops > 0)
    .filter((target) => skill.target === 'enemy' ? target.side !== unit.side : target.side === unit.side)
    .filter((target) => isOffsetInRange(unit, target, skill.range, skill.rangeShape))
    .filter((target) => skill.target !== 'enemy' || target.status !== 'hidden' || distance(unit, target) <= 1)
    .filter((target) => {
      if (skill.effect === 'troop-recovery') {
        return target.troops < target.originalTroops || (skill.clearsStatus && target.status !== 'normal');
      }
      if (skill.effect === 'status') {
        return target.status !== skill.appliesStatus
          && (skill.target === 'enemy' || target.status === 'normal');
      }
      return true;
    })
    .sort((a, b) => a.troops - b.troops || a.id.localeCompare(b.id))
    .map((target) => target.id);
}

export function previewTacticalSkill(
  state: TacticalBattleState,
  unitId: string,
  skillId: TacticalSkillId,
  targetUnitId: string,
): TacticalSkillPreview {
  const unit = state.units[unitId];
  const target = state.units[targetUnitId];
  const skill = TACTICAL_SKILLS[skillId];
  if (!unit || !target || !skill) throw new Error('计谋预览参数无效');
  if (!getTacticalSkillTargetIds(state, unitId, skillId).includes(targetUnitId)) throw new Error('目标不在计谋范围内');
  const successChance = skill.target === 'ally'
    ? 100
    : clamp(Math.round(55 + (unit.intelligence - target.intelligence) / 2), 15, 95);
  const actorTerrain = getTacticalTile(state, unit.x, unit.y)?.terrain ?? 0;
  const targetTerrain = getTacticalTile(state, target.x, target.y)?.terrain ?? 0;
  const weatherMultiplier = skill.weatherPower[state.weather];
  const terrainMultiplier = (
    (skill.terrainPower[actorTerrain] ?? 1)
    * (skill.terrainPower[targetTerrain] ?? 1)
  );
  const armsMultiplier = skill.armsPower[target.armsType] ?? 1;
  const rawPower = Math.max(
    1,
    Math.round((skill.basePower + unit.intelligence * 0.8 + unit.level * 5)
      * weatherMultiplier * terrainMultiplier * armsMultiplier),
  );
  const expectedTroopChange = skill.effect === 'troop-damage'
    ? -Math.min(target.troops, rawPower)
    : skill.effect === 'troop-recovery'
      ? Math.min(target.originalTroops - target.troops, rawPower)
      : 0;
  const targetFood = target.side === 'attacker' ? state.attackerFood : state.defenderFood;
  const expectedFoodChange = skill.effect === 'food-damage' ? -Math.min(targetFood, rawPower) : 0;
  return {
    skill,
    successChance,
    expectedTroopChange,
    expectedFoodChange,
    resultingStatus: skill.appliesStatus,
    weatherMultiplier,
    terrainMultiplier,
    armsMultiplier,
  };
}

export function useTacticalSkill(
  state: TacticalBattleState,
  unitId: string,
  skillId: TacticalSkillId,
  targetUnitId: string,
): TacticalBattleState {
  const actor = requireActiveUnit(state, unitId);
  if (actor.acted) throw new Error('该单位本阶段已经行动');
  const preview = previewTacticalSkill(state, unitId, skillId, targetUnitId);
  const target = state.units[targetUnitId];
  const random = nextRandom(state.rngSeed);
  const succeeded = preview.successChance >= 100 || Math.floor(random.value * 100) < preview.successChance;
  let next = updateUnit({ ...state, rngSeed: random.seed }, actor.id, {
    moved: true,
    acted: true,
    skillPoints: actor.skillPoints - preview.skill.cost,
  });
  let detail = '未能奏效';
  let experience = 0;
  if (succeeded && preview.skill.effect === 'troop-damage') {
    const damage = Math.abs(preview.expectedTroopChange);
    next = updateUnit(next, target.id, { troops: Math.max(0, target.troops - damage) });
    detail = `造成 ${damage} 兵力损失${target.troops - damage <= 0 ? '，目标溃退' : ''}`;
    experience = calculateBayeBattleExperience(damage, actor.level, target.level);
  } else if (succeeded && preview.skill.effect === 'status' && preview.resultingStatus) {
    next = updateUnit(next, target.id, { status: preview.resultingStatus, statusTurns: 1 });
    detail = `目标进入${BAYE_TACTICAL_STATUS_LABELS[preview.resultingStatus]}状态`;
    experience = 8;
  } else if (succeeded && preview.skill.effect === 'troop-recovery') {
    const recovery = Math.max(0, preview.expectedTroopChange);
    const restoresSkippedAction = target.id !== actor.id
      && target.side === state.activeSide
      && bayeStatusSkipsAction(target.status)
      && target.acted;
    next = updateUnit(next, target.id, {
      troops: Math.min(target.originalTroops, target.troops + recovery),
      ...(preview.skill.clearsStatus ? { status: 'normal' as const, statusTurns: 0 } : {}),
      ...(restoresSkippedAction ? { moved: false, acted: false } : {}),
    });
    detail = `恢复 ${recovery} 兵力并解除异常状态${restoresSkippedAction ? '，目标可以重新行动' : ''}`;
    experience = 6;
  } else if (succeeded && preview.skill.effect === 'food-damage') {
    const damage = Math.abs(preview.expectedFoodChange);
    next = target.side === 'attacker'
      ? { ...next, attackerFood: Math.max(0, next.attackerFood - damage) }
      : { ...next, defenderFood: Math.max(0, next.defenderFood - damage) };
    detail = `破坏 ${damage} 粮草`;
    experience = damage > 0 ? 8 : 0;
  }
  if (actor.officerId && experience > 0) next = addTacticalExperience(next, actor.officerId, experience);
  next = { ...next, logs: [...next.logs, `${actor.name}对${target.name}施展${preview.skill.name}，${detail}。`] };
  return evaluateTacticalOutcome(next);
}

export function waitTacticalUnit(state: TacticalBattleState, unitId: string): TacticalBattleState {
  const unit = requireActiveUnit(state, unitId);
  const recovered = Math.min(unit.maxSkillPoints, unit.skillPoints + 1);
  const next = updateUnit(state, unit.id, { moved: true, acted: true, skillPoints: recovered });
  return {
    ...next,
    logs: [...next.logs, `${unit.name}原地休整${recovered > unit.skillPoints ? '，恢复 1 点计谋点' : ''}。`],
  };
}

export function endTacticalSide(state: TacticalBattleState): TacticalBattleState {
  if (state.status !== 'ongoing') return state;
  const cleared = clearExpiredStatuses(state, state.activeSide);
  let next: TacticalBattleState = {
    ...cleared,
    units: Object.fromEntries(Object.entries(cleared.units).map(([id, unit]) => [
      id,
      unit.side === state.activeSide && unit.troops > 0 ? { ...unit, moved: true, acted: true } : unit,
    ])),
  };
  if (state.activeSide === 'attacker') {
    next = evaluateTacticalOutcome(next, true);
    if (next.status !== 'ongoing') return next;
    next = beginTacticalSide(next, 'defender');
    return { ...next, activeSide: 'defender', logs: [...next.logs, '守方开始行动。'] };
  }

  const attackerUse = provisionUse(next, 'attacker');
  const defenderUse = provisionUse(next, 'defender');
  next = {
    ...next,
    day: next.day + 1,
    attackerFood: Math.max(0, next.attackerFood - attackerUse),
    defenderFood: Math.max(0, next.defenderFood - defenderUse),
    logs: [...next.logs, `第 ${next.day + 1} 日开始，攻方耗粮 ${attackerUse}，守方耗粮 ${defenderUse}。`],
  };
  next = evaluateTacticalOutcome(next, false, true);
  if (next.status !== 'ongoing') return next;
  next = changeTacticalWeather(next);
  next = driveTacticalStatuses(next);
  next = beginTacticalSide(next, 'attacker');
  next = {
    ...next,
    activeSide: 'attacker',
  };
  return evaluateTacticalOutcome(next);
}

export function retreatTacticalSide(state: TacticalBattleState, side: TacticalSide): TacticalBattleState {
  if (state.status !== 'ongoing') throw new Error('战斗已经结束');
  if (state.activeSide !== side) throw new Error('只能在本方行动阶段下令全军撤退');
  const status: TacticalBattleStatus = side === 'attacker' ? 'defender-won' : 'attacker-won';
  const victoryReason: TacticalVictoryReason = side === 'attacker' ? 'attacker-retreated' : 'defender-retreated';
  return {
    ...state,
    status,
    victoryReason,
    logs: [...state.logs, victoryReasonMessage(status, victoryReason)],
  };
}

export function runBasicTacticalAi(state: TacticalBattleState): TacticalBattleState {
  if (state.status !== 'ongoing') return state;
  let next = state;
  const side = state.activeSide;
  const objective = state.tiles.find((tile) => tile.objective === 'city');
  const enemyCommanderId = side === 'attacker'
    ? state.commanderUnitIds.defender
    : state.commanderUnitIds.attacker;
  const enemyCommander = enemyCommanderId ? state.units[enemyCommanderId] : undefined;
  const unitIds = Object.values(state.units)
    .filter((unit) => unit.side === side && unit.troops > 0)
    .sort((a, b) => {
      const target = side === 'attacker' ? objective : enemyCommander;
      return (target ? distance(a, target) - distance(b, target) : 0) || a.id.localeCompare(b.id);
    })
    .map((unit) => unit.id);

  while (next.status === 'ongoing') {
    const unitId = unitIds.find((id) => {
      const unit = next.units[id];
      return unit && unit.troops > 0 && !unit.acted;
    });
    if (!unitId) break;
    const current = next.units[unitId];
    const skillAction = chooseAiSkill(next, unitId);
    if (skillAction) {
      next = useTacticalSkill(next, unitId, skillAction.skillId, skillAction.targetUnitId);
      continue;
    }
    const immediateTarget = chooseAiTarget(next, unitId);
    if (immediateTarget) {
      next = attackTacticalUnit(next, unitId, immediateTarget);
      continue;
    }

    const destinations = getReachableTiles(next, unitId);
    const destination = chooseAiDestination(next, current, destinations);
    if (destination) next = moveTacticalUnit(next, unitId, destination);
    if (next.status !== 'ongoing') break;
    const targetAfterMove = chooseAiTarget(next, unitId);
    next = targetAfterMove ? attackTacticalUnit(next, unitId, targetAfterMove) : waitTacticalUnit(next, unitId);
  }
  return next.status === 'ongoing' ? endTacticalSide(next) : next;
}

export function createTacticalBattleResult(state: TacticalBattleState): BattleResult {
  if (state.status === 'ongoing') throw new Error('战斗尚未结束');
  const winner = state.status === 'attacker-won' ? 'attacker' : 'defender';
  const casualties: Record<string, number> = {};
  for (const unit of Object.values(state.units)) {
    if (unit.officerId) casualties[unit.officerId] = Math.max(0, unit.originalTroops - unit.troops);
  }
  const reserve = state.units[`reserve:${state.targetCityId}`];
  const defenderReserveLosses = Math.min(
    state.guard.targetReserveTroops,
    reserve ? reserve.originalTroops - reserve.troops : 0,
  );
  const attackerScore = sideTroops(state, 'attacker');
  const defenderScore = sideTroops(state, 'defender');
  const logs = [
    ...state.logs.slice(-6),
    `战后兵力：攻方 ${attackerScore}，守方 ${defenderScore}。`,
    winner === 'attacker' ? '攻方赢得战斗并占领目标城池。' : '守方赢得战斗并击退进攻。',
  ];
  return {
    battleId: state.id,
    turn: state.strategicTurn,
    seedBefore: state.seedBefore,
    nextRngSeed: state.rngSeed,
    sourceCityId: state.sourceCityId,
    targetCityId: state.targetCityId,
    attackerFactionId: state.attackerFactionId,
    defenderFactionId: state.defenderFactionId,
    attackerOfficerIds: state.attackerOfficerIds,
    defenderOfficerIds: state.defenderOfficerIds,
    provisions: state.provisionsCommitted,
    winner,
    attackerScore,
    defenderScore,
    casualties,
    experienceGains: state.experienceGains,
    defenderReserveLosses,
    cityCaptured: winner === 'attacker',
    guard: state.guard,
    targetFoodAfter: state.attackerFood + state.defenderFood,
    logs,
  };
}

export function isSideComplete(state: TacticalBattleState, side = state.activeSide): boolean {
  return Object.values(state.units)
    .filter((unit) => unit.side === side && unit.troops > 0)
    .every((unit) => unit.acted);
}

export function getTacticalProvisionUse(state: TacticalBattleState, side: TacticalSide): number {
  return provisionUse(state, side);
}

export function getTacticalUnitMobility(unit: TacticalUnit): number {
  return getBayeStatusMobility(unit.status, unit.mobility);
}

function createStructuredBattlefield(
  width: number,
  height: number,
  approach: TacticalApproach,
  template: TacticalBattleState['battlefieldTemplate'],
): TacticalTile[] {
  const tiles: TacticalTile[] = [];
  const horizontal = approach === 'east' || approach === 'west';
  const objective = objectivePosition(approach, width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let terrain: BayeTerrain = 0;
      const across = horizontal ? x : y;
      const along = horizontal ? y : x;
      const acrossMiddle = horizontal ? Math.floor(width / 2) : Math.floor(height / 2);
      const alongMiddle = horizontal ? Math.floor(height / 2) : Math.floor(width / 2);
      if (template === 'river-crossing' && across === acrossMiddle && Math.abs(along - alongMiddle) > 1) terrain = 7;
      else if (template === 'highland-pass' && across >= acrossMiddle - 1 && across <= acrossMiddle + 1
        && Math.abs(along - alongMiddle) > 1) terrain = 2;
      else if (template === 'forest-road' && along !== alongMiddle && (x + y) % 3 !== 0) terrain = 3;
      else if (template === 'twin-villages' && (
        (across === acrossMiddle - 2 || across === acrossMiddle + 2)
        && Math.abs(along - alongMiddle) <= 1
      )) terrain = 4;
      else if (template === 'marsh-fords' && across >= acrossMiddle - 1 && across <= acrossMiddle + 1
        && (along + across) % 3 !== 0) terrain = 7;
      else if (template === 'fortified-basin' && (
        across === acrossMiddle - 2 || across === acrossMiddle + 2
      ) && Math.abs(along - alongMiddle) > 1) terrain = 2;
      else if (template === 'fortified-basin' && Math.abs(across - acrossMiddle) <= 1) terrain = 4;
      else if (template === 'open-plain') terrain = (x + y) % 5 === 0 ? 1 : 0;
      else if ((x + y * 3) % 17 === 7) terrain = 3;
      else if ((x * 5 + y) % 23 === 11) terrain = 4;
      if (
        template !== 'open-plain'
        && terrain === 0
        && (x * 7 + y * 11 + acrossMiddle) % 29 === 9
      ) terrain = 6;
      if (x === objective.x && y === objective.y) terrain = 5;
      tiles.push({
        x,
        y,
        terrain,
        ...(terrain === 5 ? { objective: 'city' as const } : {}),
      });
    }
  }
  return tiles;
}

function unitFromOfficer(
  state: GameState,
  officer: Officer,
  side: TacticalSide,
  x: number,
  y: number,
): TacticalUnit {
  const armsType = armsTypeIndex(officer.armsTypeId);
  const effective = getEffectiveOfficerAttributes(state, officer);
  // FgtGetCmdRng checks both equipment slots in order; the later range-changing tool wins.
  const normalAttackPatternOverride = getOfficerEquipment(state, officer)
    .map((item) => item.normalAttackPatternOverride)
    .filter((pattern): pattern is BayeNormalAttackShape => pattern !== undefined)
    .at(-1);
  const maxSkillPoints = clamp(calculateBayeSkillPoints(
    effective.intelligence,
    effective.force,
    officer.level ?? 1,
    officer.stamina,
  ), 0, 255);
  return {
    id: `officer:${officer.id}`,
    officerId: officer.id,
    name: officer.name,
    factionId: officer.factionId,
    side,
    x,
    y,
    force: effective.force,
    intelligence: effective.intelligence,
    level: officer.level ?? 1,
    armsType,
    ...(normalAttackPatternOverride ? { normalAttackPatternOverride } : {}),
    mobility: clamp((state.armsTypes[officer.armsTypeId]?.mobility ?? 3) + effective.moveBonus, 1, 8),
    originalTroops: officer.troops,
    troops: officer.troops,
    skillPoints: maxSkillPoints,
    maxSkillPoints,
    status: 'normal',
    statusTurns: 0,
    moved: false,
    acted: false,
  };
}

function evaluateTacticalOutcome(
  state: TacticalBattleState,
  allowObjectiveVictory = false,
  allowFoodExhaustion = false,
): TacticalBattleState {
  if (state.status !== 'ongoing') return state;
  const attackerAlive = sideTroops(state, 'attacker') > 0;
  const defenderAlive = sideTroops(state, 'defender') > 0;
  const attackerCommander = state.commanderUnitIds.attacker
    ? state.units[state.commanderUnitIds.attacker]
    : undefined;
  const defenderCommander = state.commanderUnitIds.defender
    ? state.units[state.commanderUnitIds.defender]
    : undefined;
  const attackerOnObjective = Object.values(state.units).some((unit) => {
    if (unit.side !== 'attacker' || unit.troops <= 0) return false;
    return getTacticalTile(state, unit.x, unit.y)?.objective === 'city';
  });
  let status: TacticalBattleStatus = 'ongoing';
  let victoryReason: TacticalVictoryReason | undefined;
  if (attackerCommander && attackerCommander.troops <= 0) {
    status = 'defender-won';
    victoryReason = 'attacker-commander-defeated';
  } else if (defenderCommander && defenderCommander.troops <= 0) {
    status = 'attacker-won';
    victoryReason = 'defender-commander-defeated';
  } else if (!attackerAlive) {
    status = 'defender-won';
    victoryReason = 'annihilation';
  } else if (allowFoodExhaustion && state.attackerFood <= 0) {
    status = 'defender-won';
    victoryReason = 'attacker-food-exhausted';
  } else if (state.day > state.maxDays) {
    status = 'defender-won';
    victoryReason = 'day-limit';
  } else if (!defenderAlive) {
    status = 'attacker-won';
    victoryReason = 'annihilation';
  } else if (allowFoodExhaustion && state.defenderFood <= 0) {
    status = 'attacker-won';
    victoryReason = 'defender-food-exhausted';
  } else if (allowObjectiveVictory && attackerOnObjective) {
    status = 'attacker-won';
    victoryReason = 'objective-held';
  }
  if (status === 'ongoing') return state;
  return {
    ...state,
    status,
    victoryReason,
    logs: [...state.logs, victoryReasonMessage(status, victoryReason)],
  };
}

function requireActiveUnit(state: TacticalBattleState, unitId: string): TacticalUnit {
  if (state.status !== 'ongoing') throw new Error('战斗已经结束');
  const unit = state.units[unitId];
  if (!unit || unit.troops <= 0) throw new Error('单位不存在或已经退出战斗');
  if (unit.side !== state.activeSide) throw new Error('当前不是该单位所属阵营的行动阶段');
  return unit;
}

function updateUnit(state: TacticalBattleState, unitId: string, patch: Partial<TacticalUnit>): TacticalBattleState {
  const unit = state.units[unitId];
  if (!unit) throw new Error(`未知战术单位：${unitId}`);
  return { ...state, units: { ...state.units, [unitId]: { ...unit, ...patch } } };
}

function resetSide(state: TacticalBattleState, side: TacticalSide): TacticalBattleState {
  return {
    ...state,
    units: Object.fromEntries(Object.entries(state.units).map(([id, unit]) => [
      id,
      unit.side === side && unit.troops > 0 ? { ...unit, moved: false, acted: false } : unit,
    ])),
  };
}

function beginTacticalSide(state: TacticalBattleState, side: TacticalSide): TacticalBattleState {
  const reset = resetSide(state, side);
  const skipped: string[] = [];
  const units = Object.fromEntries(Object.entries(reset.units).map(([id, unit]) => {
    if (unit.side !== side || unit.troops <= 0 || !bayeStatusSkipsAction(unit.status)) return [id, unit];
    skipped.push(unit.name);
    return [id, {
      ...unit,
      moved: true,
      acted: true,
      statusTurns: Math.max(0, unit.statusTurns - 1),
    }];
  }));
  return skipped.length === 0
    ? { ...reset, units }
    : { ...reset, units, logs: [...reset.logs, `${skipped.join('、')}受异常状态影响，跳过本阶段行动。`] };
}

function clearExpiredStatuses(state: TacticalBattleState, side: TacticalSide): TacticalBattleState {
  // Status recovery is driven once per battle day. Keeping this phase boundary
  // function makes the attacker/defender state machine explicit.
  void side;
  return state;
}

function changeTacticalWeather(state: TacticalBattleState): TacticalBattleState {
  const random = nextRandom(state.rngSeed);
  const weather = TACTICAL_WEATHERS[Math.floor(random.value * TACTICAL_WEATHERS.length)] ?? 'fine';
  return {
    ...state,
    rngSeed: random.seed,
    weather,
    logs: [...state.logs, `天气转为${TACTICAL_WEATHER_LABELS[weather]}。`],
  };
}

function driveTacticalStatuses(state: TacticalBattleState): TacticalBattleState {
  let next = state;
  const logs: string[] = [];
  for (const unitId of Object.keys(next.units).sort()) {
    const unit = next.units[unitId];
    if (unit.troops <= 0) continue;
    // Fight.c consumes a recovery roll for every live unit before switching on
    // its state, including normal and persistent dunjia units.
    const random = nextRandom(next.rngSeed);
    next = { ...next, rngSeed: random.seed };
    let troops = unit.troops;
    if (unit.status === 'stone-array') {
      const loss = Math.min(troops, getBayeStoneArrayLoss(troops));
      troops -= loss;
      if (loss > 0) logs.push(`${unit.name}受石阵侵蚀，损失 ${loss} 兵力。`);
    }
    const roll = Math.floor(random.value * 60);
    const recovered = shouldRecoverBayeStatus(unit.status, unit.intelligence, roll);
    next = updateUnit(next, unit.id, {
      troops,
      ...(recovered ? { status: 'normal' as const, statusTurns: 0 } : {}),
    });
    if (recovered) logs.push(`${unit.name}从${BAYE_TACTICAL_STATUS_LABELS[unit.status]}状态恢复。`);
  }
  return logs.length === 0 ? next : { ...next, logs: [...next.logs, ...logs] };
}

function addTacticalExperience(state: TacticalBattleState, officerId: string, gained: number): TacticalBattleState {
  return {
    ...state,
    experienceGains: {
      ...state.experienceGains,
      [officerId]: (state.experienceGains[officerId] ?? 0) + Math.max(0, Math.floor(gained)),
    },
  };
}

function chooseAiDestination(
  state: TacticalBattleState,
  unit: TacticalUnit,
  destinations: TacticalPosition[],
): TacticalPosition | undefined {
  if (destinations.length === 0) return undefined;
  const enemies = Object.values(state.units).filter((candidate) => candidate.side !== unit.side && candidate.troops > 0);
  const objective = state.tiles.find((tile) => tile.objective === 'city');
  return [...destinations].sort((a, b) => {
    const scoreA = aiPositionScore(state, unit, a, enemies, objective);
    const scoreB = aiPositionScore(state, unit, b, enemies, objective);
    return scoreA - scoreB || positionSort(a, b);
  })[0];
}

function aiPositionScore(
  state: TacticalBattleState,
  unit: TacticalUnit,
  position: TacticalPosition,
  enemies: TacticalUnit[],
  objective?: TacticalTile,
): number {
  const enemyDistance = enemies.length === 0
    ? 0
    : Math.min(...enemies.map((enemy) => distance(position, enemy)));
  const simulated = updateUnit(state, unit.id, { x: position.x, y: position.y, moved: true });
  const targets = getAttackableUnitIds(simulated, unit.id);
  const bestAttack = targets.map((targetId) => ({
    preview: previewTacticalAttack(simulated, unit.id, targetId),
    targetTroops: state.units[targetId].troops,
  })).sort((a, b) =>
    Number(b.preview.damage >= b.targetTroops) - Number(a.preview.damage >= a.targetTroops)
    || b.preview.damage - a.preview.damage)[0]?.preview;
  if (bestAttack) return -10_000 - bestAttack.damage;
  if (!objective) return enemyDistance;
  const objectiveDistance = distance(position, objective);
  if (unit.side === 'attacker') {
    const foodUrgency = state.attackerFood <= provisionUse(state, 'attacker') * 3 ? 5 : 2;
    return objectiveDistance * foodUrgency + enemyDistance;
  }
  const preferredEnemyDistance = getTacticalAttackRange(unit.armsType);
  return objectiveDistance * 3 + Math.abs(enemyDistance - preferredEnemyDistance);
}

function movementCost(unit: TacticalUnit, terrain: BayeTerrain): number {
  return getModernTerrainMoveCost(unit.armsType, terrain);
}

export function getTacticalAttackRange(armsType: BayeArmsType): number {
  return getModernAttackRange(armsType);
}

export function getTacticalNormalAttackLabel(unit: TacticalUnit): string {
  const shape = unit.normalAttackPatternOverride
    ?? (unit.armsType === 2
      ? 'manhattan-ring-two'
      : unit.armsType === 1 || unit.armsType === 4
        ? 'adjacent-eight'
        : 'orthogonal-adjacent');
  const label = shape === 'manhattan-ring-two'
    ? '距二环射击'
    : shape === 'adjacent-eight' ? '八向近战' : '四向近战';
  return unit.normalAttackPatternOverride ? `${label}（道具覆盖）` : label;
}

function armsTypeIndex(armsTypeId: string): BayeArmsType {
  const index = BAYE_ARMS_TYPES.indexOf(armsTypeId as (typeof BAYE_ARMS_TYPES)[number]);
  return (index < 0 ? 0 : index) as BayeArmsType;
}

function provisionUse(state: TacticalBattleState, side: TacticalSide): number {
  return Math.max(1, Math.ceil(sideTroops(state, side) / 1_000));
}

function sideTroops(state: TacticalBattleState, side: TacticalSide): number {
  return Object.values(state.units)
    .filter((unit) => unit.side === side)
    .reduce((total, unit) => total + Math.max(0, unit.troops), 0);
}

function occupiedPositions(state: TacticalBattleState, ignoredUnitId?: string): Set<string> {
  return new Set(Object.values(state.units)
    .filter((unit) => unit.id !== ignoredUnitId && unit.troops > 0)
    .map((unit) => positionKey(unit.x, unit.y)));
}

function enemyOccupiedPositions(state: TacticalBattleState, unit: TacticalUnit): Set<string> {
  return new Set(Object.values(state.units)
    .filter((candidate) => candidate.troops > 0 && candidate.side !== unit.side)
    .map((candidate) => positionKey(candidate.x, candidate.y)));
}

function isEnemyZoneOfControl(
  state: TacticalBattleState,
  unit: TacticalUnit,
  position: TacticalPosition,
): boolean {
  return Object.values(state.units).some((candidate) => (
    candidate.troops > 0
    && candidate.side !== unit.side
    && distance(candidate, position) === 1
  ));
}

function deploymentPositions(
  count: number,
  approach: TacticalApproach,
  side: TacticalSide,
  width: number,
  height: number,
): TacticalPosition[] {
  const horizontal = approach === 'east' || approach === 'west';
  const length = horizontal ? height : width;
  const center = Math.floor(length / 2);
  const rows = Array.from({ length }, (_, index) => index)
    .sort((a, b) => Math.abs(a - center) - Math.abs(b - center) || a - b);
  return Array.from({ length: count }, (_, index) => {
    const depth = Math.floor(index / rows.length);
    const along = rows[index % rows.length];
    const attacker = side === 'attacker';
    if (approach === 'east') return { x: attacker ? 1 + depth : width - 3 - depth, y: along };
    if (approach === 'west') return { x: attacker ? width - 2 - depth : 2 + depth, y: along };
    if (approach === 'south') return { x: along, y: attacker ? 1 + depth : height - 3 - depth };
    return { x: along, y: attacker ? height - 2 - depth : 2 + depth };
  });
}

function chooseAiTarget(state: TacticalBattleState, unitId: string): string | undefined {
  const unit = state.units[unitId];
  const enemyCommanderId = unit.side === 'attacker'
    ? state.commanderUnitIds.defender
    : state.commanderUnitIds.attacker;
  return getAttackableUnitIds(state, unitId)
    .map((targetId) => ({ targetId, preview: previewTacticalAttack(state, unitId, targetId) }))
    .sort((a, b) =>
      Number(b.targetId === enemyCommanderId) - Number(a.targetId === enemyCommanderId)
      || Number(b.preview.damage >= state.units[b.targetId].troops)
      - Number(a.preview.damage >= state.units[a.targetId].troops)
      || b.preview.damage - a.preview.damage
      || a.targetId.localeCompare(b.targetId))[0]?.targetId;
}

function chooseAiSkill(
  state: TacticalBattleState,
  unitId: string,
): { skillId: TacticalSkillId; targetUnitId: string } | undefined {
  const unit = state.units[unitId];
  if (!unit) return undefined;
  const enemyCommanderId = unit.side === 'attacker'
    ? state.commanderUnitIds.defender
    : state.commanderUnitIds.attacker;
  return getAvailableTacticalSkills(unit)
    .flatMap((skill) => getTacticalSkillTargetIds(state, unitId, skill.id).map((targetUnitId) => {
      const target = state.units[targetUnitId];
      const preview = previewTacticalSkill(state, unitId, skill.id, targetUnitId);
      const chance = preview.successChance / 100;
      let score = 0;
      if (skill.effect === 'troop-damage') {
        score = Math.abs(preview.expectedTroopChange) * chance;
        if (Math.abs(preview.expectedTroopChange) >= target.troops) score += 5_000;
      } else if (skill.effect === 'troop-recovery') {
        score = preview.expectedTroopChange + (target.status !== 'normal' ? 12_000 : 0);
      } else if (skill.effect === 'food-damage') {
        const remainingFood = target.side === 'attacker' ? state.attackerFood : state.defenderFood;
        score = Math.abs(preview.expectedFoodChange) * chance
          + (Math.abs(preview.expectedFoodChange) >= remainingFood ? 4_000 : 0);
      } else if (skill.effect === 'status') {
        score = skill.target === 'ally'
          ? 150
          : target.troops * chance * (
            skill.appliesStatus === 'confused' || skill.appliesStatus === 'stone-array' ? 0.8 : 0.35
          );
      }
      if (targetUnitId === enemyCommanderId && skill.target === 'enemy') score += 2_000;
      if (skill.target === 'ally' && targetUnitId === state.commanderUnitIds[unit.side]) score += 300;
      return { skillId: skill.id, targetUnitId, score };
    }))
    .filter((candidate) => candidate.score >= 6)
    .sort((a, b) => b.score - a.score
      || a.skillId.localeCompare(b.skillId)
      || a.targetUnitId.localeCompare(b.targetUnitId))[0];
}

function objectivePosition(approach: TacticalApproach, width: number, height: number): TacticalPosition {
  if (approach === 'east') return { x: width - 2, y: Math.floor(height / 2) };
  if (approach === 'west') return { x: 1, y: Math.floor(height / 2) };
  if (approach === 'south') return { x: Math.floor(width / 2), y: height - 2 };
  return { x: Math.floor(width / 2), y: 1 };
}

function resolveApproach(sourceX: number, sourceY: number, targetX: number, targetY: number): TacticalApproach {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'east' : 'west';
  return dy >= 0 ? 'south' : 'north';
}

function hashString(value: string): number {
  return [...value].reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) >>> 0, 0);
}

function victoryReasonMessage(status: TacticalBattleStatus, reason?: TacticalVictoryReason): string {
  if (reason === 'attacker-retreated') return '攻方下令全军撤退，守方获胜。';
  if (reason === 'defender-retreated') return '守方下令全军撤退，攻方占领城池。';
  if (reason === 'attacker-commander-defeated') return '攻方主将败退，守方获胜。';
  if (reason === 'defender-commander-defeated') return '守方主将败退，攻方获胜。';
  if (reason === 'objective-held') return '攻方占领城池并坚持到本方阶段结束。';
  if (reason === 'attacker-food-exhausted') return '攻方粮草耗尽，被迫撤军。';
  if (reason === 'defender-food-exhausted') return '守方粮草耗尽，城池失守。';
  if (reason === 'day-limit') return '攻方未能在期限内破城，守方获胜。';
  return status === 'attacker-won' ? '守军全部溃退，攻方获胜。' : '攻军全部溃退，守方获胜。';
}

function neighbors(x: number, y: number): TacticalPosition[] {
  return [{ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 }];
}

function positionKey(x: number, y: number): string {
  return `${x},${y}`;
}

function parsePositionKey(key: string): TacticalPosition {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

function samePosition(a: TacticalPosition, b: TacticalPosition): boolean {
  return a.x === b.x && a.y === b.y;
}

function positionSort(a: TacticalPosition, b: TacticalPosition): number {
  return a.y - b.y || a.x - b.x;
}

function distance(a: TacticalPosition, b: TacticalPosition): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function isNormalAttackTarget(origin: TacticalUnit, target: TacticalPosition): boolean {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  return origin.normalAttackPatternOverride
    ? isBayeNormalAttackPatternOffset(origin.normalAttackPatternOverride, dx, dy)
    : isBayeNormalAttackOffset(origin.armsType, dx, dy);
}

function isOffsetInRange(
  origin: TacticalPosition,
  target: TacticalPosition,
  radius: number,
  shape: TacticalSkillDefinition['rangeShape'],
): boolean {
  const dx = Math.abs(origin.x - target.x);
  const dy = Math.abs(origin.y - target.y);
  if (dx === 0 && dy === 0) return true;
  return shape === 'cross'
    ? (dx === 0 || dy === 0) && dx + dy <= radius
    : dx + dy <= radius;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
