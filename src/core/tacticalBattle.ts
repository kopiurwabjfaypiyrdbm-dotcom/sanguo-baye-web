import {
  BAYE_ARMS_TYPES,
  BAYE_TERRAINS,
  buildBayeAttackAttributes,
  countBayeAttackDamage,
  getBayeTerrainShift,
  type BayeArmsType,
  type BayeTerrain,
} from '../compat/baye/tacticalBattle';
import {
  createBattleStateGuard,
  validateAttackOrder,
  type AttackOrder,
  type BattleResult,
  type BattleStateGuard,
} from './battle';
import type { GameState, Officer } from './types';
import { getEffectiveOfficerAttributes } from './equipment';

export type TacticalSide = 'attacker' | 'defender';
export type TacticalBattleStatus = 'ongoing' | 'attacker-won' | 'defender-won';
export type TacticalVictoryReason =
  | 'annihilation'
  | 'objective-held'
  | 'attacker-food-exhausted'
  | 'defender-food-exhausted'
  | 'day-limit';
export type TacticalApproach = 'east' | 'west' | 'north' | 'south';

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
  mobility: number;
  originalTroops: number;
  troops: number;
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
  activeSide: TacticalSide;
  status: TacticalBattleStatus;
  victoryReason?: TacticalVictoryReason;
  approach: TacticalApproach;
  battlefieldTemplate: 'river-crossing' | 'highland-pass';
  tiles: TacticalTile[];
  units: Record<string, TacticalUnit>;
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

const DEFAULT_WIDTH = 12;
const DEFAULT_HEIGHT = 8;
const DEFAULT_MAX_DAYS = 30;
export const TACTICAL_SIDE_UNIT_LIMIT = 10;

export function createTacticalBattle(state: GameState, order: AttackOrder): TacticalBattleState {
  const context = validateAttackOrder(state, order);
  if (context.attackers.length > TACTICAL_SIDE_UNIT_LIMIT) {
    throw new Error(`手动战场每方最多可部署 ${TACTICAL_SIDE_UNIT_LIMIT} 名武将`);
  }
  const defenders = context.defenders.slice(0, TACTICAL_SIDE_UNIT_LIMIT);
  const approach = resolveApproach(context.source.x, context.source.y, context.target.x, context.target.y);
  const battlefieldTemplate = ((context.target.sourceIndex ?? hashString(context.target.id)) % 2 === 0)
    ? 'river-crossing'
    : 'highland-pass';
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
      moved: false,
      acted: false,
    };
  }

  const battle: TacticalBattleState = {
    schemaVersion: 1,
    id: `${state.turn}:${state.rngSeed}:${context.source.id}:${context.target.id}`,
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
    activeSide: 'attacker',
    status: 'ongoing',
    approach,
    battlefieldTemplate,
    tiles,
    units,
    guard: createBattleStateGuard(state, context),
    logs: [`${context.source.name}军进入${context.target.name}战场。`],
  };
  return evaluateTacticalOutcome(battle);
}

export function getTacticalTile(state: TacticalBattleState, x: number, y: number): TacticalTile | undefined {
  return state.tiles.find((tile) => tile.x === x && tile.y === y);
}

export function getReachableTiles(state: TacticalBattleState, unitId: string): TacticalPosition[] {
  const unit = requireActiveUnit(state, unitId);
  if (unit.moved || unit.acted) return [];
  const occupied = occupiedPositions(state, unit.id);
  const best = new Map<string, number>([[positionKey(unit.x, unit.y), 0]]);
  const frontier: Array<{ x: number; y: number; cost: number }> = [{ x: unit.x, y: unit.y, cost: 0 }];

  while (frontier.length > 0) {
    frontier.sort((a, b) => a.cost - b.cost || a.y - b.y || a.x - b.x);
    const current = frontier.shift()!;
    for (const next of neighbors(current.x, current.y)) {
      const tile = getTacticalTile(state, next.x, next.y);
      if (!tile || occupied.has(positionKey(next.x, next.y))) continue;
      const cost = current.cost + movementCost(unit, tile.terrain);
      if (cost > unit.mobility) continue;
      const key = positionKey(next.x, next.y);
      if ((best.get(key) ?? Number.POSITIVE_INFINITY) <= cost) continue;
      best.set(key, cost);
      frontier.push({ ...next, cost });
    }
  }

  return [...best.entries()]
    .filter(([key]) => key !== positionKey(unit.x, unit.y))
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
  const occupied = occupiedPositions(state, unit.id);
  const startKey = positionKey(unit.x, unit.y);
  const destinationKey = positionKey(destination.x, destination.y);
  const best = new Map<string, number>([[startKey, 0]]);
  const previous = new Map<string, string>();
  const frontier: Array<{ x: number; y: number; cost: number }> = [{ x: unit.x, y: unit.y, cost: 0 }];

  while (frontier.length > 0) {
    frontier.sort((a, b) => a.cost - b.cost || a.y - b.y || a.x - b.x);
    const current = frontier.shift()!;
    const currentKey = positionKey(current.x, current.y);
    if (currentKey === destinationKey) break;
    if (current.cost !== best.get(currentKey)) continue;
    for (const next of neighbors(current.x, current.y)) {
      const tile = getTacticalTile(state, next.x, next.y);
      if (!tile || occupied.has(positionKey(next.x, next.y))) continue;
      const stepCost = movementCost(unit, tile.terrain);
      if (!Number.isFinite(stepCost)) continue;
      const cost = current.cost + stepCost;
      if (cost > unit.mobility) continue;
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
  const range = getTacticalAttackRange(unit.armsType);
  return Object.values(state.units)
    .filter((target) => target.troops > 0 && target.side !== unit.side)
    .filter((target) => distance(unit, target) <= range)
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
  if (distance(attacker, target) > getTacticalAttackRange(attacker.armsType)) throw new Error('目标不在攻击范围内');

  const attackerTerrain = getTacticalTile(state, attacker.x, attacker.y)?.terrain ?? 0;
  const targetTerrain = getTacticalTile(state, target.x, target.y)?.terrain ?? 0;
  const attackerTerrainShift = getBayeTerrainShift(attacker.armsType, attackerTerrain);
  const defenderTerrainShift = getBayeTerrainShift(target.armsType, targetTerrain);
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
  const damage = Math.min(target.troops, countBayeAttackDamage({
    attack: attackAttributes.attack,
    defence: Math.max(1, targetAttributes.defence),
    troops: Math.min(attacker.troops, 65_535),
    attackerArmsType: attacker.armsType,
    defenderArmsType: target.armsType,
  }));
  return {
    damage,
    targetTroopsAfter: Math.max(0, target.troops - damage),
    attackerTerrain,
    defenderTerrain: targetTerrain,
    attackerTerrainShift,
    defenderTerrainShift,
  };
}

export function waitTacticalUnit(state: TacticalBattleState, unitId: string): TacticalBattleState {
  const unit = requireActiveUnit(state, unitId);
  const next = updateUnit(state, unit.id, { moved: true, acted: true });
  return { ...next, logs: [...next.logs, `${unit.name}原地待命。`] };
}

export function endTacticalSide(state: TacticalBattleState): TacticalBattleState {
  if (state.status !== 'ongoing') return state;
  let next: TacticalBattleState = {
    ...state,
    units: Object.fromEntries(Object.entries(state.units).map(([id, unit]) => [
      id,
      unit.side === state.activeSide && unit.troops > 0 ? { ...unit, moved: true, acted: true } : unit,
    ])),
  };
  if (state.activeSide === 'attacker') {
    next = evaluateTacticalOutcome(next, true);
    if (next.status !== 'ongoing') return next;
    next = resetSide(next, 'defender');
    return { ...next, activeSide: 'defender', logs: [...next.logs, '守方开始行动。'] };
  }

  const attackerUse = provisionUse(next, 'attacker');
  const defenderUse = provisionUse(next, 'defender');
  next = resetSide({
    ...next,
    day: next.day + 1,
    attackerFood: Math.max(0, next.attackerFood - attackerUse),
    defenderFood: Math.max(0, next.defenderFood - defenderUse),
  }, 'attacker');
  next = {
    ...next,
    activeSide: 'attacker',
    logs: [...next.logs, `第 ${next.day} 日开始，攻方耗粮 ${attackerUse}，守方耗粮 ${defenderUse}。`],
  };
  return evaluateTacticalOutcome(next);
}

export function runBasicTacticalAi(state: TacticalBattleState): TacticalBattleState {
  if (state.status !== 'ongoing') return state;
  let next = state;
  const side = state.activeSide;
  const unitIds = Object.values(state.units)
    .filter((unit) => unit.side === side && unit.troops > 0 && !unit.acted)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((unit) => unit.id);

  for (const unitId of unitIds) {
    if (next.status !== 'ongoing') break;
    const current = next.units[unitId];
    if (!current || current.troops <= 0 || current.acted) continue;
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
      else if ((x + y * 3) % 17 === 7) terrain = 3;
      else if ((x * 5 + y) % 23 === 11) terrain = 4;
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
    mobility: clamp((state.armsTypes[officer.armsTypeId]?.mobility ?? 3) + effective.moveBonus, 1, 8),
    originalTroops: officer.troops,
    troops: officer.troops,
    moved: false,
    acted: false,
  };
}

function evaluateTacticalOutcome(state: TacticalBattleState, allowObjectiveVictory = false): TacticalBattleState {
  if (state.status !== 'ongoing') return state;
  const attackerAlive = sideTroops(state, 'attacker') > 0;
  const defenderAlive = sideTroops(state, 'defender') > 0;
  const attackerOnObjective = Object.values(state.units).some((unit) => {
    if (unit.side !== 'attacker' || unit.troops <= 0) return false;
    return getTacticalTile(state, unit.x, unit.y)?.objective === 'city';
  });
  let status: TacticalBattleStatus = 'ongoing';
  let victoryReason: TacticalVictoryReason | undefined;
  if (!attackerAlive) {
    status = 'defender-won';
    victoryReason = 'annihilation';
  } else if (state.attackerFood <= 0) {
    status = 'defender-won';
    victoryReason = 'attacker-food-exhausted';
  } else if (state.day > state.maxDays) {
    status = 'defender-won';
    victoryReason = 'day-limit';
  } else if (!defenderAlive) {
    status = 'attacker-won';
    victoryReason = 'annihilation';
  } else if (state.defenderFood <= 0) {
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
  if (terrain === BAYE_TERRAINS.indexOf('river')) {
    if (unit.armsType === BAYE_ARMS_TYPES.indexOf('navy')) return 1;
    if (unit.armsType === BAYE_ARMS_TYPES.indexOf('cavalry')) return Number.POSITIVE_INFINITY;
    return unit.armsType === BAYE_ARMS_TYPES.indexOf('elite') ? 2 : 3;
  }
  if (unit.armsType === BAYE_ARMS_TYPES.indexOf('navy')) return 2;
  if (terrain === BAYE_TERRAINS.indexOf('forest') || terrain === BAYE_TERRAINS.indexOf('hill')) {
    return unit.armsType === BAYE_ARMS_TYPES.indexOf('cavalry') ? 2 : 1;
  }
  return 1;
}

export function getTacticalAttackRange(armsType: BayeArmsType): number {
  return armsType === BAYE_ARMS_TYPES.indexOf('archer') || armsType === BAYE_ARMS_TYPES.indexOf('mystic') ? 2 : 1;
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
  return getAttackableUnitIds(state, unitId)
    .map((targetId) => ({ targetId, preview: previewTacticalAttack(state, unitId, targetId) }))
    .sort((a, b) =>
      Number(b.preview.damage >= state.units[b.targetId].troops)
      - Number(a.preview.damage >= state.units[a.targetId].troops)
      || b.preview.damage - a.preview.damage
      || a.targetId.localeCompare(b.targetId))[0]?.targetId;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
