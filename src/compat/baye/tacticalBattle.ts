export const BAYE_ARMS_TYPES = ['cavalry', 'infantry', 'archer', 'navy', 'elite', 'mystic'] as const;
export const BAYE_TERRAINS = ['grass', 'plain', 'hill', 'forest', 'village', 'city', 'camp', 'river'] as const;
export const BAYE_ARMS_LABELS = ['骑兵', '步兵', '弓兵', '水兵', '极兵', '玄兵'] as const;
export const BAYE_TERRAIN_LABELS = ['草地', '平原', '山地', '森林', '村庄', '城池', '营寨', '河流'] as const;
/** Matches FgtCount.c:FgtIntMove and fight.h:MOV_* defaults, before equipment bonuses. */
export const BAYE_BASE_MOBILITY = [5, 4, 4, 5, 6, 3] as const;

export type BayeArmsType = 0 | 1 | 2 | 3 | 4 | 5;
export type BayeTerrain = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type BayeAttackAttributeInput = {
  force: number;
  intelligence: number;
  level: number;
  armsType: BayeArmsType;
  terrain: BayeTerrain;
  /** Signed dFgtLandF entry. Zero means no shift. */
  terrainShift: number;
};

export type BayeAttackAttributes = {
  attack: number;
  defence: number;
};

export type BayeDamageInput = {
  attack: number;
  defence: number;
  troops: number;
  attackerArmsType: BayeArmsType;
  defenderArmsType: BayeArmsType;
};

export type BayeStrategicBattleInput = {
  attackerTroops: number;
  defenderTroops: number;
  attackerFood: number;
  defenderFood: number;
  /** Exact gam_rand() % 101 result. */
  randomValue: number;
};

export type BayeStrategicBattleResult = 1 | 2;

/** Six arms types × eight terrains, extracted from IFACE_CONID/dFgtLandF. */
export const BAYE_TERRAIN_SHIFTS = [
  [0, 0, 2, 1, 0, 0, 0, 3],
  [0, 0, 0, 0, 0, 0, 0, 2],
  [0, 0, 0, 0, 0, 0, 0, 2],
  [1, 1, 3, 2, 0, 0, 0, 0],
  [0, 0, 1, 1, 0, 0, 0, 1],
  [0, 0, 0, 0, 0, 0, 0, 1],
] as const;

export const BAYE_SUBDUE_MATRIX = [
  [1, 1.2, 0.8, 1, 0.7, 1.3],
  [0.8, 1, 1.2, 1, 0.6, 1.2],
  [1.2, 0.8, 1, 1, 1.1, 1.2],
  [1, 1, 1, 1, 1, 1],
  [1.1, 1.3, 0.9, 1, 1, 1.5],
  [0.6, 0.6, 0.6, 0.6, 0.6, 0.6],
] as const;

export function getBayeTerrainShift(armsType: BayeArmsType, terrain: BayeTerrain): number {
  assertIndex(armsType, BAYE_ARMS_TYPES.length, 'armsType');
  assertIndex(terrain, BAYE_TERRAINS.length, 'terrain');
  return BAYE_TERRAIN_SHIFTS[armsType][terrain];
}

const attackModulus = [1, 0.8, 0.9, 0.8, 1.3, 0.4] as const;
const defenceModulus = [0.7, 1.2, 1, 1.1, 1.2, 0.6] as const;
const terrainDefenceModulus = [1, 1, 1.3, 1.15, 1.1, 1.5, 1.2, 0.8] as const;

/** Matches FgtCount.c BuiltAtkAttr with the default (non-custom-ratio) path. */
export function buildBayeAttackAttributes(input: BayeAttackAttributeInput): BayeAttackAttributes {
  assertUnsigned(input.force, 8, 'force');
  assertUnsigned(input.intelligence, 8, 'intelligence');
  assertUnsigned(input.level, 8, 'level');
  assertSignedByte(input.terrainShift, 'terrainShift');
  assertIndex(input.armsType, BAYE_ARMS_TYPES.length, 'armsType');
  assertIndex(input.terrain, BAYE_TERRAINS.length, 'terrain');

  const levelFactor = input.level + 10;
  const baseAttack = toU16(Math.trunc(Math.fround(input.force * levelFactor * attackModulus[input.armsType])));
  const baseDefence = toU16(
    Math.trunc(Math.fround(input.intelligence * levelFactor * defenceModulus[input.armsType])),
  );
  const attack = adjustBayeTerrainValue(baseAttack, input.terrainShift);
  const shiftedDefence = adjustBayeTerrainValue(baseDefence, input.terrainShift);
  const defence = toU16(Math.trunc(Math.fround(shiftedDefence * terrainDefenceModulus[input.terrain])));

  return { attack, defence };
}

/** Matches the two U16 truncation points in FgtCount.c CountAtkHurt. */
export function countBayeAttackDamage(input: BayeDamageInput): number {
  assertUnsigned(input.attack, 16, 'attack');
  assertUnsigned(input.defence, 16, 'defence');
  assertUnsigned(input.troops, 16, 'troops');
  assertIndex(input.attackerArmsType, BAYE_ARMS_TYPES.length, 'attackerArmsType');
  assertIndex(input.defenderArmsType, BAYE_ARMS_TYPES.length, 'defenderArmsType');
  if (input.defence === 0) throw new RangeError('defence must be greater than zero');

  const ratio = Math.fround(Math.fround(input.attack) / Math.fround(input.defence));
  const baseDamage = toU16(Math.trunc(Math.fround(ratio * (input.troops >>> 3))));
  const subdued = toU16(
    Math.trunc(Math.fround(baseDamage * BAYE_SUBDUE_MATRIX[input.attackerArmsType][input.defenderArmsType])),
  );
  return toU16(subdued + 10);
}

/** Matches tactic.c GetArmType. A later equipped slot overrides an earlier one. */
export function resolveBayeArmsType(
  baseArmsType: BayeArmsType,
  toolArmCodes: readonly [number, number],
): BayeArmsType {
  assertIndex(baseArmsType, BAYE_ARMS_TYPES.length, 'baseArmsType');
  let armsType: number = baseArmsType;
  for (const code of toolArmCodes) {
    assertUnsigned(code, 8, 'toolArmCode');
    switch (code) {
      case 0:
        break;
      case 1:
        armsType = 3;
        break;
      case 2:
        armsType = 5;
        break;
      case 3:
        armsType = 4;
        break;
      default:
        armsType = code - 4;
        break;
    }
  }
  if (armsType < 0 || armsType >= BAYE_ARMS_TYPES.length) {
    throw new RangeError(`tool arm code resolved to unsupported arms type: ${armsType}`);
  }
  return armsType as BayeArmsType;
}

/** Matches FgtCount.c FgtCountWon for battles where both sides have troops. */
export function resolveBayeStrategicBattle(input: BayeStrategicBattleInput): BayeStrategicBattleResult {
  assertUnsigned(input.attackerTroops, 16, 'attackerTroops');
  assertUnsigned(input.defenderTroops, 16, 'defenderTroops');
  assertUnsigned(input.attackerFood, 16, 'attackerFood');
  assertUnsigned(input.defenderFood, 16, 'defenderFood');
  if (input.attackerTroops === 0 || input.defenderTroops === 0) {
    throw new RangeError('zero-troop outcomes depend on surrounding FgtCountWon state and must be resolved by the caller');
  }
  if (!Number.isInteger(input.randomValue) || input.randomValue < 0 || input.randomValue > 100) {
    throw new RangeError('randomValue must be an integer from 0 through 100');
  }

  const { attackerTroops, defenderTroops, attackerFood, defenderFood, randomValue } = input;
  if (attackerTroops > defenderTroops) {
    if ((attackerTroops >>> 1) > defenderTroops) return booleanResult(randomValue < 30);
    if (attackerFood > defenderFood) return booleanResult(randomValue < 40);
    return booleanResult(randomValue < 60);
  }
  if (attackerTroops < (defenderTroops >>> 1)) return booleanResult(randomValue > 2);
  if (attackerFood > defenderFood) return booleanResult(randomValue > 30);
  return booleanResult(randomValue > 10);
}

export function adjustBayeTerrainValue(value: number, terrainShift: number): number {
  assertUnsigned(value, 16, 'value');
  assertSignedByte(terrainShift, 'terrainShift');
  if (terrainShift >= 0 && terrainShift <= 3) return value >>> terrainShift;

  const clamped = Math.min(99, Math.max(-99, terrainShift));
  const unsignedProduct = Math.imul(value, clamped >>> 0) >>> 0;
  return toU16(value - Math.trunc(unsignedProduct / 100));
}

function booleanResult(condition: boolean): BayeStrategicBattleResult {
  return condition ? 2 : 1;
}

function toU16(value: number): number {
  return value & 0xffff;
}

function assertUnsigned(value: number, bits: 8 | 16, name: string): void {
  const maximum = bits === 8 ? 0xff : 0xffff;
  if (!Number.isInteger(value) || value < 0 || value > maximum) {
    throw new RangeError(`${name} must be an unsigned ${bits}-bit integer`);
  }
}

function assertSignedByte(value: number, name: string): void {
  if (!Number.isInteger(value) || value < -128 || value > 127) {
    throw new RangeError(`${name} must be a signed 8-bit integer`);
  }
}

function assertIndex(value: number, length: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value >= length) {
    throw new RangeError(`${name} must be an integer from 0 through ${length - 1}`);
  }
}
